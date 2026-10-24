"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISODay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { BrandName } from "@/components/brand-name";
import { ReviewDragContext, ReviewDragHandle, useReviewDropTarget, type DraggedReview, type ReviewDropTarget } from "@/components/review-drag";
import { ReviewModal } from "@/components/review-modal";
import { SessionEditModal } from "@/components/session-edit-modal";
import { ScheduleReviewModal } from "@/components/schedule-review-modal";
import { displayArea, loadCourseAreas } from "@/lib/course-catalog";
import type { BlockReview, QuestionBlock, StudentProfile, WeeklyPlan } from "@/lib/database.types";
import { planningToday } from "@/lib/planning-date";
import { scheduleBlockReview } from "@/lib/revision-actions";
import { availabilityResolver, type WeekStartsOn } from "@/lib/study-availability";
import { prepareWeeklyPlanning } from "@/lib/weekly-planning";
import { supabase } from "@/lib/supabase";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

type CalendarEvent = {
  id: string;
  date: string;
  label: string;
  type: "first-contact" | "completed" | "window" | "scheduled";
  block: QuestionBlock;
  /** The recorded session behind a first contact or completed review, when there is one. */
  session?: BlockReview | null;
  /** Only the last session of a topic can be corrected. */
  isLastSession?: boolean;
};

