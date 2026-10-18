/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { questionBlockFixture } from "./test-fixtures";

const actions = vi.hoisted(() => ({ schedule: vi.fn(), unschedule: vi.fn() }));
vi.mock("@/lib/revision-actions", () => ({
  scheduleBlockReview: actions.schedule,
  unscheduleBlockReview: actions.unschedule,
}));

import { ScheduleReviewModal } from "./schedule-review-modal";

/** Monday, Wednesday and Friday have one slot each. */
const routineCapacity = (date: string) => [1, 3, 5].includes(new Date(`${date}T12:00:00`).getDay()) ? 1 : 0;

function renderModal(overrides: Partial<Parameters<typeof ScheduleReviewModal>[0]> = {}) {
  const props = {
    block: questionBlockFixture(),
    userId: "student-1",
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<ScheduleReviewModal {...props} />);
  return props;
}

const dateInput = () => screen.getByLabelText("Dia da revisão") as HTMLInputElement;

beforeEach(() => {
  actions.schedule.mockReset().mockResolvedValue(undefined);
  actions.unschedule.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("ScheduleReviewModal", () => {
  it("opens as a labelled dialog on the currently planned day", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Escolher um dia" })).toBeTruthy();
    expect(dateInput().value).toBe("2026-10-15");
  });

  it("never proposes a day before the allowed window", () => {
    renderModal({ block: questionBlockFixture({ planned_review_date: "2026-10-01" }), minDate: "2026-10-12" });
    expect(dateInput().value).toBe("2026-10-12");
  });

  it("saves the chosen day, refreshes the plan and closes", async () => {
    const user = userEvent.setup();
    const props = renderModal({ minDate: "2026-10-12", maxDate: "2026-10-18", capacityForDate: routineCapacity });
    await user.click(screen.getByRole("button", { name: /qua.*14/i }));
    expect(dateInput().value).toBe("2026-10-14");
    await user.click(screen.getByRole("button", { name: "Agendar" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(actions.schedule).toHaveBeenCalledWith({ block: props.block, userId: "student-1", date: "2026-10-14" });
    expect(props.onChanged).toHaveBeenCalledTimes(1);
  });

  it("only offers days with room as shortcuts and warns about other days", async () => {
    const user = userEvent.setup();
    renderModal({ minDate: "2026-10-12", maxDate: "2026-10-18", capacityForDate: routineCapacity });
    expect(screen.getAllByRole("button", { name: /\d{2}/ })).toHaveLength(3);
    // 2026-10-15 is a Thursday, outside the Monday/Wednesday/Friday routine.
    expect(screen.getByText(/fora da sua disponibilidade/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /qua.*14/i }));
    expect(screen.queryByText(/fora da sua disponibilidade/)).toBeNull();
  });

  it("keeps the dialog open and explains a failed save", async () => {
    const user = userEvent.setup();
    actions.schedule.mockRejectedValueOnce(new Error("Este tema foi atualizado em outra sessão."));
    const props = renderModal();
    await user.click(screen.getByRole("button", { name: "Agendar" }));
    expect(await screen.findByText("Este tema foi atualizado em outra sessão.")).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });

  it("returns a manual choice to the automatic suggestion", async () => {
    const user = userEvent.setup();
    const props = renderModal({ block: questionBlockFixture({ planning_source: "manual" }) });
    await user.click(screen.getByRole("button", { name: "Usar sugestão automática" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(actions.unschedule).toHaveBeenCalledWith({ block: props.block, userId: "student-1" });
    expect(actions.schedule).not.toHaveBeenCalled();
  });

  it("hides the automatic-suggestion action when nothing is planned", () => {
    renderModal({ block: questionBlockFixture({ planned_review_date: null }) });
    expect(screen.queryByRole("button", { name: "Usar sugestão automática" })).toBeNull();
  });

  it("closes with Escape, the close button or a click on the backdrop", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    await user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("dialog") });
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it("does not mention an external calendar", () => {
    renderModal();
    expect(screen.getByRole("dialog").textContent).not.toMatch(/Google|sincroniz/i);
  });
});
