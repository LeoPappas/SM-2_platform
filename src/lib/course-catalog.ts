import type { CourseCatalogSource, MajorArea, StudentProfile } from "./database.types";
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

export async function loadCatalogSuggestions(userId: string, profile?: StudentProfile | null): Promise<CatalogTopic[]> {
  const source: CourseCatalogSource = profile?.course_catalog_source ?? "metamed";
  const { supabase } = await import("./supabase");
  if (source === "upload") {
    const { data, error } = await supabase
      .from("course_topics")
      .select("source_order,original_area,major_area,specialty,title")
      .eq("user_id", userId)
      .order("source_order");
    if (error) throw new Error("Não foi possível carregar a lista de temas do seu cursinho.");
    return (data ?? []).map(topic => toCatalogTopic({
      sourceOrder: topic.source_order,
      originalArea: topic.original_area,
      majorArea: topic.major_area,
      specialty: topic.specialty,
      title: topic.title,
    }));
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
  }));
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
  return topics.filter(topic => [topic.title, topic.specialty, topic.majorArea]
    .some(value => normalizeHeader(value).includes(normalizedQuery)))
    .slice(0, limit);
}

function toCatalogTopic(topic: ParsedCourseTopic): CatalogTopic {
  return {
    title: topic.title,
    catalogArea: topic.originalArea || topic.majorArea,
    majorArea: topic.majorArea,
    specialty: topic.specialty,
    suggestedImportance: "media",
  };
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