export default function CalendarPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [courseAreas, setCourseAreas] = useState<ReadonlyMap<string, string>>(new Map());
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<CalendarEvent | null>(null);
  const [dayList, setDayList] = useState<{ day: Date; events: CalendarEvent[] } | null>(null);
  const [scheduleBlock, setScheduleBlock] = useState<QuestionBlock | null>(null);
  const [reviewBlock, setReviewBlock] = useState<QuestionBlock | null>(null);
  const [sessionBlock, setSessionBlock] = useState<QuestionBlock | null>(null);
  const [sessionDetails, setSessionDetails] = useState<CalendarEvent | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A dragged review shows on its new day at once and returns if the save fails.
  const [pendingMoves, setPendingMoves] = useState<Record<string, string>>({});

  const loadData = useCallback(async (userId: string) => {
    const { data: savedProfile } = await supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (savedProfile?.onboarding_completed) {
      try { await prepareWeeklyPlanning(planningToday(savedProfile.timezone)); }
      catch { setError("Não foi possível atualizar o fechamento da semana. Atualize a página para tentar novamente."); }
    }
    const [blocksResult, reviewsResult, profileResult, plansResult] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId).is("archived_at", null),
      supabase.from("block_reviews").select("*").eq("user_id", userId).order("review_date"),
      supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("weekly_plans").select("*").eq("user_id", userId),
    ]);

    if (blocksResult.error || reviewsResult.error || profileResult.error || plansResult.error) {
      setError("Não foi possível carregar o calendário.");
    }
    setBlocks(blocksResult.data ?? []);
    setCourseAreas(await loadCourseAreas(blocksResult.data ?? []).catch(() => new Map<string, string>()));
    setReviews(reviewsResult.data ?? []);
    setProfile(profileResult.data ?? null);
    setWeeklyPlans(plansResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      setSession(activeSession);
      if (activeSession) loadData(activeSession.user.id);
      else setLoading(false);
    });
  }, [loadData]);

  const events = useMemo(() => {
    const blockById = new Map(blocks.map(block => [block.id, block]));
    const firstContactByBlock = new Map(reviews.filter(review => review.contact_type === "first_contact").map(review => [review.block_id, review]));
    const lastReviewByBlock = new Map<string, BlockReview>();
    for (const review of reviews.filter(item => item.contact_type === "review")) {
      const current = lastReviewByBlock.get(review.block_id);
      if (!current || `${review.review_date}${review.created_at}` > `${current.review_date}${current.created_at}`) lastReviewByBlock.set(review.block_id, review);
    }
    const blockEvents: CalendarEvent[] = blocks.flatMap(block => {
      const firstContact: CalendarEvent = {
        id: `${block.id}-first`,
        date: block.study_date,
        label: "Primeiro contato",
        type: "first-contact",
        block,
        session: firstContactByBlock.get(block.id) ?? null,
        isLastSession: block.repetitions === 0,
      };
      const plannedDate = pendingMoves[block.id] ?? block.planned_review_date;
      const next: CalendarEvent = plannedDate
        ? {
            id: `${block.id}-scheduled`,
            date: plannedDate,
            label: block.planning_source === "manual" || pendingMoves[block.id] ? "Dia escolhido" : "Revisão agendada",
            type: "scheduled",
            block,
          }
        : {
            id: `${block.id}-window`,
            date: block.next_review_date,
            label: "Janela calculada",
            type: "window",
            block,
          };
      return [firstContact, next];
    });
    const reviewEvents: CalendarEvent[] = reviews.filter(review => review.contact_type === "review").flatMap(review => {
      const block = blockById.get(review.block_id);
      return block ? [{
        id: review.id,
        date: review.review_date,
        label: "Revisão concluída",
        type: "completed" as const,
        block,
        session: review,
        isLastSession: block.repetitions > 0 && lastReviewByBlock.get(block.id)?.id === review.id,
      }] : [];
    });
    return [...blockEvents, ...reviewEvents];
  }, [blocks, reviews, pendingMoves]);
  const availabilityOn = useMemo(() => profile ? availabilityResolver(profile, weeklyPlans) : null, [profile, weeklyPlans]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Carregando calendário...</div>;

  const weekStartsOn = (profile?.week_starts_on ?? 1) as WeekStartsOn;
  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = planningToday(profile?.timezone);
  const capacityForDate = (date: string) => availabilityOn ? availabilityOn(date).dailyCapacities[String(getISODay(new Date(`${date}T12:00:00`)))] ?? 0 : 1;
  const moving = Object.keys(pendingMoves).length > 0;
  const moveToDate = async (review: DraggedReview, target: ReviewDropTarget) => {
    const block = blocks.find(item => item.id === review.blockId);
    if (!session || !block || moving || target.date < today) return;
    setPendingMoves({ [block.id]: target.date });
    setError(null);
    setNotice(null);
    try {
      await scheduleBlockReview({ block, userId: session.user.id, date: target.date });
      await loadData(session.user.id);
      setNotice(`${block.title} foi para ${target.label}.`);
    } catch (cause) {
      setError(`Não foi possível mover ${block.title}; ela voltou para o dia anterior. ${cause instanceof Error ? cause.message : ""}`.trim());
    } finally {
      setPendingMoves({});
    }
  };
  const openSession = (event: CalendarEvent) => {
    if (event.isLastSession) setSessionBlock(event.block);
    else setSessionDetails(event);
  };
  const weekdayLabels = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

  return (
    <div className="page-shell">
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <header className="page-header">
        <h1 className="page-title mt-0">Calendário</h1>
        <button type="button" onClick={() => setCurrentMonth(new Date())} className="button-secondary"><CalendarClock size={16} /> Hoje</button>
      </header>

      <section className="overflow-hidden card">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5">
          <button type="button" onClick={() => setCurrentMonth(month => subMonths(month, 1))} className="icon-button" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <h2 className="text-base font-semibold text-gray-900">{formatMonth(currentMonth)}</h2>
          <button type="button" onClick={() => setCurrentMonth(month => addMonths(month, 1))} className="icon-button" aria-label="Próximo mês"><ChevronRight size={18} /></button>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-gray-200 px-4 py-3">
          <Legend type="first-contact" label="Primeiro contato" />
          <Legend type="completed" label="Revisão concluída" />
          <Legend type="window" label="Janela calculada" />
          <Legend type="scheduled" label="Revisão agendada" />
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[52rem]">
            <div className="grid grid-cols-7 border-b border-l border-gray-300 bg-gray-50">
              {Array.from({ length: 7 }, (_, offset) => {
                const dow = (weekStartsOn + offset) % 7;
                return { label: weekdayLabels[dow], isoDay: dow === 0 ? 7 : dow };
              }).map(day => {
                const unavailable = Boolean(profile && !profile.study_days.includes(day.isoDay));
                return (
                  <div key={day.label} className={`flex items-center justify-center border-r border-gray-300 py-2.5 text-center text-xs font-semibold last:border-r-0 ${unavailable ? "bg-gray-50 text-gray-500" : "text-gray-500"}`}>
                    {day.label}
                  </div>
                );
              })}
            </div>
            <ReviewDragContext keyboard={false} onMove={(review, target) => void moveToDate(review, target)}>
              <div className="grid grid-cols-7 border-l border-gray-300">
                {calendarDays.map(day => {
                  const date = format(day, "yyyy-MM-dd");
                  return (
                    <CalendarDay
                      key={date}
                      day={day}
                      date={date}
                      events={events.filter(event => event.date === date)}
                      inMonth={isSameMonth(day, currentMonth)}
                      isToday={date === today}
                      unavailable={Boolean(availabilityOn) && capacityForDate(date) === 0}
                      acceptsDrop={date >= today && !moving}
                      dragDisabled={moving}
                      onOpen={setActionEvent}
                      onOpenSession={openSession}
                      onShowAll={dayEvents => setDayList({ day, events: dayEvents })}
                    />
                  );
                })}
              </div>
            </ReviewDragContext>
          </div>
        </div>
      </section>

      {dayList && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-label={`Eventos de ${formatDay(dayList.day)}`} onMouseDown={event => {
          if (event.target === event.currentTarget) setDayList(null);
        }}>
          <div className="modal-panel w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="page-eyebrow">{dayList.events.length} eventos</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">{formatDay(dayList.day)}</h2>
              </div>
              <button type="button" onClick={() => setDayList(null)} className="icon-button" aria-label="Fechar"><X size={18} /></button>
            </div>
            <ul className="mt-5 space-y-2">
              {dayList.events.map(event => {
                const content = <>
                  <span className={`h-3 w-4 shrink-0 rounded ${legendClass(event.type)}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{event.block.title}</span>
                    <span className="block text-xs text-gray-500">{event.label}</span>
                  </span>
                </>;
                return (
                  <li key={event.id}>
                    {event.type === "window" || event.type === "scheduled" ? (
                      <button type="button" onClick={() => {
                        setDayList(null);
                        setActionEvent(event);
                      }} className="flex w-full items-center gap-3 rounded-md border border-gray-300 px-4 py-3 text-left transition-colors hover:bg-gray-100">
                        {content}
                      </button>
                    ) : (
                      <button type="button" onClick={() => {
                        setDayList(null);
                        openSession(event);
                      }} className="flex w-full items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-100">
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {actionEvent && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-panel w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="page-eyebrow">{actionEvent.label}</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">{actionEvent.block.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{displayArea(actionEvent.block, courseAreas)} · {actionEvent.block.specialty}</p>
                {actionEvent.type === "scheduled" && actionEvent.date !== actionEvent.block.next_review_date && (
                  <p className="mt-2 text-sm text-gray-600">Data calculada: <span className="font-semibold text-gray-900">{format(new Date(`${actionEvent.block.next_review_date}T12:00:00`), "dd/MM")}</span></p>
                )}
              </div>
              <button type="button" onClick={() => setActionEvent(null)} className="icon-button" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="mt-6 grid gap-2">
              <button type="button" onClick={() => {
                setScheduleBlock(actionEvent.block);
                setActionEvent(null);
              }} className="flex items-center justify-between rounded-md border border-gray-300 px-4 py-3 text-left transition-colors hover:bg-gray-100">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{actionEvent.type === "scheduled" ? "Remarcar dia" : "Escolher um dia"}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">Atualiza o seu plano na <BrandName />.</span>
                </span>
                <CalendarPlus size={17} className="text-blue-700" />
              </button>
              <button type="button" onClick={() => {
                setReviewBlock(actionEvent.block);
                setActionEvent(null);
              }} className="flex items-center justify-between rounded-md border border-gray-300 px-4 py-3 text-left transition-colors hover:bg-gray-100">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Registrar revisão</span>
                  <span className="mt-0.5 block text-xs text-gray-500">Salva o resultado e abre a próxima janela.</span>
                </span>
                <Play size={16} className="text-blue-700" />
              </button>
            </div>
          </div>
        </div>
      )}

      {session && scheduleBlock && (
        <ScheduleReviewModal
          block={scheduleBlock}
          userId={session.user.id}
          minDate={today}
          capacityForDate={capacityForDate}
          onClose={() => setScheduleBlock(null)}
          onChanged={() => loadData(session.user.id)}
        />
      )}

      {session && sessionBlock && (
        <SessionEditModal
          block={sessionBlock}
          userId={session.user.id}
          examDate={profile?.exam_date}
          timezone={profile?.timezone}
          onClose={() => setSessionBlock(null)}
          onSaved={() => loadData(session.user.id)}
        />
      )}

      {sessionDetails && <SessionDetailsModal event={sessionDetails} onClose={() => setSessionDetails(null)} />}

      {session && reviewBlock && (
        <ReviewModal
          block={reviewBlock}
          area={displayArea(reviewBlock, courseAreas)}
          userId={session.user.id}
          examDate={profile?.exam_date}
          timezone={profile?.timezone}
          onClose={() => setReviewBlock(null)}
          onCompleted={() => loadData(session.user.id)}
        />
      )}
    </div>
  );
}

const DAY_LINES = 3;

/** A past session that can no longer be corrected, shown read-only. */
function SessionDetailsModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useModalAccessibility(onClose, false);
  const review = event.session;
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={mouse => {
      if (mouse.target === mouse.currentTarget) onClose();
    }}>
      <div ref={panelRef} tabIndex={-1} className="modal-panel w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">{event.label}</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-gray-900">{event.block.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{formatDay(new Date(`${event.date}T12:00:00`))}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X size={18} /></button>
        </div>
        {review ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Questões" value={String(review.question_count)} />
            <Detail label="Acertos" value={`${review.correct_count} · ${review.accuracy_percentage}%`} />
            <Detail label="Dificuldade percebida" value={review.perceived_difficulty} />
            <Detail label="Tempo" value={review.time_spent_minutes != null ? `${review.time_spent_minutes} min` : "—"} />
            <Detail label="Intervalo calculado" value={review.new_interval_days != null ? `${review.new_interval_days} dias` : "—"} />
          </dl>
        ) : (
          <p className="mt-6 text-sm leading-6 text-gray-600">Este primeiro contato foi cadastrado antes do registro de sessões.</p>
        )}
        <p className="mt-6 rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3 text-xs leading-5 text-gray-600">
          Só a última sessão do tema pode ser corrigida. Mudar uma sessão antiga alteraria todos os intervalos calculados depois dela.
        </p>
        <div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="button-secondary">Fechar</button></div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

function CalendarDay({ day, date, events, inMonth, isToday, unavailable, acceptsDrop, dragDisabled, onOpen, onOpenSession, onShowAll }: {
  day: Date; date: string; events: CalendarEvent[]; inMonth: boolean; isToday: boolean; unavailable: boolean;
  acceptsDrop: boolean; dragDisabled: boolean; onOpen: (event: CalendarEvent) => void; onOpenSession: (event: CalendarEvent) => void;
  onShowAll: (events: CalendarEvent[]) => void;
}) {
  const label = format(day, "EEEE dd/MM", { locale: ptBR });
  const { setNodeRef, isOver } = useReviewDropTarget(`day:${date}`, { date, label }, !acceptsDrop);
  // The cell has room for three lines; with more events, the third line counts the rest.
  const visible = events.length > DAY_LINES ? events.slice(0, DAY_LINES - 1) : events;
  const hidden = events.slice(visible.length);
  return (
    <div ref={setNodeRef} aria-label={unavailable ? `${format(day, "d 'de' MMMM", { locale: ptBR })}, fora da disponibilidade da semana` : undefined} className={`h-36 overflow-hidden border-b border-r border-gray-300 p-2 transition-shadow ${isOver ? "ring-2 ring-inset ring-blue-500" : ""} ${!inMonth ? "bg-gray-100" : unavailable ? "bg-gray-50" : "bg-white"}`}>
      <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-blue-700 text-white" : inMonth ? "text-gray-700" : "text-gray-400"}`}>
        {format(day, "d")}
      </div>
      <div className="space-y-1">
        {visible.map(event => event.type === "window" || event.type === "scheduled" ? (
          <ReviewDragHandle
            key={event.id}
            id={`calendar:${event.id}`}
            review={{ blockId: event.block.id, title: event.block.title, date: event.date }}
            disabled={dragDisabled}
            onClick={() => onOpen(event)}
            title={`${event.label}: ${event.block.title}. Arraste para outro dia ou clique para mais opções.`}
            className={`block h-6 w-full truncate rounded px-2 py-1 text-left text-[11px] font-semibold leading-4 ${eventClass(event.type)}`}
          >
            {event.block.title}
          </ReviewDragHandle>
        ) : (
          <button key={event.id} type="button" onClick={() => onOpenSession(event)} title={`${event.label}: ${event.block.title}. ${event.isLastSession ? "Clique para editar." : "Clique para ver os dados."}`} className={`block h-6 w-full truncate rounded px-2 py-1 text-left text-[11px] font-semibold leading-4 ${eventClass(event.type)}`}>
            {event.block.title}
          </button>
        ))}
        {hidden.length > 0 && (
          <button type="button" onClick={() => onShowAll(events)} title={hidden.map(event => event.block.title).join(", ")} className="block h-6 w-full rounded px-2 py-1 text-left text-[11px] font-semibold leading-4 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
            +{hidden.length} mais
          </button>
        )}
      </div>
    </div>
  );
}

function Legend({ type, label }: { type: CalendarEvent["type"]; label: string }) {
  return <span className="flex items-center gap-2 text-xs text-gray-600"><span className={`h-3 w-4 rounded ${legendClass(type)}`} />{label}</span>;
}

function eventClass(type: CalendarEvent["type"]) {
  return {
    "first-contact": "bg-blue-50 text-blue-800 hover:bg-blue-100",
    completed: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    window: "border border-dashed border-gray-300 bg-white text-gray-600 hover:border-gray-500 hover:bg-gray-50",
    scheduled: "bg-blue-700 text-white hover:bg-blue-600",
  }[type];
}

function legendClass(type: CalendarEvent["type"]) {
  return {
    "first-contact": "bg-blue-200",
    completed: "bg-emerald-600",
    window: "border border-dashed border-gray-400 bg-white",
    scheduled: "bg-blue-700",
  }[type];
}

function formatDay(date: Date) {
  const label = format(date, "EEEE, dd/MM", { locale: ptBR });
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}

function formatMonth(date: Date) {
  const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}
