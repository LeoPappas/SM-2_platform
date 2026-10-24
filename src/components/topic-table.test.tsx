/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { questionBlockFixture } from "./test-fixtures";
import { TopicTableHeader, TopicTableRow } from "./topic-table";

afterEach(cleanup);

function renderRow(overrides: Parameters<typeof questionBlockFixture>[0] = {}) {
  const handlers = { onEdit: vi.fn(), onHistory: vi.fn(), onArchive: vi.fn(), onRestore: vi.fn(), onDelete: vi.fn() };
  render(<TopicTableRow block={questionBlockFixture(overrides)} area="Cirurgia Geral" reviewCount={1} busy={false} {...handlers} />);
  return handlers;
}

describe("TopicTable", () => {
  it("labels the five columns, with the archive date in place of the next contact for archived topics", () => {
    const { rerender } = render(<TopicTableHeader archived={false} />);
    for (const label of ["Tema", "Número de contatos", "Último contato", "Próximo contato", "Ações"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    rerender(<TopicTableHeader archived />);
    expect(screen.getByText("Arquivado em")).toBeTruthy();
  });

  it("shows the area it is given, contacts, the last contact and the next contact", () => {
    renderRow({ last_review_date: "2026-10-20", next_review_date: "2026-10-27" });
    expect(screen.getByText("Cirurgia Geral · Cardiologia")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("contatos")).toBeTruthy();
    expect(screen.getByText("20/10/2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "27/10/2026" })).toBeTruthy();
  });

  it("explains the last contact's performance on hover", async () => {
    const user = userEvent.setup();
    renderRow({ last_review_date: "2026-10-20", accuracy_percentage: 45, importance: "alta" });
    await user.hover(screen.getByRole("button", { name: "Insuficiência cardíaca" }));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("Data: 20/10/2026");
    expect(tooltip.textContent).toContain("Acurácia: 45%");
    expect(tooltip.textContent).toContain("Importância: Alta");
    await user.unhover(screen.getByRole("button", { name: "Insuficiência cardíaca" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("counts the days from the last contact to the next one, and a click keeps it open", async () => {
    const user = userEvent.setup();
    renderRow({ last_review_date: null, study_date: "2026-10-20", next_review_date: "2026-10-27" });
    const next = screen.getByRole("button", { name: "27/10/2026" });
    await user.click(next);
    await user.unhover(next);
    expect(screen.getByRole("tooltip").textContent).toBe("7 dias após o último contato");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("explains in the header that the next contact is the calculated date", async () => {
    const user = userEvent.setup();
    render(<TopicTableHeader archived={false} />);
    await user.hover(screen.getByRole("button", { name: "Próximo contato" }));
    expect(screen.getByRole("tooltip").textContent).toContain("depende das vagas disponíveis");
  });

  it("deletes an active topic straight from its row", async () => {
    const user = userEvent.setup();
    const handlers = renderRow();
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    expect(handlers.onDelete).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Arquivar" })).toBeTruthy();
  });

  it("shows the archive date and the archived actions for an archived topic", async () => {
    const user = userEvent.setup();
    const handlers = renderRow({ archived_at: "2026-10-24T15:00:00Z" });
    expect(screen.getByText("24/10/2026")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(handlers.onRestore).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Excluir definitivamente" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arquivar" })).toBeNull();
  });
});
