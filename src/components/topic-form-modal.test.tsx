/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogTopic } from "@/lib/medical-catalog";
import { questionBlockFixture } from "./test-fixtures";

const mocks = vi.hoisted(() => ({
  loadSuggestions: vi.fn(),
  findDate: vi.fn(),
  updateBlock: vi.fn(),
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  contactError: null as null | { message: string },
}));

vi.mock("@/lib/course-catalog", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/course-catalog")>()),
  loadCatalogSuggestions: mocks.loadSuggestions,
}));
vi.mock("@/lib/revision-actions", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/revision-actions")>()),
  findAutomaticReviewDate: mocks.findDate,
}));
vi.mock("@/lib/question-block-writes", () => ({ updateQuestionBlock: mocks.updateBlock }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        mocks.inserts.push({ table, row });
        const result = table === "question_blocks"
          ? { data: { ...row, id: "new-block" }, error: null }
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

  it("blocks more correct answers than questions", async () => {
    renderModal();
    await waitFor(() => expect(select("Tema").value).toBe("Insuficiência cardíaca"));
    fireEvent.change(screen.getByLabelText("Questões"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Acertos"), { target: { value: "12" } });
    expect(submitButton("Registrar tema").disabled).toBe(true);
  });
});
