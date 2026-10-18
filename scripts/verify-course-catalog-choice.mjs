/** Isolated PostgreSQL verification for the course catalog activation migration.
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
const target = migrations.find(name => name.includes("activate_course_catalogs"));
if (!target) throw new Error("Course catalog activation migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (sql, pattern, params = []) => { await assert.rejects(db.query(sql, params), pattern); checks += 1; };
const asStudent = async () => db.exec("set role authenticated");
const asAdmin = async () => db.exec("reset role");

const owner = "11111111-1111-4111-8111-111111111111";
const legacyBlockId = "33333333-3333-4333-8333-333333333333";
const catalogBlockId = "22222222-2222-4222-8222-222222222222";

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
  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions,major_area,specialty,source)
    values($1,$2,'Arritmias, Síncope e PCR','Cardiologia',10,7,70,'Médio',current_date-30,current_date,current_date,'automatic',7,0,
      'Clínica Médica','Cardiologia','MetaMed')`, [legacyBlockId, owner]);

  await db.exec(await readFile(resolve(migrationDir, target), "utf8"));
  check(await value("select count(*)::int from public.course_catalog_releases where status='active'"), 3, "three catalogs active");
  check(await value("select count(*)::int from public.relevance_engine_activations"), 0, "numeric engine stays inactive");
  check(await value("select course_catalog_source || ':' || coalesce(course_catalog_release_id::text,'none') from public.student_profiles"),
    "metamed:none", "existing profile keeps the MetaMed list");

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await asStudent();
  const releases = await rows(`select r.provider_code, r.id::text, count(i.id)::int as items
    from public.course_catalog_releases r join public.course_catalog_items i on i.release_id=r.id
    group by r.provider_code, r.id order by r.provider_code`);
  check(releases.map(release => [release.provider_code, release.items]),
    [["medcof", 658], ["medgrupo", 90], ["medway", 172]], "students see the three catalogs and their items");
  const release = Object.fromEntries(releases.map(entry => [entry.provider_code, entry.id]));

  await db.query("update public.student_profiles set course_catalog_source='course', course_catalog_release_id=$1 where user_id=$2",
    [release.medway, owner]);
  check(await value("select course_catalog_release_id::text from public.student_profiles"), release.medway, "student picks Medway");
  await reject("update public.student_profiles set course_catalog_release_id=null where user_id=$1",
    /course_catalog_release_check/, [owner]);
  await reject("update public.student_profiles set course_catalog_source='metamed' where user_id=$1",
    /course_catalog_release_check/, [owner]);
  await reject("update public.student_profiles set course_catalog_release_id=gen_random_uuid() where user_id=$1",
    /not available|foreign key/, [owner]);

  const icc = await rows("select title, suggested_importance from public.get_catalog_suggestions($1,'ICC',20)", [release.medway]);
  check(icc.map(item => item.title).includes("Insuficiência Cardíaca"), true, "ICC finds heart failure in Medway");

  const item = (await rows(`select catalog_item_id::text, relevance_version_id::text, effective_score::text, title
    from public.get_catalog_suggestions($1,'Arritmias, Síncope e PCR',5)`, [release.medway]))[0];
  check(item.title, "Arritmias, Síncope e PCR", "legacy title has an exact Medway match");
  await db.query(`update public.question_blocks set catalog_item_id=$1, relevance_version_id=$2, relevance_score=$3,
    source='Medway · Extensivo R1 2026' where id=$4`, [item.catalog_item_id, item.relevance_version_id, item.effective_score, legacyBlockId]);
  check(await value("select catalog_item_id::text from public.question_blocks where id=$1", [legacyBlockId]), item.catalog_item_id,
    "legacy block attaches to the Medway item");
  const other = (await rows(`select catalog_item_id::text, relevance_version_id::text, effective_score::text
    from public.get_catalog_suggestions($1,'Insuficiência Cardíaca',5)`, [release.medway]))[0];
  await reject("update public.question_blocks set catalog_item_id=$1, relevance_version_id=$2, relevance_score=$3 where id=$4",
    /immutable once attached/, [other.catalog_item_id, other.relevance_version_id, other.effective_score, legacyBlockId]);

  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions,major_area,specialty,
    importance,catalog_item_id,relevance_version_id,relevance_score)
    values($1,$2,'Insuficiência Cardíaca','Cardiologia',20,16,80,'Médio',current_date,current_date+14,current_date+14,'automatic',14,0,
      'Clínica Médica','Cardiologia','alta',$3,$4,$5)`,
    [catalogBlockId, owner, other.catalog_item_id, other.relevance_version_id, other.effective_score]);
  await db.query(`insert into public.block_reviews(block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,catalog_item_id,relevance_version_id,relevance_score)
    values($1,$2,20,16,80,'Médio',4,current_date+14,'first_contact',$3,$4,$5)`,
    [catalogBlockId, owner, other.catalog_item_id, other.relevance_version_id, other.effective_score]);
  check(await value("select count(*)::int from public.block_reviews where block_id=$1", [catalogBlockId]), 1,
    "first contact keeps the catalog snapshot");
  await reject(`insert into public.question_blocks(user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,interval_days,repetitions,catalog_item_id,relevance_version_id,relevance_score)
    values($1,'Forjado','Cardiologia',20,16,80,'Médio',current_date,current_date+14,14,0,$2,$3,9.9)`,
    /do not match/, [owner, other.catalog_item_id, other.relevance_version_id]);

  await asAdmin();
  await db.query("update public.course_catalog_releases set status='retired' where id in ($1,$2)", [release.medway, release.medcof]);
  await asStudent();
  await db.query("update public.student_profiles set preferred_name='Leo' where user_id=$1", [owner]);
  check(await value("select course_catalog_release_id::text from public.student_profiles"), release.medway,
    "a retired catalog stays on the profile that already chose it");
  await reject("update public.student_profiles set course_catalog_release_id=$1 where user_id=$2",
    /not available/, [release.medcof, owner]);
  await asAdmin();

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
