import type { Importance, MajorArea } from "./database.types";

export const MAJOR_AREAS = [
  "Clínica Médica",
  "Cirurgia",
  "Ginecologia e Obstetrícia",
  "Pediatria",
  "Preventiva",
] as const satisfies readonly MajorArea[];

export const SPECIALTIES_BY_AREA: Record<(typeof MAJOR_AREAS)[number], readonly string[]> = {
  "Clínica Médica": [
    "Cardiologia",
    "Dermatologia",
    "Emergências",
    "Endocrinologia",
    "Gastroenterologia",
    "Geriatria",
    "Hematologia",
    "Infectologia",
    "Nefrologia",
    "Neurologia",
    "Pneumologia",
    "Psiquiatria",
    "Reumatologia",
  ],
  Cirurgia: [
    "Anestesiologia",
    "Cirurgia do Aparelho Digestivo",
    "Cirurgia Geral",
    "Cirurgia Vascular",
    "Ortopedia",
    "Trauma",
    "Urologia",
  ],
  "Ginecologia e Obstetrícia": [
    "Ginecologia",
    "Mastologia",
    "Obstetrícia",
  ],
  Pediatria: [
    "Emergências Pediátricas",
    "Infectologia Pediátrica",
    "Neonatologia",
    "Pneumologia Pediátrica",
    "Puericultura",
  ],
  Preventiva: [
    "Bioestatística",
    "Epidemiologia",
    "Medicina Preventiva",
    "Saúde Coletiva",
    "Sistema Único de Saúde",
  ],
};

export type CatalogTopic = {
  title: string;
  catalogArea: string;
  majorArea: MajorArea;
  specialty: string;
  suggestedImportance: Importance;
};

export const REFERENCE_TOPICS: readonly CatalogTopic[] = [
  topic("Arritmias", "Clínica Médica", "Cardiologia", "alta"),
  topic("Hipertensão arterial", "Clínica Médica", "Cardiologia", "alta"),
  topic("Insuficiência cardíaca", "Clínica Médica", "Cardiologia", "alta"),
  topic("Síndrome coronariana aguda", "Clínica Médica", "Cardiologia", "alta"),
  topic("Cirrose e suas complicações", "Clínica Médica", "Gastroenterologia", "alta"),
  topic("Hemorragia digestiva", "Clínica Médica", "Gastroenterologia", "alta"),
  topic("Sepse", "Clínica Médica", "Infectologia", "alta"),
  topic("Endocardite infecciosa", "Clínica Médica", "Infectologia", "alta"),
  topic("HIV e infecções oportunistas", "Clínica Médica", "Infectologia", "media"),
  topic("Distúrbios hidroeletrolíticos", "Clínica Médica", "Nefrologia", "alta"),
  topic("Síndromes nefrítica e nefrótica", "Clínica Médica", "Nefrologia", "media"),
  topic("Asma", "Clínica Médica", "Pneumologia", "alta"),
  topic("DPOC", "Clínica Médica", "Pneumologia", "alta"),
  topic("Tromboembolismo pulmonar", "Clínica Médica", "Pneumologia", "alta"),
  topic("Vasculites", "Clínica Médica", "Reumatologia", "baixa"),
  topic("Abdome agudo", "Cirurgia", "Cirurgia Geral", "alta"),
  topic("Cuidados perioperatórios", "Cirurgia", "Cirurgia Geral", "media"),
  topic("Hérnias da parede abdominal", "Cirurgia", "Cirurgia Geral", "media"),
  topic("Trauma abdominal", "Cirurgia", "Trauma", "alta"),
  topic("Trauma torácico", "Cirurgia", "Trauma", "alta"),
  topic("Choque no trauma", "Cirurgia", "Trauma", "alta"),
  topic("Pré-natal", "Ginecologia e Obstetrícia", "Obstetrícia", "alta"),
  topic("Síndromes hipertensivas da gestação", "Ginecologia e Obstetrícia", "Obstetrícia", "alta"),
  topic("Hemorragias da gestação", "Ginecologia e Obstetrícia", "Obstetrícia", "alta"),
  topic("Trabalho de parto", "Ginecologia e Obstetrícia", "Obstetrícia", "alta"),
  topic("Câncer do colo do útero", "Ginecologia e Obstetrícia", "Ginecologia", "alta"),
  topic("Sangramento uterino anormal", "Ginecologia e Obstetrícia", "Ginecologia", "media"),
  topic("Reanimação neonatal", "Pediatria", "Neonatologia", "alta"),
  topic("Aleitamento materno", "Pediatria", "Puericultura", "media"),
  topic("Crescimento e desenvolvimento", "Pediatria", "Puericultura", "alta"),
  topic("Infecções respiratórias na infância", "Pediatria", "Pneumologia Pediátrica", "alta"),
  topic("Diarreia aguda e desidratação", "Pediatria", "Emergências Pediátricas", "alta"),
  topic("Doenças exantemáticas", "Pediatria", "Infectologia Pediátrica", "media"),
  topic("Medidas de frequência e associação", "Preventiva", "Epidemiologia", "alta"),
  topic("Desenhos de estudo", "Preventiva", "Epidemiologia", "alta"),
  topic("Testes diagnósticos", "Preventiva", "Epidemiologia", "alta"),
  topic("Rastreamento", "Preventiva", "Medicina Preventiva", "alta"),
  topic("Princípios e diretrizes do SUS", "Preventiva", "Sistema Único de Saúde", "alta"),
  topic("Níveis de atenção à saúde", "Preventiva", "Saúde Coletiva", "media"),
  topic("Bioestatística básica", "Preventiva", "Bioestatística", "media"),
];

export function getSpecialties(majorArea: MajorArea) {
  if (majorArea === "A classificar") return [];
  return SPECIALTIES_BY_AREA[majorArea];
}

export function findCatalogTopic(title: string) {
  const normalizedTitle = normalize(title);
  return REFERENCE_TOPICS.find(topicItem => normalize(topicItem.title) === normalizedTitle) ?? null;
}

export function searchCatalogTopics(query: string, limit = 8) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return REFERENCE_TOPICS
    .filter(topicItem => normalize(topicItem.title).includes(normalizedQuery))
    .slice(0, limit);
}

function topic(
  title: string,
  majorArea: CatalogTopic["majorArea"],
  specialty: string,
  suggestedImportance: Importance,
): CatalogTopic {
  return { title, catalogArea: majorArea, majorArea, specialty, suggestedImportance };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}
