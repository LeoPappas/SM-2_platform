"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import {
  addDays,
  differenceInDays,
  eachDayOfInterval,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, ArrowRight, Clock, Play, Plus, X } from "lucide-react";
import {
  calendarSyncPatchFromResult,
} from "@/lib/calendar";
import { createOrUpdateCalendarEventWithAuth } from "@/lib/calendar-auth";
import type { DifficultyRating, QuestionBlock } from "@/lib/database.types";
import { getGoogleProviderToken, persistGoogleProviderToken } from "@/lib/google-provider-token";
import { calculateAccuracy, calculateBlockReview } from "@/lib/sm2";
import { supabase } from "@/lib/supabase";

const difficultyOptions: DifficultyRating[] = [
  "Muito fácil",
  "Fácil",
  "Médio",
  "Difícil",
  "Muito difícil",
];

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState<QuestionBlock | null>(null);
  const [reviewDate, setReviewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [questionCount, setQuestionCount] = useState(20);
  const [correctCount, setCorrectCount] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyRating>("Médio");
  const [timeSpent, setTimeSpent] = useState("");

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 6000);
  }, []);

  const fetchBlocks = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("question_blocks")
      .select("*")
      .eq("user_id", userId)
      .order("next_review_date", { ascending: true });

    if (error) showError("Erro ao carregar blocos. Tente recarregar a página.");
    else setBlocks(data ?? []);
    setLoading(false);
  }, [showError]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      persistGoogleProviderToken(session);
      setSession(session);
      if (session) fetchBlocks(session.user.id);
      else setLoading(false);
    });
  }, [fetchBlocks]);

  const getValidToken = async () => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (freshSession) {
      persistGoogleProviderToken(freshSession);
      setSession(freshSession);
    }
    return getGoogleProviderToken();
  };

  const openReviewModal = (block: QuestionBlock) => {
    setReviewOpen(block);
    setReviewDate(format(new Date(), "yyyy-MM-dd"));
    setQuestionCount(block.question_count);
    setCorrectCount(block.correct_count);
    setDifficulty(block.perceived_difficulty);
    setTimeSpent(block.time_spent_minutes?.toString() ?? "");
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewOpen || !session || correctCount > questionCount) return;
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
      time_spent_minutes: timeSpent ? Number(timeSpent) : null,
      sm2_grade_calculated: result.q,
      previous_next_review_date: reviewOpen.next_review_date,
      new_next_review_date: nextReviewDate,
    });

    if (reviewError) {
      showError("Erro ao salvar revisão. Verifique os dados e tente novamente.");
      setSubmitting(false);
      return;
    }

    let calendarPatch = {};
    if (reviewOpen.calendar_sync_enabled) {
      await getValidToken();
      const syncResult = await createOrUpdateCalendarEventWithAuth({
        eventId: reviewOpen.calendar_event_id,
        summary: reviewOpen.title,
        description: [
          `Área: ${reviewOpen.area_name}`,
          `Questões: ${questionCount}`,
          `Acertos: ${correctCount} (${accuracy}%)`,
          `Próxima revisão calculada para ${nextReviewDate}.`,
        ].join("\n"),
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
        time_spent_minutes: timeSpent ? Number(timeSpent) : null,
        repetitions: result.repetitions,
        easiness_factor: result.easinessFactor,
        interval_days: result.intervalDays,
        next_review_date: nextReviewDate,
        ...calendarPatch,
      })
      .eq("id", reviewOpen.id);

    if (updateError) showError("A revisão foi salva, mas o bloco não foi atualizado.");

    setReviewOpen(null);
    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayBlocks = blocks.filter(block => block.next_review_date === todayStr);
  const overdueBlocks = blocks.filter(block => block.next_review_date < todayStr);
  const upcomingBlocks = blocks.filter(block => block.next_review_date > todayStr).slice(0, 8);
  const totalQuestions = blocks.reduce((sum, block) => sum + block.question_count, 0);
  const averageAccuracy = blocks.length
    ? Math.round(blocks.reduce((sum, block) => sum + block.accuracy_percentage, 0) / blocks.length)
    : 0;

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }).map(date => {
    const dateStr = format(date, "yyyy-MM-dd");
    return {
      dateStr,
      label: format(date, "EEE", { locale: ptBR }),
      dayNum: format(date, "d"),
      blocks: blocks.filter(block => block.next_review_date === dateStr),
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    };
  });

  const firstName =
    session?.user.user_metadata?.full_name?.split(" ")[0] ??
    session?.user.email?.split("@")[0] ??
    "Estudante";

  return (
    <div className="min-h-screen bg-gray-50">
      {errorMsg && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-3 text-red-700">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={16} /></button>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold capitalize text-gray-900">Olá, {firstName}</h1>
            <p className="mt-0.5 text-sm capitalize text-gray-500">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <Link
            href="/dashboard/blocos"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Plus size={17} /> Novo bloco
          </Link>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <SummaryCard label="Blocos ativos" value={blocks.length.toString()} />
          <SummaryCard label="Questões registradas" value={totalQuestions.toString()} />
          <SummaryCard label="Acurácia média" value={`${averageAccuracy}%`} />
          <SummaryCard label="Vencidos" value={overdueBlocks.length.toString()} tone="danger" />
        </div>

        <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <QueueCard
            title="Hoje"
            count={todayBlocks.length}
            icon={<span className="h-2 w-2 rounded-full bg-blue-500" />}
            empty="Nenhum bloco para hoje."
            blocks={todayBlocks}
            actionTone="blue"
            onReview={openReviewModal}
          />
          <QueueCard
            title="Revisões atrasadas"
            count={overdueBlocks.length}
            icon={<AlertCircle size={15} className="text-red-500" />}
            empty="Tudo em dia."
            blocks={overdueBlocks}
            actionTone="red"
            onReview={openReviewModal}
          />
          <QueueCard
            title="Próximas revisões"
            icon={<Clock size={15} className="text-emerald-500" />}
            empty="Nenhuma revisão futura."
            blocks={upcomingBlocks}
            actionTone="gray"
            onReview={openReviewModal}
          />
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <span className="text-sm font-semibold text-gray-800">Semana de revisão</span>
            <Link href="/dashboard/calendario" className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
              Calendário <ArrowRight size={15} />
            </Link>
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map(({ dateStr, label, dayNum, blocks, isToday, isPast }) => (
              <div key={dateStr} className={`min-h-[136px] border-r border-gray-100 p-3 last:border-r-0 ${isToday ? "bg-blue-50" : isPast ? "bg-gray-50/60" : ""}`}>
                <div className="mb-3 text-center">
                  <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-blue-600" : "text-gray-400"}`}>{label}</div>
                  <div className={`mt-0.5 text-xl font-bold leading-tight ${isToday ? "text-blue-700" : isPast ? "text-gray-300" : "text-gray-700"}`}>{dayNum}</div>
                </div>
                <div className="space-y-1">
                  {blocks.slice(0, 4).map(block => (
                    <button
                      key={block.id}
                      onClick={() => openReviewModal(block)}
                      title={block.title}
                      className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                        isToday
                          ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                          : isPast
                            ? "bg-red-100 text-red-700 hover:bg-red-200"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {block.title}
                    </button>
                  ))}
                  {blocks.length > 4 && <div className="pt-0.5 text-center text-xs text-gray-400">+{blocks.length - 4}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Registrar revisão</h3>
            <p className="mb-5 text-sm text-gray-500">{reviewOpen.title}</p>
            <form onSubmit={submitReview} className="space-y-4">
              <input type="date" value={reviewDate} max={format(new Date(), "yyyy-MM-dd")} onChange={event => setReviewDate(event.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Questões" value={questionCount} min={1} onChange={setQuestionCount} />
                <NumberField label="Acertos" value={correctCount} min={0} max={questionCount} onChange={setCorrectCount} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Dificuldade percebida</label>
                <select value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyRating)} className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {difficultyOptions.map(option => <option key={option}>{option}</option>)}
                </select>
              </div>
              <NumberField label="Tempo em minutos" value={timeSpent} min={0} onChange={value => setTimeSpent(value.toString())} optional />
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

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tone === "danger" ? "text-red-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function QueueCard({
  title,
  count,
  icon,
  empty,
  blocks,
  actionTone,
  onReview,
}: {
  title: string;
  count?: number;
  icon: React.ReactNode;
  empty: string;
  blocks: QuestionBlock[];
  actionTone: "blue" | "red" | "gray";
  onReview: (block: QuestionBlock) => void;
}) {
  const buttonClass = {
    blue: "bg-blue-600 hover:bg-blue-700 text-white",
    red: "bg-red-500 hover:bg-red-600 text-white",
    gray: "bg-gray-200 hover:bg-gray-300 text-gray-700",
  }[actionTone];

  return (
    <div className="flex min-h-[220px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        {icon}
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        {count !== undefined && count > 0 && <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1.5 text-xs font-bold text-gray-700">{count}</span>}
      </div>
      <div className="flex-1 p-4">
        {blocks.length === 0 ? (
          <div className="flex min-h-[92px] items-center justify-center text-sm text-gray-400">{empty}</div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {blocks.map(block => (
              <div key={block.id} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-gray-500">{block.area_name} · {block.accuracy_percentage}%</div>
                  <div className="truncate text-sm font-semibold text-gray-900">{block.title}</div>
                </div>
                <button onClick={() => onReview(block)} className={`shrink-0 rounded-md p-2 transition-colors ${buttonClass}`} title="Registrar revisão">
                  <Play size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  optional,
  onChange,
}: {
  label: string;
  value: number | string;
  min: number;
  max?: number;
  optional?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        required={!optional}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}
