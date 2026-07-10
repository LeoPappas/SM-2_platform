"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  addDays,
  addMonths,
  differenceInDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { calendarSyncPatchFromResult } from "@/lib/calendar";
import { createOrUpdateCalendarEventWithAuth } from "@/lib/calendar-auth";
import type { BlockReview, DifficultyRating, QuestionBlock } from "@/lib/database.types";
import { getGoogleProviderToken, persistGoogleProviderToken } from "@/lib/google-provider-token";
import { calculateAccuracy, calculateBlockReview } from "@/lib/sm2";
import { supabase } from "@/lib/supabase";

type CalendarEvent = {
  type: "completed" | "scheduled" | "missed" | "first-contact";
  label: string;
  block: QuestionBlock;
  date: string;
};

const difficultyOptions: DifficultyRating[] = [
  "Muito fácil",
  "Fácil",
  "Médio",
  "Difícil",
  "Muito difícil",
];

export default function CalendarioPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [actionOpen, setActionOpen] = useState<CalendarEvent | null>(null);
  const [reviewOpen, setReviewOpen] = useState<QuestionBlock | null>(null);
  const [reviewDate, setReviewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rescheduleOpen, setRescheduleOpen] = useState<CalendarEvent | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [questionCount, setQuestionCount] = useState(20);
  const [correctCount, setCorrectCount] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyRating>("Médio");

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 6000);
  }, []);

  const fetchData = useCallback(async (userId: string) => {
    const [blocksRes, reviewsRes] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId).order("next_review_date", { ascending: true }),
      supabase.from("block_reviews").select("*").eq("user_id", userId).order("review_date", { ascending: true }),
    ]);

    if (blocksRes.error) showError("Erro ao carregar blocos.");
    else setBlocks(blocksRes.data ?? []);
    if (reviewsRes.error) showError("Erro ao carregar revisões.");
    else setReviews(reviewsRes.data ?? []);
    setLoading(false);
  }, [showError]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      persistGoogleProviderToken(session);
      setSession(session);
      if (session) fetchData(session.user.id);
      else setLoading(false);
    });
  }, [fetchData]);

  const getValidToken = async () => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (freshSession) {
      persistGoogleProviderToken(freshSession);
      setSession(freshSession);
    }
    return getGoogleProviderToken();
  };

  const openReview = (block: QuestionBlock, date?: string) => {
    setActionOpen(null);
    setReviewOpen(block);
    setReviewDate(date && date <= format(new Date(), "yyyy-MM-dd") ? date : format(new Date(), "yyyy-MM-dd"));
    setQuestionCount(block.question_count);
    setCorrectCount(block.correct_count);
    setDifficulty(block.perceived_difficulty);
  };

  const openReschedule = (calendarEvent: CalendarEvent) => {
    setActionOpen(null);
    setRescheduleOpen(calendarEvent);
    setRescheduleDate(calendarEvent.date);
  };

  const submitReschedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !rescheduleOpen || !rescheduleDate) return;
    setSubmitting(true);

    const block = rescheduleOpen.block;
    let calendarPatch = {};
    let calendarSyncMessage: string | null = null;

    if (block.calendar_sync_enabled) {
      await getValidToken();
      const syncResult = await createOrUpdateCalendarEventWithAuth({
        eventId: block.calendar_event_id,
        summary: block.title,
        description: [
          `Área: ${block.area_name}`,
          `Questões: ${block.question_count}`,
          `Revisão remarcada manualmente para ${rescheduleDate}.`,
        ].join("\n"),
        date: rescheduleDate,
      });
      calendarPatch = calendarSyncPatchFromResult(syncResult);
      if (!syncResult.ok) calendarSyncMessage = syncResult.message;
    }

    const { error } = await supabase
      .from("question_blocks")
      .update({
        next_review_date: rescheduleDate,
        ...calendarPatch,
      })
      .eq("id", block.id);

    if (error) {
      showError("Erro ao remarcar revisão.");
      setSubmitting(false);
      return;
    }

    setRescheduleOpen(null);
    setSubmitting(false);
    if (calendarSyncMessage) showError(`Revisão remarcada, mas o Google Calendar não foi atualizado: ${calendarSyncMessage}`);
    fetchData(session.user.id);
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !reviewOpen || correctCount > questionCount) return;
    setSubmitting(true);

    const selectedDate = startOfDay(new Date(`${reviewDate}T00:00:00`));
    const scheduledDate = startOfDay(new Date(`${reviewOpen.next_review_date}T00:00:00`));
    const daysDelayed = differenceInDays(selectedDate, scheduledDate);
    const accuracy = calculateAccuracy(correctCount, questionCount);
    const result = calculateBlockReview({
      accuracy,
      perceivedDifficulty: difficulty,
      repetitions: reviewOpen.repetitions,
      previousInterval: reviewOpen.interval_days,
      previousEF: reviewOpen.easiness_factor,
      daysDelayed,
      priorityWeight: reviewOpen.priority_weight,
    });
    const nextReviewDate = format(addDays(selectedDate, result.intervalDays), "yyyy-MM-dd");

    const { error: reviewError } = await supabase.from("block_reviews").insert({
      block_id: reviewOpen.id,
      user_id: session.user.id,
      review_date: reviewDate,
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: accuracy,
      perceived_difficulty: difficulty,
      sm2_grade_calculated: result.q,
      previous_next_review_date: reviewOpen.next_review_date,
      new_next_review_date: nextReviewDate,
    });

    if (reviewError) {
      showError("Erro ao salvar revisão.");
      setSubmitting(false);
      return;
    }

    let calendarPatch = {};
    if (reviewOpen.calendar_sync_enabled) {
      await getValidToken();
      const syncResult = await createOrUpdateCalendarEventWithAuth({
        eventId: reviewOpen.calendar_event_id,
        summary: reviewOpen.title,
        description: `Área: ${reviewOpen.area_name}\nQuestões: ${questionCount}\nAcertos: ${correctCount} (${accuracy}%)`,
        date: nextReviewDate,
      });
      calendarPatch = calendarSyncPatchFromResult(syncResult);
    }

    const { error: updateError } = await supabase
      .from("question_blocks")
      .update({
        question_count: questionCount,
        correct_count: correctCount,
        accuracy_percentage: accuracy,
        perceived_difficulty: difficulty,
        repetitions: result.repetitions,
        easiness_factor: result.easinessFactor,
        interval_days: result.intervalDays,
        next_review_date: nextReviewDate,
        ...calendarPatch,
      })
      .eq("id", reviewOpen.id);

    if (updateError) showError("Revisão salva, mas o bloco não foi atualizado.");

    setReviewOpen(null);
    setSubmitting(false);
    fetchData(session.user.id);
  };

  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const reviewsByBlock = reviews.reduce<Record<string, BlockReview[]>>((acc, review) => {
    acc[review.block_id] = acc[review.block_id] ?? [];
    acc[review.block_id].push(review);
    return acc;
  }, {});
  const reviewsByDate = reviews.reduce<Record<string, BlockReview[]>>((acc, review) => {
    acc[review.review_date] = acc[review.review_date] ?? [];
    acc[review.review_date].push(review);
    return acc;
  }, {});

  const getScheduledLabel = (block: QuestionBlock) => {
    const completedReviews = reviewsByBlock[block.id]?.length ?? 0;
    return block.next_review_date <= block.study_date ? "PC" : `R-${completedReviews + 1}`;
  };

  const getEventsForDay = (dayStr: string): CalendarEvent[] => {
    const completed = reviewsByDate[dayStr] ?? [];
    const completedBlockIds = new Set(completed.map(review => review.block_id));
    const events: CalendarEvent[] = [];

    blocks.forEach(block => {
      if (block.study_date !== dayStr) return;
      events.push({ type: "first-contact", label: "PC", block, date: dayStr });
    });

    completed.forEach(review => {
      const block = blocks.find(item => item.id === review.block_id);
      if (!block) return;
      events.push({ type: "completed", label: `R-${Math.max(1, reviewsByBlock[block.id].findIndex(item => item.id === review.id) + 1)}`, block, date: dayStr });
    });

    blocks.forEach(block => {
      if (block.next_review_date !== dayStr || completedBlockIds.has(block.id)) return;
      events.push({ type: dayStr < todayStr ? "missed" : "scheduled", label: getScheduledLabel(block), block, date: dayStr });
    });

    return events;
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {errorMsg && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-3 text-red-700">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={16} /></button>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Calendário</h1>
          <p className="mt-1 text-sm text-gray-500">PC marca primeiro contato; R-n marca revisões agendadas ou registradas.</p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-center gap-6 border-b border-gray-100 py-5">
            <button onClick={() => setCurrentDate(date => subMonths(date, 1))} className="rounded-lg p-1.5 transition-colors hover:bg-gray-100">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <h2 className="w-52 text-center text-lg font-bold capitalize text-gray-900">
              {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <button onClick={() => setCurrentDate(date => addMonths(date, 1))} className="rounded-lg p-1.5 transition-colors hover:bg-gray-100">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-gray-100 px-6 py-3">
            <Legend tone="first-contact" label="Primeiro contato" />
            <Legend tone="scheduled" label="Agendada" />
            <Legend tone="completed" label="Concluída" />
            <Legend tone="missed" label="Atrasada" />
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100">
            {["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."].map(day => (
              <div key={day} className="py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 border-l border-t border-gray-100">
            {calDays.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const events = getEventsForDay(dayStr);
              const inMonth = isSameMonth(day, currentDate);
              const isToday = dayStr === todayStr;

              return (
                <div key={dayStr} className={`min-h-[112px] border-b border-r border-gray-100 p-1.5 ${!inMonth ? "bg-gray-50/60" : ""}`}>
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isToday ? "bg-blue-600 text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {events.slice(0, 4).map((event, index) => (
                      <button
                        key={`${event.block.id}-${event.type}-${index}`}
                        onClick={() => event.type !== "completed" && event.type !== "first-contact" && setActionOpen(event)}
                        disabled={event.type === "completed" || event.type === "first-contact"}
                        title={`${event.label} | ${event.block.title}`}
                        className={`w-full truncate rounded px-1.5 py-[3px] text-left text-[10px] font-semibold leading-[14px] transition-colors ${eventClass(event.type)}`}
                      >
                        {event.label} | {event.block.title}
                      </button>
                    ))}
                    {events.length > 4 && <div className="pt-0.5 text-center text-[10px] text-gray-400">+{events.length - 4}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {actionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{actionOpen.label} | {actionOpen.block.title}</h3>
                <p className="mt-1 text-sm text-gray-500">Agendada para {formatDateLabel(actionOpen.date)}</p>
              </div>
              <button onClick={() => setActionOpen(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => openReview(actionOpen.block, actionOpen.date)}
                disabled={actionOpen.date > todayStr}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Registrar revisão</span>
                  <span className="mt-0.5 block text-xs text-gray-500">Salva o desempenho e calcula a próxima data pelo SM-2.</span>
                </span>
                <Play size={16} className="text-green-600" />
              </button>

              <button
                type="button"
                onClick={() => openReschedule(actionOpen)}
                className="w-full rounded-lg border border-blue-200 px-4 py-3 text-left transition-colors hover:bg-blue-50"
              >
                <span className="block text-sm font-semibold text-gray-900">Remarcar revisão</span>
                <span className="mt-0.5 block text-xs text-gray-500">Move esta revisão no app e atualiza o mesmo evento no Google Calendar.</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {rescheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Remarcar revisão</h3>
                <p className="mt-1 text-sm text-gray-500">{rescheduleOpen.label} | {rescheduleOpen.block.title}</p>
              </div>
              <button onClick={() => setRescheduleOpen(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>

            <form onSubmit={submitReschedule} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Nova data</span>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={rescheduleOpen.block.study_date}
                  onChange={event => setRescheduleDate(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                O evento existente do Google Calendar será movido. Não será criado um segundo evento.
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setRescheduleOpen(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" disabled={submitting || !rescheduleDate} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : "Remarcar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Registrar revisão</h3>
                <p className="mt-1 text-sm text-gray-500">{reviewOpen.title}</p>
              </div>
              <button onClick={() => setReviewOpen(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
            </div>
            <form onSubmit={submitReview} className="space-y-4">
              <input type="date" value={reviewDate} max={todayStr} onChange={event => setReviewDate(event.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Questões" value={questionCount} min={1} onChange={setQuestionCount} />
                <NumberField label="Acertos" value={correctCount} min={0} max={questionCount} onChange={setCorrectCount} />
              </div>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Dificuldade</span>
                <select value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyRating)} className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {difficultyOptions.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                Acurácia calculada: <span className="font-semibold text-gray-900">{calculateAccuracy(correctCount, questionCount)}%</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setReviewOpen(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" disabled={submitting || correctCount > questionCount} className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                  <Play size={15} /> {submitting ? "Salvando..." : "Salvar revisão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ tone, label }: { tone: CalendarEvent["type"]; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-gray-500">
      <span className={`inline-block h-3 w-4 rounded ${legendClass(tone)}`} />
      {label}
    </span>
  );
}

function formatDateLabel(date: string) {
  return format(new Date(`${date}T00:00:00`), "dd/MM/yyyy");
}

function eventClass(type: CalendarEvent["type"]) {
  if (type === "first-contact") return "bg-blue-600 text-white cursor-default";
  if (type === "completed") return "bg-green-500 text-white cursor-default";
  if (type === "missed") return "border border-red-400 bg-white text-red-600 hover:bg-red-50";
  return "border border-green-500 bg-white text-green-700 hover:bg-green-50";
}

function legendClass(type: CalendarEvent["type"]) {
  if (type === "first-contact") return "bg-blue-600";
  if (type === "completed") return "bg-green-500";
  if (type === "missed") return "border border-red-400 bg-white";
  return "border border-green-500 bg-white";
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={event => onChange(Number(event.target.value))} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>
  );
}
