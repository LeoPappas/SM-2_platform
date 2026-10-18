/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: api.rpc } }));

import { WeeklyAvailabilityModal } from "./weekly-availability-modal";

// 2026-10-12 is a Monday; ISO weekday keys 1..7.
const routine = { "1": 2, "2": 0, "3": 2, "4": 0, "5": 2, "6": 0, "7": 0 };

function renderModal(overrides: Partial<Parameters<typeof WeeklyAvailabilityModal>[0]> = {}) {
  const props = {
    weekStart: "2026-10-12",
    dailyCapacities: routine,
    hasOverride: false,
    onClose: vi.fn(),
    onSaved: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<WeeklyAvailabilityModal {...props} />);
  return props;
}

const dayInput = (weekday: string) => screen.getByRole("spinbutton", { name: `Revisões na ${weekday}` }) as HTMLInputElement;

beforeEach(() => api.rpc.mockReset().mockResolvedValue({ data: {}, error: null }));
afterEach(cleanup);

describe("WeeklyAvailabilityModal", () => {
  it("lists the seven days of the week with the routine capacity", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Ajustar esta semana" })).toBeTruthy();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(7);
    expect(dayInput("segunda-feira").value).toBe("2");
    expect(screen.getByText("6 revisões")).toBeTruthy();
  });

  it("saves only the days with capacity, refreshes and closes", async () => {
    const user = userEvent.setup();
    const props = renderModal();
    fireEvent.change(dayInput("terça-feira"), { target: { value: "3" } });
    fireEvent.change(dayInput("sexta-feira"), { target: { value: "0" } });
    expect(screen.getByText("7 revisões")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Salvar a semana/ }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(api.rpc).toHaveBeenCalledWith("save_weekly_availability", {
      p_week_start: "2026-10-12",
      p_study_days: [1, 2, 3],
      p_daily_capacities: { ...routine, "2": 3, "5": 0 },
    });
    expect(props.onSaved).toHaveBeenCalledTimes(1);
  });

  it("clamps each day between 0 and 20 reviews", () => {
    renderModal();
    fireEvent.change(dayInput("segunda-feira"), { target: { value: "35" } });
    fireEvent.change(dayInput("quarta-feira"), { target: { value: "-4" } });
    expect(dayInput("segunda-feira").value).toBe("20");
    expect(dayInput("quarta-feira").value).toBe("0");
  });

  it("explains that a week with no capacity schedules nothing automatically", () => {
    renderModal({ dailyCapacities: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 } });
    expect(screen.getByRole("status").textContent).toMatch(/Nenhuma revisão será distribuída/);
  });

  it("restores the usual routine only when the week was adjusted", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<WeeklyAvailabilityModal weekStart="2026-10-12" dailyCapacities={routine} hasOverride={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Usar rotina habitual/ })).toBeNull();
    unmount();

    const props = renderModal({ hasOverride: true });
    await user.click(screen.getByRole("button", { name: /Usar rotina habitual/ }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(api.rpc).toHaveBeenCalledWith("reset_weekly_availability", { p_week_start: "2026-10-12" });
  });

  it("keeps the dialog open when the database rejects the week", async () => {
    const user = userEvent.setup();
    api.rpc.mockResolvedValueOnce({ data: null, error: { message: "Closed weeks cannot change" } });
    const props = renderModal();
    await user.click(screen.getByRole("button", { name: /Salvar a semana/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Não foi possível salvar a disponibilidade desta semana.");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it("tells the student the week was saved when only the refresh fails", async () => {
    const user = userEvent.setup();
    renderModal({ onSaved: vi.fn().mockRejectedValue(new Error("offline")) });
    await user.click(screen.getByRole("button", { name: /Salvar a semana/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/A disponibilidade foi salva/);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    expect((screen.getByRole("button", { name: /Salvar a semana/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
