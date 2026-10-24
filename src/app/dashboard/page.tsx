"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { addDays, eachDayOfInterval, format, getISODay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, BarChart3, CalendarDays, CalendarPlus, Check, Clock3, GripVertical, Play, Plus, SlidersHorizontal, Stethoscope } from "lucide-react";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { ReviewDragContext, ReviewDragHandle, useReviewDropTarget, type DraggedReview, type ReviewDropTarget } from "@/components/review-drag";
import { ReviewModal } from "@/components/review-modal";
import { ScheduleReviewModal } from "@/components/schedule-review-modal";
import { TopicFormModal } from "@/components/topic-form-modal";
import { WeeklyAvailabilityModal } from "@/components/weekly-availability-modal";
import { displayArea, displayMajorArea, loadCourseAreas } from "@/lib/course-catalog";
import { persistAutomaticReviewSchedule } from "@/lib/question-block-writes";
import type { QuestionBlock, StudentProfile, WeeklyPlan as SavedWeeklyPlan } from "@/lib/database.types";
import { planningToday } from "@/lib/planning-date";
import { scheduleBlockReview } from "@/lib/revision-actions";
import { buildWeeklyPlan, importanceLabel, performanceLabel, type WeeklyPlanItem } from "@/lib/revision-engine";
import { availabilityResolver, firstStudyDayOfWeek, resolvePlanningWeek } from "@/lib/study-availability";
import { availabilityPrompt } from "@/lib/week-confirmation";
import { prepareWeeklyPlanning } from "@/lib/weekly-planning";
import { supabase } from "@/lib/supabase";

type CompletedReview = { block_id: string; review_date: string };
type AvailabilityTarget = { weekStart: string; dailyCapacities: Record<string, number>; hasOverride: boolean; title: string };

