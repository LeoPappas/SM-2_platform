/** Real PostgreSQL semantics via isolated PGlite; no remote connection or credentials.
 * Install a pinned runtime outside the project and set PGLITE_MODULE to its index.js.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";

const runtime = process.env.PGLITE_MODULE;
if (!runtime) throw new Error("Set PGLITE_MODULE to a temporary @electric-sql/pglite/dist/index.js installation.");
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = (await readdir(resolve(root, "supabase/migrations"))).filter(name => name.endsWith(".sql")).sort();
const target = migrations.find(name => name.includes("weekly_availability_and_review_occurrences"));
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (sql, pattern, params = []) => { await assert.rejects(db.query(sql, params), pattern); checks += 1; };
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const legacy = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const current = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const future = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const manual = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const foreign = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const oldReview = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const insertBlock = async (id, userId, date, source = "automatic", planned = null) => db.query(`
  insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,perceived_difficulty,
    study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions)
  values($1,$2,'Fixture','Clínica Médica',10,7,70,'Médio',current_date-100,$3,$4,$5,7,0)`, [id,userId,date,planned,source]);

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const migration of migrations.filter(name => name < target)) {
    await db.exec(await readFile(resolve(root,"supabase/migrations",migration),"utf8"));
  }
  const today = await value("select (now() at time zone 'America/Sao_Paulo')::date::text");
  const week = await value("select date_trunc('week',(now() at time zone 'America/Sao_Paulo'))::date::text");
  const past = await value("select ($1::date-28)::text",[week]);
  const futureDate = await value("select ($1::date+21)::text",[week]);
  await db.query("insert into auth.users(id) values($1),($2)",[owner,other]);
  await db.query("insert into public.student_profiles(user_id,calendar_sync_enabled) values($1,true),($2,false)",[owner,other]);
  await insertBlock(legacy,owner,past,"automatic",today);
  await db.query(`insert into public.block_reviews(id,block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date) values($1,$2,$3,10,7,70,'Médio',3,$4)`,[oldReview,legacy,owner,past]);
  await db.exec(await readFile(resolve(root,"supabase/migrations",target),"utf8"));
  check(await value("select count(*)::int from public.block_reviews where id=$1",[oldReview]),1,"existing historical review retained");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
  await db.exec("set role authenticated");
  await insertBlock(current,owner,today,"automatic",today);
  await insertBlock(future,owner,futureDate,"automatic",today);
  await insertBlock(manual,owner,futureDate,"manual",futureDate);
  const prepared = await value("select public.prepare_weekly_plan($1)",[today]);
  check(prepared.week_start,week,"Monday snapshot used");
  check(prepared.items.length,4,"one occurrence per pending revision");
  check(prepared.items.find(i=>i.block_id===legacy).backlog_since,past,"debt begins in original due week after long absence");
  check(prepared.items.find(i=>i.block_id===current).backlog_since,null,"current-week overflow is not debt");
  check(prepared.items.find(i=>i.block_id===future).backlog_since,null,"optional early review is not debt");
  await db.query("select public.prepare_weekly_plan($1)",[today]);
  check(await value("select count(*)::int from public.weekly_plan_items"),4,"prepare is idempotent");
  check(await value("select backlog_since::text from public.question_blocks where id=$1",[legacy]),past,"legacy debt mirrors occurrence");
  check(await value("select backlog_urgency = round((backlog_since+6-study_date)::numeric / interval_days,4) from public.question_blocks where id=$1",[legacy]),true,"debt urgency frozen at original due week's end");
  check(await value("select closed_at is not null from public.weekly_plans where week_start=$1",[past]),true,"closed original due week recorded");
  await db.query("update public.question_blocks set planned_review_date=$2,planning_source='manual' where id=$1",[current,futureDate]);
  check(await value("select due_week_start::text from public.weekly_plan_items where block_id=$1",[current]),futureDate,"manual future move before debt reanchors due week");
  check(await value("select jsonb_array_length(reschedule_history) from public.weekly_plan_items where block_id=$1",[current]),1,"manual reschedule audit retained");
  await db.query("update public.question_blocks set planned_review_date=$2,planning_source='automatic' where id=$1",[current,today]);
  check(await value("select due_week_start::text from public.weekly_plan_items where block_id=$1",[current]),week,"restoring automatic schedule restores calculated due week");
  await db.query("update public.question_blocks set planned_review_date=$2,planning_source='manual' where id=$1",[legacy,futureDate]);
  check(await value("select backlog_since::text from public.weekly_plan_items where block_id=$1",[legacy]),past,"moving debt to future retains FIFO age");
  const saved = await value("select to_jsonb(public.save_weekly_availability($1,array[1,2,2,7],'{\"1\":2,\"2\":0,\"7\":3}'::jsonb))",[week]);
  check(saved.study_days,[1,2,7],"weekly weekdays deduplicated");
  check(saved.capacity,5,"weekly per-day capacities summed");
  const paused = await value("select to_jsonb(public.save_weekly_availability($1,'{}'::integer[],'{}'::jsonb))",[week]);
  check(paused.capacity,0,"zero-capacity week supported");
  check(paused.study_days,[],"pause can have no days");
  await reject("select public.save_weekly_availability($1,array[1],'{\"1\":21}'::jsonb)",/Invalid weekly availability/,[week]);
  await reject("select public.save_weekly_availability($1,array[1],'{\"1\":\"2\"}'::jsonb)",/Invalid weekly availability/,[week]);
  await reject("select public.save_weekly_availability($1,array[1],'{\"8\":2}'::jsonb)",/Invalid weekly availability/,[week]);
  await reject("select public.save_weekly_availability($1,array[1,null],null)",/Invalid weekly availability/,[week]);
  await reject("select public.save_weekly_availability($1,array[1],null)",/Closed weeks/,[past]);
  const reset = await value("select to_jsonb(public.reset_weekly_availability($1))",[week]);
  check(reset.study_days,null,"reset clears override without deleting week");
  check(await value("select count(*)::int from public.weekly_plan_items"),4,"reset retains all occurrence history");
  await db.query("select public.save_weekly_availability($1,array[1],'{\"1\":4}'::jsonb)",[week]);
  await db.query("update public.student_profiles set week_starts_on=0,daily_theme_capacity=3 where user_id=$1",[owner]);
  check(await value("select public.planning_week_start($1,$2,0)::text",[owner,today]),week,"profile preference cannot move saved current week");
  check((await value("select public.prepare_weekly_plan($1)",[today])).week_start,week,"prepare exposes preserved snapshot anchor after profile change");
  check(await value("select capacity from public.weekly_plans where week_start=$1",[week]),4,"profile change preserves saved override");
  await reject("update public.student_profiles set timezone='Invalid/Timezone' where user_id=$1",/Invalid planning timezone/,[owner]);
  await reject("select public.prepare_weekly_plan($1::date+30)",/Reference date cannot be in the future/,[today]);
  await reject("select public.prepare_weekly_plan(null)",/Reference date cannot be in the future/);
  const operation = "12345678-1234-4234-8234-123456789abc";
  const newDate = await value("select ($1::date+7)::text",[today]);
  const review = {expected_repetitions:0,review_date:today,question_count:20,correct_count:16,accuracy_percentage:80,perceived_difficulty:"Médio",sm2_grade_calculated:4,new_next_review_date:newDate,performance_band:"bom",calculation_mode:"performance",engine_version:"metamed-v1"};
  const changes = {next_review_date:newDate,planned_review_date:newDate,interval_days:7};
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/last contact and today/,[legacy,{...review,review_date:futureDate},changes]);
  const beforeContact = await value("select (study_date-1)::text from public.question_blocks where id=$1",[legacy]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/last contact and today/,[legacy,{...review,review_date:beforeContact},changes]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/Invalid review interval/,[legacy,review,{...changes,interval_days:null}]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/Invalid review interval/,[legacy,review,{...changes,interval_days:8}]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/Planned review date cannot be in the past/,[legacy,review,{...changes,planned_review_date:past}]);
  await reject("select public.complete_block_review($1,$2,$3,$4)",/check constraint/,[legacy,operation,{...review,correct_count:21},changes]);
  check(await value("select count(*)::int from public.block_reviews where operation_id=$1",[operation]),0,"invalid review leaves no partial insert");
  check(await value("select repetitions from public.question_blocks where id=$1",[legacy]),0,"invalid review leaves block unchanged");
  const completed = await value("select public.complete_block_review($1,$2,$3,$4)",[legacy,operation,review,changes]);
  check(completed.replayed,false,"first completion is new transaction");
  check(completed.block.repetitions,1,"repetitions advanced once");
  check(completed.block.calendar_sync_status,"pending","calendar intent persisted for later external sync");
  check(completed.block.backlog_since,null,"new occurrence has no previous debt");
  check(await value("select status from public.weekly_plan_items where block_id=$1 and revision_number=0",[legacy]),"completed","old due occurrence completed atomically");
  check(await value("select count(*)::int from public.weekly_plan_items where block_id=$1 and status='open'",[legacy]),1,"exactly one new open occurrence");
  const replayed = await value("select public.complete_block_review($1,$2,$3,$4)",[legacy,operation,review,changes]);
  check(replayed.replayed,true,"network retry replays existing operation");
  check(await value("select repetitions from public.question_blocks where id=$1",[legacy]),1,"retry cannot increment block again");
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/Review changed/,[legacy,review,changes]);
  await reject("select public.complete_block_review($1,$2,$3,$4)",/another block/,[current,operation,review,changes]);
  const retroDate = await value("select ($1::date-2)::text",[today]);
  const retroNextDate = await value("select ($1::date+7)::text",[retroDate]);
  const retroReview = {...review,review_date:retroDate,new_next_review_date:retroNextDate};
  const retroChanges = {...changes,next_review_date:retroNextDate,planned_review_date:retroNextDate};
  const retroCompleted = await value("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",[current,retroReview,retroChanges]);
  check(retroCompleted.review.review_date,retroDate,"chronologically valid retrospective review is allowed");
  const beforeLastContact = await value("select ($1::date-1)::text",[retroDate]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/last contact and today/,[current,{...retroReview,expected_repetitions:1,review_date:beforeLastContact},retroChanges]);
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  await db.exec("set role authenticated");
  await insertBlock(foreign,other,today,"automatic",today);
  check(await value("select count(*)::int from public.weekly_plan_items"),1,"other student cannot see owner occurrences");
  await reject("update public.weekly_plan_items set user_id=$1 where block_id=$2",/row-level security/,[owner,foreign]);
  await reject("select public.complete_block_review($1,gen_random_uuid(),$2,$3)",/Block not found/,[legacy,review,changes]);
  await reject("insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on) values($1,$2,100,$3,$3,1)",/row-level security/,[owner,legacy,today]);
  await reject("insert into public.weekly_plan_items(user_id,block_id,revision_number,due_week_start,original_due_week_start,week_starts_on) values($1,$2,100,$3,$3,1)",/foreign key/,[other,legacy,today]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await reject("select public.prepare_weekly_plan($1)",/Authentication required/,[today]);
  await db.exec("reset role; set role anon");
  await reject("select public.prepare_weekly_plan($1)",/permission denied/,[today]);
  console.log(JSON.stringify({migration:target,checks,result:"passed",scope:"local isolated PGlite; all historical migrations applied; no remote database touched"},null,2));
} finally {
  await db.close();
}
