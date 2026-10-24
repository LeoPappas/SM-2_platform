import type { CourseCatalogSource, Database, MajorArea, QuestionBlock, StudentProfile } from "./database.types";
import { MAJOR_AREAS, type CatalogTopic } from "./medical-catalog";
import { importanceFromRelevance } from "./revision-engine";

export type ParsedCourseTopic = {
  sourceOrder: number;
  originalArea: string | null;
  majorArea: MajorArea;
  specialty: string;
  title: string;
};

export function parseCourseCatalog(text: string): ParsedCourseTopic[] {
  const delimiter = detectDelimiter(text);
  const rows = parseDelimitedRows(text, delimiter).filter(row => row.some(cell => cell.trim()));
  if (rows.length === 0) return [];

  const headers = rows[0].map(normalizeHeader);
  const titleIndex = findColumn(headers, ["nome da aula", "tema", "titulo", "title", "aula"]);
  if (titleIndex === -1) throw new Error("A lista precisa ter uma coluna chamada Tema, Título ou Nome da aula.");

  const areaIndex = findColumn(headers, ["grande area", "area", "major area"]);
  const specialtyIndex = findColumn(headers, ["modulo", "especialidade", "specialty"]);
  const orderIndex = findColumn(headers, ["ordem", "order"]);

  const unique = new Set<string>();
  return rows.slice(1).flatMap((row, index) => {
    const title = row[titleIndex]?.trim();
    if (!title) return [];
    const originalArea = areaIndex >= 0 ? row[areaIndex]?.trim() || null : null;
    const specialty = specialtyIndex >= 0
      ? row[specialtyIndex]?.trim() || "A classificar"
      : originalArea || "A classificar";
    const majorArea = mapMajorArea(originalArea);
    const key = `${normalizeHeader(majorArea)}|${normalizeHeader(title)}|${normalizeHeader(specialty)}`;
    if (unique.has(key)) return [];
    unique.add(key);

    return [{
      sourceOrder: orderIndex >= 0 ? Number(row[orderIndex]) || index + 1 : index + 1,
      originalArea,
      majorArea,
      specialty,
      title,
    }];
  });
}

export async function readCatalogFile(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("pt-BR");
  if (!extension || !["csv", "tsv", "txt"].includes(extension)) {
    throw new Error("Envie um arquivo CSV, TSV ou TXT.");
  }
  if (file.size > 2_000_000) throw new Error("O arquivo deve ter no máximo 2 MB.");
  return parseCourseCatalog(await file.text());
}

export async function replaceUploadedCatalog({
  filename,
  topics,
}: {
  filename: string;
  topics: ParsedCourseTopic[];
}) {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("replace_course_topics", {
    p_filename: filename,
    p_topics: topics,
  });
  if (error || data !== topics.length) throw new Error("Não foi possível importar a lista de temas.");
}

type CatalogSuggestion = Database["public"]["Functions"]["get_catalog_suggestions"]["Returns"][number];

export type CourseCatalogOption = {
  id: string;
  providerCode: string;
  label: string;
  releaseName: string;
  itemCount: number | null;
};

const PROVIDER_LABELS: Record<string, string> = {
  medway: "Medway",
  medcof: "MedCof",
  medgrupo: "Medcurso",
};
const PROVIDER_ORDER = ["medway", "medcof", "medgrupo"];
const CATALOG_PAGE_SIZE = 500;
/** The Lista MetaMed is the canonical taxonomy of relevance v3, one entry per topic. */
export const METAMED_TOPIC_TOTAL = 492;
export const CUSTOM_TOPIC_SOURCE = "Tema próprio";

export function courseProviderLabel(providerCode: string, providerName: string) {
  return PROVIDER_LABELS[providerCode] ?? providerName;
}

