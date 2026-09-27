"use client";

import { useId, useMemo, useState } from "react";
import { eachDayOfInterval, format, getISODay } from "date-fns";
import { CalendarPlus, CalendarX, X } from "lucide-react";
import { BrandName } from "@/components/brand-name";
import type { QuestionBlock } from "@/lib/database.types";
import { scheduleBlockReview, unscheduleBlockReview } from "@/lib/revision-actions";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

export function ScheduleReviewModal({
  block,
  userId,
  minDate,
  maxDate,
  studyDays,
  onClose,
  onChanged,
}: {
  block: QuestionBlock;
  userId: string;
  minDate?: string;
  maxDate?: string;
  studyDays?: number[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [date, setDate] = useState(() => {
    const proposed = block.planned_review_date ?? minDate ?? block.next_review_date;
    return minDate && proposed < minDate ? minDate : proposed;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const panelRef = useModalAccessibility(onClose, submitting);
  const availableDates = useMemo(() => {
    if (!minDate || !maxDate || minDate > maxDate || !studyDays?.length) return [];
    return eachDayOfInterval({ start: new Date(`${minDate}T12:00:00`), end: new Date(`${maxDate}T12:00:00`) })
      .filter(day => studyDays.includes(getISODay(day)))
      .map(day => format(day, "yyyy-MM-dd")).slice(0, 7);
  }, [maxDate, minDate, studyDays]);
  const unavailableDay = Boolean(date && studyDays && !studyDays.includes(getISODay(new Date(`${date}T12:00:00`))));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const calendar = await scheduleBlockReview({ block, userId, date });
      setSaved(true);
      await onChanged();
      if (calendar.ok) onClose();
      else setError("A data foi salva na MetaMed. O Google Calendar ficou pendente; reconecte nas configurações para sincronizar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o planejamento. Atualize a página para conferir a data salva.");
    } finally {
      setSubmitting(false);
    }
  };

  const unschedule = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const calendar = await unscheduleBlockReview({ block, userId });
      setSaved(true);
      await onChanged();
      if (calendar.ok) onClose();
      else setError("A sugestão automática foi salva. O Google Calendar ficou pendente; reconecte nas configurações para sincronizar.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível remover o agendamento.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="dashboard-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={submitting}
      onMouseDown={event => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div ref={panelRef} tabIndex={-1} className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">{block.major_area} · {block.specialty}</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-gray-950">Escolher um dia</h2>
            <p className="mt-1 text-sm text-gray-500">{block.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="icon-button" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Dia da revisão</span>
            <input
              type="date"
              data-modal-initial-focus
              required
              value={date}
              min={minDate}
              max={maxDate}
              onChange={event => setDate(event.target.value)}
              className="field-control"
            />
          </label>

          {availableDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {availableDates.map(availableDate => (
                <button key={availableDate} type="button" onClick={() => setDate(availableDate)} className={`rounded-md border px-3 py-2 text-xs font-semibold ${date === availableDate ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit" }).format(new Date(`${availableDate}T12:00:00`))}
                </button>
              ))}
            </div>
          )}

          {unavailableDay && (
            <p className="text-sm leading-5 text-amber-700">
              Este dia fica fora da sua rotina habitual, mas você pode agendar a revisão nele.
            </p>
          )}

          <div className="rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-5 text-gray-600">
            Janela calculada pelo motor: <span className="font-semibold text-gray-900">{formatDate(block.next_review_date)}</span>.
            {block.calendar_sync_enabled
              ? " O mesmo dia será sincronizado com o Google Calendar."
              : <> O agendamento ficará apenas na <BrandName />.</>}
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {block.planned_review_date ? (
              <button
                type="button"
                onClick={unschedule}
                disabled={submitting || saved}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <CalendarX size={16} /> Usar sugestão automática
              </button>
            ) : <span />}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} disabled={submitting} className="button-secondary">{saved ? "Fechar" : "Cancelar"}</button>
              <button type="submit" disabled={submitting || saved || !date} className="button-primary">
                <CalendarPlus size={16} /> {submitting ? "Salvando..." : "Agendar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