export default function HomeDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [courseAreas, setCourseAreas] = useState<ReadonlyMap<string, string>>(new Map());
  const [completedReviews, setCompletedReviews] = useState<CompletedReview[]>([]);
  const [weeks, setWeeks] = useState<SavedWeeklyPlan[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewedAnchor, setViewedAnchor] = useState<string | null>(null);
  const [viewedWeekStartsOn, setViewedWeekStartsOn] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewBlock, setReviewBlock] = useState<QuestionBlock | null>(null);
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [scheduleBlock, setScheduleBlock] = useState<QuestionBlock | null>(null);
  const [availabilityTarget, setAvailabilityTarget] = useState<AvailabilityTarget | null>(null);
  const [confirmingWeek, setConfirmingWeek] = useState(false);
  // Moves shown right away; each is dropped once saved (and reloaded) or reverted on failure.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({});
  const loadVersion = useRef(0);
  const savingPlan = useRef(false);
  const lastSavedSignature = useRef("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const today = planningToday(profile?.timezone);
  const referenceDate = weekOffset === 0 ? today : viewedAnchor ?? today;
  const moving = Object.keys(pendingMoves).length > 0;

  const loadData = useCallback(async (userId: string) => {
    const version = ++loadVersion.current;
    try {
      const profileResult = await supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle();
      if (profileResult.error) throw new Error("Não foi possível carregar sua rotina.");
      const nextProfile = profileResult.data;
      if (!nextProfile?.onboarding_completed) {
        if (version === loadVersion.current) setProfile(nextProfile);
        return;
      }
      const localToday = planningToday(nextProfile.timezone);
      // Future previews must not prematurely close the real current week.
      const prepared = await prepareWeeklyPlanning(localToday);
      const plansResult = await supabase.from("weekly_plans").select("*").eq("user_id", userId);
      if (plansResult.error || !prepared) throw new Error("Não foi possível carregar a disponibilidade semanal.");
      const viewedDate = weekOffset === 0 ? localToday : format(addDays(new Date(`${prepared.week_start}T12:00:00`), 7), "yyyy-MM-dd");
      const viewedWeek = resolvePlanningWeek(viewedDate, nextProfile.week_starts_on ?? 1, plansResult.data ?? []);
      const [blocksResult, reviewsResult] = await Promise.all([
        supabase.from("question_blocks").select("*").eq("user_id", userId).is("archived_at", null).order("next_review_date"),
        supabase.from("block_reviews").select("block_id,review_date").eq("user_id", userId).eq("contact_type", "review").gte("review_date", viewedWeek.weekStart).lte("review_date", viewedWeek.weekEnd),
      ]);
      if (blocksResult.error || reviewsResult.error) throw new Error("Não foi possível carregar sua semana.");
      const nextCourseAreas = await loadCourseAreas(blocksResult.data ?? []).catch(() => new Map<string, string>());
      if (version !== loadVersion.current) return;
      setProfile(nextProfile);
      setBlocks(blocksResult.data ?? []);
      setCourseAreas(nextCourseAreas);
      setCompletedReviews(reviewsResult.data ?? []);
      setWeeks(plansResult.data ?? []);
      setCurrentWeekStart(prepared.week_start);
      setViewedAnchor(viewedWeek.weekStart);
      setViewedWeekStartsOn(viewedWeek.weekStartsOn);
      setError(null);
      lastSavedSignature.current = "";
    } catch (cause) {
      if (version === loadVersion.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar sua semana.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (!active) return;
      setSession(activeSession);
      if (activeSession) void loadData(activeSession.user.id);
      else setLoading(false);
    });
    return () => { active = false; };
  }, [loadData, reloadVersion]);

  useEffect(() => {
    const refresh = () => { if (session) void loadData(session.user.id); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [session, loadData]);

  const availabilityOn = useMemo(() => profile ? availabilityResolver(profile, weeks) : null, [profile, weeks]);
  const viewedWeekPlan = weeks.find(week => week.week_start === viewedAnchor) ?? null;
  const availability = useMemo(() => availabilityOn ? availabilityOn(viewedAnchor ?? today) : null, [availabilityOn, viewedAnchor, today]);
  const plan = useMemo(() => profile && availability ? buildWeeklyPlan({
    blocks, ...availability, referenceDate, weekStartsOn: viewedWeekStartsOn,
    completedWork: completedReviews.map(review => ({ blockId: review.block_id, date: review.review_date })),
    includeAnticipations: true, examDate: profile.exam_date,
  }) : null, [blocks, profile, availability, referenceDate, completedReviews, viewedWeekStartsOn]);
  const scheduleSignature = plan?.scheduleUpdates.map(update => `${update.id}:${blocks.find(block => block.id === update.id)?.repetitions}:${update.planned_review_date ?? "none"}`).join("|") ?? "";

  useEffect(() => {
    // Future weeks are previews and cannot take dates from this week's live queue.
    if (!session || !plan || weekOffset !== 0 || !scheduleSignature || savingPlan.current || lastSavedSignature.current === scheduleSignature) return;
    lastSavedSignature.current = scheduleSignature;
    savingPlan.current = true;
    void Promise.allSettled(plan.scheduleUpdates.map(update => {
      const block = blocks.find(item => item.id === update.id)!;
      return persistAutomaticReviewSchedule({ block, userId: session.user.id, date: update.planned_review_date, source: update.planning_source });
    })).then(results => {
      const savedBlocks = results.flatMap(result => result.status === "fulfilled" && result.value.block ? [result.value.block] : []);
      setBlocks(current => current.map(block => {
        const saved = savedBlocks.find(item => item.id === block.id);
        return saved && block.repetitions === saved.repetitions && block.planning_source !== "manual" ? { ...block, ...saved } : block;
      }));
      if (results.some(result => result.status === "rejected")) setError("Algumas datas ainda não foram confirmadas. Atualize a semana para tentar novamente.");
    }).finally(() => { savingPlan.current = false; });
  }, [plan, scheduleSignature, session, blocks, weekOffset]);

  const moveToDate = async (review: DraggedReview, target: ReviewDropTarget) => {
    if (!session || moving || target.date < today) return;
    const block = blocks.find(item => item.id === review.blockId);
    if (!block) return;
    setPendingMoves({ [block.id]: target.date });
    setError(null);
    setNotice(null);
    let saved = false;
    try {
      await scheduleBlockReview({ block, userId: session.user.id, date: target.date });
      saved = true;
      await loadData(session.user.id);
      setNotice(`${block.title} foi para ${target.label}.`);
    } catch (cause) {
      setError(saved
        ? "A data foi salva. Atualize a semana para conferir."
        : `Não foi possível mover ${block.title}; ela voltou para o dia anterior. ${cause instanceof Error ? cause.message : ""}`.trim());
    } finally {
      setPendingMoves({});
    }
  };

  const keepRoutine = async (weekStart: string) => {
    if (!session) return;
    setConfirmingWeek(true);
    setError(null);
    const { error: confirmError } = await supabase.rpc("confirm_weekly_availability", { p_week_start: weekStart });
    if (confirmError) setError("Não foi possível confirmar a semana. Tente novamente.");
    await loadData(session.user.id);
    setConfirmingWeek(false);
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Montando sua semana...</div>;
  if (!session) return null;
  if (error && !profile) return <div className="page-shell"><p role="alert" className="text-sm text-red-700">{error}</p><button className="button-secondary mt-4" onClick={() => setReloadVersion(value => value + 1)}>Tentar novamente</button></div>;
  if (!profile?.onboarding_completed) return <OnboardingPanel userId={session.user.id} profile={profile} onSaved={saved => { setProfile(saved); void loadData(session.user.id); }} />;
  if (!plan || !availability || !availabilityOn) return null;

  const firstName = profile.preferred_name ?? session.user.user_metadata?.full_name?.split(" ")[0] ?? session.user.email?.split("@")[0] ?? "Estudante";
  const completedByBlock = new Map(completedReviews.map(review => [review.block_id, review.review_date]));
  const completedBlocks = blocks.filter(block => completedByBlock.has(block.id));
  const todoItems = uniqueItems([...plan.preExam, ...plan.selected]);
  const hasOverride = viewedWeekPlan?.study_days != null || viewedWeekPlan?.daily_capacities != null;
  const scheduledOn = (item: WeeklyPlanItem) => pendingMoves[item.block.id] ?? item.scheduledDate ?? null;
  const prompt = currentWeekStart ? availabilityPrompt({ today, currentWeekStart, weeks, profileCreatedAt: profile.created_at, timezone: profile.timezone }) : null;
  const nextWeekStart = currentWeekStart ? shiftDate(currentWeekStart, 7) : null;
  const nextWeekDay = nextWeekStart ? firstStudyDayOfWeek(nextWeekStart, availabilityOn(nextWeekStart)) : null;
  const capacityForDate = (date: string) => availabilityOn(date).dailyCapacities[String(getISODay(new Date(`${date}T12:00:00`)))] ?? 0;

  const adjustWeek = (weekStart: string, title: string) => {
    const week = weeks.find(item => item.week_start === weekStart);
    setAvailabilityTarget({
      weekStart,
      dailyCapacities: availabilityOn(weekStart).dailyCapacities,
      hasOverride: week?.study_days != null || week?.daily_capacities != null,
      title,
    });
  };

  const row = (item: WeeklyPlanItem) => <TopicRow key={item.block.id} block={item.block} area={displayArea(item.block, courseAreas)} areaTone={displayMajorArea(item.block, courseAreas)} item={item} scheduledDate={scheduledOn(item)} onSchedule={() => setScheduleBlock(item.block)} onReview={() => setReviewBlock(item.block)} dragDisabled={moving} />;

  return (
    <div className="page-shell">
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" className="ml-3 underline" onClick={() => void loadData(session.user.id)}>Atualizar semana</button></div>}
      {notice && <div role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {prompt && (
        <section aria-label="Disponibilidade da semana" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900">{weekQuestion(prompt.scope, prompt.weekStart, today)}</p>
            <p className="mt-0.5 text-xs leading-5 text-blue-800">Ajuste os dias e quantas revisões cabem em cada um, ou mantenha sua rotina habitual.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" disabled={confirmingWeek} onClick={() => void keepRoutine(prompt.weekStart)}>Manter minha rotina</button>
            <button type="button" className="button-primary" disabled={confirmingWeek} onClick={() => adjustWeek(prompt.weekStart, prompt.scope === "current" ? "Ajustar esta semana" : "Ajustar a próxima semana")}><SlidersHorizontal size={15} /> {prompt.scope === "current" ? "Ajustar esta semana" : "Ajustar a próxima semana"}</button>
          </div>
        </section>
      )}
      <header className="page-header mb-5 sm:items-center">
        <div><h1 className="page-title mt-0">Sua semana, {firstName}</h1><p className="mt-2 text-sm text-gray-500">{formatDate(plan.weekStart)} a {formatDate(plan.weekEnd)} · {plan.capacityUsed} de {plan.capacity} vagas ocupadas{plan.extraCount > 0 ? ` · ${plan.extraCount} ${plan.extraCount === 1 ? "extra" : "extras"}` : ""}</p></div>
        <button type="button" onClick={() => setCreatingTopic(true)} className="button-primary"><Plus size={16} /> Novo tema</button>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-1 shadow-xs" aria-label="Semana exibida">
          {["Esta semana", "Próxima semana"].map((label, offset) => <button key={label} type="button" aria-pressed={weekOffset === offset} onClick={() => { if (weekOffset !== offset) { setWeekOffset(offset); setLoading(true); setNotice(null); } }} className={`rounded-[6px] px-3 py-2 text-xs font-semibold transition-colors ${weekOffset === offset ? "bg-blue-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>)}
        </div>
        <button type="button" onClick={() => adjustWeek(plan.weekStart, weekOffset === 0 ? "Ajustar esta semana" : "Ajustar a próxima semana")} className="button-secondary"><SlidersHorizontal size={15} /> {weekOffset === 0 ? "Ajustar esta semana" : "Ajustar a próxima semana"}{hasOverride && <span className="status-badge bg-amber-50 text-amber-700">Ajustada</span>}</button>
      </div>
      {weekOffset === 1 && <p className="mb-4 text-sm leading-6 text-gray-500">Prévia da próxima semana. As sugestões automáticas serão confirmadas quando ela começar. Você já pode ajustar a disponibilidade e escolher datas manualmente.</p>}
      {blocks.length === 0 ? <div className="empty-state min-h-64"><Stethoscope size={25} /><p>Seu planejamento começa quando você cadastra um tema já estudado.</p><Link href="/dashboard/blocos" className="button-primary"><Plus size={15} /> Cadastrar primeiro tema</Link></div> : (
        <ReviewDragContext onMove={(review, target) => void moveToDate(review, target)}>
          <WeekStrip todo={todoItems} scheduledOn={scheduledOn} completed={completedBlocks} completedByBlock={completedByBlock} weekStart={plan.weekStart} dailyCapacities={availability.dailyCapacities} today={today} moving={moving} />
          {weekOffset === 0 && nextWeekDay && <NextWeekDrop date={nextWeekDay} disabled={moving} />}
          <p className="mt-3 text-xs leading-5 text-gray-500">Arraste uma revisão pela alça <GripVertical size={12} className="inline align-[-1px]" aria-hidden="true" /> para outro dia ou para a próxima semana; no celular, segure antes de arrastar. Também dá para usar o teclado (Espaço e setas) ou o botão de calendário do tema. Dias fora da rotina e revisões além da capacidade entram como extras.</p>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <TaskColumn title="Feitos" count={completedBlocks.length} icon={<Check size={16} />} tone="done">{completedBlocks.length === 0 ? <InlineEmpty>Nenhuma revisão concluída nesta semana.</InlineEmpty> : completedBlocks.map(block => <TopicRow key={block.id} block={block} area={displayArea(block, courseAreas)} areaTone={displayMajorArea(block, courseAreas)} completedDate={completedByBlock.get(block.id)} />)}</TaskColumn>
            <TaskColumn title="Por fazer" count={todoItems.length} icon={<Clock3 size={16} />} tone="todo">{todoItems.length === 0 ? <InlineEmpty>Nenhuma revisão agendada nesta semana.</InlineEmpty> : todoItems.map(item => row(item))}</TaskColumn>
            <TaskColumn title="Atrasados" count={plan.backlog.length} icon={<CalendarPlus size={16} />} tone="late">{plan.backlog.length === 0 ? <InlineEmpty>Nenhum atraso aguardando uma vaga.</InlineEmpty> : plan.backlog.map(item => row(item))}</TaskColumn>
          </div>
          {plan.deferred.length > 0 && <section className="mt-5 overflow-hidden card"><div className="border-b border-gray-100 px-4 py-4"><h2 className="text-sm font-semibold text-gray-900">Pendentes nesta semana · {plan.deferred.length}</h2><p className="mt-1 text-xs leading-5 text-gray-500">Estas revisões ainda não têm uma vaga disponível. Elas só viram atraso após o fechamento da semana. Você pode ajustar a capacidade ou escolher outro dia.</p></div><div className="divide-y divide-gray-100">{plan.deferred.map(item => row(item))}</div></section>}
        </ReviewDragContext>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Link href="/dashboard/calendario" className="button-secondary"><CalendarDays size={16} /> Calendário <ArrowRight size={15} /></Link><Link href="/dashboard/metricas" className="button-secondary"><BarChart3 size={16} /> Métricas <ArrowRight size={15} /></Link></div>
      {creatingTopic && <TopicFormModal userId={session.user.id} profile={profile} onClose={() => setCreatingTopic(false)} onSaved={() => loadData(session.user.id)} />}
      {reviewBlock && <ReviewModal block={reviewBlock} area={displayArea(reviewBlock, courseAreas)} userId={session.user.id} examDate={profile.exam_date} timezone={profile.timezone} onClose={() => setReviewBlock(null)} onCompleted={() => loadData(session.user.id)} />}
      {scheduleBlock && <ScheduleReviewModal block={scheduleBlock} userId={session.user.id} minDate={today} capacityForDate={capacityForDate} onClose={() => setScheduleBlock(null)} onChanged={() => loadData(session.user.id)} />}
      {availabilityTarget && <WeeklyAvailabilityModal title={availabilityTarget.title} weekStart={availabilityTarget.weekStart} dailyCapacities={availabilityTarget.dailyCapacities} hasOverride={availabilityTarget.hasOverride} onClose={() => setAvailabilityTarget(null)} onSaved={() => loadData(session.user.id)} />}
    </div>
  );
}

function WeekStrip({ todo, scheduledOn, completed, completedByBlock, weekStart, dailyCapacities, today, moving }: {
  todo: WeeklyPlanItem[]; scheduledOn: (item: WeeklyPlanItem) => string | null; completed: QuestionBlock[]; completedByBlock: Map<string, string>;
  weekStart: string; dailyCapacities: Record<string, number>; today: string; moving: boolean;
}) {
  const days = eachDayOfInterval({ start: new Date(`${weekStart}T12:00:00`), end: addDays(new Date(`${weekStart}T12:00:00`), 6) });
  return <section className="overflow-x-auto card" aria-label="Calendário desta semana"><div className="grid min-w-[42rem] grid-cols-7 divide-x divide-gray-100">{days.map(day => {
    const date = format(day, "yyyy-MM-dd");
    return <WeekDay key={date} day={day} date={date} today={today} moving={moving}
      capacity={dailyCapacities[String(getISODay(day))] ?? 0}
      scheduled={todo.filter(item => scheduledOn(item) === date)}
      finished={completed.filter(block => completedByBlock.get(block.id) === date)} />;
  })}</div></section>;
}

function WeekDay({ day, date, today, moving, capacity, scheduled, finished }: {
  day: Date; date: string; today: string; moving: boolean; capacity: number; scheduled: WeeklyPlanItem[]; finished: QuestionBlock[];
}) {
  const label = format(day, "EEEE dd/MM", { locale: ptBR });
  const { setNodeRef, isOver } = useReviewDropTarget(`day:${date}`, { date, label }, date < today || moving);
  return <div ref={setNodeRef} aria-label={`${label}, capacidade ${capacity}`} className={`min-h-32 px-3 py-3 transition-shadow ${isOver ? "ring-2 ring-inset ring-blue-500" : ""} ${date === today ? "bg-blue-50" : capacity === 0 ? "bg-gray-50" : ""}`}>
    <div className="flex items-baseline justify-between gap-2"><span className={`text-xs font-semibold capitalize ${date === today ? "text-blue-700" : "text-gray-500"}`}>{format(day, "EEE", { locale: ptBR })}</span><span className="text-sm font-semibold tabular-nums text-gray-800">{format(day, "d")}</span></div>
    <p className="mt-1 text-[11px] text-gray-500">{capacity > 0 ? `${finished.length + scheduled.length}/${capacity} revisões` : "Fora da rotina"}</p>
    <div className="mt-3 space-y-1.5">
      {finished.map(block => <div key={`done-${block.id}`} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={12} className="shrink-0" /><span className="truncate">{block.title}</span></div>)}
      {scheduled.map(item => <ReviewDragHandle key={item.block.id} id={`strip:${item.block.id}`} review={{ blockId: item.block.id, title: item.block.title, date }} disabled={moving} label={`Mover ${item.block.title}`} title={item.block.title} className="block w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-200">{item.block.title}</ReviewDragHandle>)}
      {finished.length === 0 && scheduled.length === 0 && <span className="text-xs text-gray-400">{capacity > 0 ? "Livre" : ""}</span>}
    </div>
  </div>;
}

function NextWeekDrop({ date, disabled }: { date: string; disabled: boolean }) {
  const label = `próxima semana (${format(new Date(`${date}T12:00:00`), "EEEE dd/MM", { locale: ptBR })})`;
  const { setNodeRef, isOver } = useReviewDropTarget("next-week", { date, label }, disabled);
  return <div ref={setNodeRef} className={`mt-3 flex items-center justify-between gap-3 rounded-md border border-dashed px-4 py-2.5 text-xs transition-colors ${isOver ? "border-blue-500 bg-blue-50 text-blue-800" : "border-gray-300 text-gray-500"}`}>
    <span className="font-semibold">Próxima semana</span>
    <span>Solte aqui para mover para {format(new Date(`${date}T12:00:00`), "EEEE, dd/MM", { locale: ptBR })}</span>
  </div>;
}

function TaskColumn({ title, count, icon, tone, children }: { title: string; count: number; icon: React.ReactNode; tone: "done" | "todo" | "late"; children: React.ReactNode }) {
  const tones = { done: "border-emerald-100 bg-emerald-50 text-emerald-700", todo: "border-gray-200 bg-gray-50 text-gray-900", late: "border-amber-100 bg-amber-50 text-amber-700" };
  return <section className="overflow-hidden card"><div className={`flex items-center justify-between border-b px-4 py-3.5 ${tones[tone]}`}><div className="flex items-center gap-2">{icon}<h2 className="text-sm font-semibold">{title}</h2></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold tabular-nums">{count}</span></div><div className="divide-y divide-gray-100">{children}</div></section>;
}

function TopicRow({ block, area, areaTone: tone, item, scheduledDate, completedDate, onSchedule, onReview, dragDisabled = false }: {
  block: QuestionBlock; area: string; areaTone: QuestionBlock["major_area"]; item?: WeeklyPlanItem; scheduledDate?: string | null; completedDate?: string;
  onSchedule?: () => void; onReview?: () => void; dragDisabled?: boolean;
}) {
  return <div className="flex min-h-32 gap-3 px-4 py-4"><div className="min-w-0 flex-1">
    <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-gray-900">{block.title}</h3>{item?.isExtra && <span className="status-badge bg-gray-200 text-gray-800">Extra</span>}{item?.isAnticipation && <span className="status-badge bg-blue-50 text-blue-700">Antecipação</span>}{block.pre_exam_review_requested && <span className="status-badge bg-amber-50 text-amber-700">Antes da prova</span>}</div>
    <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-gray-500"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${areaTone(tone)}`} />{area} · {block.specialty}</p>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>{block.accuracy_percentage}% · {block.performance_band ? performanceLabel(block.performance_band) : "legado"}</span><span>Importância {importanceLabel(block.importance).toLocaleLowerCase("pt-BR")}</span>{completedDate && <span className="font-semibold text-emerald-700">Concluído em {formatDate(completedDate)}</span>}{!completedDate && scheduledDate && <span className="font-semibold text-blue-700">Agendada: {formatDate(scheduledDate)}</span>}</div>
    {completedDate && block.planned_review_date
      ? <p className="mt-2 text-xs text-gray-500">Próxima revisão agendada para <span className="font-semibold text-blue-700">{formatDate(block.planned_review_date)}</span></p>
      : <p className="mt-2 text-xs text-gray-500">Próxima sugestão: <span className="font-medium text-gray-800">{formatDate(block.next_review_date)}</span></p>}
  </div>{onSchedule && onReview && <div className="flex shrink-0 flex-col items-center gap-1">
    <ReviewDragHandle id={`row:${block.id}`} review={{ blockId: block.id, title: block.title, date: scheduledDate }} disabled={dragDisabled} label={`Mover ${block.title} para outro dia`} title="Arrastar para outro dia" className="icon-button text-gray-400"><GripVertical size={15} /></ReviewDragHandle>
    <button type="button" onClick={onSchedule} title="Escolher ou remarcar dia" aria-label={`Escolher dia de ${block.title}`} className="icon-button"><CalendarPlus size={16} /></button>
    <button type="button" onClick={onReview} title="Registrar revisão" aria-label={`Registrar revisão de ${block.title}`} className="icon-button text-blue-700 hover:bg-blue-50 hover:text-blue-800"><Play size={15} /></button>
  </div>}</div>;
}

function InlineEmpty({ children }: { children: React.ReactNode }) { return <div className="flex min-h-32 items-center justify-center px-5 text-center text-sm text-gray-500">{children}</div>; }
function uniqueItems(items: WeeklyPlanItem[]) { const seen = new Set<string>(); return items.filter(item => { if (seen.has(item.block.id)) return false; seen.add(item.block.id); return true; }); }
function areaTone(area: QuestionBlock["major_area"]) { return { "Clínica Médica": "bg-area-1", Cirurgia: "bg-area-2", "Ginecologia e Obstetrícia": "bg-area-3", Pediatria: "bg-area-4", Preventiva: "bg-area-5", "A classificar": "bg-gray-300" }[area]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`)); }
function shiftDate(value: string, days: number) { return format(addDays(new Date(`${value}T12:00:00`), days), "yyyy-MM-dd"); }

/** "Sua semana começou na segunda-feira (12/10). Quais dias você tem livres?" */
function weekQuestion(scope: "current" | "next", weekStart: string, today: string) {
  const day = new Date(`${weekStart}T12:00:00`);
  const weekday = format(day, "EEEE", { locale: ptBR });
  const article = ["sábado", "domingo"].includes(weekday) ? "no" : "na";
  const when = `${article} ${weekday} (${format(day, "dd/MM")})`;
  if (scope === "next") return `Sua próxima semana começa ${when}. Quais dias você terá livres?`;
  return `Sua semana ${weekStart < today ? "começou" : "começa"} ${when}. Quais dias você tem livres?`;
}
