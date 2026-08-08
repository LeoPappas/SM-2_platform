"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { ReviewModal } from "@/components/review-modal";
import { ScheduleReviewModal } from "@/components/schedule-review-modal";
import type { BlockReview, QuestionBlock, StudentProfile } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { supabase } from "@/lib/supabase";

type CalendarEvent = {
  id: string;
  date: string;
  label: string;
  type: "first-contact" | "completed" | "window" | "scheduled";
  block: QuestionBlock;
};

export default function CalendarPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<CalendarEvent | null>(null);
  const [scheduleBlock, setScheduleBlock] = useState<QuestionBlock | null>(null);
  const [reviewBlock, setReviewBlock] = useState<QuestionBlock | null>(null);

  const loadData = useCallback(async (userId: string) => {
    const [blocksResult, reviewsResult, profileResult] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId),
      supabase.from("block_reviews").select("*").eq("user_id", userId).order("review_date"),
      supabase.from("student_profiles").select("*").eq("user_id", userId).maybeSingle(),
    ]);

    if (blocksResult.error || reviewsResult.error || profileResult.error) {
      setError("Não foi possível carregar o calendário.");
    }
    setBlocks(blocksResult.data ?? []);
    setReviews(reviewsResult.data ?? []);
    setProfile(profileResult.data ?? null);
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

  const events = useMemo(() => {
    const blockById = new Map(blocks.map(block => [block.id, block]));
    const blockEvents: CalendarEvent[] = blocks.flatMap(block => {
      const firstContact: CalendarEvent = {
        id: `${block.id}-first`,
        date: block.study_date,
        label: "Primeiro contato",
        type: "first-contact",
        block,
      };
      const next: CalendarEvent = block.planned_review_date
        ? {
            id: `${block.id}-scheduled`,
            date: block.planned_review_date,
            label: block.planning_source === "manual" ? "Dia escolhido" : "Revisão agendada",
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
      }] : [];
    });
    return [...blockEvents, ...reviewEvents];
  }, [blocks, reviews]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Carregando calendário...</div>;

  const calendarStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="page-shell">
      {error && <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <header className="page-header">
        <h1 className="page-title mt-0">Calendário</h1>
        <button type="button" onClick={() => setCurrentMonth(new Date())} className="button-secondary"><CalendarClock size={16} /> Hoje</button>
      </header>

      <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5">
          <button type="button" onClick={() => setCurrentMonth(month => subMonths(month, 1))} className="icon-button" aria-label="Mês anterior"><ChevronLeft size={18} /></button>
          <h2 className="text-base font-semibold text-gray-950">{formatMonth(currentMonth)}</h2>
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
              {[
                { label: "seg.", isoDay: 1 },
                { label: "ter.", isoDay: 2 },
                { label: "qua.", isoDay: 3 },
                { label: "qui.", isoDay: 4 },
                { label: "sex.", isoDay: 5 },
                { label: "sáb.", isoDay: 6 },
                { label: "dom.", isoDay: 7 },
              ].map(day => {
                const unavailable = Boolean(profile?.study_days?.length && !profile.study_days.includes(day.isoDay));
                return (
                  <div key={day.label} className={`flex items-center justify-center border-r border-gray-300 py-2.5 text-center text-xs font-semibold last:border-r-0 ${unavailable ? "bg-gray-50/70 text-gray-400" : "text-gray-500"}`}>
                    {day.label}
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-7 border-l border-gray-300">
              {calendarDays.map(day => {
                const date = format(day, "yyyy-MM-dd");
                const dayEvents = events.filter(event => event.date === date);
                const inMonth = isSameMonth(day, currentMonth);
                const isToday = date === today;
                const unavailable = Boolean(profile?.study_days?.length && !profile.study_days.includes(getISODay(day)));
                return (
                  <div key={date} aria-label={unavailable ? `${format(day, "d 'de' MMMM", { locale: ptBR })}, fora da rotina habitual` : undefined} className={`min-h-32 border-b border-r border-gray-300 p-2 ${!inMonth ? "bg-gray-100" : unavailable ? "bg-gray-50/70" : "bg-white"}`}>
                    <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isToday ? "bg-brand-blue text-white" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 4).map(event => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => event.type === "window" || event.type === "scheduled" ? setActionEvent(event) : undefined}
                          disabled={event.type === "first-contact" || event.type === "completed"}
                          title={`${event.label}: ${event.block.title}`}
                          className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] font-semibold ${eventClass(event.type)}`}
                        >
                          {event.block.title}
                        </button>
                      ))}
                      {dayEvents.length > 4 && <p className="text-center text-[10px] text-gray-400">+{dayEvents.length - 4}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {actionEvent && (
        <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-brand-blue">{actionEvent.label}</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-950">{actionEvent.block.title}</h2>
                <p className="mt-1 text-sm text-gray-500">{actionEvent.block.major_area} · {actionEvent.block.specialty}</p>
              </div>
              <button type="button" onClick={() => setActionEvent(null)} className="icon-button" aria-label="Fechar"><X size={18} /></button>
            </div>
            <div className="mt-6 grid gap-2">
              <button type="button" onClick={() => {
                setScheduleBlock(actionEvent.block);
                setActionEvent(null);
              }} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 text-left hover:bg-gray-50">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">{actionEvent.type === "scheduled" ? "Remarcar dia" : "Escolher um dia"}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">Atualiza a <BrandName /> e o Google Calendar.</span>
                </span>
                <CalendarPlus size={17} className="text-brand-blue" />
              </button>
              <button type="button" onClick={() => {
                setReviewBlock(actionEvent.block);
                setActionEvent(null);
              }} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 text-left hover:bg-gray-50">
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Registrar revisão</span>
                  <span className="mt-0.5 block text-xs text-gray-500">Salva o resultado e abre a próxima janela.</span>
                </span>
                <Play size={16} className="text-brand-blue" />
              </button>
            </div>
          </div>
        </div>
      )}

      {session && scheduleBlock && (
        <ScheduleReviewModal
          block={scheduleBlock}
          userId={session.user.id}
          minDate={scheduleBlock.study_date}
          maxDate={profile?.exam_date ?? undefined}
          studyDays={profile?.study_days}
          onClose={() => setScheduleBlock(null)}
          onChanged={() => loadData(session.user.id)}
        />
      )}

      {session && reviewBlock && (
        <ReviewModal
          block={reviewBlock}
          userId={session.user.id}
          examDate={profile?.exam_date}
          onClose={() => setReviewBlock(null)}
          onCompleted={() => loadData(session.user.id)}
        />
      )}
    </div>
  );
}

function Legend({ type, label }: { type: CalendarEvent["type"]; label: string }) {
  return <span className="flex items-center gap-2 text-xs text-gray-600"><span className={`h-3 w-4 rounded ${legendClass(type)}`} />{label}</span>;
}

function eventClass(type: CalendarEvent["type"]) {
  return {
    "first-contact": "cursor-default bg-blue-100 text-blue-800",
    completed: "cursor-default bg-brand-mint/20 text-brand-ink",
    window: "border border-dashed border-gray-300 bg-white text-gray-600 hover:border-gray-500 hover:bg-gray-50",
    scheduled: "bg-teal-100 text-teal-800 hover:bg-teal-200",
  }[type];
}

function legendClass(type: CalendarEvent["type"]) {
  return {
    "first-contact": "bg-blue-400",
    completed: "bg-brand-mint",
    window: "border border-dashed border-gray-400 bg-white",
    scheduled: "bg-teal-500",
  }[type];
}

function formatMonth(date: Date) {
  const label = format(date, "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1);
}
