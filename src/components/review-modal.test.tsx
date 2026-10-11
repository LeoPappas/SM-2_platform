/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteReviewInput } from "@/lib/revision-actions";
import { questionBlockFixture } from "./test-fixtures";

const actions = vi.hoisted(() => ({ complete: vi.fn(), preExam: vi.fn() }));
vi.mock("@/lib/revision-actions", () => ({
  completeBlockReview: actions.complete,
  setPreExamReviewRequest: actions.preExam,
}));

import { ReviewModal } from "./review-modal";

const calculation = (overrides = {}) => ({
  calculation: {
    accuracy: 90, intervalDays: 28, nextReviewDate: "2026-11-08", performanceBand: "bom",
    calculationMode: "performance", fallsAfterExam: false, ...overrides,
  },
});

function renderModal(overrides: Partial<Parameters<typeof ReviewModal>[0]> = {}) {
  const props = {
    block: questionBlockFixture(),
    userId: "student-1",
    examDate: "2026-12-01",
    initialDate: "2026-10-11",
    timezone: "America/Sao_Paulo",
    onClose: vi.fn(),
    onCompleted: vi.fn(),
    ...overrides,
  };
  render(<ReviewModal {...props} />);
  return props;
}

const field = (label: string | RegExp) => screen.getByLabelText(label) as HTMLInputElement;
// The number fields clamp on every keystroke, so set the final value in one change event.
function fill(label: string | RegExp, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
  actions.complete.mockReset().mockResolvedValue(calculation());
  actions.preExam.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReviewModal", () => {
  it("records the review with the typed numbers and closes", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    fill("Questões", "30");
    fill("Acertos", "27");
    await user.selectOptions(screen.getByLabelText("Dificuldade percebida"), "Fácil");
    fill(/Tempo em minutos/, "45");
    expect(screen.getByText("27/30 · 90%")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    const submitted = actions.complete.mock.calls[0][0] as CompleteReviewInput;
    expect(submitted).toMatchObject({
      block: props.block, userId: "student-1", reviewDate: "2026-10-11", questionCount: 30, correctCount: 27,
      perceivedDifficulty: "Fácil", timeSpentMinutes: 45, examDate: "2026-12-01",
    });
    expect(submitted.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(props.onCompleted).toHaveBeenCalledTimes(1);
  });

  it("warns that fewer than 20 questions switch to the difficulty-based interval", async () => {
    renderModal();
    expect(screen.queryByText(/menos de 20 questões/)).toBeNull();
    fill("Questões", "19");
    expect(screen.getByText(/menos de 20 questões/)).toBeTruthy();
  });

  it("flags an early review before the suggested date", async () => {
    renderModal({ initialDate: "2026-10-11", block: questionBlockFixture({ planned_review_date: "2026-10-15" }) });
    expect(screen.getByText(/revisão está sendo antecipada/)).toBeTruthy();
  });

  it("retries a failed save with exactly the same submission", async () => {
    const user = userEvent.setup();
    actions.complete.mockRejectedValueOnce(new Error("Não foi possível confirmar o salvamento da revisão."));
    const props = renderModal();
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    expect(await screen.findByText("Não foi possível confirmar o salvamento da revisão.")).toBeTruthy();
    expect(screen.getByText(/os mesmos dados serão enviados/)).toBeTruthy();
    expect(field("Questões").matches(":disabled")).toBe(true);

    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(actions.complete).toHaveBeenCalledTimes(2);
    expect(actions.complete.mock.calls[1][0]).toBe(actions.complete.mock.calls[0][0]);
  });

  it("asks about a last review when the next window falls after the exam", async () => {
    const user = userEvent.setup();
    actions.complete.mockResolvedValueOnce(calculation({ fallsAfterExam: true, intervalDays: 84 }));
    const props = renderModal();
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    expect(await screen.findByRole("dialog", { name: "A próxima janela cai depois da prova" })).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Garantir última revisão/ }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(actions.preExam).toHaveBeenCalledWith({ blockId: "block-1", userId: "student-1", requested: true });
    expect(props.onCompleted).toHaveBeenCalledTimes(2);
  });

  it("records the decision to skip the last review", async () => {
    const user = userEvent.setup();
    actions.complete.mockResolvedValueOnce(calculation({ fallsAfterExam: true }));
    renderModal();
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    await user.click(await screen.findByRole("button", { name: "Não preciso revisar" }));
    await waitFor(() => expect(actions.preExam).toHaveBeenCalledWith({ blockId: "block-1", userId: "student-1", requested: false }));
  });

  it("confirms the saved review when only the page refresh fails", async () => {
    const user = userEvent.setup();
    const props = renderModal({ onCompleted: vi.fn().mockRejectedValue(new Error("offline")) });
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    expect(await screen.findByRole("dialog", { name: "Revisão salva" })).toBeTruthy();
    expect(screen.getByText(/A revisão foi salva. Atualize a página/)).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("cannot be submitted with more correct answers than questions", async () => {
    renderModal();
    fill("Acertos", "25");
    expect((screen.getByRole("button", { name: "Salvar revisão" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not mention an external calendar after saving", async () => {
    const user = userEvent.setup();
    renderModal({ onCompleted: vi.fn().mockRejectedValue(new Error("offline")) });
    await user.click(screen.getByRole("button", { name: "Salvar revisão" }));
    expect((await screen.findByRole("dialog")).textContent).not.toMatch(/Google|Calendar|sincroniz/i);
  });
});
