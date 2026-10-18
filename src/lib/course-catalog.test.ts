import { describe, expect, it } from "vitest";
import {
  findCatalogMatches,
  findLegacyCatalogMatch,
  fromCatalogSuggestion,
  getCatalogAreas,
  getCatalogSpecialties,
  getCatalogTopics,
  parseCourseCatalog,
  searchCourseCatalog,
  topicKey,
} from "./course-catalog";

describe("course catalog", () => {
  it("parses the MetaMed TSV format and maps known areas", () => {
    const topics = parseCourseCatalog("Ordem\tGrande área\tMódulo\tNome da aula\n1\tCirurgia Geral\tTrauma\tChoque\n2\tRadiologia\tRadiologia\tTórax");
    expect(topics).toHaveLength(2);
    expect(topics[0]).toMatchObject({ majorArea: "Cirurgia", specialty: "Trauma", title: "Choque" });
    expect(topics[1].majorArea).toBe("A classificar");
  });

  it("supports quoted CSV cells and removes duplicates", () => {
    const topics = parseCourseCatalog('Tema,Área,Especialidade\n"Dor, aguda",Clínica Médica,Emergências\n"Dor, aguda",Clínica Médica,Emergências');
    expect(topics).toHaveLength(1);
    expect(topics[0].title).toBe("Dor, aguda");
  });

  it("preserves the same title and specialty in different major areas", () => {
    const topics = parseCourseCatalog("Tema\tGrande área\tMódulo\nArritmias\tClínica Médica\tCardiologia\nArritmias\tPediatria\tCardiologia");
    expect(topics).toHaveLength(2);
  });

  it("requires a recognizable title column", () => {
    expect(() => parseCourseCatalog("Código\tMódulo\n1\tCardio")).toThrow("Nome da aula");
  });

  it("searches title, specialty and area", () => {
    const topics = [{ title: "Choque", catalogArea: "Cirurgia Geral", majorArea: "Cirurgia" as const, specialty: "Trauma", suggestedImportance: "media" as const }];
    expect(searchCourseCatalog(topics, "trauma")).toHaveLength(1);
  });

  it("builds cascading area, specialty and topic options from the active catalog", () => {
    const topics = [
      { title: "Choque", catalogArea: "Cirurgia Geral", majorArea: "Cirurgia" as const, specialty: "Trauma", suggestedImportance: "media" as const },
      { title: "FAST", catalogArea: "Cirurgia Geral", majorArea: "Cirurgia" as const, specialty: "Trauma", suggestedImportance: "media" as const },
      { title: "Rádio Explica", catalogArea: "Radiologia", majorArea: "A classificar" as const, specialty: "Radiologia", suggestedImportance: "media" as const },
    ];

    expect(getCatalogAreas(topics)).toEqual(["Cirurgia Geral", "Radiologia"]);
    expect(getCatalogSpecialties(topics, "Cirurgia Geral")).toEqual(["Trauma"]);
    expect(getCatalogTopics(topics, "Cirurgia Geral", "Trauma").map(topic => topic.title)).toEqual(["Choque", "FAST"]);
  });

  it("maps a course catalog suggestion with its relevance snapshot", () => {
    const topic = fromCatalogSuggestion({
      catalog_release_id: "release", catalog_item_id: "item", external_id: "MW-002", title: "Insuficiência Cardíaca",
      catalog_area: "Clínica Médica", major_area: "Clínica Médica", specialty: "Cardiologia", effective_score: "8.4" as never,
      relevance_version_id: "publication", topic_ids: ["CM-CAR-004"], workload_weight: 1, suggested_importance: "alta",
    }, "Medway · Extensivo R1 2026");
    expect(topic).toMatchObject({ catalogItemId: "item", relevanceScore: 8.4, suggestedImportance: "alta", sourceLabel: "Medway · Extensivo R1 2026" });
    expect(topicKey(topic)).toBe("item");
    expect(topicKey({ ...topic, catalogItemId: null })).toBe("Insuficiência Cardíaca");
  });

  it("matches a legacy topic by title regardless of accents and case", () => {
    const topics = [
      { title: "Arritmias, Síncope e PCR", catalogArea: "Clínica Médica", majorArea: "Clínica Médica" as const, specialty: "Conteúdo integrado", suggestedImportance: "media" as const },
      { title: "Arritmias, Síncope e PCR", catalogArea: "Clínica Médica", majorArea: "Clínica Médica" as const, specialty: "Cardiologia", suggestedImportance: "media" as const },
    ];
    expect(findLegacyCatalogMatch(topics, { title: "arritmias, sincope e pcr", specialty: "Cardiologia" })).toBe(topics[1]);
    expect(findLegacyCatalogMatch(topics, { title: "Arritmias, Síncope e PCR", specialty: "Outra" })).toBe(topics[0]);
    expect(findLegacyCatalogMatch(topics, { title: "Asma", specialty: "Pneumologia" })).toBeNull();
  });

  it("searches the loaded list locally when there is no course catalog", async () => {
    const topics = [{ title: "Choque", catalogArea: "Cirurgia Geral", majorArea: "Cirurgia" as const, specialty: "Trauma", suggestedImportance: "media" as const }];
    expect(await findCatalogMatches({ topics, query: "c" })).toEqual([]);
    expect(await findCatalogMatches({ topics, query: "choq" })).toEqual(topics);
  });

  it("finds Lista MetaMed topics by synonym and an old topic by its canonical id", async () => {
    const topics = [
      { title: "Insuficiência cardíaca crônica", catalogArea: "Clínica Médica", majorArea: "Clínica Médica" as const, specialty: "Cardiologia",
        suggestedImportance: "alta" as const, relevanceScore: 9, canonicalTopicId: "CM-CAR-004", aliases: ["ICFEr", "ICC"] },
    ];
    expect(await findCatalogMatches({ topics, query: "icc" })).toEqual(topics);
    expect(topicKey(topics[0])).toBe("CM-CAR-004");
    expect(findLegacyCatalogMatch(topics, { title: "Outro nome", specialty: "Cardiologia", canonical_topic_id: "CM-CAR-004" })).toBe(topics[0]);
  });
});
