/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogTopic } from "@/lib/medical-catalog";
import { questionBlockFixture } from "./test-fixtures";

const mocks = vi.hoisted(() => ({
  loadSuggestions: vi.fn(),
  findMatches: vi.fn(),
  findDate: vi.fn(),
  updateBlock: vi.fn(),
  findExisting: vi.fn(),
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  contactError: null as null | { message: string },
  blockError: null as null | { code: string; message: string },
}));

vi.mock("@/lib/course-catalog", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/course-catalog")>()),
  loadCatalogSuggestions: mocks.loadSuggestions,
  findCatalogMatches: mocks.findMatches,
}));
vi.mock("@/lib/revision-actions", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/revision-actions")>()),
  findAutomaticReviewDate: mocks.findDate,
}));
vi.mock("@/lib/question-block-writes", async importOriginal => ({
  ExistingTopicError: (await importOriginal<typeof import("@/lib/question-block-writes")>()).ExistingTopicError,
  updateQuestionBlock: mocks.updateBlock,
  findExistingTopic: mocks.findExisting,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserts.push({ table, row });
        const result = table === "question_blocks"
          ? mocks.blockError ? { data: null, error: mocks.blockError } : { data: { ...row, id: "new-block" }, error: null }
          : { data: null, error: mocks.contactError };
        return { select: () => ({ single: () => Promise.resolve(result) }), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
      },
      delete: () => {
        const filters: Record<string, unknown> = {};
        mocks.deletes.push({ table, filters });
        const chain = { eq: (key: string, value: unknown) => { filters[key] = value; return chain; } };
        return chain;
      },
    }),
  },
}));

import { TopicFormModal } from "./topic-form-modal";

