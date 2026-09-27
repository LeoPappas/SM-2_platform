/** Isolated PostgreSQL verification for the relevance catalog migration.
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
const target = migrations.find(name => name.includes("relevance_catalog_v3_foundation"));
if (!target) throw new Error("Relevance catalog migration not found.");

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
const value = async (sql, params = []) => Object.values((await rows(sql, params))[0])[0];
const reject = async (sql, pattern, params = []) => { await assert.rejects(db.query(sql, params), pattern); checks += 1; };
const relevanceFactor = (score, config) => {
  const clamped = Math.min(config.maximumScore, Math.max(config.minimumScore, score));
  const position = (clamped - config.minimumScore) / (config.maximumScore - config.minimumScore);
  return config.maximumFactor - position * (config.maximumFactor - config.minimumFactor);
};
const shadowInterval = ({ previous, questions, correct, difficulty, score, config }) => {
  const accuracy = Math.round((Math.max(0, correct) / questions) * 100);
  const factor = relevanceFactor(score, config);
  const smallSampleFactors = { "Muito fácil": 6, "Fácil": 4.5, "Médio": 3, "Difícil": 1.3, "Muito difícil": 0.8 };
  const difficultyFactors = { "Muito fácil": 1.2, "Fácil": 1.1, "Médio": 1, "Difícil": 0.9, "Muito difícil": 0.8 };
  const performanceFactor = accuracy >= 85 ? 6 : accuracy >= 70 ? 3 : accuracy >= 50 ? 1.3 : 0.8;
  const raw = questions < 20
    ? previous * smallSampleFactors[difficulty] * factor
    : previous * performanceFactor * factor * difficultyFactors[difficulty];
  return Math.min(180, Math.max(7, Math.round(raw)));
};

const owner = "11111111-1111-4111-8111-111111111111";
const blockId = "22222222-2222-4222-8222-222222222222";
const legacyBlockId = "33333333-3333-4333-8333-333333333333";
const legacyReviewId = "44444444-4444-4444-8444-444444444444";
const operation = "55555555-5555-4555-8555-555555555555";
const highBlockId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const lowBlockId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const noActivationBlockId = "abababab-abab-4bab-8bab-abababababab";

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
  await db.query("insert into public.student_profiles(user_id,calendar_sync_enabled) values($1,false)", [owner]);
  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions)
    values($1,$2,'Legacy','Clínica Médica',10,7,70,'Médio',current_date-30,current_date,current_date,'automatic',7,0)`, [legacyBlockId, owner]);
  await db.query(`insert into public.block_reviews(id,block_id,user_id,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date)
    values($1,$2,$3,10,7,70,'Médio',3,current_date)`, [legacyReviewId, legacyBlockId, owner]);

  await db.exec(await readFile(resolve(migrationDir, target), "utf8"));
  check(await value("select count(*)::int from public.canonical_topic_versions"), 492, "492 canonical topic versions seeded");
  check(await value("select count(*)::int from public.canonical_topic_aliases"), 1244, "all aliases seeded");
  check(await value("select count(*)::int from public.course_catalog_items"), 920, "920 catalog items seeded");
  check(await value("select count(*)::int from public.course_catalog_item_topics"), 1235, "1235 item-topic links seeded");
  check(await value("select count(*)::int from public.course_catalog_releases where status='active'"), 0, "catalog is not activated by seed");
  check(await value("select count(*)::int from public.relevance_engine_activations"), 0, "numeric engine is not activated by seed");
  check(await value("select source_sha256 from public.relevance_publications"), "3671a6c8ce245c5e89e744671adc518b48cef4151b195352505dc2819da3fd7e", "source hash retained");
  check(await value("select count(*)::int from public.block_reviews where id=$1", [legacyReviewId]), 1, "historical review retained");
  check(await value("select relevance_score is null from public.question_blocks where id=$1", [legacyBlockId]), true, "legacy block remains valid with null snapshot");
  check(await value(`select count(*)::int from public.course_catalog_items i join public.course_catalog_releases r on r.id=i.release_id
    where r.provider_code='medcof' and i.external_id='MC-186'`), 0, "MC-186 hole preserved");
  check(await value(`select count(*)::int from (
    select item_id from public.course_catalog_item_topics group by item_id having abs(sum(weight)-1)>0.000001
  ) bad`), 0, "all item weights sum to one");
  check(await value(`select count(*)::int from (
    select i.id from public.course_catalog_items i
    join public.course_catalog_item_topics l on l.item_id=i.id
    join public.topic_relevance_scores s on s.publication_id=l.publication_id and s.topic_id=l.topic_id and s.exam_code='GLOBAL'
    group by i.id,i.effective_relevance
    having i.effective_relevance <> round((0.7*sum(l.weight*s.score)+0.3*max(s.score))::numeric,1)
  ) bad`), 0, "stored effective scores match database half-up calculation");
  check(await value(`select effective_relevance::text from public.course_catalog_items where external_id='MW-045'`), "7.7", "MW-045 reconciled");
  check(await value(`select effective_relevance::text from public.course_catalog_items where external_id='MG-058'`), "7.3", "MG-058 reconciled");

  const publicationId = await value("select id::text from public.relevance_publications");
  const medwayRelease = await value("select id::text from public.course_catalog_releases where provider_code='medway'");
  const medcofRelease = await value("select id::text from public.course_catalog_releases where provider_code='medcof'");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec("set role authenticated");
  check(await value("select count(*)::int from public.course_catalog_releases"), 0, "validated releases hidden by RLS");
  check(await value("select count(*)::int from public.get_catalog_suggestions($1,null,500)", [medwayRelease]), 0, "RPC does not expose inactive release");
  check(await value("select count(*)::int from public.topic_relevance_scores"), 0, "scores hidden without engine activation");
  await db.exec("reset role; set role anon");
  await reject("select count(*) from public.get_catalog_suggestions($1,null,500)", /permission denied/, [medwayRelease]);
  await db.exec("reset role");

  await db.query("update public.course_catalog_releases set status='active' where id in ($1,$2)", [medwayRelease, medcofRelease]);
  await db.exec("set role authenticated");
  check(await value("select count(*)::int from public.get_catalog_suggestions($1,null,500)", [medwayRelease]), 172, "active Medway release available through RPC");
  check((await value("select count(*)::int from public.get_catalog_suggestions($1,'angina instavel',500)", [medwayRelease])) > 0, true, "normalized alias search works without accents");
  check(await value("select count(*)::int from public.get_catalog_suggestions($1,null,500,0)", [medcofRelease]), 500, "MedCof first page is bounded");
  check(await value("select count(*)::int from public.get_catalog_suggestions($1,null,500,500)", [medcofRelease]), 158, "MedCof second page exposes the remainder");
  check(await value("select count(*)::int from public.topic_relevance_scores"), 0, "catalog activation does not activate numeric engine");
  const catalogItem = (await rows(`select catalog_item_id::text,relevance_version_id::text,effective_score::text
    from public.get_catalog_suggestions($1,null,1)`, [medwayRelease]))[0];
  const scoreTenCatalogItem = (await rows(`select catalog_item_id::text,relevance_version_id::text,effective_score::text
    from public.get_catalog_suggestions($1,null,500) where effective_score=10 limit 1`, [medwayRelease]))[0];
  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions,
    catalog_item_id,relevance_version_id,relevance_score)
    values($1,$2,'No activation','Clínica Médica',20,16,80,'Médio',current_date-30,current_date,current_date,'automatic',7,0,$3,$4,$5)`,
    [noActivationBlockId, owner, catalogItem.catalog_item_id, catalogItem.relevance_version_id, catalogItem.effective_score]);
  const noActivationNextDate = await value("select (current_date+7)::text");
  const noActivationCompleted = await value("select public.complete_block_review($1,$2,$3,$4)", [
    noActivationBlockId, "acacacac-acac-4cac-8cac-acacacacacac", {
      expected_repetitions: 0, review_date: await value("select current_date::text"), question_count: 20,
      correct_count: 16, accuracy_percentage: 80, perceived_difficulty: "Médio", sm2_grade_calculated: 4,
      new_next_review_date: noActivationNextDate, performance_band: "bom", calculation_mode: "performance", engine_version: "metamed-v1",
    }, { next_review_date: noActivationNextDate, planned_review_date: noActivationNextDate, interval_days: 7 },
  ]);
  check(noActivationCompleted.review.catalog_item_id, catalogItem.catalog_item_id, "review keeps catalog identity without numeric activation");
  check(noActivationCompleted.review.relevance_score.toFixed(1), Number(catalogItem.effective_score).toFixed(1), "review keeps source score without numeric activation");
  check(noActivationCompleted.review.relevance_factor, null, "review has no factor without numeric activation");
  check(noActivationCompleted.review.relevance_formula_config, null, "review has no formula config without numeric activation");
  check(noActivationCompleted.review.relevance_shadow_interval_days, null, "review has no shadow interval without numeric activation");
  check(noActivationCompleted.block.interval_days, 7, "live interval remains independent without numeric activation");
  await db.exec("reset role");
  const formulaConfig = { minimumScore: 1, maximumScore: 10, minimumFactor: 0.8, maximumFactor: 1.2 };
  await reject(`insert into public.relevance_engine_activations(
    exam_code,publication_id,mode,formula_version,formula_config
  ) values('GLOBAL',$1,'shadow','global-linear-bounded-v1','{}'::jsonb)`, /check constraint/, [publicationId]);
  await reject(`insert into public.relevance_engine_activations(
    exam_code,publication_id,mode,formula_version,formula_config
  ) values('GLOBAL',$1,'active','global-linear-bounded-v1',$2)`, /check constraint/, [publicationId, formulaConfig]);
  await db.query(`insert into public.relevance_engine_activations(
    exam_code,publication_id,mode,formula_version,formula_config
  ) values('GLOBAL',$1,'shadow','global-linear-bounded-v1',$2)`, [publicationId, formulaConfig]);
  await db.exec("set role authenticated");
  check(await value("select count(*)::int from public.topic_relevance_scores"), 492, "shadow activation exposes source scores independently");
  check(await value("select public.calculate_relevance_shadow_interval(30,20,16,'Médio',false,10,$1)", [formulaConfig]), 72,
    "score 10 replaces low-importance factor instead of multiplying the live interval");
  check(await value("select public.calculate_relevance_shadow_interval(30,20,16,'Médio',false,1,$1)", [formulaConfig]), 108,
    "score 1 replaces high-importance factor without double application");
  check(await value("select public.calculate_relevance_shadow_interval(30,20,16,'Médio',true,10,$1)", [formulaConfig]), 14,
    "performance first contact remains unchanged by numeric relevance");
  check(await value("select public.calculate_relevance_shadow_interval(30,10,9,'Muito fácil',true,10,$1)", [formulaConfig]), 21,
    "small-sample first contact remains unchanged by numeric relevance");
  check(await value("select public.calculate_relevance_shadow_interval(30,10,9,'Fácil',false,10,$1)", [formulaConfig]), 108,
    "small-sample review uses the replacement relevance factor");
  check(await value("select public.calculate_relevance_shadow_interval(30,200,169,'Médio',false,10,$1)", [formulaConfig]), 144,
    "accuracy rounding matches the TypeScript 85 percent boundary");
  check(await value("select public.calculate_relevance_shadow_interval(63,20,10,'Muito fácil',false,1.1,$1)", [formulaConfig]), 117,
    "shadow interval uses the exact factor before the persisted four-decimal snapshot");

  await reject(`insert into public.question_blocks(user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,interval_days,relevance_version_id,relevance_score)
    values($1,'Forged relevance source','Clínica Médica',20,16,80,'Médio',current_date,current_date+7,7,$2,10)`,
    /question_blocks_catalog_source_all_or_none_check|check constraint/, [owner, publicationId]);

  await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,interval_days,repetitions,
    catalog_item_id,relevance_version_id,relevance_score)
    values($1,$2,'Catalog block','Clínica Médica',10,7,70,'Médio',current_date-30,current_date,current_date,'automatic',7,0,$3,$4,$5)`,
    [blockId, owner, catalogItem.catalog_item_id, catalogItem.relevance_version_id, catalogItem.effective_score]);
  await reject("update public.question_blocks set relevance_score=1 where id=$1", /immutable once attached/, [blockId]);
  const nextDate = await value("select (current_date+7)::text");
  const spoofItem = "66666666-6666-4666-8666-666666666666";
  const sourceScore = Number(catalogItem.effective_score);
  const expectedFactor = Number(relevanceFactor(sourceScore, formulaConfig).toFixed(4));
  const review = {
    expected_repetitions: 0, review_date: await value("select current_date::text"), question_count: 20,
    correct_count: 16, accuracy_percentage: 80, perceived_difficulty: "Médio", sm2_grade_calculated: 4,
    new_next_review_date: nextDate, performance_band: "bom", calculation_mode: "performance", engine_version: "metamed-v1",
  };
  const changes = { next_review_date: nextDate, planned_review_date: nextDate, interval_days: 7 };
  const expectedShadow = shadowInterval({
    previous: 7, questions: review.question_count, correct: review.correct_count,
    difficulty: review.perceived_difficulty, score: sourceScore, config: formulaConfig,
  });
  const alternateConfig = { minimumScore: 1, maximumScore: 10, minimumFactor: 0.7, maximumFactor: 1.3 };
  const alternateFactor = Number((alternateConfig.maximumFactor
    - (alternateConfig.maximumFactor - alternateConfig.minimumFactor)
      * (sourceScore - alternateConfig.minimumScore) / (alternateConfig.maximumScore - alternateConfig.minimumScore)).toFixed(4));
  await reject("select public.complete_block_review($1,$2,$3,$4)", /formula config diverges/,
    [blockId, "77777777-7777-4777-8777-777777777777", {
      ...review, relevance_factor: alternateFactor, relevance_formula_version: "global-linear-bounded-v1",
      relevance_formula_config: alternateConfig, relevance_shadow_interval_days: 7,
    }, changes]);
  await reject("select public.complete_block_review($1,$2,$3,$4)", /factor diverges/,
    [blockId, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", {
      ...review, relevance_factor: 1.3,
    }, changes]);
  await reject("select public.complete_block_review($1,$2,$3,$4)", /catalog identity does not match/,
    [blockId, "88888888-8888-4888-8888-888888888888", { ...review, catalog_item_id: spoofItem }, changes]);
  const completed = await value("select public.complete_block_review($1,$2,$3,$4)", [blockId, operation, review, changes]);
  check(completed.replayed, false, "first completion is not replayed");
  check(completed.review.catalog_item_id, catalogItem.catalog_item_id, "review snapshots block catalog identity");
  check(completed.review.relevance_version_id, catalogItem.relevance_version_id, "review snapshots block publication identity");
  check(completed.review.relevance_score.toFixed(1), sourceScore.toFixed(1), "review snapshots block source score");
  check(completed.review.relevance_factor.toFixed(4), expectedFactor.toFixed(4), "server derives factor from activated config");
  check(completed.review.relevance_formula_version, "global-linear-bounded-v1", "formula identifier snapshotted");
  check(completed.review.relevance_formula_config, formulaConfig, "server snapshots activated formula config");
  check(completed.review.relevance_shadow_interval_days, expectedShadow, "shadow interval is independently recalculated from the prior interval");
  check(completed.block.interval_days, 7, "shadow interval does not change live interval");
  check((await value("select public.complete_block_review($1,$2,$3,$4)", [blockId, operation, review, changes])).replayed, true, "completion remains idempotent");
  await reject("update public.block_reviews set relevance_factor=1 where operation_id=$1", /Historical relevance snapshots are immutable/, [operation]);
  await reject("update public.question_blocks set relevance_shadow_interval_days=relevance_shadow_interval_days+1 where id=$1",
    /latest completed review/, [blockId]);

  for (const [id, importance] of [[highBlockId, "alta"], [lowBlockId, "baixa"]]) {
    await db.query(`insert into public.question_blocks(id,user_id,title,area_name,question_count,correct_count,accuracy_percentage,
      perceived_difficulty,study_date,next_review_date,planned_review_date,planning_source,importance,interval_days,repetitions,
      catalog_item_id,relevance_version_id,relevance_score)
      values($1,$2,$3,'Clínica Médica',20,16,80,'Médio',current_date-30,current_date,current_date,'automatic',$4,30,0,$5,$6,$7)`,
      [id, owner, `Replacement ${importance}`, importance, scoreTenCatalogItem.catalog_item_id,
        scoreTenCatalogItem.relevance_version_id, scoreTenCatalogItem.effective_score]);
  }
  const currentDate = await value("select current_date::text");
  const highNextDate = await value("select (current_date+72)::text");
  const lowNextDate = await value("select (current_date+108)::text");
  const replacementReview = {
    expected_repetitions: 0, review_date: currentDate, question_count: 20, correct_count: 16,
    accuracy_percentage: 80, perceived_difficulty: "Médio", sm2_grade_calculated: 4,
    performance_band: "bom", calculation_mode: "performance", engine_version: "metamed-v1",
  };
  const highCompleted = await value("select public.complete_block_review($1,$2,$3,$4)", [
    highBlockId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    { ...replacementReview, new_next_review_date: highNextDate },
    { next_review_date: highNextDate, planned_review_date: highNextDate, interval_days: 72 },
  ]);
  const lowCompleted = await value("select public.complete_block_review($1,$2,$3,$4)", [
    lowBlockId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    { ...replacementReview, new_next_review_date: lowNextDate },
    { next_review_date: lowNextDate, planned_review_date: lowNextDate, interval_days: 108 },
  ]);
  check(highCompleted.review.relevance_shadow_interval_days, 72, "high legacy importance yields the TS shadow candidate");
  check(lowCompleted.review.relevance_shadow_interval_days, 72, "low legacy importance is replaced, yielding 72 instead of double-applied 86");
  check(highCompleted.block.interval_days, 72, "high-importance live interval remains independent of shadow");
  check(lowCompleted.block.interval_days, 108, "low-importance live interval remains independent of shadow");

  await reject(`insert into public.block_reviews(block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,engine_version,new_interval_days,
    catalog_item_id,relevance_version_id,relevance_score,relevance_factor,relevance_formula_version,relevance_formula_config,relevance_shadow_interval_days)
    values($1,$2,current_date,10,7,70,'Médio',3,current_date+7,'review','metamed-v1',7,$3,$4,1.0,$5,
      'global-linear-bounded-v1',$6,7)`, /source relevance does not match/,
    [blockId, owner, catalogItem.catalog_item_id, publicationId, alternateFactor, alternateConfig]);
  await reject(`insert into public.block_reviews(block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,engine_version,importance,previous_interval_days,new_interval_days,
    catalog_item_id,relevance_version_id,relevance_score,relevance_factor,relevance_formula_version,relevance_formula_config,relevance_shadow_interval_days)
    values($1,$2,current_date,10,7,70,'Médio',3,current_date+7,'review','metamed-v1','media',7,7,$3,$4,$5,$6,
      'global-linear-bounded-v1',$7,7)`, /active shadow configuration/,
    [blockId, owner, catalogItem.catalog_item_id, publicationId, sourceScore, alternateFactor, alternateConfig]);
  await reject(`insert into public.block_reviews(block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,engine_version,new_interval_days)
    values($1,$2,current_date,10,7,70,'Médio',3,current_date+7,'review','metamed-v1',7)`, /source relevance does not match/,
    [blockId, owner]);
  await db.query(`insert into public.block_reviews(block_id,user_id,review_date,question_count,correct_count,accuracy_percentage,
    perceived_difficulty,sm2_grade_calculated,new_next_review_date,contact_type,engine_version)
    values($1,$2,current_date,10,7,70,'Médio',3,current_date+7,'first_contact','metamed-v1')`, [legacyBlockId, owner]);
  checks += 1;
  await db.exec("reset role");

  await db.query("update public.course_catalog_releases set status='retired' where id=$1", [medwayRelease]);
  await db.exec("set role authenticated");
  check(await value("select count(*)::int from public.get_catalog_suggestions($1,null,500)", [medwayRelease]), 0, "retired catalog is hidden from suggestions");
  const secondNextDate = await value("select (current_date+14)::text");
  const secondReview = { ...review, expected_repetitions: 1, new_next_review_date: secondNextDate };
  const secondChanges = { next_review_date: secondNextDate, planned_review_date: secondNextDate, interval_days: 14 };
  const completedAfterRetirement = await value("select public.complete_block_review($1,$2,$3,$4)",
    [blockId, "99999999-9999-4999-8999-999999999999", secondReview, secondChanges]);
  check(completedAfterRetirement.replayed, false, "historical block remains reviewable after catalog retirement");
  check(completedAfterRetirement.review.relevance_shadow_interval_days, expectedShadow,
    "retired block recalculates shadow from its previous interval without catalog RLS lookup");
  await db.exec("reset role");

  const draftPublication = "f0000000-0000-4000-8000-000000000001";
  const draftRelease = "f0000000-0000-4000-8000-000000000002";
  const draftTopic = "CM-DRAFT-999";
  const zeroHash = "0".repeat(64);
  await db.query(`insert into public.relevance_publications(id,version_key,reference_year,validation_state,score_formula,
    rounding_mode,source_filename,source_sha256,technical_document_filename,technical_document_sha256,importer_version,validation_report)
    values($1,'draft-verifier',2027,'draft','test','half_up_1_decimal','draft.xlsx',$2,'draft.md',$2,'test','{}')`,
    [draftPublication, zeroHash]);
  await db.query("insert into public.canonical_topics(topic_id,first_publication_id) values($1,$2)", [draftTopic, draftPublication]);
  await db.query(`insert into public.course_catalog_releases(id,publication_id,provider_code,provider_name,release_name,
    source_document,source_edition,source_volume,source_sha256,status)
    values($1,$2,'medcof','Draft MedCof','Draft','draft','draft','draft',$3,'draft')`,
    [draftRelease, draftPublication, zeroHash]);
  checks += 3;
  await reject(`insert into public.course_catalog_items(id,release_id,publication_id,external_id,catalog_area,title,source_order,
    major_area,major_area_derivation,specialty,specialty_derivation,effective_relevance,workload_weight)
    values(gen_random_uuid(),$1,$2,'MC-186','Cirurgia','Invalid reuse',999,'Cirurgia','highest_weight_topic_experimental',
    'Cirurgia','unanimous_canonical_specialty',7.0,1)`, /tombstoned/, [draftRelease, draftPublication]);
  await reject("update public.canonical_topics set first_publication_id=$1 where topic_id=$2",
    /publication identity is immutable/, [publicationId, draftTopic]);
  await reject(`insert into public.relevance_engine_activations(exam_code,publication_id,mode,formula_version,formula_config)
    values('DRAFT',$1,'shadow','global-linear-bounded-v1',$2)`, /requires a validated publication/,
    [draftPublication, formulaConfig]);
  await db.query("update public.relevance_publications set validation_state='validated' where id=$1", [draftPublication]);
  await db.query("update public.course_catalog_releases set status='validated' where id=$1", [draftRelease]);
  checks += 2;

  const topicId = await value("select topic_id from public.canonical_topic_versions where publication_id=$1 order by topic_id limit 1", [publicationId]);
  const aliasRow = (await rows(`select topic_id,normalized_alias from public.canonical_topic_aliases
    where publication_id=$1 order by topic_id,normalized_alias limit 1`, [publicationId]))[0];
  const itemId = await value("select id::text from public.course_catalog_items where publication_id=$1 order by id limit 1", [publicationId]);
  const linkRow = (await rows(`select item_id::text,topic_id from public.course_catalog_item_topics
    where publication_id=$1 order by item_id,topic_id limit 1`, [publicationId]))[0];

  await reject("update public.relevance_publications set importer_version='forged' where id=$1", /publication is immutable/, [publicationId]);
  await reject("delete from public.relevance_publications where id=$1", /publication is immutable/, [publicationId]);
  await reject("insert into public.canonical_topics(topic_id,first_publication_id) values('CM-APPEND-998',$1)", /data is immutable/, [publicationId]);
  await reject("update public.canonical_topics set created_at=created_at+interval '1 second' where topic_id=$1", /data is immutable/, [draftTopic]);
  await reject("delete from public.canonical_topics where topic_id=$1", /data is immutable/, [draftTopic]);
  await reject("update public.canonical_topic_versions set canonical_name=canonical_name||' forged' where publication_id=$1 and topic_id=$2",
    /data is immutable/, [publicationId, topicId]);
  await reject("delete from public.canonical_topic_versions where publication_id=$1 and topic_id=$2",
    /data is immutable/, [publicationId, topicId]);
  await reject(`insert into public.canonical_topic_aliases(publication_id,topic_id,alias,normalized_alias)
    values($1,$2,'Post validation append','post validation append')`, /data is immutable/, [publicationId, topicId]);
  await reject(`delete from public.canonical_topic_aliases where publication_id=$1 and topic_id=$2 and normalized_alias=$3`,
    /data is immutable/, [publicationId, aliasRow.topic_id, aliasRow.normalized_alias]);
  await reject("update public.topic_relevance_scores set score=1 where publication_id=$1 and topic_id=$2 and exam_code='GLOBAL'",
    /data is immutable/, [publicationId, topicId]);
  await reject("delete from public.topic_relevance_scores where publication_id=$1 and topic_id=$2 and exam_code='GLOBAL'",
    /data is immutable/, [publicationId, topicId]);
  await reject("update public.course_catalog_releases set provider_name='forged' where id=$1", /metadata is immutable/, [medcofRelease]);
  await reject("delete from public.course_catalog_releases where id=$1", /cannot be deleted/, [medwayRelease]);
  await reject("update public.course_catalog_releases set status='active' where id=$1", /Invalid catalog release status transition/, [medwayRelease]);
  await reject(`insert into public.course_catalog_releases(id,publication_id,provider_code,provider_name,release_name,
    source_document,source_edition,source_volume,source_sha256,status)
    values(gen_random_uuid(),$1,'append','Append','Append','x','x','x',$2,'draft')`, /cannot be appended/,
    [publicationId, zeroHash]);
  await reject("update public.course_catalog_items set title=title||' forged' where id=$1", /data is immutable/, [itemId]);
  await reject("delete from public.course_catalog_items where id=$1", /data is immutable/, [itemId]);
  await reject("update public.course_catalog_item_topics set weight=weight where item_id=$1 and topic_id=$2", /data is immutable/,
    [linkRow.item_id, linkRow.topic_id]);
  await reject("delete from public.course_catalog_item_topics where item_id=$1 and topic_id=$2", /data is immutable/,
    [linkRow.item_id, linkRow.topic_id]);
  await reject("update public.course_catalog_item_tombstones set reason=reason||' forged' where provider_code='medcof' and external_id='MC-186'",
    /data is immutable/);
  await reject("delete from public.course_catalog_item_tombstones where provider_code='medcof' and external_id='MC-186'",
    /data is immutable/);
  await reject(`insert into public.course_catalog_item_tombstones(provider_code,external_id,publication_id,reason)
    values('medcof','MC-NEW',$1,'forged append')`, /data is immutable/, [publicationId]);

  console.log(JSON.stringify({ migration: target, checks, result: "passed", scope: "isolated PGlite; no remote database touched" }, null, 2));
} finally {
  await db.close();
}
