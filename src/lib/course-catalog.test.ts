import { describe, expect, it } from "vitest";
import {
  getCatalogAreas,
  getCatalogSpecialties,
  getCatalogTopics,
  parseCourseCatalog,
  searchCourseCatalog,
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
});
