import type { CourseCatalogSource, Database, MajorArea, QuestionBlock, StudentProfile } from "./database.types";
import type { CatalogTopic } from "./medical-catalog";

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
  medgrupo: "Medcurso (MedGrupo)",
};
const PROVIDER_ORDER = ["medway", "medcof", "medgrupo"];
const CATALOG_PAGE_SIZE = 500;
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
  const sourceLabel = release
    ? `${courseProviderLabel(release.provider_code, release.provider_name)} · ${release.release_name}`
    : "Lista do cursinho";
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

  const { data, error } = await supabase
    .from("metamed_topics")
    .select("source_order,original_area,major_area,specialty,title")
    .order("source_order");
  if (error) throw new Error("Não foi possível carregar a lista de temas da MetaMed.");
  return (data ?? []).map(topic => toCatalogTopic({
    sourceOrder: topic.source_order,
    originalArea: topic.original_area,
    majorArea: topic.major_area,
    specialty: topic.specialty,
    title: topic.title,
  }, "MetaMed"));
}

/** Topics are told apart by catalog identity; lists without one use the title. */
export function topicKey(topic: CatalogTopic) {
  return topic.catalogItemId ?? topic.title;
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
export function findLegacyCatalogMatch(topics: readonly CatalogTopic[], block: Pick<QuestionBlock, "title" | "specialty">) {
  const title = normalizeHeader(block.title);
  const candidates = topics.filter(topic => normalizeHeader(topic.title) === title);
  return candidates.find(topic => topic.specialty === block.specialty) ?? candidates[0] ?? null;
}

export function getCatalogAreas(topics: readonly CatalogTopic[]) {
  return unique(topics.map(topic => topic.catalogArea));
}

export function getCatalogSpecialties(topics: readonly CatalogTopic[], catalogArea: string) {
  return unique(topics.filter(topic => topic.catalogArea === catalogArea).map(topic => topic.specialty));
}

export function getCatalogTopics(topics: readonly CatalogTopic[], catalogArea: string, specialty: string) {
  return topics.filter(topic => topic.catalogArea === catalogArea && topic.specialty === specialty);
}

export function searchCourseCatalog(topics: readonly CatalogTopic[], query: string, limit = 8) {
  const normalizedQuery = normalizeHeader(query);
  if (!normalizedQuery) return [];
  return topics.filter(topic => [topic.title, topic.specialty, topic.majorArea, topic.catalogArea]
    .some(value => normalizeHeader(value).includes(normalizedQuery)))
    .slice(0, limit);
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
  if (normalized === "ginecologia e obstetricia") return "Ginecologia e Obstetrícia";
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
