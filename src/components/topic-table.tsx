"use client";

import { differenceInCalendarDays } from "date-fns";
import { Archive, ArchiveRestore, History, Pencil, Trash2 } from "lucide-react";
import { InfoTooltip } from "@/components/info-tooltip";
import type { QuestionBlock } from "@/lib/database.types";
import { importanceLabel } from "@/lib/revision-engine";

// Header and rows share the template so every column starts at the same edge.
const columns = "lg:grid-cols-[minmax(16rem,2fr)_minmax(7rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_10rem]";

export function TopicTableHeader({ archived }: { archived: boolean }) {
  return (
    <div className={`hidden rounded-t-lg border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold text-gray-500 lg:grid lg:gap-4 ${columns}`}>
      <span>Tema</span>
      <span>Número de contatos</span>
      <span>Último contato</span>
      {archived ? <span>Arquivado em</span> : (
        <span>
          <InfoTooltip content="Data calculada pelo algoritmo. O dia marcado para a revisão depende das vagas disponíveis na sua semana.">
            Próximo contato
          </InfoTooltip>
        </span>
      )}
      <span>Ações</span>
    </div>
  );
}

export function TopicTableRow({
  block,
  area,
  reviewCount,
  onEdit,
  onHistory,
  onArchive,
  onRestore,
  onDelete,
  busy,
}: {
  block: QuestionBlock;
  /** The course's area when the topic is a course lesson. */
  area: string;
  reviewCount: number;
  onEdit: () => void;
  onHistory: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const contactCount = reviewCount + 1;
  const lastContact = block.last_review_date ?? block.study_date;
  const daysUntilNext = differenceInCalendarDays(parseDate(block.next_review_date), parseDate(lastContact));

  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-left sm:grid-cols-3 lg:items-center ${columns}`}>
      <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
        <div className="flex min-w-0 items-center gap-2">
          <InfoTooltip
            className="truncate text-base font-semibold text-gray-900"
            content={(
              <span className="block space-y-0.5">
                <span className="block font-semibold">Último contato</span>
                <span className="block">Data: {formatDate(lastContact)}</span>
                <span className="block">Acurácia: {block.accuracy_percentage}%</span>
                <span className="block">Importância: {importanceLabel(block.importance)}</span>
              </span>
            )}
          >
            {block.title}
          </InfoTooltip>
          {block.major_area === "A classificar" && <span className="status-badge bg-amber-50 text-amber-700">Classificar</span>}
        </div>
        <p className="mt-1 truncate text-xs font-medium text-gray-500">{area} · {block.specialty}</p>
      </div>
      <Cell label="Número de contatos">
        <span className="font-semibold tabular-nums text-gray-900">{contactCount}</span>{" "}
        <span className="text-xs text-gray-500">{contactCount === 1 ? "contato" : "contatos"}</span>
      </Cell>
      <Cell label="Último contato">{formatDate(lastContact)}</Cell>
      <Cell label={block.archived_at ? "Arquivado em" : "Próximo contato"}>
        {block.archived_at ? formatDate(block.archived_at.slice(0, 10)) : (
          <InfoTooltip content={`${daysUntilNext} ${daysUntilNext === 1 ? "dia" : "dias"} após o último contato`}>
            {formatDate(block.next_review_date)}
          </InfoTooltip>
        )}
      </Cell>
      <div className="col-span-2 flex justify-start gap-1 sm:col-span-3 lg:col-span-1">
        <ActionButton label="Histórico" onClick={onHistory}><History size={15} /></ActionButton>
        {block.archived_at ? <>
          <ActionButton label="Restaurar" onClick={onRestore} disabled={busy}><ArchiveRestore size={15} /></ActionButton>
          <ActionButton label="Excluir definitivamente" onClick={onDelete} danger><Trash2 size={15} /></ActionButton>
        </> : <>
          <ActionButton label="Editar última sessão" onClick={onEdit}><Pencil size={15} /></ActionButton>
          <ActionButton label="Arquivar" onClick={onArchive}><Archive size={15} /></ActionButton>
          <ActionButton label="Excluir" onClick={onDelete} danger><Trash2 size={15} /></ActionButton>
        </>}
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 text-sm font-medium text-gray-700">
      <span className="mb-0.5 block text-xs font-normal text-gray-500 lg:hidden">{label}</span>
      {children}
    </div>
  );
}

function ActionButton({ label, onClick, danger, disabled, children }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`icon-button ${danger ? "hover:bg-red-50 hover:text-red-700" : ""}`}>
      {children}
    </button>
  );
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(parseDate(value));
}
