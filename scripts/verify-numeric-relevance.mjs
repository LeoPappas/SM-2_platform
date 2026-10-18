/** Isolated PostgreSQL verification for the numeric relevance engine migration.
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
const target = migrations.find(name => name.includes("numeric_relevance_engine"));
if (!target) throw new Error("Numeric relevance engine migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (sql, pattern, params = []) => { await assert.rejects(db.query(sql, params), pattern); checks += 1; };

const owner = "11111111-1111-4111-8111-111111111111";
const legacyId = "33333333-3333-4333-8333-333333333333";
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
  await db.query(`insert into public.question_blocks(id,${columns}) values($2,${values},'baixa')`, [owner, legacyId]);
  await db.query(`insert into public.block_reviews(block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type)
    values($1,$2,20,15,75,'Médio',3,current_date+14,'first_contact')`, [legacyId, owner]);

  await db.exec(await readFile(resolve(migrationDir, target), "utf8"));
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [legacyId]), "1.0",
    "a topic without a score keeps its old factor through the equivalent number");
  check(await value("select engine_relevance::text from public.block_reviews where block_id=$1", [legacyId]), "1.0",
    "existing reviews record the number");

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  check(await value("select count(*)::int from public.canonical_topic_versions"), 492, "students read the 492 canonical topics");
  check(await value("select count(*)::int from public.topic_relevance_scores where exam_code='GLOBAL'"), 492, "students read the GLOBAL scores");
  check(await value("select count(*)::int from public.canonical_topic_aliases"), 1245, "students read the synonyms");
  check(await value("select score::text from public.topic_relevance_scores where topic_id='CM-CAR-004'"), "9.0", "relevancia_global of CM-CAR-004");

  await db.query(`insert into public.question_blocks(${columns},canonical_topic_id,engine_relevance) values(${values},'alta','CM-CAR-004',9)`, [owner]);
  check(await value("select count(*)::int from public.question_blocks where canonical_topic_id='CM-CAR-004'"), 1, "a MetaMed topic stores its relevancia_global");
  const wrongCanonical = await value(`insert into public.question_blocks(${columns},canonical_topic_id,engine_relevance)
    values(${values},'alta','CM-CAR-004',8) returning engine_relevance::text`, [owner]);
  check(wrongCanonical, "9.0", "a wrong number sent for a MetaMed topic is replaced by its relevancia_global");

  check(await value(`insert into public.question_blocks(${columns}) values(${values},'alta') returning engine_relevance::text`, [owner]), "10.0",
    "an own topic without a number (older client) gets its category's number");
  const ownId = await value(`insert into public.question_blocks(${columns},engine_relevance) values(${values},'alta',5.5) returning id::text`, [owner]);
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [ownId]), "10.0", "a wrong number for an own topic is corrected");
  await db.query("update public.question_blocks set importance='baixa' where id=$1", [ownId]);
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [ownId]), "1.0", "changing the category updates the number");

  const item = (await rows(`select catalog_item_id::text, relevance_version_id::text, effective_score::text
    from public.get_catalog_suggestions((select id from public.course_catalog_releases where provider_code='medway'),'Insuficiência Cardíaca',1)`))[0];
  const catalogId = await value(`insert into public.question_blocks(${columns},catalog_item_id,relevance_version_id,relevance_score,engine_relevance)
    values(${values},'alta',$2,$3,$4,$4) returning id::text`, [owner, item.catalog_item_id, item.relevance_version_id, item.effective_score]);
  check(await value("select engine_relevance::text from public.question_blocks where id=$1", [catalogId]), item.effective_score,
    "a course lesson uses its own score");
  check(await value(`insert into public.question_blocks(${columns},catalog_item_id,relevance_version_id,relevance_score)
    values(${values},'alta',$2,$3,$4) returning engine_relevance::text`, [owner, item.catalog_item_id, item.relevance_version_id, item.effective_score]),
    item.effective_score, "an older client that sends only the lesson score still gets it as the number");
  await reject(`insert into public.question_blocks(${columns},catalog_item_id,relevance_version_id,relevance_score,engine_relevance,canonical_topic_id)
    values(${values},'alta',$2,$3,$4,$4,'CM-CAR-004')`, /single_catalog_source_check/, [owner, item.catalog_item_id, item.relevance_version_id, item.effective_score]);

  await db.query(`insert into public.block_reviews(block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,catalog_item_id,relevance_version_id,relevance_score)
    values($1,$2,20,15,75,'Médio',3,current_date+14,'first_contact',$3,$4,$5)`,
    [catalogId, owner, item.catalog_item_id, item.relevance_version_id, item.effective_score]);
  check(await value("select engine_relevance::text from public.block_reviews where block_id=$1", [catalogId]), item.effective_score,
    "a new review records the number it used");
  await reject("update public.block_reviews set engine_relevance = 2 where block_id=$1", /immutable/, [catalogId]);
  await db.exec("reset role");

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
