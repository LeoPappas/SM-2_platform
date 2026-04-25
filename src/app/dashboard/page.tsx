"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Theme } from "@/lib/database.types";
import { calculateSM2 } from "@/lib/sm2";
import { createOrUpdateCalendarEvent } from "@/lib/calendar";
import {
  format, differenceInDays, startOfDay, addDays,
  startOfWeek, eachDayOfInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Play, X, ChevronRight, AlertCircle, Clock, BookOpen } from "lucide-react";

export default function HomePage() {
  const [session, setSession] = useState<any>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Theme picker → study session flow
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState("");

  // Study session modal
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
      if (session) fetchThemes(session.user.id);
      else setLoading(false);
    });
  }, []);

  const getValidToken = async (): Promise<string | null> => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (freshSession) setSession(freshSession);
    return freshSession?.provider_token ?? null;
  };

  const fetchThemes = async (userId: string) => {
    const { data, error } = await supabase
      .from("themes")
      .select("*")
      .eq("user_id", userId)
      .order("next_review_date", { ascending: true });

    if (error) showError("Erro ao carregar temas. Tente recarregar a página.");
    else if (data) setThemes(data);
    setLoading(false);
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
      showError("Erro ao salvar a sessão de estudo. Tente novamente.");
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

    if (updateError) showError("Erro ao atualizar o tema. A sessão foi salva, mas o tema pode estar desatualizado.");

    setStudyOpen(null);
    setAccuracy(0);
    setEasiness("Médio");
    setStudyDate(format(new Date(), "yyyy-MM-dd"));
    setSubmitting(false);
    fetchThemes(session.user.id);
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

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-screen text-gray-400 text-sm">
      Carregando...
    </div>
  );

  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayThemes = themes.filter(t => t.next_review_date === todayStr);
  const overdueThemes = themes.filter(t => t.next_review_date < todayStr);
  const upcomingThemes = themes.filter(t => t.next_review_date > todayStr).slice(0, 10);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }).map(date => {
    const dateStr = format(date, "yyyy-MM-dd");
    return {
      dateStr,
      label: format(date, "EEE", { locale: ptBR }),
      dayNum: format(date, "d"),
      dayThemes: themes.filter(t => t.next_review_date === dateStr),
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
    };
  });

  const firstName =
    session?.user?.user_metadata?.full_name?.split(" ")[0] ??
    session?.user?.email?.split("@")[0] ??
    "Estudante";

  return (
    <div className="min-h-screen bg-gray-50">
      {errorMsg && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={16} /></button>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 capitalize">
              Olá, {firstName}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <button
            onClick={() => setThemePickerOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors text-sm shadow-sm"
          >
            <Plus size={17} /> Sessão de Estudo
          </button>
        </div>

        {/* Row 1: Three cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">

          {/* Hoje */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span className="font-semibold text-gray-800 text-sm">Hoje</span>
              {todayThemes.length > 0 && (
                <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                  {todayThemes.length}
                </span>
              )}
            </div>
            <div className="p-4 flex-1">
              {todayThemes.length === 0 ? (
                <div className="min-h-[80px]" />
              ) : (
                <div className="space-y-2">
                  {todayThemes.map(theme => (
                    <div key={theme.id} className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-blue-500 font-medium truncate">{theme.area}</div>
                        <div className="text-sm font-semibold text-gray-800 truncate">{theme.title}</div>
                      </div>
                      <button
                        onClick={() => openStudyModal(theme)}
                        className="shrink-0 p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        <Play size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Revisões Atrasadas */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2.5">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <span className="font-semibold text-gray-800 text-sm">Revisões Atrasadas</span>
              {overdueThemes.length > 0 && (
                <span className="ml-auto text-xs font-bold bg-red-100 text-red-600 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                  {overdueThemes.length}
                </span>
              )}
            </div>
            <div className="p-4 flex-1">
              {overdueThemes.length === 0 ? (
                <div className="min-h-[80px] flex items-center justify-center">
                  <span className="text-sm text-green-600 font-medium">Tudo em dia ✓</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {overdueThemes.map(theme => {
                    const daysLate = differenceInDays(
                      startOfDay(new Date()),
                      startOfDay(new Date(theme.next_review_date + "T00:00:00"))
                    );
                    return (
                      <div key={theme.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-red-500 font-medium truncate">
                            {theme.area} · {daysLate}d atrasado
                          </div>
                          <div className="text-sm font-semibold text-gray-800 truncate">{theme.title}</div>
                        </div>
                        <button
                          onClick={() => openStudyModal(theme)}
                          className="shrink-0 p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                        >
                          <Play size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Próximas Revisões */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center gap-2.5">
              <Clock size={14} className="text-emerald-500 shrink-0" />
              <span className="font-semibold text-gray-800 text-sm">Próximas Revisões</span>
            </div>
            <div className="p-4 flex-1">
              {upcomingThemes.length === 0 ? (
                <div className="min-h-[80px] flex items-center justify-center">
                  <span className="text-sm text-gray-400">Nenhuma revisão agendada.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {upcomingThemes.map(theme => (
                    <div key={theme.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="shrink-0 text-center w-9">
                        <div className="text-xs text-gray-400 font-medium leading-none capitalize">
                          {format(new Date(theme.next_review_date + "T00:00:00"), "MMM", { locale: ptBR })}
                        </div>
                        <div className="text-lg font-bold text-gray-700 leading-tight">
                          {format(new Date(theme.next_review_date + "T00:00:00"), "d")}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 border-l border-gray-200 pl-3">
                        <div className="text-xs text-gray-400 truncate">{theme.area}</div>
                        <div className="text-sm font-semibold text-gray-800 truncate">{theme.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Esta Semana */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <BookOpen size={14} className="text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-800 text-sm">Esta Semana</span>
          </div>
          <div className="grid grid-cols-7">
            {weekDays.map(({ dateStr, label, dayNum, dayThemes, isToday, isPast }) => (
              <div
                key={dateStr}
                className={`border-r border-gray-100 last:border-r-0 p-3 min-h-[140px] flex flex-col ${
                  isToday ? "bg-blue-50" : isPast ? "bg-gray-50/60" : ""
                }`}
              >
                <div className="text-center mb-3">
                  <div className={`text-xs font-semibold uppercase tracking-wide capitalize ${
                    isToday ? "text-blue-500" : "text-gray-400"
                  }`}>
                    {label}
                  </div>
                  <div className={`text-xl font-bold leading-tight mt-0.5 ${
                    isToday ? "text-blue-600" : isPast ? "text-gray-300" : "text-gray-700"
                  }`}>
                    {dayNum}
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  {dayThemes.slice(0, 4).map(t => (
                    <button
                      key={t.id}
                      onClick={() => openStudyModal(t)}
                      title={t.title}
                      className={`w-full text-left text-xs rounded-lg px-2 py-1.5 truncate font-medium transition-colors ${
                        isToday
                          ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                          : isPast
                          ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayThemes.length > 4 && (
                    <div className="text-xs text-gray-400 text-center pt-0.5">
                      +{dayThemes.length - 4} mais
                    </div>
                  )}
                </div>
              </div>
            ))}
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
