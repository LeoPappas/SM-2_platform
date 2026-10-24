/** Isolated PostgreSQL verification for the one-active-topic indexes.
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
const target = migrations.find(name => name.includes("one_active_topic"));
if (!target) throw new Error("One active topic migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const value = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0];
const reject = async (run, pattern) => { await assert.rejects(run(), pattern); checks += 1; };

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const columns = `user_id,title,area_name,question_count,correct_count,accuracy_percentage,perceived_difficulty,
  study_date,next_review_date,interval_days,repetitions,major_area,specialty,importance`;
const values = `$1,$2,'Cardiologia',20,15,75,'Médio',current_date,current_date+14,14,0,'Clínica Médica','Cardiologia','alta'`;
const insert = (user, title, extra = "", extraValues = "", params = []) =>
  db.query(`insert into public.question_blocks(${columns}${extra}) values(${values}${extraValues}) returning id::text`, [user, title, ...params]);

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  for (const migration of migrations.filter(name => name <= target)) {
    await db.exec(await readFile(resolve(migrationDir, migration), "utf8"));
  }
  await db.query("insert into auth.users(id) values($1),($2)", [owner, other]);
  await db.query("insert into public.student_profiles(user_id) values($1),($2)", [owner, other]);

  // Own topics: the same name, in any case, is the same topic.
  const ownId = (await insert(owner, "Síndrome disfágica")).rows[0].id;
  await reject(() => insert(owner, "síndrome DISFÁGICA"), /one_active_own_title/);
  check((await insert(other, "Síndrome disfágica")).rows.length, 1, "another student can have the same own topic");

  // Lista MetaMed topics.
  await insert(owner, "ICC", ",canonical_topic_id", ",'CM-CAR-004'");
  await reject(() => insert(owner, "Outro nome", ",canonical_topic_id", ",'CM-CAR-004'"), /one_active_canonical_topic/);

  // Course lessons.
  const lesson = (await db.query(`select id::text, publication_id::text, effective_relevance::text from public.course_catalog_items
    where release_id = (select id from public.course_catalog_releases where provider_code='medway') order by source_order limit 1`)).rows[0];
  const lessonColumns = ",catalog_item_id,relevance_version_id,relevance_score";
  const lessonValues = ",$3,$4,$5";
  await insert(owner, "Aula", lessonColumns, lessonValues, [lesson.id, lesson.publication_id, lesson.effective_relevance]);
  await reject(() => insert(owner, "Aula de novo", lessonColumns, lessonValues, [lesson.id, lesson.publication_id, lesson.effective_relevance]),
    /one_active_catalog_item/);

  // Archived copies do not count, but restoring one while an active copy exists fails.
  await db.query("update public.question_blocks set archived_at = now() where id=$1", [ownId]);
  const secondId = (await insert(owner, "Síndrome disfágica")).rows[0].id;
  check(typeof secondId, "string", "the topic can be registered again once the first copy is archived");
  await reject(() => db.query("update public.question_blocks set archived_at = null where id=$1", [ownId]), /one_active_own_title/);
  check(await value("select count(*)::int from public.question_blocks where user_id=$1 and lower(title)='síndrome disfágica'", [owner]), 2,
    "the archived copy keeps its history");

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
