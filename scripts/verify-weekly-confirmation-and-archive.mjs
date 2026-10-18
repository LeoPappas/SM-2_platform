/** Isolated PostgreSQL verification for the week confirmation and archive migration.
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
const target = migrations.find(name => name.includes("weekly_confirmation_and_archive"));
if (!target) throw new Error("Week confirmation and archive migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (sql, pattern, params = []) => { await assert.rejects(db.query(sql, params), pattern); checks += 1; };

const owner = "11111111-1111-4111-8111-111111111111";
const activeId = "22222222-2222-4222-8222-222222222222";
const archivedId = "33333333-3333-4333-8333-333333333333";

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const migration of migrations.filter(name => name <= target)) {
    await db.exec(await readFile(resolve(migrationDir, migration), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await db.query("insert into public.student_profiles(user_id, week_starts_on) values($1, 1)", [owner]);
  // Both topics were due three weeks ago, so a missed week would normally become backlog.
  for (const id of [activeId, archivedId]) {
    await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
      perceived_difficulty,study_date,next_review_date,interval_days,repetitions)
      values($1,$2,'Tema','Cardiologia',20,15,75,'Médio',current_date-60,current_date-21,14,0)`, [id, owner]);
  }
  // Archived before any week closed: clear the debt the insert trigger already derived.
  await db.query("update public.question_blocks set archived_at = now(), backlog_since = null, backlog_urgency = null where id = $1", [archivedId]);
  await db.query("delete from public.weekly_plan_items where block_id = $1", [archivedId]);

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  const prepared = await value("select public.prepare_weekly_plan(current_date)");
  check(prepared.items.map(item => item.block_id), [activeId], "prepare returns only active topics");
  check(await value("select count(*)::int from public.weekly_plan_items where block_id = $1", [archivedId]), 0,
    "archived topic gets no occurrence");
  check(await value("select backlog_since is not null from public.question_blocks where id = $1", [activeId]), true,
    "active topic still becomes backlog");
  check(await value("select backlog_since is null from public.question_blocks where id = $1", [archivedId]), true,
    "archived topic never turns into backlog");

  await db.query("update public.question_blocks set archived_at = null where id = $1", [archivedId]);
  const restored = await value("select public.prepare_weekly_plan(current_date)");
  check(restored.items.map(item => item.block_id).sort(), [activeId, archivedId].sort(), "restored topic returns to planning");

  const weekStart = prepared.week_start;
  check(await value("select availability_confirmed_at is null from public.weekly_plans where week_start = $1", [weekStart]), true,
    "a prepared week starts unconfirmed");
  const [confirmed] = await rows("select * from public.confirm_weekly_availability($1::date)", [weekStart]);
  check(confirmed.availability_confirmed_at !== null && confirmed.study_days === null, true, "keeping the routine confirms without an override");
  const firstConfirmation = confirmed.availability_confirmed_at;
  await db.query("select public.confirm_weekly_availability($1::date)", [weekStart]);
  check(String(await value("select availability_confirmed_at from public.weekly_plans where week_start = $1", [weekStart])),
    String(new Date(firstConfirmation)), "confirming twice keeps the first confirmation");

  const nextWeek = await value("select ($1::date + 7)::text", [weekStart]);
  const [adjusted] = await rows("select * from public.save_weekly_availability($1::date, array[1,3], '{\"1\":2,\"3\":1}'::jsonb)", [nextWeek]);
  check([adjusted.study_days, adjusted.availability_confirmed_at !== null], [[1, 3], true], "adjusting a week confirms it");
  const [reset] = await rows("select * from public.reset_weekly_availability($1::date)", [nextWeek]);
  check([reset.study_days, reset.availability_confirmed_at !== null], [null, true], "going back to the routine also confirms it");

  await reject("select public.confirm_weekly_availability(($1::date - 14))", /Closed weeks|Invalid week start/, [weekStart]);
  await reject("select public.confirm_weekly_availability(($1::date + 1))", /Invalid week start/, [weekStart]);
  await db.exec("reset role; set role anon");
  await reject("select public.confirm_weekly_availability(current_date)", /permission denied/);
  await db.exec("reset role");

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
