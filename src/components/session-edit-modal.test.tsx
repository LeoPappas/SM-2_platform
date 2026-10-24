/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockReview } from "@/lib/database.types";
import { questionBlockFixture } from "./test-fixtures";

const actions = vi.hoisted(() => ({ load: vi.fn(), edit: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/revision-actions", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/revision-actions")>(),
  loadLastSession: actions.load,
  editLastBlockSession: actions.edit,
}));

import { SessionEditModal } from "./session-edit-modal";

const firstContact = {
  id: "first", block_id: "block-1", user_id: "student-1", review_date: "2026-10-03", question_count: 20, correct_count: 11,
  accuracy_percentage: 55, perceived_difficulty: "Médio", time_spent_minutes: null, contact_type: "first_contact",
  previous_interval_days: null, new_interval_days: 10, engine_relevance: 10,
} as BlockReview;

function renderModal() {
  const props = {
    block: questionBlockFixture({ repetitions: 0 }),
    userId: "student-1",
    timezone: "America/Sao_Paulo",
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onEditClassification: vi.fn(),
  };
  render(<SessionEditModal {...props} />);
  return props;
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  actions.load.mockResolvedValue({ session: firstContact, previousDate: null });
  actions.edit.mockResolvedValue({});
});
afterEach(cleanup);

describe("SessionEditModal", () => {
  it("opens the last session filled in and previews the recalculated review", async () => {
    renderModal();
    await waitFor(() => expect(field("Data do primeiro contato").value).toBe("2026-10-03"));
    expect(screen.getByText("Primeiro contato")).toBeTruthy();
    expect(field("Questões").value).toBe("20");
    expect(field("Acertos").value).toBe("11");
    expect(screen.getByText("13/10/2026 · 10 dias")).toBeTruthy();

    fireEvent.change(field("Acertos"), { target: { value: "18" } });
    expect(screen.getByText("24/10/2026 · 21 dias")).toBeTruthy();
  });

  it("saves the corrected numbers for that session", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await waitFor(() => expect(field("Acertos").value).toBe("11"));
    fireEvent.change(field("Acertos"), { target: { value: "18" } });
    await user.selectOptions(screen.getByLabelText("Dificuldade percebida"), "Difícil");
    await user.click(screen.getByRole("button", { name: /Salvar sessão/ }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(actions.edit).toHaveBeenCalledWith(expect.objectContaining({
      session: firstContact, reviewDate: "2026-10-03", questionCount: 20, correctCount: 18, perceivedDifficulty: "Difícil",
    }));
    expect(props.onSaved).toHaveBeenCalled();
  });

  it("keeps the classification one link away", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await user.click(screen.getByRole("button", { name: "Editar classificação do tema" }));
    expect(props.onEditClassification).toHaveBeenCalledOnce();
  });

  it("hides the classification link where the page does not offer it", async () => {
    render(<SessionEditModal block={questionBlockFixture({ repetitions: 0 })} userId="student-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await waitFor(() => expect(field("Acertos").value).toBe("11"));
    expect(screen.queryByRole("button", { name: "Editar classificação do tema" })).toBeNull();
  });

  it("explains a topic with no recorded session and offers only the classification", async () => {
    actions.load.mockResolvedValue({ session: null, previousDate: null });
    renderModal();
    expect(await screen.findByText(/não há uma sessão para editar/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Salvar sessão/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar classificação do tema" })).toBeTruthy();
  });

  it("shows why a save failed and stays open", async () => {
    const user = userEvent.setup();
    actions.edit.mockRejectedValue(new Error("Este tema recebeu outra sessão enquanto você editava."));
    const props = renderModal();
    await waitFor(() => expect(field("Acertos").value).toBe("11"));
    await user.click(screen.getByRole("button", { name: /Salvar sessão/ }));
    expect(await screen.findByText(/recebeu outra sessão/)).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
