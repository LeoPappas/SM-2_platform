/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudentProfile } from "@/lib/database.types";

const mocks = vi.hoisted(() => ({
  loadOptions: vi.fn(),
  rebalance: vi.fn(),
  upserts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/course-catalog", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/course-catalog")>()),
  loadCourseCatalogOptions: mocks.loadOptions,
}));
vi.mock("@/lib/revision-actions", () => ({ rebalanceAutomaticReviewSlots: mocks.rebalance }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      upsert: (row: Record<string, unknown>) => {
        mocks.upserts.push(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { ...row, study_days: row.study_days }, error: null }) }) };
      },
    }),
  },
}));

import { OnboardingPanel } from "./onboarding-panel";

const courses = [
  { id: "release-medway", providerCode: "medway", label: "Medway", releaseName: "Extensivo R1 2026", itemCount: 172 },
  { id: "release-medcof", providerCode: "medcof", label: "MedCof", releaseName: "Extensivo 2025 — R1 Acesso Direto", itemCount: 658 },
];

const pressed = (name: string | RegExp) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

beforeEach(() => {
  mocks.loadOptions.mockReset().mockResolvedValue(courses);
  mocks.rebalance.mockReset().mockResolvedValue(undefined);
  mocks.upserts.length = 0;
});
afterEach(cleanup);

describe("OnboardingPanel course choice", () => {
  it("saves the chosen course catalog with its lesson count", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<OnboardingPanel userId="student-1" onSaved={onSaved} />);
    await user.type(screen.getByLabelText("Vocativo preferido"), "Leo");
    fireEvent.change(screen.getByLabelText("Data da prova"), { target: { value: "2027-03-01" } });
    await user.click(await screen.findByRole("button", { name: /Medway/ }));
    await user.click(screen.getByRole("button", { name: /Concluir configuração/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.upserts[0]).toMatchObject({
      course_catalog_source: "course", course_catalog_release_id: "release-medway",
      course_catalog_filename: null, course_theme_total: 172,
    });
  });

  it("asks a new student to choose a course before finishing", async () => {
    const user = userEvent.setup();
    render(<OnboardingPanel userId="student-1" onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText("Vocativo preferido"), "Leo");
    fireEvent.change(screen.getByLabelText("Data da prova"), { target: { value: "2027-03-01" } });
    await user.click(screen.getByRole("button", { name: /Concluir configuração/ }));

    expect(await screen.findByText("Escolha o seu cursinho.")).toBeTruthy();
    expect(mocks.upserts).toEqual([]);
  });

  it("offers only the MetaMed list and the course catalogs, without descriptions", async () => {
    render(<OnboardingPanel userId="student-1" onSaved={vi.fn()} />);
    await screen.findByRole("button", { name: "MedCof" });
    const section = screen.getByRole("heading", { name: "Qual cursinho você faz?" }).closest("section")!;
    expect([...section.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Lista MetaMed", "Medway", "MedCof"]);
    expect(section.textContent).not.toMatch(/aulas|Outro|CSV/);
  });

  it("switches an existing course back to the MetaMed list", async () => {
    const user = userEvent.setup();
    const profile = {
      user_id: "student-1", preferred_name: "Leo", exam_date: "2027-03-01", study_days: [1, 2, 3], daily_theme_capacity: 2,
      course_catalog_source: "course", course_catalog_release_id: "release-medcof", course_theme_total: 658,
    } as unknown as StudentProfile;
    render(<OnboardingPanel userId="student-1" profile={profile} onSaved={vi.fn()} compact />);
    await waitFor(() => expect(pressed("MedCof")).toBe("true"));

    await user.click(screen.getByRole("button", { name: "Lista MetaMed" }));
    expect(pressed("MedCof")).toBe("false");
    await user.click(screen.getByRole("button", { name: /Salvar alterações/ }));

    await waitFor(() => expect(mocks.upserts).toHaveLength(1));
    expect(mocks.upserts[0]).toMatchObject({ course_catalog_source: "metamed", course_catalog_release_id: null, course_theme_total: 184 });
  });
});
