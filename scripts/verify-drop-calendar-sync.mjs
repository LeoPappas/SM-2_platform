/** Isolated PostgreSQL verification for the removal of the Google Calendar columns.
 * Set PGLITE_MODULE to an external @electric-sql/pglite/dist/index.js install.
 * No remote database or credentials are used.
 *
 * Chain A mirrors the remote: every migration up to the weekly one, seeded with Calendar state,
 * then the drop migration, then the rollback. Chain B applies the full local history, including the
 * unapplied relevance v3 migration, and proves the Calendar columns never come back.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const runtime = process.env.PGLITE_MODULE;
if (!runtime) throw new Error("Set PGLITE_MODULE to an external @electric-sql/pglite/dist/index.js installation.");
const { PGlite } = await import(pathToFileURL(runtime).href);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationDir = resolve(root, "supabase/migrations");
const migrations = (await readdir(migrationDir)).filter(name => name.endsWith(".sql")).sort();
const dropMigration = migrations.find(name => name.includes("drop_google_calendar_sync"));
if (!dropMigration) throw new Error("Drop migration for the Google Calendar columns not found.");
const weekly = migrations.find(name => name.includes("weekly_availability_and_review_occurrences"));
const rollback = await readFile(resolve(root, "supabase/rollbacks", dropMigration.replace(/\.sql$/, ".down.sql")), "utf8");
const read = name => readFile(resolve(migrationDir, name), "utf8");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const legacy = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const added = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const operation = "12345678-1234-4234-8234-123456789abc";

async function freshDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  return db;
}
const calendarObjects = db => db.query(`
  select 'column' kind, table_name||'.'||column_name name from information_schema.columns
    where table_schema='public' and column_name like 'calendar\\_%'
  union all select 'trigger', tgname::text from pg_trigger where not tgisinternal and tgname like '%calendar%'
  union all select 'index', indexname from pg_indexes where schemaname='public' and indexname like '%calendar%'
  union all select 'constraint', conname::text from pg_constraint where conname like '%calendar%'
  union all select 'function', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and pg_get_functiondef(p.oid) ilike '%calendar\\_%'
  order by 1,2`).then(result => result.rows.map(row => `${row.kind}:${row.name}`));
const insertBlock = (db, id, userId) => db.query(`
  insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,perceived_difficulty,
    study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions)
  values($1,$2,'Fixture','Clínica Médica',10,7,70,'Médio',current_date-100,current_date,current_date,'automatic',7,0)`, [id, userId]);

// Chain A: the state of the remote database.
{
  const db = await freshDatabase();
  try {
    for (const migration of migrations.filter(name => name <= weekly)) await db.exec(await read(migration));
    await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
    await db.query("insert into public.student_profiles(user_id,calendar_sync_enabled) values($1,true),($2,false)", [owner, other]);
    await insertBlock(db, legacy, owner);
    await db.query(`update public.question_blocks set calendar_event_id='event-1',calendar_sync_status='failed',
      calendar_last_error='expired' where id=$1`, [legacy]);
    check((await calendarObjects(db)).length > 10, true, "fixture starts with the Calendar schema in place");

    await db.exec(await read(dropMigration));
    check(await calendarObjects(db), [], "no Calendar column, trigger, index, constraint or function remains");
    check((await db.query("select title from public.question_blocks where id=$1", [legacy])).rows, [{ title: "Fixture" }], "existing study rows are preserved");

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const today = (await db.query("select current_date::text d")).rows[0].d;
    const next = (await db.query("select (current_date+7)::text d")).rows[0].d;
    const review = { expected_repetitions: 0, review_date: today, question_count: 20, correct_count: 16, accuracy_percentage: 80,
      perceived_difficulty: "Médio", sm2_grade_calculated: 4, new_next_review_date: next, performance_band: "bom",
      calculation_mode: "performance", engine_version: "metamed-v1", priority_score: 1 };
    const changes = { next_review_date: next, planned_review_date: next, interval_days: 7 };
    const completed = (await db.query("select public.complete_block_review($1,$2,$3,$4) r", [legacy, operation, review, changes])).rows[0].r;
    check(completed.replayed, false, "review completes without the Calendar columns");
    check(completed.block.repetitions, 1, "repetitions advance once");
    check(Object.keys(completed.block).filter(key => key.startsWith("calendar_")), [], "returned block carries no Calendar state");
    const replay = (await db.query("select public.complete_block_review($1,$2,$3,$4) r", [legacy, operation, review, changes])).rows[0].r;
    check(replay.replayed, true, "retrying the same operation is idempotent");
    await insertBlock(db, added, owner);
    check(Number((await db.query("select count(*) c from public.question_blocks where user_id=$1", [owner])).rows[0].c), 2, "new topics can be created without the inherit trigger");
    await db.query("update public.student_profiles set week_starts_on=1 where user_id=$1", [owner]);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.complete_block_review($1,$2,$3,$4)", [legacy, operation, review, changes]), /permission denied/);
    checks += 1;
    await db.exec("reset role");

    await db.exec(rollback);
    check((await calendarObjects(db)).length > 10, true, "rollback restores the Calendar schema");
    check((await db.query("select calendar_sync_enabled from public.student_profiles where user_id=$1", [owner])).rows, [{ calendar_sync_enabled: false }], "rollback restores the profile preference column");
    await db.query("update public.question_blocks set calendar_sync_enabled=true where id=$1", [added]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec("set role authenticated");
    const restored = (await db.query("select public.complete_block_review($1,$2,$3,$4) r", [added, "87654321-4321-4321-8321-cba987654321", { ...review }, changes])).rows[0].r;
    check(restored.block.calendar_sync_status, "pending", "rollback restores the previous review function");
    await db.exec("reset role");
    await db.exec(await read(dropMigration));
    check(await calendarObjects(db), [], "the drop migration can run again after a rollback");
  } finally {
    await db.close();
  }
}

// Chain B: the whole local history, including the unapplied relevance v3 migration.
{
  const db = await freshDatabase();
  try {
    for (const migration of migrations) await db.exec(await read(migration));
    check(await calendarObjects(db), [], "the full migration history leaves no Calendar object behind");
  } finally {
    await db.close();
  }
}

console.log(JSON.stringify({ migration: dropMigration, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
