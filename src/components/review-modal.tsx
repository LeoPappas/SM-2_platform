"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, Check, Play, X } from "lucide-react";
import type { DifficultyRating, QuestionBlock } from "@/lib/database.types";
import { completeBlockReview, setPreExamReviewRequest } from "@/lib/revision-actions";
import { calculateAccuracy, getCalculationMode } from "@/lib/revision-engine";

const difficultyOptions: DifficultyRating[] = [
  "Muito fácil",
  "Fácil",
  "Médio",
  "Difícil",
  "Muito difícil",
];

type ReviewResult = Awaited<ReturnType<typeof completeBlockReview>>;

export function ReviewModal({
  block,
  userId,
  examDate,
  initialDate,
  onClose,
  onCompleted,
}: {
  block: QuestionBlock;
  userId: string;
  examDate?: string | null;
  initialDate?: string;
  onClose: () => void;
  onCompleted: () => void | Promise<void>;
}) {
  const [reviewDate, setReviewDate] = useState(initialDate ?? format(new Date(), "yyyy-MM-dd"));
  const [questionCount, setQuestionCount] = useState(block.question_count || 20);
  const [correctCount, setCorrectCount] = useState(block.correct_count);
  const [difficulty, setDifficulty] = useState<DifficultyRating>(block.perceived_difficulty);
  const [timeSpent, setTimeSpent] = useState(block.time_spent_minutes?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const accuracy = useMemo(
    () => calculateAccuracy(correctCount, questionCount),
    [correctCount, questionCount],
  );
  const smallSample = getCalculationMode(questionCount) === "small_sample";
  const suggestedDate = block.planned_review_date ?? block.next_review_date;
  const isEarlyReview = Boolean(reviewDate && suggestedDate && reviewDate < suggestedDate);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (correctCount > questionCount) return;
    setSubmitting(true);
    setError(null);

    try {
      const completed = await completeBlockReview({
        block,
        userId,
        reviewDate,
        questionCount,
        correctCount,
        perceivedDifficulty: difficulty,
        timeSpentMinutes: timeSpent ? Number(timeSpent) : null,
        examDate,
      });
      setResult(completed);
      await onCompleted();
      if (!completed.calculation.fallsAfterExam) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a revisão.");
    } finally {
      setSubmitting(false);
    }
  };

  const decidePreExam = async (requested: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      await setPreExamReviewRequest({ blockId: block.id, userId, requested });
      await onCompleted();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar sua decisão.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.calculation.fallsAfterExam) {
    return (
      <DialogShell onClose={onClose}>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-amber-100 text-amber-700">
          <CalendarClock size={22} />
        </div>
        <h2 className="mt-5 text-lg font-semibold text-gray-950">A próxima janela cai depois da prova</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          O intervalo calculado foi mantido em {result.calculation.intervalDays} dias. Você quer separar este tema para uma última revisão antes de {formatDate(examDate)}?
        </p>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => decidePreExam(true)}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Check size={16} /> Garantir última revisão
          </button>
          <button
            type="button"
            onClick={() => decidePreExam(false)}
            disabled={submitting}
            className="rounded-md border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Não preciso revisar
          </button>
        </div>
      </DialogShell>
    );
  }

  return (
    <DialogShell onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-emerald-700">{block.major_area} · {block.specialty}</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-950">Registrar revisão</h2>
          <p className="mt-1 text-sm text-gray-500">{block.title}</p>
        </div>
        <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Data da revisão">
          <input
            type="date"
            required
            value={reviewDate}
            min={block.last_review_date ?? block.study_date}
            max={format(new Date(), "yyyy-MM-dd")}
            onChange={event => setReviewDate(event.target.value)}
            className="field-control"
          />
        </Field>

        {isEarlyReview && (
          <p className="text-sm leading-5 text-amber-700">
            Esta revisão está sendo antecipada. Ao salvar, o agendamento atual será liberado e a próxima revisão partirá desta data.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Questões">
            <input
              type="number"
              min={1}
              required
              value={questionCount}
              onChange={event => {
                const value = Math.max(1, Number(event.target.value));
                setQuestionCount(value);
                setCorrectCount(current => Math.min(current, value));
              }}
              className="field-control"
            />
          </Field>
          <Field label="Acertos">
            <input
              type="number"
              min={0}
              max={questionCount}
              required
              value={correctCount}
              onChange={event => setCorrectCount(Math.max(0, Number(event.target.value)))}
              className="field-control"
            />
          </Field>
        </div>

        <Field label="Dificuldade percebida">
          <select
            value={difficulty}
            onChange={event => setDifficulty(event.target.value as DifficultyRating)}
            className="field-control"
          >
            {difficultyOptions.map(option => <option key={option}>{option}</option>)}
          </select>
        </Field>

        <Field label="Tempo em minutos" optional>
          <input
            type="number"
            min={0}
            value={timeSpent}
            onChange={event => setTimeSpent(event.target.value)}
            className="field-control"
          />
        </Field>

        <div className={`rounded-md border px-3.5 py-3 ${smallSample ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-gray-600">Desempenho</span>
            <span className="text-sm font-semibold tabular-nums text-gray-950">{correctCount}/{questionCount} · {accuracy}%</span>
          </div>
          {smallSample && (
            <div className="mt-2 flex gap-2 border-t border-amber-200 pt-2 text-xs leading-5 text-amber-900">
              <AlertTriangle className="mt-0.5 shrink-0" size={14} />
              Com menos de 20 questões, a dificuldade percebida define o intervalo. Complete 20 questões quando puder para usar o desempenho.
            </div>
          )}
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
          <button
            type="submit"
            disabled={submitting || correctCount > questionCount}
            className="button-primary"
          >
            <Play size={15} /> {submitting ? "Salvando..." : "Salvar revisão"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function DialogShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-xs font-normal text-gray-400">Opcional</span>}
      </span>
      {children}
    </label>
  );
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{children}</div>;
}

function formatDate(value?: string | null) {
  if (!value) return "a data definida";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
