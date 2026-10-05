"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { addDays, eachDayOfInterval, format, getISODay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, BarChart3, CalendarDays, CalendarPlus, Check, Clock3, GripVertical, Play, Plus, SlidersHorizontal, Stethoscope } from "lucide-react";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { ReviewModal } from "@/components/review-modal";
import { ScheduleReviewModal } from "@/components/schedule-review-modal";
import { WeeklyAvailabilityModal } from "@/components/weekly-availability-modal";
import { persistAutomaticReviewSchedule } from "@/lib/calendar-sync";
import type { QuestionBlock, StudentProfile, WeeklyPlan as SavedWeeklyPlan } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { planningToday } from "@/lib/planning-date";
import { scheduleBlockReview } from "@/lib/revision-actions";
import { buildWeeklyPlan, importanceLabel, normalizeStudyAvailability, performanceLabel, type WeeklyPlanItem } from "@/lib/revision-engine";
import { resolvePlanningWeek } from "@/lib/study-availability";
import { prepareWeeklyPlanning } from "@/lib/weekly-planning";
import { supabase } from "@/lib/supabase";

type CompletedReview = { block_id: string; review_date: string };

export default function HomeDashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [completedReviews, setCompletedReviews] = useState<CompletedReview[]>([]);
  const [weeklyOverride, setWeeklyOverride] = useState<SavedWeeklyPlan | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewedAnchor, setViewedAnchor] = useState<string | null>(null);
  const [viewedWeekStartsOn, setViewedWeekStartsOn] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewBlock, setReviewBlock] = useState<QuestionBlock | null>(null);
  const [scheduleBlock, setScheduleBlock] = useState<QuestionBlock | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const loadVersion = useRef(0);
  const savingPlan = useRef(false);
  const lastSavedSignature = useRef("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const today = planningToday(profile?.timezone);
  const referenceDate = weekOffset === 0 ? today : viewedAnchor ?? today;

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
        supabase.from("question_blocks").select("*").eq("user_id", userId).order("next_review_date"),
        supabase.from("block_reviews").select("block_id,review_date").eq("user_id", userId).eq("contact_type", "review").gte("review_date", viewedWeek.weekStart).lte("review_date", viewedWeek.weekEnd),
      ]);
      if (blocksResult.error || reviewsResult.error) throw new Error("Não foi possível carregar sua semana.");
      if (version !== loadVersion.current) return;
      setProfile(nextProfile);
      setBlocks(blocksResult.data ?? []);
      setCompletedReviews(reviewsResult.data ?? []);
      setWeeklyOverride(plansResult.data?.find(plan => plan.week_start === viewedWeek.weekStart) ?? null);
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
      persistGoogleProviderToken(activeSession);
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

  const availability = useMemo(() => profile ? normalizeStudyAvailability({
    studyDays: weeklyOverride?.study_days ?? profile.study_days,
    dailyCapacity: profile.daily_theme_capacity,
    dailyCapacities: weeklyOverride?.daily_capacities ?? profile.daily_capacities,
  }) : null, [profile, weeklyOverride]);
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
      if (results.some(result => result.status === "fulfilled" && !result.value.calendar.ok)) setNotice("As datas foram salvas. O Google Calendar tem alterações pendentes e tentará sincronizar novamente.");
    }).finally(() => { savingPlan.current = false; });
  }, [plan, scheduleSignature, session, blocks, weekOffset]);

  const moveToDate = async (blockId: string, date: string) => {
    if (!session || moving || date < today) return;
    const block = blocks.find(item => item.id === blockId);
    if (!block) return;
    setMoving(true);
    setError(null);
    let saved = false;
    try {
      const calendar = await scheduleBlockReview({ block, userId: session.user.id, date });
      saved = true;
      setNotice(calendar.ok ? `Revisão movida para ${formatDate(date)}.` : "A data foi salva. O Google Calendar está pendente de sincronização.");
      await loadData(session.user.id);
    } catch (cause) {
      setError(saved ? "A data foi salva. Atualize a semana para conferir." : cause instanceof Error ? cause.message : "Não foi possível mover a revisão.");
    } finally { setMoving(false); }
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Montando sua semana...</div>;
  if (!session) return null;
  if (error && !profile) return <div className="page-shell"><p role="alert" className="text-sm text-red-700">{error}</p><button className="button-secondary mt-4" onClick={() => setReloadVersion(value => value + 1)}>Tentar novamente</button></div>;
  if (!profile?.onboarding_completed) return <OnboardingPanel userId={session.user.id} profile={profile} onSaved={saved => { setProfile(saved); void loadData(session.user.id); }} />;
  if (!plan || !availability) return null;

  const firstName = profile.preferred_name ?? session.user.user_metadata?.full_name?.split(" ")[0] ?? session.user.email?.split("@")[0] ?? "Estudante";
  const completedByBlock = new Map(completedReviews.map(review => [review.block_id, review.review_date]));
  const completedBlocks = blocks.filter(block => completedByBlock.has(block.id));
  const todoItems = uniqueItems([...plan.preExam, ...plan.selected]);
  const hasOverride = weeklyOverride?.study_days != null || weeklyOverride?.daily_capacities != null;
  const row = (item: WeeklyPlanItem) => <TopicRow key={item.block.id} block={item.block} item={item} onSchedule={() => setScheduleBlock(item.block)} onReview={() => setReviewBlock(item.block)} draggable={!moving} />;

  return (
    <div className="page-shell">
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" className="ml-3 underline" onClick={() => void loadData(session.user.id)}>Atualizar semana</button></div>}
      {notice && <div role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
      <header className="page-header mb-5 sm:items-center">
        <div><h1 className="page-title mt-0">Sua semana, {firstName}</h1><p className="mt-2 text-sm text-gray-500">{formatDate(plan.weekStart)} a {formatDate(plan.weekEnd)} · {plan.capacityUsed} de {plan.capacity} vagas ocupadas{plan.extraCount > 0 ? ` · ${plan.extraCount} ${plan.extraCount === 1 ? "extra" : "extras"}` : ""}</p></div>
        <Link href="/dashboard/blocos" className="button-primary"><Plus size={16} /> Novo tema</Link>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md border border-gray-200 bg-white p-1" aria-label="Semana exibida">
          {["Esta semana", "Próxima semana"].map((label, offset) => <button key={label} type="button" aria-pressed={weekOffset === offset} onClick={() => { if (weekOffset !== offset) { setWeekOffset(offset); setLoading(true); setNotice(null); } }} className={`rounded px-3 py-2 text-xs font-semibold ${weekOffset === offset ? "bg-brand-blue text-white" : "text-gray-600 hover:bg-gray-50"}`}>{label}</button>)}
        </div>
        <button type="button" onClick={() => setAvailabilityOpen(true)} className="button-secondary"><SlidersHorizontal size={15} /> Ajustar esta semana{hasOverride && <span className="status-badge bg-amber-50 text-amber-800">Ajustada</span>}</button>
      </div>
      {weekOffset === 1 && <p className="mb-4 text-sm leading-6 text-gray-500">Prévia da próxima semana. As sugestões automáticas serão confirmadas quando ela começar. Você já pode ajustar a disponibilidade e escolher datas manualmente.</p>}
      {blocks.length === 0 ? <div className="empty-state min-h-64"><Stethoscope size={25} /><p>Seu planejamento começa quando você cadastra um tema já estudado.</p><Link href="/dashboard/blocos" className="button-primary"><Plus size={15} /> Cadastrar primeiro tema</Link></div> : <>
        <WeekStrip todo={todoItems} completed={completedBlocks} completedByBlock={completedByBlock} weekStart={plan.weekStart} dailyCapacities={availability.dailyCapacities} today={today} moving={moving} onMove={moveToDate} />
        <p className="mt-3 text-xs leading-5 text-gray-500">Arraste uma revisão para escolher o dia, ou use o botão de calendário no tema. Dias fora da rotina e revisões além da capacidade entram como extras.</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <TaskColumn title="Feitos" count={completedBlocks.length} icon={<Check size={16} />} tone="done">{completedBlocks.length === 0 ? <InlineEmpty>Nenhuma revisão concluída nesta semana.</InlineEmpty> : completedBlocks.map(block => <TopicRow key={block.id} block={block} completedDate={completedByBlock.get(block.id)} />)}</TaskColumn>
          <TaskColumn title="Por fazer" count={todoItems.length} icon={<Clock3 size={16} />} tone="todo">{todoItems.length === 0 ? <InlineEmpty>Nenhuma revisão agendada nesta semana.</InlineEmpty> : todoItems.map(row)}</TaskColumn>
          <TaskColumn title="Atrasados" count={plan.backlog.length} icon={<CalendarPlus size={16} />} tone="late">{plan.backlog.length === 0 ? <InlineEmpty>Nenhum atraso aguardando uma vaga.</InlineEmpty> : plan.backlog.map(row)}</TaskColumn>
        </div>
        {plan.deferred.length > 0 && <section className="mt-5 overflow-hidden rounded-md border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-4"><h2 className="text-sm font-semibold text-gray-950">Pendentes nesta semana · {plan.deferred.length}</h2><p className="mt-1 text-xs leading-5 text-gray-500">Estas revisões ainda não têm uma vaga disponível. Elas só viram atraso após o fechamento da semana. Você pode ajustar a capacidade ou escolher outro dia.</p></div><div className="divide-y divide-gray-100">{plan.deferred.map(row)}</div></section>}
      </>}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Link href="/dashboard/calendario" className="button-secondary"><CalendarDays size={16} /> Calendário <ArrowRight size={15} /></Link><Link href="/dashboard/metricas" className="button-secondary"><BarChart3 size={16} /> Métricas <ArrowRight size={15} /></Link></div>
      {reviewBlock && <ReviewModal block={reviewBlock} userId={session.user.id} examDate={profile.exam_date} timezone={profile.timezone} onClose={() => setReviewBlock(null)} onCompleted={() => loadData(session.user.id)} />}
      {scheduleBlock && <ScheduleReviewModal block={scheduleBlock} userId={session.user.id} minDate={today} studyDays={availability.studyDays} onClose={() => setScheduleBlock(null)} onChanged={() => loadData(session.user.id)} />}
      {availabilityOpen && <WeeklyAvailabilityModal weekStart={plan.weekStart} dailyCapacities={availability.dailyCapacities} hasOverride={hasOverride} onClose={() => setAvailabilityOpen(false)} onSaved={() => loadData(session.user.id)} />}
    </div>
  );
}

function WeekStrip({ todo, completed, completedByBlock, weekStart, dailyCapacities, today, moving, onMove }: {
  todo: WeeklyPlanItem[]; completed: QuestionBlock[]; completedByBlock: Map<string, string>; weekStart: string;
  dailyCapacities: Record<string, number>; today: string; moving: boolean; onMove: (blockId: string, date: string) => Promise<void>;
}) {
  const days = eachDayOfInterval({ start: new Date(`${weekStart}T12:00:00`), end: addDays(new Date(`${weekStart}T12:00:00`), 6) });
  return <section className="overflow-x-auto rounded-md border border-gray-200 bg-white" aria-label="Calendário desta semana"><div className="grid min-w-[42rem] grid-cols-7 divide-x divide-gray-100">{days.map(day => {
    const date = format(day, "yyyy-MM-dd");
    const scheduled = todo.filter(item => item.scheduledDate === date);
    const finished = completed.filter(block => completedByBlock.get(block.id) === date);
    const capacity = dailyCapacities[String(getISODay(day))] ?? 0;
    return <div key={date} aria-label={`${format(day, "EEEE dd/MM", { locale: ptBR })}, capacidade ${capacity}`} onDragOver={event => { if (date >= today && !moving) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={event => { event.preventDefault(); const blockId = event.dataTransfer.getData("text/metamed-block"); if (blockId) void onMove(blockId, date); }} className={`min-h-32 px-3 py-3 ${date === today ? "bg-emerald-50" : capacity === 0 ? "bg-gray-50/70" : ""}`}>
      <div className="flex items-baseline justify-between gap-2"><span className={`text-xs font-semibold capitalize ${date === today ? "text-emerald-800" : "text-gray-500"}`}>{format(day, "EEE", { locale: ptBR })}</span><span className="text-sm font-semibold tabular-nums text-gray-800">{format(day, "d")}</span></div>
      <p className="mt-1 text-[11px] text-gray-400">{capacity > 0 ? `${finished.length + scheduled.length}/${capacity} revisões` : "Fora da rotina"}</p>
      <div className="mt-3 space-y-1.5">{finished.map(block => <div key={`done-${block.id}`} className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check size={12} className="shrink-0" /><span className="truncate">{block.title}</span></div>)}{scheduled.map(item => <div key={item.block.id} draggable={!moving} onDragStart={event => { event.dataTransfer.setData("text/metamed-block", item.block.id); event.dataTransfer.effectAllowed = "move"; }} title={item.block.title} className="cursor-grab truncate border-l-2 border-gray-400 pl-2 text-xs font-medium text-gray-700">{item.block.title}</div>)}{finished.length === 0 && scheduled.length === 0 && <span className="text-xs text-gray-300">{capacity > 0 ? "Livre" : ""}</span>}</div>
    </div>;
  })}</div></section>;
}

function TaskColumn({ title, count, icon, tone, children }: { title: string; count: number; icon: React.ReactNode; tone: "done" | "todo" | "late"; children: React.ReactNode }) {
  const tones = { done: "border-emerald-200 bg-emerald-50 text-emerald-800", todo: "border-gray-200 bg-gray-50 text-gray-800", late: "border-amber-200 bg-amber-50 text-amber-800" };
  return <section className="overflow-hidden rounded-md border border-gray-200 bg-white"><div className={`flex items-center justify-between border-b px-4 py-3.5 ${tones[tone]}`}><div className="flex items-center gap-2">{icon}<h2 className="text-sm font-semibold">{title}</h2></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white/80 px-2 text-xs font-semibold tabular-nums">{count}</span></div><div className="divide-y divide-gray-100">{children}</div></section>;
}

function TopicRow({ block, item, completedDate, onSchedule, onReview, draggable = false }: { block: QuestionBlock; item?: WeeklyPlanItem; completedDate?: string; onSchedule?: () => void; onReview?: () => void; draggable?: boolean }) {
  return <div draggable={draggable} onDragStart={event => { event.dataTransfer.setData("text/metamed-block", block.id); event.dataTransfer.effectAllowed = "move"; }} className="relative flex min-h-32 gap-3 px-4 py-4"><span className={`absolute bottom-0 left-0 top-0 w-1 ${areaTone(block.major_area)}`} /><div className="min-w-0 flex-1 pl-1">
    <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-gray-950">{block.title}</h3>{item?.isExtra && <span className="status-badge bg-cyan-100 text-cyan-700">Extra</span>}{item?.isAnticipation && <span className="status-badge bg-blue-50 text-blue-700">Antecipação</span>}{block.backlog_since && !completedDate && <span className="status-badge bg-amber-100 text-amber-800">Atraso desde {formatDate(block.backlog_since)}</span>}{block.pre_exam_review_requested && <span className="status-badge bg-amber-100 text-amber-800">Antes da prova</span>}{block.calendar_sync_enabled && ["pending", "failed"].includes(block.calendar_sync_status) && <span className="status-badge bg-gray-100 text-gray-600">Calendar pendente</span>}</div>
    <p className="mt-1 truncate text-xs text-gray-500">{block.major_area} · {block.specialty}</p>
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>{block.accuracy_percentage}% · {block.performance_band ? performanceLabel(block.performance_band) : "legado"}</span><span>Importância {importanceLabel(block.importance).toLocaleLowerCase("pt-BR")}</span>{completedDate && <span className="font-semibold text-emerald-700">Concluído em {formatDate(completedDate)}</span>}{!completedDate && item?.scheduledDate && <span className="font-semibold text-emerald-700">Agendada: {formatDate(item.scheduledDate)}</span>}</div>
    <p className="mt-2 text-xs text-gray-500">Próxima sugestão: <span className="font-medium text-gray-800">{formatDate(block.next_review_date)}</span></p>
  </div>{onSchedule && onReview && <div className="flex shrink-0 flex-col items-center gap-1">{draggable && <GripVertical size={14} className="cursor-grab text-gray-300" aria-hidden="true" />}<button type="button" onClick={onSchedule} title="Escolher ou remarcar dia" aria-label={`Escolher dia de ${block.title}`} className="icon-button"><CalendarPlus size={16} /></button><button type="button" onClick={onReview} title="Registrar revisão" aria-label={`Registrar revisão de ${block.title}`} className="icon-button text-emerald-700 hover:bg-emerald-50"><Play size={15} /></button></div>}</div>;
}

function InlineEmpty({ children }: { children: React.ReactNode }) { return <div className="flex min-h-32 items-center justify-center px-5 text-center text-sm text-gray-400">{children}</div>; }
function uniqueItems(items: WeeklyPlanItem[]) { const seen = new Set<string>(); return items.filter(item => { if (seen.has(item.block.id)) return false; seen.add(item.block.id); return true; }); }
function areaTone(area: QuestionBlock["major_area"]) { return { "Clínica Médica": "bg-area-1", Cirurgia: "bg-area-2", "Ginecologia e Obstetrícia": "bg-area-3", Pediatria: "bg-area-4", Preventiva: "bg-area-5", "A classificar": "bg-gray-300" }[area]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T12:00:00`)); }
