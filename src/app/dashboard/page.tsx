"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { addDays, eachDayOfInterval, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock3,
  Play,
  Plus,
  Stethoscope,
} from "lucide-react";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { ReviewModal } from "@/components/review-modal";
import { ScheduleReviewModal } from "@/components/schedule-review-modal";
import { updateQuestionBlockAndSync } from "@/lib/calendar-sync";
import type { QuestionBlock, StudentProfile } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import {
  buildWeeklyPlan,
  importanceLabel,
  performanceLabel,
  type WeeklyPlanItem,
} from "@/lib/revision-engine";
import { supabase } from "@/lib/supabase";

type ScheduleContext = {
  block: QuestionBlock;
  minDate: string;
  maxDate: string;
} | null;

type CompletedReview = {
  block_id: string;
  review_date: string;
};

export default function HomeDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [completedReviews, setCompletedReviews] = useState<CompletedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewBlock, setReviewBlock] = useState<QuestionBlock | null>(null);
  const [scheduleContext, setScheduleContext] = useState<ScheduleContext>(null);

  const today = format(new Date(), "yyyy-MM-dd");

  const loadData = useCallback(async (userId: string) => {
    const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekStart = format(weekStartDate, "yyyy-MM-dd");
    const weekEnd = format(addDays(weekStartDate, 6), "yyyy-MM-dd");
    const [profileResult, blocksResult, reviewsResult] = await Promise.all([
      supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("question_blocks").select("*").eq("user_id", userId).order("next_review_date", { ascending: true }),
      supabase.from("block_reviews").select("block_id,review_date").eq("user_id", userId).gte("review_date", weekStart).lte("review_date", weekEnd),
    ]);

    if (profileResult.error || blocksResult.error || reviewsResult.error) {
      setError("Não foi possível carregar sua semana.");
    }
    const nextProfile = profileResult.data ?? null;
    setProfile(nextProfile);
    setBlocks(blocksResult.data ?? []);
    setCompletedReviews(reviewsResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      persistGoogleProviderToken(activeSession);
      setSession(activeSession);
      if (activeSession) loadData(activeSession.user.id);
      else setLoading(false);
    });
  }, [loadData]);

  const plan = useMemo(() => {
    if (!profile) return null;
    return buildWeeklyPlan({
      blocks,
      studyDays: profile.study_days,
      dailyCapacity: profile.daily_theme_capacity,
      referenceDate: today,
      examDate: profile.exam_date,
    });
  }, [blocks, profile, today]);

  const backlogUpdateSignature = plan?.backlogUpdates
    .map(update => `${update.id}:${update.backlog_since}:${update.backlog_urgency}`)
    .join("|") ?? "";
  const scheduleUpdateSignature = plan?.scheduleUpdates
    .map(update => `${update.id}:${update.planned_review_date ?? "none"}:${update.planning_source ?? "none"}`)
    .join("|") ?? "";

  useEffect(() => {
    if (!session || !plan || (plan.backlogUpdates.length === 0 && plan.scheduleUpdates.length === 0)) return;
    let cancelled = false;

    const changesByBlock = new Map<string, Partial<QuestionBlock>>();
    for (const update of plan.backlogUpdates) {
      changesByBlock.set(update.id, {
        ...changesByBlock.get(update.id),
        backlog_since: update.backlog_since,
        backlog_urgency: update.backlog_urgency,
      });
    }
    for (const update of plan.scheduleUpdates) {
      changesByBlock.set(update.id, {
        ...changesByBlock.get(update.id),
        planned_review_date: update.planned_review_date,
        planning_source: update.planning_source,
      });
    }

    Promise.all([...changesByBlock.entries()].map(([blockId, changes]) => updateQuestionBlockAndSync({
      blockId,
      userId: session.user.id,
      changes,
    })))
      .then(results => {
        if (cancelled) return;
        if (results.some(result => !result.calendar.ok)) {
          setError("A semana foi atualizada, mas o Google Calendar ainda tem alterações pendentes. A MetaMed tentará novamente automaticamente.");
        }
        setBlocks(current => current.map(block => {
          const backlogUpdate = plan.backlogUpdates.find(item => item.id === block.id);
          const scheduleUpdate = plan.scheduleUpdates.find(item => item.id === block.id);
          return { ...block, ...backlogUpdate, ...scheduleUpdate };
        }));
      })
      .catch(() => {
        if (!cancelled) setError("A semana foi calculada, mas não foi possível atualizar toda a fila de atrasados.");
      });

    return () => { cancelled = true; };
  }, [backlogUpdateSignature, plan, scheduleUpdateSignature, session]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Montando sua semana...</div>;
  if (!session) return null;
  if (!profile?.onboarding_completed) {
    return <OnboardingPanel userId={session.user.id} profile={profile} onSaved={saved => {
      setProfile(saved);
    }} />;
  }
  if (!plan) return null;

  const firstName = profile.preferred_name
    ?? session.user.user_metadata?.full_name?.split(" ")[0]
    ?? session.user.email?.split("@")[0]
    ?? "Estudante";
  const completedByBlock = new Map(completedReviews.map(review => [review.block_id, review.review_date]));
  const completedBlocks = blocks.filter(block => completedByBlock.has(block.id));
  const completedIds = new Set(completedBlocks.map(block => block.id));
  const todoItems = uniqueItems([...plan.preExam, ...plan.selected]).filter(item => !completedIds.has(item.block.id));
  const backlogItems = plan.backlog.filter(item => !completedIds.has(item.block.id));

  const openSchedule = (block: QuestionBlock) => setScheduleContext({
    block,
    minDate: block.pre_exam_review_requested ? today : plan.weekStart,
    maxDate: block.pre_exam_review_requested ? profile.exam_date ?? plan.weekEnd : plan.weekEnd,
  });

  return (
    <div className="page-shell">
      {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <header className="page-header mb-5 sm:items-center">
        <h1 className="page-title mt-0">Sua semana, {firstName}</h1>
        <Link href="/dashboard/blocos" className="button-primary"><Plus size={16} /> Novo tema</Link>
      </header>

      {blocks.length === 0 ? (
        <div className="empty-state min-h-64">
          <Stethoscope size={25} />
          <p>Seu planejamento começa quando você cadastra um tema já estudado.</p>
          <Link href="/dashboard/blocos" className="button-primary"><Plus size={15} /> Cadastrar primeiro tema</Link>
        </div>
      ) : (
        <>
          <WeekStrip todo={todoItems} completed={completedBlocks} completedByBlock={completedByBlock} weekStart={plan.weekStart} studyDays={profile.study_days} />

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <TaskColumn title="Feitos" count={completedBlocks.length} icon={<Check size={16} />} tone="done">
              {completedBlocks.length === 0 ? <InlineEmpty>Nenhuma revisão concluída nesta semana.</InlineEmpty> : completedBlocks.map(block => (
                <TopicRow key={block.id} block={block} completedDate={completedByBlock.get(block.id)} />
              ))}
            </TaskColumn>

            <TaskColumn title="Por fazer" count={todoItems.length} icon={<Clock3 size={16} />} tone="todo">
              {todoItems.length === 0 ? <InlineEmpty>Você concluiu todas as revisões da semana.</InlineEmpty> : todoItems.map(item => (
                <TopicRow key={item.block.id} block={item.block} item={item} onSchedule={() => openSchedule(item.block)} onReview={() => setReviewBlock(item.block)} />
              ))}
            </TaskColumn>

            <TaskColumn title="Atrasados" count={backlogItems.length} icon={<CalendarPlus size={16} />} tone="late">
              {backlogItems.length === 0 ? <InlineEmpty>Nenhum tema atrasado.</InlineEmpty> : backlogItems.map(item => (
                <TopicRow key={item.block.id} block={item.block} item={item} onSchedule={() => openSchedule(item.block)} onReview={() => setReviewBlock(item.block)} />
              ))}
            </TaskColumn>
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Link href="/dashboard/calendario" className="button-secondary"><CalendarDays size={16} /> Calendário <ArrowRight size={15} /></Link>
        <Link href="/dashboard/metricas" className="button-secondary"><BarChart3 size={16} /> Métricas <ArrowRight size={15} /></Link>
      </div>

      {reviewBlock && (
        <ReviewModal block={reviewBlock} userId={session.user.id} examDate={profile.exam_date} onClose={() => setReviewBlock(null)} onCompleted={() => loadData(session.user.id)} />
      )}
      {scheduleContext && (
        <ScheduleReviewModal block={scheduleContext.block} userId={session.user.id} minDate={scheduleContext.minDate} maxDate={scheduleContext.maxDate} studyDays={profile.study_days} onClose={() => setScheduleContext(null)} onChanged={() => loadData(session.user.id)} />
      )}
    </div>
  );
}

function WeekStrip({
  todo,
  completed,
  completedByBlock,
  weekStart,
  studyDays,
}: {
  todo: WeeklyPlanItem[];
  completed: QuestionBlock[];
  completedByBlock: Map<string, string>;
  weekStart: string;
  studyDays: number[];
}) {
  const days = eachDayOfInterval({ start: new Date(`${weekStart}T12:00:00`), end: addDays(new Date(`${weekStart}T12:00:00`), 6) });
  return (
    <section className="overflow-x-auto rounded-md border border-gray-200 bg-white" aria-label="Calendário desta semana">
      <div className="grid min-w-[42rem] grid-cols-7 divide-x divide-gray-100">
        {days.map(day => {
          const date = format(day, "yyyy-MM-dd");
          const scheduled = todo.filter(item => item.scheduledDate === date);
          const finished = completed.filter(block => completedByBlock.get(block.id) === date);
          const isToday = date === format(new Date(), "yyyy-MM-dd");
          const isStudyDay = studyDays.includes(Number(format(day, "i")));
          return (
            <div key={date} className={`min-h-28 px-3 py-3 ${isToday ? "bg-emerald-50" : ""} ${isStudyDay ? "" : "bg-gray-50/70"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-xs font-semibold capitalize ${isToday ? "text-emerald-800" : "text-gray-500"}`}>{format(day, "EEEE", { locale: ptBR })}</span>
                <span className={`text-sm font-semibold tabular-nums ${isToday ? "text-emerald-900" : "text-gray-800"}`}>{format(day, "d")}</span>
              </div>
              <div className="mt-3 space-y-1.5">
                {finished.map(block => <div key={`done-${block.id}`} className="flex items-center gap-1.5 truncate text-xs font-medium text-emerald-700"><Check size={12} className="shrink-0" /> <span className="truncate">{block.title}</span></div>)}
                {scheduled.map(item => <div key={item.block.id} className="truncate border-l-2 border-gray-400 pl-2 text-xs font-medium text-gray-700">{item.block.title}</div>)}
                {finished.length === 0 && scheduled.length === 0 && <span className="text-xs text-gray-300">{isStudyDay ? "Livre" : "Fora da rotina"}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskColumn({ title, count, icon, tone, children }: { title: string; count: number; icon: React.ReactNode; tone: "done" | "todo" | "late"; children: React.ReactNode }) {
  const tones = {
    done: "border-emerald-200 bg-emerald-50 text-emerald-800",
    todo: "border-gray-200 bg-gray-50 text-gray-800",
    late: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className={`flex items-center justify-between border-b px-4 py-3.5 ${tones[tone]}`}>
        <div className="flex items-center gap-2"><span>{icon}</span><h2 className="text-sm font-semibold">{title}</h2></div>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/80 px-2 text-xs font-semibold tabular-nums">{count}</span>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

function TopicRow({ block, item, completedDate, onSchedule, onReview }: { block: QuestionBlock; item?: WeeklyPlanItem; completedDate?: string; onSchedule?: () => void; onReview?: () => void }) {
  return (
    <div className="relative flex min-h-28 gap-3 px-4 py-4">
      <span className={`absolute bottom-0 left-0 top-0 w-1 ${areaTone(block.major_area)}`} />
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-950">{block.title}</h3>
          {item?.isExtra && <span className="status-badge bg-cyan-100 text-cyan-700">Extra</span>}
          {block.pre_exam_review_requested && <span className="status-badge bg-amber-100 text-amber-800">Antes da prova</span>}
          {block.calendar_sync_enabled && block.calendar_sync_status === "pending" && <span className="status-badge bg-gray-100 text-gray-600">Sincronizando</span>}
          {block.calendar_sync_enabled && block.calendar_sync_status === "failed" && <span className="status-badge bg-red-100 text-red-700">Reconectar Calendar</span>}
        </div>
        <p className="mt-1 truncate text-xs text-gray-500">{block.major_area} · {block.specialty}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>{block.accuracy_percentage}% · {block.performance_band ? performanceLabel(block.performance_band) : "legado"}</span>
          <span>Importância {importanceLabel(block.importance).toLocaleLowerCase("pt-BR")}</span>
          {completedDate && <span className="font-semibold text-emerald-700">Concluído em {formatDate(completedDate)}</span>}
          {!completedDate && item?.scheduledDate && <span className="font-semibold text-emerald-700">{formatDate(item.scheduledDate)}</span>}
        </div>
      </div>
      {onSchedule && onReview && (
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onSchedule} title={block.planned_review_date ? "Remarcar" : "Escolher dia"} aria-label={block.planned_review_date ? "Remarcar" : "Escolher dia"} className="icon-button"><CalendarPlus size={16} /></button>
          <button type="button" onClick={onReview} title="Registrar revisão" aria-label="Registrar revisão" className="icon-button text-emerald-700 hover:bg-emerald-50"><Play size={15} /></button>
        </div>
      )}
    </div>
  );
}

function InlineEmpty({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center px-5 text-center text-sm text-gray-400">{children}</div>;
}

function uniqueItems(items: WeeklyPlanItem[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.block.id)) return false;
    seen.add(item.block.id);
    return true;
  });
}

function areaTone(area: QuestionBlock["major_area"]) {
  return {
    "Clínica Médica": "bg-brand-blue",
    Cirurgia: "bg-brand-sky",
    "Ginecologia e Obstetrícia": "bg-brand-cyan",
    Pediatria: "bg-brand-teal",
    Preventiva: "bg-brand-mint",
    "A classificar": "bg-gray-400",
  }[area];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`));
}
