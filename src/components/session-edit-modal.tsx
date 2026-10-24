"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { SmallSampleNotice } from "@/components/small-sample-notice";
import { cleanCount, readCounts } from "@/lib/count-input";
import type { BlockReview, DifficultyRating, QuestionBlock } from "@/lib/database.types";
import { planningToday } from "@/lib/planning-date";
import { editLastBlockSession, loadLastSession, recalculateSession } from "@/lib/revision-actions";
import { getCalculationMode } from "@/lib/revision-engine";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

const difficultyOptions: DifficultyRating[] = [
  "Muito fácil",
  "Fácil",
  "Médio",
  "Difícil",
  "Muito difícil",
];

/**
 * Corrects the last session of a topic (first contact or newest review). The
 * next review is recalculated from the corrected numbers; older sessions stay locked.
 */
export function SessionEditModal({
  block,
  userId,
  examDate,
  timezone,
  onClose,
  onSaved,
  onEditClassification,
}: {
  block: QuestionBlock;
  userId: string;
  examDate?: string | null;
  timezone?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Opens the topic's classification; the link is hidden where it is not available. */
  onEditClassification?: () => void;
}) {
  const [session, setSession] = useState<BlockReview | null>(null);
  const [previousDate, setPreviousDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewDate, setReviewDate] = useState("");
  const [questionCount, setQuestionCount] = useState("20");
  const [correctCount, setCorrectCount] = useState("0");
  const [smallSampleConfirmed, setSmallSampleConfirmed] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyRating>("Médio");
  const [timeSpent, setTimeSpent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const panelRef = useModalAccessibility(onClose, submitting);
  const today = planningToday(timezone);

  useEffect(() => {
    let active = true;
    loadLastSession(block)
      .then(result => {
        if (!active) return;
        setSession(result.session);
        setPreviousDate(result.previousDate);
        if (result.session) {
          setReviewDate(result.session.review_date);
          setQuestionCount(String(result.session.question_count));
          setCorrectCount(String(result.session.correct_count));
          // A session already saved with a small sample was confirmed when it was recorded.
          setSmallSampleConfirmed(getCalculationMode(result.session.question_count) === "small_sample");
          setDifficulty(result.session.perceived_difficulty);
          setTimeSpent(result.session.time_spent_minutes?.toString() ?? "");
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a última sessão."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [block]);

  const counts = readCounts(questionCount, correctCount);
  const questions = counts.questionCount ?? 0;
  const correct = counts.correctCount ?? 0;
  const preview = useMemo(() => session && reviewDate && counts.valid
    ? recalculateSession({ block, session, reviewDate, questionCount: questions, correctCount: correct, perceivedDifficulty: difficulty, examDate })
    : null, [block, correct, counts.valid, difficulty, examDate, questions, reviewDate, session]);
  const smallSample = questions > 0 && getCalculationMode(questions) === "small_sample";
  const countsReady = counts.valid && (!smallSample || smallSampleConfirmed);
  const firstContact = session?.contact_type === "first_contact";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !countsReady) return;
    setSubmitting(true);
    setError(null);
    try {
      await editLastBlockSession({
        block,
        session,
        userId,
        reviewDate,
        questionCount: questions,
        correctCount: correct,
        perceivedDifficulty: difficulty,
        timeSpentMinutes: timeSpent ? Number(timeSpent) : null,
        examDate,
      });
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a sessão.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={submitting} onMouseDown={event => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <div ref={panelRef} tabIndex={-1} className="modal-panel max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">{session ? firstContact ? "Primeiro contato" : "Última revisão" : "Última sessão"}</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-gray-900">Editar sessão</h2>
            <p className="mt-1 text-sm text-gray-500">{block.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting} className="icon-button" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-gray-500">Carregando a última sessão...</p>
        ) : !session ? (
          <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-6 text-gray-600">
            Este tema foi cadastrado antes do registro de sessões, então não há uma sessão para editar.
          </p>
        ) : (
          <form id="session-edit-form" onSubmit={submit} className="mt-6">
            <fieldset disabled={submitting} className="space-y-4">
              <Field label={firstContact ? "Data do primeiro contato" : "Data da revisão"}>
                <input
                  type="date"
                  data-modal-initial-focus
                  required
                  value={reviewDate}
                  min={previousDate ?? undefined}
                  max={today}
                  onChange={event => setReviewDate(event.target.value)}
                  className="field-control"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Questões">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    required
                    value={questionCount}
                    onChange={event => setQuestionCount(cleanCount(event.target.value))}
                    className="field-control"
                  />
                </Field>
                <Field label="Acertos">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    required
                    value={correctCount}
                    onChange={event => setCorrectCount(cleanCount(event.target.value))}
                    className="field-control"
                  />
                </Field>
              </div>
              {counts.tooManyCorrect && <p className="text-sm text-red-700">Os acertos não podem passar do número de questões.</p>}

              <Field label="Dificuldade percebida">
                <select value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyRating)} className="field-control">
                  {difficultyOptions.map(option => <option key={option}>{option}</option>)}
                </select>
              </Field>

              <Field label="Tempo em minutos" optional>
                <input type="number" min={0} value={timeSpent} onChange={event => setTimeSpent(event.target.value)} className="field-control" />
              </Field>

              <div className={`rounded-md border px-3.5 py-3 text-sm ${smallSample ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-gray-600">Próxima revisão</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {preview?.nextReviewDate ? `${formatDate(preview.nextReviewDate)} · ${preview.intervalDays} dias` : "—"}
                  </span>
                </div>
                {smallSample && <SmallSampleNotice confirmed={smallSampleConfirmed} onConfirmedChange={setSmallSampleConfirmed} />}
              </div>
              <p className="text-xs leading-5 text-gray-500">Só a última sessão pode ser corrigida. Ao salvar, a próxima revisão é recalculada a partir destes dados.</p>
            </fieldset>
          </form>
        )}

        {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

        <div className={`mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5 ${onEditClassification ? "justify-between" : "justify-end"}`}>
          {onEditClassification && (
            <button type="button" onClick={onEditClassification} disabled={submitting} className="text-sm font-semibold text-blue-700 hover:underline">
              Editar classificação do tema
            </button>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="button-secondary">Cancelar</button>
            {session && (
              <button type="submit" form="session-edit-form" disabled={submitting || !countsReady} className="button-primary">
                <Check size={16} /> {submitting ? "Salvando..." : "Salvar sessão"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-gray-900">
        {label}
        {optional && <span className="text-xs font-normal text-gray-500">Opcional</span>}
      </span>
      {children}
    </label>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
