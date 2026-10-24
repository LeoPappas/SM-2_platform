/** Isolated PostgreSQL verification for the own-topic relevance values migration.
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
const target = migrations.find(name => name.includes("own_topic_relevance_values"));
if (!target) throw new Error("Own-topic relevance values migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];

const owner = "11111111-1111-4111-8111-111111111111";
const ownId = "33333333-3333-4333-8333-333333333333";
const columns = `user_id,title,area_name,question_count,correct_count,accuracy_percentage,perceived_difficulty,
  study_date,next_review_date,interval_days,repetitions,major_area,specialty,importance`;
const values = `$1,'Tema','Cardiologia',20,15,75,'Médio',current_date,current_date+14,14,0,'Clínica Médica','Cardiologia'`;

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const migration of migrations.filter(name => name < target)) {
    await db.exec(await readFile(resolve(migrationDir, migration), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1)", [owner]);
  await db.query("insert into public.student_profiles(user_id) values($1)", [owner]);
  await db.query(`insert into public.question_blocks(id,${columns}) values($2,${values},'baixa')`, [owner, ownId]);
  await db.query(`insert into public.block_reviews(block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type)
    values($1,$2,20,15,75,'Médio',3,current_date+14,'first_contact')`, [ownId, owner]);
  const canonicalId = await value(`insert into public.question_blocks(${columns},canonical_topic_id,engine_relevance)
    values(${values},'alta','CM-CAR-004',9) returning id::text`, [owner]);
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [ownId]), "1.0", "before: an own baixa topic is 1");

  await db.exec(await readFile(resolve(migrationDir, target), "utf8"));
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [ownId]), "3.0",
    "an existing own topic moves to its band's median");
  check(await value("select engine_relevance::text from public.block_reviews where block_id=$1", [ownId]), "1.0",
    "its past review keeps the number it was calculated with");
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [canonicalId]), "9.0",
    "a MetaMed topic keeps its relevancia_global");

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  for (const [importance, expected] of [["alta", "8.5"], ["media", "6.2"], ["baixa", "3.0"]]) {
    check(await value(`insert into public.question_blocks(${columns}) values(${values},$2) returning engine_relevance::text`, [owner, importance]),
      expected, `a new own ${importance} topic gets ${expected}`);
  }
  check(await value(`insert into public.question_blocks(${columns},engine_relevance) values(${values},'alta',10) returning engine_relevance::text`, [owner]),
    "8.5", "an older client sending the old number is corrected");
  await db.query("update public.question_blocks set importance='alta' where id=$1", [ownId]);
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [ownId]), "8.5", "changing the category updates the number");
  await db.query("update public.question_blocks set question_count=21 where id=$1", [ownId]);
  check(await value("select question_count from public.question_blocks where id=$1", [ownId]), 21, "unrelated updates pass the constraint");
  await db.exec("reset role");

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