const catalog: CatalogTopic[] = [
  { title: "Insuficiência cardíaca", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia", suggestedImportance: "alta" },
  { title: "Arritmias", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia", suggestedImportance: "media" },
  { title: "Asma", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Pneumologia", suggestedImportance: "media" },
  { title: "Apendicite", catalogArea: "Cirurgia", majorArea: "Cirurgia", specialty: "Cirurgia Geral", suggestedImportance: "alta" },
];

const medway = { relevanceVersionId: "publication-v3", sourceLabel: "Medway · Extensivo R1 2026" };
const courseCatalog: CatalogTopic[] = [
  { ...medway, title: "Insuficiência Cardíaca", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia", suggestedImportance: "alta", catalogItemId: "item-ic", relevanceScore: 8.4 },
  { ...medway, title: "Arritmias, Síncope e PCR", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia", suggestedImportance: "media", catalogItemId: "item-arr", relevanceScore: 7.1 },
  { ...medway, title: "Apendicite", catalogArea: "Cirurgia Geral", majorArea: "Cirurgia", specialty: "Cirurgia Geral", suggestedImportance: "media", catalogItemId: "item-ap", relevanceScore: 6.5 },
];
const courseProfile = { exam_date: "2027-03-01", course_catalog_source: "course", course_catalog_release_id: "release-medway" } as never;

function renderModal(overrides: Partial<Parameters<typeof TopicFormModal>[0]> = {}) {
  const props = { userId: "student-1", onClose: vi.fn(), onSaved: vi.fn(), ...overrides };
  render(<TopicFormModal {...props} />);
  return props;
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;
const submitButton = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
  mocks.loadSuggestions.mockReset().mockResolvedValue(catalog);
  mocks.findExisting.mockReset().mockResolvedValue(null);
  mocks.blockError = null;
  mocks.findMatches.mockReset().mockResolvedValue([]);
  mocks.findDate.mockReset().mockResolvedValue("2026-10-20");
  mocks.updateBlock.mockReset().mockResolvedValue(undefined);
  mocks.inserts.length = 0;
  mocks.deletes.length = 0;
  mocks.contactError = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TopicFormModal", () => {
  it("starts on the first catalog topic once the list loads", async () => {
    renderModal();
    expect(submitButton("Registrar tema").disabled).toBe(true);
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    expect(select("Grande área").value).toBe("Clínica Médica");
    expect(select("Especialidade").value).toBe("Cardiologia");
    expect(submitButton("Registrar tema").disabled).toBe(false);
  });

  it("narrows specialties and topics when the area changes", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    await user.selectOptions(select("Grande área"), "Cirurgia");
    expect(select("Especialidade").value).toBe("Cirurgia Geral");
    expect([...select("Tema").options].map(option => option.value)).toEqual(["Apendicite"]);
  });

  it("registers the first contact with the scheduled review and no Calendar state", async () => {
    const user = userEvent.setup();
    const props = renderModal({ profile: { exam_date: "2027-03-01", course_catalog_source: "metamed" } as never });
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    fireEvent.change(screen.getByLabelText("Questões"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Acertos"), { target: { value: "16" } });
    await user.click(submitButton("Registrar tema"));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    const block = mocks.inserts.find(insert => insert.table === "question_blocks")!.row;
    expect(block).toMatchObject({
      user_id: "student-1", title: "Insuficiência cardíaca", specialty: "Cardiologia", major_area: "Clínica Médica",
      importance: "alta", question_count: 20, correct_count: 16, planned_review_date: "2026-10-20", planning_source: "automatic",
    });
    expect(Object.keys(block).filter(key => key.startsWith("calendar_"))).toEqual([]);
    expect(mocks.findDate).toHaveBeenCalledWith({ userId: "student-1", targetDate: block.next_review_date });
    expect(mocks.inserts.find(insert => insert.table === "block_reviews")!.row)
      .toMatchObject({ block_id: "new-block", contact_type: "first_contact", correct_count: 16 });
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("removes the new topic again when its first contact cannot be saved", async () => {
    const user = userEvent.setup();
    mocks.contactError = { message: "insert failed" };
    const props = renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    await user.click(submitButton("Registrar tema"));

    expect(await screen.findByText(/O tema foi revertido/)).toBeTruthy();
    expect(mocks.deletes).toEqual([{ table: "question_blocks", filters: { id: "new-block", user_id: "student-1" } }]);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("edits only the classification of an existing topic", async () => {
    const user = userEvent.setup();
    const block = questionBlockFixture({ title: "Arritmias", specialty: "Cardiologia" });
    const props = renderModal({ block });
    await waitFor(() => expect(select("Tema").value).toBe("Arritmias"));
    expect(screen.queryByText("Desempenho no primeiro contato")).toBeNull();
    await user.selectOptions(select("Tema"), "Insuficiência cardíaca");
    await user.click(submitButton("Salvar alterações"));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(mocks.updateBlock).toHaveBeenCalledWith({
      blockId: "block-1",
      userId: "student-1",
      changes: expect.objectContaining({ title: "Insuficiência cardíaca", specialty: "Cardiologia", importance: "alta", priority_weight: 3 }),
    });
    expect(mocks.inserts).toEqual([]);
  });

  it("keeps a legacy topic that is no longer in the catalog selectable", async () => {
    renderModal({ block: questionBlockFixture({ title: "Tema antigo", specialty: "Cardiologia", major_area: "Clínica Médica" }) });
    await waitFor(() => expect(select("Tema").value).toBe("Tema antigo"));
  });

  it("shows why the catalog could not be loaded", async () => {
    mocks.loadSuggestions.mockRejectedValueOnce(new Error("Não foi possível carregar a lista de temas."));
    renderModal();
    expect(await screen.findByText("Não foi possível carregar a lista de temas.")).toBeTruthy();
    expect(submitButton("Registrar tema").disabled).toBe(true);
  });

  it("registers a course lesson with its catalog identity and suggested importance", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    renderModal({ profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-ic"));
    await user.click(submitButton("Registrar tema"));

    await waitFor(() => expect(mocks.inserts).toHaveLength(2));
    expect(mocks.inserts[0].row).toMatchObject({
      title: "Insuficiência Cardíaca", source: "Medway · Extensivo R1 2026", importance: "alta",
      catalog_item_id: "item-ic", relevance_version_id: "publication-v3", relevance_score: 8.4,
      engine_relevance: 8.4, canonical_topic_id: null,
    });
    expect(mocks.inserts[1].row).toMatchObject({
      contact_type: "first_contact", catalog_item_id: "item-ic", relevance_version_id: "publication-v3", relevance_score: 8.4,
    });
  });

  it("finds a lesson by synonym and selects it only when the student picks it", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    mocks.findMatches.mockImplementation(async ({ query }: { query: string }) => query === "ICC" ? [courseCatalog[0]] : []);
    renderModal({ profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-ic"));
    await user.selectOptions(select("Grande área"), "Cirurgia Geral");
    await user.type(screen.getByLabelText("Buscar tema"), "ICC");

    const result = await screen.findByRole("button", { name: /Insuficiência Cardíaca/ });
    expect(select("Tema").value).toBe("item-ap");
    expect(mocks.findMatches).toHaveBeenLastCalledWith(expect.objectContaining({ query: "ICC", releaseId: "release-medway" }));
    await user.click(result);
    expect(select("Tema").value).toBe("item-ic");
  });

  it("registers a topic of the student's own when the lesson is missing", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    renderModal({ profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-ic"));
    await user.click(screen.getByRole("button", { name: "Não encontrei meu tema" }));
    await user.type(screen.getByLabelText("Nome do tema"), "Síndrome disfágica");
    await user.type(screen.getByLabelText("Especialidade do tema"), "Gastroenterologia");
    await user.selectOptions(select("Importância"), "alta");
    await user.click(submitButton("Registrar tema"));

    await waitFor(() => expect(mocks.inserts).toHaveLength(2));
    const block = mocks.inserts[0].row;
    expect(block).toMatchObject({
      title: "Síndrome disfágica", source: "Tema próprio", major_area: "Clínica Médica",
      specialty: "Gastroenterologia", importance: "alta", suggested_importance: null,
      engine_relevance: 8.5, canonical_topic_id: null,
    });
    expect(block).not.toHaveProperty("catalog_item_id");
    expect(mocks.inserts[1].row).not.toHaveProperty("catalog_item_id");
  });

  it("suggests a similar lesson for a new topic without linking it silently", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    mocks.findMatches.mockImplementation(async ({ query }: { query: string }) => query.startsWith("Insuf") ? [courseCatalog[0]] : []);
    renderModal({ profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-ic"));
    await user.selectOptions(select("Grande área"), "Cirurgia Geral");
    await user.click(screen.getByRole("button", { name: "Não encontrei meu tema" }));
    await user.type(screen.getByLabelText("Nome do tema"), "Insuficiencia cardiaca");

    const similar = await screen.findByRole("list", { name: "Aulas parecidas" });
    expect(similar.textContent).toContain("Insuficiência Cardíaca");
    expect(screen.getByLabelText("Nome do tema")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Usar esta aula" }));
    expect(select("Tema").value).toBe("item-ic");
  });

  it("links a legacy topic to the matching course lesson when saved", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    const block = questionBlockFixture({ title: "Arritmias, Síncope e PCR", specialty: "Cardiologia", source: "MetaMed" });
    const props = renderModal({ block, profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-arr"));
    expect(screen.getByText(/passa a usar a aula/).textContent).toContain("Medway · Extensivo R1 2026");
    await user.click(submitButton("Salvar alterações"));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(mocks.updateBlock).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({
        catalog_item_id: "item-arr", relevance_version_id: "publication-v3", relevance_score: 7.1,
        source: "Medway · Extensivo R1 2026",
      }),
    }));
  });

  it("saves a Lista MetaMed topic with its relevancia_global and the category derived from it", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue([
      { title: "Insuficiência cardíaca crônica", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia",
        suggestedImportance: "alta", relevanceScore: 9, canonicalTopicId: "CM-CAR-004", sourceLabel: "MetaMed" },
      { title: "Síncope", catalogArea: "Clínica Médica", majorArea: "Clínica Médica", specialty: "Cardiologia",
        suggestedImportance: "media", relevanceScore: 6, canonicalTopicId: "CM-CAR-011", sourceLabel: "MetaMed" },
    ] satisfies CatalogTopic[]);
    renderModal({ profile: { exam_date: "2027-03-01", course_catalog_source: "metamed" } as never });
    await waitFor(() => expect(select("Tema").value).toBe("CM-CAR-004"));
    await user.selectOptions(select("Tema"), "CM-CAR-011");
    await user.click(submitButton("Registrar tema"));

    await waitFor(() => expect(mocks.inserts).toHaveLength(2));
    expect(mocks.inserts[0].row).toMatchObject({
      title: "Síncope", source: "MetaMed", canonical_topic_id: "CM-CAR-011", engine_relevance: 6,
      importance: "media", suggested_importance: "media",
    });
    expect(mocks.inserts[0].row).not.toHaveProperty("catalog_item_id");
  });

  it("keeps a topic linked to a lesson read-only", async () => {
    renderModal({ block: questionBlockFixture({ catalog_item_id: "item-ic", source: "Medway · Extensivo R1 2026" }), profile: courseProfile });
    expect(screen.getByText(/vinculado a uma aula do seu cursinho/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Salvar alterações" })).toBeNull();
    expect(mocks.loadSuggestions).not.toHaveBeenCalled();
  });

  it("dates the first contact by the student's planning timezone, not the device clock", async () => {
    // 03:30 UTC on 12/10 is still 23:30 on 11/10 in Manaus.
    vi.setSystemTime(new Date("2026-10-12T03:30:00Z"));
    renderModal({ profile: { exam_date: "2027-03-01", timezone: "America/Manaus", course_catalog_source: "metamed" } as never });
    const date = screen.getByLabelText("Data do primeiro contato") as HTMLInputElement;
    expect(date.value).toBe("2026-10-11");
    expect(date.max).toBe("2026-10-11");
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    await user.keyboard("{Escape}");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("blocks more correct answers than questions", async () => {
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    fireEvent.change(screen.getByLabelText("Questões"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Acertos"), { target: { value: "12" } });
    expect(submitButton("Registrar tema").disabled).toBe(true);
    expect(screen.getByText("Os acertos não podem passar do número de questões.")).toBeTruthy();
  });

  it("refuses a topic the student already registered and points to where to continue it", async () => {
    const user = userEvent.setup();
    mocks.loadSuggestions.mockResolvedValue(courseCatalog);
    mocks.findExisting.mockResolvedValue({
      id: "old", title: "Insuficiência Cardíaca", archived_at: null, study_date: "2026-09-20",
      last_review_date: "2026-10-01", next_review_date: "2026-10-08", planned_review_date: null,
    });
    renderModal({ profile: courseProfile });
    await waitFor(() => expect(select("Tema").value).toBe("item-ic"));
    await user.click(submitButton("Registrar tema"));

    const notice = await screen.findByRole("alert");
    expect(notice.textContent).toBe("\"Insuficiência Cardíaca\" já está nos seus temas. O último contato foi em 01/10, e a próxima revisão "
      + "estava prevista para 08/10. Para estudá-lo de novo, registre uma revisão pelo Início ou pelo Calendário.");
    expect(notice.querySelector("strong")?.textContent).toBe("revisão");
    expect(mocks.findExisting).toHaveBeenCalledWith(expect.objectContaining({ catalogItemId: "item-ic" }));
    expect(mocks.inserts).toHaveLength(0);
  });

  it("explains a copy saved by a double click between the check and the insert", async () => {
    const user = userEvent.setup();
    mocks.findExisting.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "other", title: "Insuficiência cardíaca", archived_at: null, study_date: "2026-10-11",
      last_review_date: "2026-10-11", next_review_date: "2026-10-25", planned_review_date: "2026-10-26",
    });
    mocks.blockError = { code: "23505", message: "duplicate key value violates unique constraint" };
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    await user.click(submitButton("Registrar tema"));
    expect((await screen.findByRole("alert")).textContent).toContain("está prevista para 26/10");
  });

  it("sends an archived copy back to the archive instead of registering it again", async () => {
    const user = userEvent.setup();
    mocks.findExisting.mockResolvedValue({
      id: "old", title: "Insuficiência cardíaca", archived_at: "2026-10-20T10:00:00Z", study_date: "2026-09-20",
      last_review_date: null, next_review_date: "2026-09-30", planned_review_date: null,
    });
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    await user.click(submitButton("Registrar tema"));
    expect((await screen.findByRole("alert")).textContent).toContain("está nos Arquivados. O último contato foi em 20/09.");
    expect(mocks.inserts).toHaveLength(0);
  });

  it("explains a small sample in plain words and registers it only after the student confirms", async () => {
    const user = userEvent.setup();
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    fireEvent.change(screen.getByLabelText("Questões"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Acertos"), { target: { value: "7" } });
    expect(screen.getByText(/percentual de acerto ainda não é confiável/)).toBeTruthy();
    expect(submitButton("Registrar tema").disabled).toBe(true);
    await user.click(screen.getByLabelText("Entendi, quero registrar mesmo assim"));
    expect(submitButton("Registrar tema").disabled).toBe(false);
  });
});
