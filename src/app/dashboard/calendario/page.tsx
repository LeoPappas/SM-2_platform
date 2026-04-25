"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Theme, StudySession } from "@/lib/database.types";
import { calculateSM2 } from "@/lib/sm2";
import { createOrUpdateCalendarEvent } from "@/lib/calendar";
import {
  format, differenceInDays, startOfDay, addDays,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, addMonths, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ChevronLeft, ChevronRight, Play, X } from "lucide-react";

type EventType = "completed" | "scheduled" | "missed";

type CalendarEvent = {
  type: EventType;
  label: string;
  theme: Theme;
  sessionId?: string;
};

export default function CalendarioPage() {
  const [session, setSession] = useState<any>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [allSessions, setAllSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());

  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [studyOpen, setStudyOpen] = useState<Theme | null>(null);
  const [accuracy, setAccuracy] = useState(0);
  const [easiness, setEasiness] = useState("Médio");
  const [studyDate, setStudyDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 6000);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchData(session.user.id);
      else setLoading(false);
    });
  }, []);

  const fetchData = async (userId: string) => {
    const [themesRes, sessionsRes] = await Promise.all([
      supabase.from("themes").select("*").eq("user_id", userId).order("next_review_date", { ascending: true }),
      supabase.from("study_sessions").select("*").eq("user_id", userId).order("study_date", { ascending: true }),
    ]);
    if (themesRes.error) showError("Erro ao carregar temas.");
    else if (themesRes.data) setThemes(themesRes.data);
    if (sessionsRes.error) showError("Erro ao carregar sessões.");
    else if (sessionsRes.data) setAllSessions(sessionsRes.data);
    setLoading(false);
  };

  const getValidToken = async (): Promise<string | null> => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (freshSession) setSession(freshSession);
    return freshSession?.provider_token ?? null;
  };

  const submitStudySession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyOpen) return;
    setSubmitting(true);

    const selectedDate = startOfDay(new Date(studyDate + "T00:00:00"));
    const scheduledDate = startOfDay(new Date(studyOpen.next_review_date + "T00:00:00"));
    const daysDelayed = differenceInDays(selectedDate, scheduledDate);

    const result = calculateSM2({
      accuracy,
      easiness,
      repetitions: studyOpen.repetitions,
      previousInterval: studyOpen.interval_days,
      previousEF: studyOpen.easiness_factor,
      daysDelayed,
    });

    const nextDate = addDays(selectedDate, result.intervalDays);
    const formattedNextDate = format(nextDate, "yyyy-MM-dd");

    const { error: sessionError } = await supabase.from("study_sessions").insert({
      theme_id: studyOpen.id,
      user_id: session.user.id,
      study_date: studyDate,
      accuracy_percentage: accuracy,
      easiness_rating: easiness,
      sm2_grade_calculated: result.q,
    });

    if (sessionError) {
      showError("Erro ao salvar a sessão de estudo.");
      setSubmitting(false);
      return;
    }

    let newEventId = studyOpen.calendar_event_id;
    const token = await getValidToken();
    if (token) {
      try {
        const eventId = await createOrUpdateCalendarEvent({
          providerToken: token,
          eventId: studyOpen.calendar_event_id,
          summary: studyOpen.title,
          description: `Área: ${studyOpen.area}\nContatos: ${result.repetitions}\nSua precisão anterior: ${accuracy}%\nAtualização gerada pela plataforma SM-2.`,
          date: formattedNextDate,
        });
        if (eventId) newEventId = eventId;
      } catch {
        showError("Erro ao sincronizar com Google Calendar. A revisão foi salva normalmente.");
      }
    }

    const { error: updateError } = await supabase
      .from("themes")
      .update({
        repetitions: result.repetitions,
        easiness_factor: result.easinessFactor,
        interval_days: result.intervalDays,
        next_review_date: formattedNextDate,
        calendar_event_id: newEventId,
      })
      .eq("id", studyOpen.id);

    if (updateError) showError("Erro ao atualizar o tema.");

    setStudyOpen(null);
    setAccuracy(0);
    setEasiness("Médio");
    setStudyDate(format(new Date(), "yyyy-MM-dd"));
    setSubmitting(false);
    fetchData(session.user.id);
  };

  const openStudyModal = (theme: Theme) => {
    setStudyOpen(theme);
    setStudyDate(format(new Date(), "yyyy-MM-dd"));
    setAccuracy(0);
    setEasiness("Médio");
  };

  const handleThemePickerContinue = () => {
    const theme = themes.find(t => t.id === selectedThemeId);
    if (!theme) return;
    setThemePickerOpen(false);
    setSelectedThemeId("");
    openStudyModal(theme);
  };

  // --- Calendar logic ---
  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");

  // sessionsByTheme[themeId] = sessions sorted by study_date ASC (preserved from fetch order)
  const sessionsByTheme: Record<string, StudySession[]> = {};
  allSessions.forEach(s => {
    if (!sessionsByTheme[s.theme_id]) sessionsByTheme[s.theme_id] = [];
    sessionsByTheme[s.theme_id].push(s);
  });

  // sessionsByDate[dateStr] = sessions completed on that date
  const sessionsByDate: Record<string, StudySession[]> = {};
  allSessions.forEach(s => {
    if (!sessionsByDate[s.study_date]) sessionsByDate[s.study_date] = [];
    sessionsByDate[s.study_date].push(s);
  });

  // Label for a future/missed theme: PC if never studied, R-n if n sessions done
  const getThemeLabel = (themeId: string): string => {
    const count = (sessionsByTheme[themeId] || []).length;
    return count === 0 ? "PC" : `R-${count}`;
  };

  const getEventsForDay = (dayStr: string): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    const completedOnDay = sessionsByDate[dayStr] || [];
    const completedThemeIds = new Set(completedOnDay.map(s => s.theme_id));

    // Completed sessions on this day → green filled
    completedOnDay.forEach(s => {
      const theme = themes.find(t => t.id === s.theme_id);
      if (!theme) return;
      const idx = (sessionsByTheme[s.theme_id] || []).findIndex(x => x.id === s.id);
      events.push({
        type: "completed",
        label: idx === 0 ? "PC" : `R-${idx}`,
        theme,
        sessionId: s.id,
      });
    });

    // Themes whose next_review_date = this day and not yet completed today
    themes.forEach(theme => {
      if (theme.next_review_date !== dayStr) return;
      if (completedThemeIds.has(theme.id)) return;
      events.push({
        type: dayStr < todayStr ? "missed" : "scheduled",
        label: getThemeLabel(theme.id),
        theme,
      });
    });

    return events;
  };

  // Build calendar grid (Sun → Sat)
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-screen text-gray-400 text-sm">
      Carregando...
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {errorMsg && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={16} /></button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Calendário</h1>
          <button
            onClick={() => setThemePickerOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
          >
            <Plus size={17} /> Sessão de Estudo
          </button>
        </div>

        {/* Calendar card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* Month navigation */}
          <div className="flex items-center justify-center py-5 border-b border-gray-100 gap-6">
            <button
              onClick={() => setCurrentDate(d => subMonths(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <h2 className="text-lg font-bold text-gray-900 capitalize w-52 text-center">
              {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <button
              onClick={() => setCurrentDate(d => addMonths(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 border-b border-gray-100">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block w-4 h-3 rounded border border-green-500 bg-white shrink-0" />
              Revisão agendada
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block w-4 h-3 rounded bg-green-500 shrink-0" />
              Revisão concluída
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <span className="inline-block w-4 h-3 rounded border border-red-400 bg-white shrink-0" />
              Revisão atrasada
            </span>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."].map(d => (
              <div key={d} className="text-center text-xs font-semibold uppercase tracking-wide text-gray-400 py-3">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 border-l border-t border-gray-100">
            {calDays.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, currentDate);
              const isToday = dayStr === todayStr;
              const events = getEventsForDay(dayStr);

              return (
                <div
                  key={dayStr}
                  className={`border-r border-b border-gray-100 p-1.5 min-h-[110px] ${
                    !inMonth ? "bg-gray-50/60" : ""
                  }`}
                >
                  {/* Day number */}
                  <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                    isToday
                      ? "bg-blue-600 text-white"
                      : inMonth
                      ? "text-gray-700"
                      : "text-gray-300"
                  }`}>
                    {format(day, "d")}
                  </div>

                  {/* Event chips */}
                  <div className="space-y-0.5">
                    {events.slice(0, 4).map((event, i) => (
                      <button
                        key={i}
                        onClick={() => event.type !== "completed" ? openStudyModal(event.theme) : undefined}
                        disabled={event.type === "completed"}
                        title={`${event.label} | ${event.theme.title}`}
                        className={`w-full text-left text-[10px] font-semibold px-1.5 py-[3px] rounded truncate leading-[14px] transition-colors ${
                          event.type === "completed"
                            ? "bg-green-500 text-white cursor-default"
                            : event.type === "missed"
                            ? "border border-red-400 text-red-600 bg-white hover:bg-red-50"
                            : "border border-green-500 text-green-700 bg-white hover:bg-green-50"
                        }`}
                      >
                        {event.label} | {event.theme.title}
                      </button>
                    ))}
                    {events.length > 4 && (
                      <div className="text-[10px] text-gray-400 text-center pt-0.5">
                        +{events.length - 4} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL: Theme Picker */}
      {themePickerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1">Nova Sessão de Estudo</h3>
            <p className="text-sm text-gray-500 mb-5">Qual tema você vai registrar?</p>
            <select
              value={selectedThemeId}
              onChange={e => setSelectedThemeId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-3 bg-white text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Selecionar tema —</option>
              {themes.map(t => (
                <option key={t.id} value={t.id}>{t.title} · {t.area}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setThemePickerOpen(false); setSelectedThemeId(""); }}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleThemePickerContinue}
                disabled={!selectedThemeId}
                className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 text-sm font-semibold transition-colors"
              >
                Continuar <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Study Session */}
      {studyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1">Sessão de Estudos</h3>
            <p className="text-gray-500 text-sm mb-6">
              Avaliando: <span className="font-semibold text-gray-900">{studyOpen.title}</span>
            </p>
            <form onSubmit={submitStudySession} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">Data do Estudo</label>
                <input
                  type="date"
                  value={studyDate}
                  onChange={e => setStudyDate(e.target.value)}
                  max={format(new Date(), "yyyy-MM-dd")}
                  className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Porcentagem de Acerto ({accuracy}%)
                </label>
                <input
                  type="range" min="0" max="100" value={accuracy}
                  onChange={e => setAccuracy(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0%</span>
                  <span className="font-bold text-blue-600 text-sm">{accuracy}%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Facilidade do Tema</label>
                <select
                  value={easiness}
                  onChange={e => setEasiness(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option>Muito Fácil</option>
                  <option>Fácil</option>
                  <option>Médio</option>
                  <option>Difícil</option>
                  <option>Muito Difícil</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStudyOpen(null)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 text-sm font-semibold transition-colors"
                >
                  <Play size={15} /> {submitting ? "Salvando..." : "Concluir Sessão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
