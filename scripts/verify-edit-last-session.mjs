/** Isolated PostgreSQL verification for editing the last session of a topic.
 * Set PGLITE_MODULE to an external @electric-sql/pglite/dist/index.js install.
 * No remote database or credentials are used.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = process.env.PGLITE_MODULE;
if (!runtime) throw new Error("Set PGLITE_MODULE to an external @electric-sql/pglite/dist/index.js installation.");
const { PGlite } = await import(pathToFileURL(runtime).href);
const db = new PGlite();
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = resolve(root, "supabase/migrations");
const migrations = (await readdir(migrationDir)).filter(name => name.endsWith(".sql")).sort();
// The latest version of edit_last_block_session; the first one is applied before it.
const target = migrations.find(name => name.includes("edit_session_keeps_schedule"));
if (!target) throw new Error("Edit session migrations not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (run, pattern) => { await assert.rejects(run(), pattern); checks += 1; };

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const blockId = "33333333-3333-4333-8333-333333333333";
const firstId = "44444444-4444-4444-8444-444444444444";
const asUser = async user => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
};
const session = (date, questions, correct, interval, extra = {}) => JSON.stringify({
  review_date: date, question_count: questions, correct_count: correct, accuracy_percentage: Math.round(correct / questions * 100),
  perceived_difficulty: "Médio", time_spent_minutes: 30, sm2_grade_calculated: 5, new_interval_days: interval,
  new_next_review_date: extra.next ?? null, calculation_mode: "performance", performance_band: "muito_bom", engine_version: "metamed-v2",
});
const edit = (review, expected, body, planned = null) => db.query(
  "select public.edit_last_block_session($1,$2,$3,$4::jsonb,$5) as result", [blockId, review, expected, body, planned]);
const day = async offset => value(`select (current_date + ${offset})::text`);

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const migration of migrations.filter(name => name <= target)) {
    await db.exec(await readFile(resolve(migrationDir, migration), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [owner, stranger]);
  await db.query("insert into public.student_profiles(user_id,timezone) values($1,'UTC'),($2,'UTC')", [owner, stranger]);
  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,perceived_difficulty,
      study_date,last_review_date,next_review_date,interval_days,repetitions,major_area,specialty,importance)
    values($1,$2,'Imunizações','Pediatria',20,11,55,'Médio',current_date-10,current_date-10,current_date,10,0,'Pediatria','Puericultura','alta')`, [blockId, owner]);
  await db.query(`insert into public.block_reviews(id,block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
      perceived_difficulty,sm2_grade_calculated,new_next_review_date,new_interval_days,contact_type)
    values($1,$2,$3,current_date-10,20,11,55,'Médio',2,current_date,10,'first_contact')`, [firstId, blockId, owner]);
  // The block's insert created its open occurrence; make it a debt from an old week.
  await db.query(`update public.weekly_plan_items set due_week_start = current_date-14, original_due_week_start = current_date-14,
    backlog_since = current_date-14 where user_id=$1 and block_id=$2 and revision_number=0`, [owner, blockId]);
  check(await value("select count(*)::int from public.weekly_plan_items where block_id=$1 and backlog_since is not null", [blockId]), 1,
    "the occurrence starts late");
  const relevanceBefore = await value("select engine_relevance::text from public.block_reviews where id=$1", [firstId]);

  await asUser(stranger);
  await reject(async () => edit(firstId, 0, session("2026-01-01", 20, 18, 21)), /Block not found/);
  await asUser(owner);
  const tenDaysAgo = await day(-10);
  const next = await day(11);
  await reject(async () => edit(firstId, 1, session(tenDaysAgo, 20, 18, 21, { next })), /Session changed/);
  await reject(async () => edit(blockId, 0, session(tenDaysAgo, 20, 18, 21, { next })), /Only the last session/);
  await reject(async () => edit(firstId, 0, session(tenDaysAgo, 20, 18, 21, { next: await day(12) })), /Invalid review interval/);
  await reject(async () => edit(firstId, 0, session(tenDaysAgo, 20, 18, 5, { next: await day(-5) })), /Invalid review interval/);
  await reject(async () => edit(firstId, 0, session(await day(1), 20, 18, 21, { next: await day(22) })), /between the previous contact and today/);
  await reject(async () => edit(firstId, 0, session(tenDaysAgo, 20, 21, 21, { next })), /Invalid question counts/);
  await reject(async () => edit(firstId, 0, session(tenDaysAgo, 20, 18, 21, { next }), await day(-1)), /cannot be in the past/);

  await edit(firstId, 0, session(tenDaysAgo, 20, 18, 21, { next }), next);
  const block = (await rows(`select correct_count, accuracy_percentage, interval_days, next_review_date::text, planned_review_date::text,
    planning_source, backlog_since, backlog_urgency, study_date::text, last_review_date::text, repetitions, performance_band
    from public.question_blocks where id=$1`, [blockId]))[0];
  check(block, {
    correct_count: 18, accuracy_percentage: 90, interval_days: 21, next_review_date: next, planned_review_date: next,
    planning_source: "automatic", backlog_since: null, backlog_urgency: null, study_date: tenDaysAgo, last_review_date: tenDaysAgo,
    repetitions: 0, performance_band: "muito_bom",
  }, "the topic takes the corrected session and its new next review");
  const review = (await rows(`select correct_count, new_interval_days, new_next_review_date::text, time_spent_minutes, engine_relevance::text
    from public.block_reviews where id=$1`, [firstId]))[0];
  check(review, { correct_count: 18, new_interval_days: 21, new_next_review_date: next, time_spent_minutes: 30, engine_relevance: relevanceBefore },
    "the session is rewritten and keeps the relevance it was calculated with");
  const item = (await rows(`select backlog_since, due_week_start = public.planning_week_start($1, $2::date, 1) as moved
    from public.weekly_plan_items where block_id=$3 and revision_number=0`, [owner, next, blockId]))[0];
  check(item, { backlog_since: null, moved: true }, "the open occurrence moves to the new week and is no longer late");

  // After a review, only that review can change, and never to before the first contact.
  await db.exec("reset role");
  await db.query(`insert into public.block_reviews(id,block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
      perceived_difficulty,sm2_grade_calculated,new_next_review_date,previous_interval_days,new_interval_days,contact_type)
    values('55555555-5555-4555-8555-555555555555',$1,$2,current_date-2,20,15,75,'Médio',4,current_date+40,21,42,'review')`, [blockId, owner]);
  await db.query("update public.question_blocks set repetitions = 1 where id=$1", [blockId]);
  await asUser(owner);
  await reject(async () => edit(firstId, 1, session(tenDaysAgo, 20, 18, 21, { next })), /Only the last session/);
  await reject(async () => edit("55555555-5555-4555-8555-555555555555", 1, session(await day(-11), 20, 15, 42, { next: await day(31) })),
    /between the previous contact and today/);
  const twoDaysAgo = await day(-2);
  await edit("55555555-5555-4555-8555-555555555555", 1, session(twoDaysAgo, 20, 19, 63, { next: await day(61) }), await day(61));
  check(await value("select study_date::text from public.question_blocks where id=$1", [blockId]), tenDaysAgo,
    "editing a review keeps the first contact date");
  check(await value("select last_review_date::text from public.question_blocks where id=$1", [blockId]), twoDaysAgo,
    "editing a review keeps its date as the last contact");

  // A correction that keeps the calculated date keeps the planned day and who chose it.
  await db.exec("reset role");
  await db.query("update public.question_blocks set planned_review_date = current_date + 70, planning_source = 'manual' where id=$1", [blockId]);
  await asUser(owner);
  const chosenDay = await day(70);
  await edit("55555555-5555-4555-8555-555555555555", 1, session(twoDaysAgo, 20, 19, 63, { next: await day(61) }), await day(-3));
  const kept = (await rows("select planned_review_date::text, planning_source, time_spent_minutes from public.question_blocks where id=$1", [blockId]))[0];
  check(kept, { planned_review_date: chosenDay, planning_source: "manual", time_spent_minutes: 30 },
    "an unchanged calculated date keeps the chosen day, even with a stale planned date sent");
  check(await value("select planned_review_date::text from public.weekly_plan_items where block_id=$1 and revision_number=1", [blockId]), chosenDay,
    "the open occurrence keeps the chosen day");
  await edit("55555555-5555-4555-8555-555555555555", 1, session(twoDaysAgo, 20, 12, 21, { next: await day(19) }), await day(19));
  const moved = (await rows("select next_review_date::text, planned_review_date::text, planning_source from public.question_blocks where id=$1", [blockId]))[0];
  check(moved, { next_review_date: await day(19), planned_review_date: await day(19), planning_source: "automatic" },
    "a new calculated date moves the review to the nearest free day");
  await db.exec("reset role");

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