/** Active course catalogs a student can choose, with their lesson counts. */
export async function loadCourseCatalogOptions(): Promise<CourseCatalogOption[]> {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase
    .from("course_catalog_releases")
    .select("id,provider_code,provider_name,release_name")
    .eq("status", "active");
  if (error) throw new Error("Não foi possível carregar a lista de cursinhos.");
  const releases = data ?? [];
  const counts = await Promise.all(releases.map(async release => {
    const { count } = await supabase
      .from("course_catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("release_id", release.id);
    return count ?? null;
  }));
  return releases
    .map((release, index) => ({
      id: release.id,
      providerCode: release.provider_code,
      label: courseProviderLabel(release.provider_code, release.provider_name),
      releaseName: release.release_name,
      itemCount: counts[index],
    }))
    .sort((a, b) => providerRank(a.providerCode) - providerRank(b.providerCode));
}

export function fromCatalogSuggestion(item: CatalogSuggestion, sourceLabel: string): CatalogTopic {
  return {
    title: item.title,
    catalogArea: item.catalog_area,
    majorArea: item.major_area,
    specialty: item.specialty,
    suggestedImportance: item.suggested_importance,
    catalogItemId: item.catalog_item_id,
    externalItemId: item.external_id,
    relevanceScore: Number(item.effective_score),
    relevanceVersionId: item.relevance_version_id,
    canonicalTopicIds: item.topic_ids,
    workloadWeight: item.workload_weight,
    sourceLabel,
  };
}

async function loadCourseRelease(releaseId: string): Promise<CatalogTopic[]> {
  const { supabase } = await import("./supabase");
  const { data: release } = await supabase
    .from("course_catalog_releases")
    .select("provider_code,provider_name,release_name")
    .eq("id", releaseId)
    .maybeSingle();
  const sourceLabel = release ? releaseLabel(release) : "Lista do cursinho";
  const items: CatalogSuggestion[] = [];
  for (let offset = 0; ; offset += CATALOG_PAGE_SIZE) {
    const { data, error } = await supabase.rpc("get_catalog_suggestions", {
      p_release_id: releaseId,
      p_limit: CATALOG_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error("Não foi possível carregar a lista de temas do seu cursinho.");
    items.push(...(data ?? []));
    if ((data ?? []).length < CATALOG_PAGE_SIZE) break;
  }
  return items.map(item => fromCatalogSuggestion(item, sourceLabel));
}

export async function loadCatalogSuggestions(userId: string, profile?: StudentProfile | null): Promise<CatalogTopic[]> {
  const source: CourseCatalogSource = profile?.course_catalog_source ?? "metamed";
  if (source === "course" && profile?.course_catalog_release_id) {
    return loadCourseRelease(profile.course_catalog_release_id);
  }
  const { supabase } = await import("./supabase");
  if (source === "upload") {
    const { data, error } = await supabase
      .from("course_topics")
      .select("source_order,original_area,major_area,specialty,title")
      .eq("user_id", userId)
      .order("source_order");
    if (error) throw new Error("Não foi possível carregar a lista de temas do seu cursinho.");
    const sourceLabel = profile?.course_catalog_filename || "Lista do cursinho";
    return (data ?? []).map(topic => toCatalogTopic({
      sourceOrder: topic.source_order,
      originalArea: topic.original_area,
      majorArea: topic.major_area,
      specialty: topic.specialty,
      title: topic.title,
    }, sourceLabel));
  }

  return loadMetaMedTopics();
}

/**
 * Lista MetaMed: the canonical topics of the active publication, each scored by
 * its relevancia_global, with synonyms for search.
 */
async function loadMetaMedTopics(): Promise<CatalogTopic[]> {
  const { supabase } = await import("./supabase");
  const failure = new Error("Não foi possível carregar a lista de temas da MetaMed.");
  const { data: release, error: releaseError } = await supabase
    .from("course_catalog_releases").select("publication_id").eq("status", "active").limit(1).maybeSingle();
  if (releaseError || !release) throw failure;
  const publicationId = release.publication_id;
  // PostgREST returns at most 1,000 rows per request; synonyms exceed that.
  const pages = async <Row,>(query: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) => {
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await query(from, from + 999);
      if (error) throw failure;
      all.push(...(data ?? []));
      if ((data ?? []).length < 1000) return all;
    }
  };
  const [versions, scores, aliases] = await Promise.all([
    pages((from, to) => supabase.from("canonical_topic_versions").select("topic_id,canonical_name,major_area,specialty")
      .eq("publication_id", publicationId).order("topic_id").range(from, to)),
    pages((from, to) => supabase.from("topic_relevance_scores").select("topic_id,score")
      .eq("publication_id", publicationId).eq("exam_code", "GLOBAL").order("topic_id").range(from, to)),
    pages((from, to) => supabase.from("canonical_topic_aliases").select("topic_id,alias")
      .eq("publication_id", publicationId).order("topic_id").range(from, to)),
  ]);
  const scoreByTopic = new Map(scores.map(row => [row.topic_id, Number(row.score)]));
  const aliasesByTopic = new Map<string, string[]>();
  for (const row of aliases) aliasesByTopic.set(row.topic_id, [...(aliasesByTopic.get(row.topic_id) ?? []), row.alias]);
  return versions
    .filter(topic => scoreByTopic.has(topic.topic_id))
    .map(topic => {
      const score = scoreByTopic.get(topic.topic_id)!;
      return {
        title: topic.canonical_name,
        catalogArea: topic.major_area,
        majorArea: topic.major_area,
        specialty: topic.specialty,
        suggestedImportance: importanceFromRelevance(score),
        relevanceScore: score,
        canonicalTopicId: topic.topic_id,
        canonicalTopicIds: [topic.topic_id],
        aliases: aliasesByTopic.get(topic.topic_id) ?? [],
        sourceLabel: "MetaMed",
      } satisfies CatalogTopic;
    })
    .sort((a, b) => MAJOR_AREAS.indexOf(a.majorArea as (typeof MAJOR_AREAS)[number]) - MAJOR_AREAS.indexOf(b.majorArea as (typeof MAJOR_AREAS)[number])
      || a.specialty.localeCompare(b.specialty, "pt-BR")
      || a.canonicalTopicId.localeCompare(b.canonicalTopicId));
}

/** Topics are told apart by catalog identity; lists without one use the title. */
export function topicKey(topic: CatalogTopic) {
  return topic.catalogItemId ?? topic.canonicalTopicId ?? topic.title;
}

/**
 * Title and area matches from the loaded list, followed by synonym matches the
 * database finds in the student's course catalog. The student always picks one.
 */
export async function findCatalogMatches({
  topics,
  query,
  releaseId,
  limit = 8,
}: {
  topics: readonly CatalogTopic[];
  query: string;
  releaseId?: string | null;
  limit?: number;
}): Promise<CatalogTopic[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const local = searchCourseCatalog(topics, trimmed, limit);
  if (!releaseId || local.length >= limit) return local;
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.rpc("get_catalog_suggestions", {
    p_release_id: releaseId,
    p_search: trimmed,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw new Error("Não foi possível buscar temas.");
  const byId = new Map(topics.map(topic => [topic.catalogItemId, topic]));
  const remote = (data ?? []).flatMap(item => byId.get(item.catalog_item_id) ?? []);
  const seen = new Set<string>();
  return [...local, ...remote].filter(topic => {
    if (seen.has(topicKey(topic))) return false;
    seen.add(topicKey(topic));
    return true;
  }).slice(0, limit);
}

/** Same title in the current list, preferring the block's specialty. */
export function findLegacyCatalogMatch(topics: readonly CatalogTopic[], block: Pick<QuestionBlock, "title" | "specialty"> & { canonical_topic_id?: string | null }) {
  const sameTopic = block.canonical_topic_id ? topics.find(topic => topic.canonicalTopicId === block.canonical_topic_id) : null;
  if (sameTopic) return sameTopic;
  const title = normalizeHeader(block.title);
  const candidates = topics.filter(topic => normalizeHeader(topic.title) === title);
  return candidates.find(topic => topic.specialty === block.specialty) ?? candidates[0] ?? null;
}

/**
 * The area each linked lesson has in the student's course spreadsheet. The
 * block's own major_area comes from the canonical topic and stays for analysis.
 */
export async function loadCourseAreas(blocks: readonly Pick<QuestionBlock, "catalog_item_id">[]) {
  const ids = unique(blocks.flatMap(block => block.catalog_item_id ?? []));
  const areas = new Map<string, string>();
  if (ids.length === 0) return areas;
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.from("course_catalog_items").select("id,catalog_area").in("id", ids);
  if (error) throw new Error("Não foi possível carregar as áreas do cursinho.");
  for (const item of data ?? []) areas.set(item.id, item.catalog_area);
  return areas;
}

/** The area the student sees: the course's, else the topic's own. */
export function displayArea(block: Pick<QuestionBlock, "catalog_item_id" | "major_area">, courseAreas: ReadonlyMap<string, string>) {
  return (block.catalog_item_id && courseAreas.get(block.catalog_item_id)) || block.major_area;
}

/** The major area matching the area the student sees, for its colour; the topic's own when the course's is unknown. */
export function displayMajorArea(block: Pick<QuestionBlock, "catalog_item_id" | "major_area">, courseAreas: ReadonlyMap<string, string>): MajorArea {
  const mapped = mapMajorArea(displayArea(block, courseAreas));
  return mapped === "A classificar" ? block.major_area : mapped;
}

// The cascading lists read alphabetically, whatever order the course spreadsheet uses.
export function getCatalogAreas(topics: readonly CatalogTopic[]) {
  return unique(topics.map(topic => topic.catalogArea)).sort(byName);
}

export function getCatalogSpecialties(topics: readonly CatalogTopic[], catalogArea: string) {
  return unique(topics.filter(topic => topic.catalogArea === catalogArea).map(topic => topic.specialty)).sort(byName);
}

export function getCatalogTopics(topics: readonly CatalogTopic[], catalogArea: string, specialty: string) {
  return topics.filter(topic => topic.catalogArea === catalogArea && topic.specialty === specialty)
    .sort((a, b) => byName(a.title, b.title));
}

export function searchCourseCatalog(topics: readonly CatalogTopic[], query: string, limit = 8) {
  if (!normalizeSearch(query)) return [];
  return topics.filter(topic => [topic.title, topic.specialty, topic.majorArea, topic.catalogArea, ...(topic.aliases ?? [])]
    .some(value => matchesSearch(value, query)))
    .slice(0, limit);
}

/**
 * Accent, case, hyphen and spacing insensitive: "pre natal", "prenatal" and
 * "Pré-natal" all find "Pré-Natal".
 */
export function matchesSearch(value: string, query: string) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const normalizedValue = normalizeSearch(value);
  return normalizedValue.includes(normalizedQuery)
    || normalizedValue.replaceAll(" ", "").includes(normalizedQuery.replaceAll(" ", ""));
}

function normalizeSearch(value: string) {
  return normalizeHeader(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function byName(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function toCatalogTopic(topic: ParsedCourseTopic, sourceLabel: string): CatalogTopic {
  return {
    title: topic.title,
    catalogArea: topic.originalArea || topic.majorArea,
    majorArea: topic.majorArea,
    specialty: topic.specialty,
    suggestedImportance: "media",
    sourceLabel,
  };
}

/** "Medway · Extensivo R1 2026", or just "Medcurso 2020" when the release already names the course. */
function releaseLabel(release: { provider_code: string; provider_name: string; release_name: string }) {
  const label = courseProviderLabel(release.provider_code, release.provider_name);
  return release.release_name.startsWith(label) ? release.release_name : `${label} · ${release.release_name}`;
}

function providerRank(providerCode: string) {
  const rank = PROVIDER_ORDER.indexOf(providerCode);
  return rank === -1 ? PROVIDER_ORDER.length : rank;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function mapMajorArea(value: string | null): MajorArea {
  const normalized = normalizeHeader(value ?? "");
  if (normalized === "clinica medica") return "Clínica Médica";
  if (normalized === "cirurgia" || normalized === "cirurgia geral") return "Cirurgia";
  if (normalized === "ginecologia e obstetricia" || normalized === "go") return "Ginecologia e Obstetrícia";
  if (normalized === "pediatria") return "Pediatria";
  if (normalized === "preventiva" || normalized === "medicina preventiva") return "Preventiva";
  return "A classificar";
}

function detectDelimiter(text: string) {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = ["\t", ";", ","];
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
}

function parseDelimitedRows(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function findColumn(headers: string[], aliases: string[]) {
  return headers.findIndex(header => aliases.includes(header));
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}
