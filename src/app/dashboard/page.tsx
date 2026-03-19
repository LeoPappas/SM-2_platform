"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Theme, StudySession } from "@/lib/database.types";
import { calculateSM2 } from "@/lib/sm2";
import { createOrUpdateCalendarEvent, deleteCalendarEvent } from "@/lib/calendar";
import { format, differenceInDays, startOfDay, addDays } from "date-fns";
import { LogOut, Plus, Play, CalendarClock, Activity, BookOpen, X, Pencil, Trash2, History } from "lucide-react";

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [newThemeOpen, setNewThemeOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState<Theme | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit Theme
  const [editTheme, setEditTheme] = useState<Theme | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArea, setEditArea] = useState("");

  // Delete Theme
  const [deleteConfirm, setDeleteConfirm] = useState<Theme | null>(null);

  // Study Session History
  const [sessionsView, setSessionsView] = useState<Theme | null>(null);
  const [sessions, setSessions] = useState<StudySession[]>([]);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 6000);
  };

  // Formulário Novo Tema
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");

  // Formulário Estudo
  const [accuracy, setAccuracy] = useState(0);
  const [easiness, setEasiness] = useState("Médio");
  const [studyDate, setStudyDate] = useState(format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchThemes(session.user.id);
    });
  }, []);

  const getValidToken = async (): Promise<string | null> => {
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    if (freshSession) {
      setSession(freshSession);
    }
    return freshSession?.provider_token ?? null;
  };

  const fetchThemes = async (userId: string) => {
    const { data, error } = await supabase
      .from("themes")
      .select("*")
      .eq("user_id", userId)
      .order("next_review_date", { ascending: true });

    if (error) {
      showError("Erro ao carregar temas. Tente recarregar a página.");
    } else if (data) {
      setThemes(data);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const addTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !area) return;
    setSubmitting(true);

    const { data: inserted, error } = await supabase
      .from("themes")
      .insert({ user_id: session.user.id, title, area })
      .select()
      .single();

    if (error || !inserted) {
      showError("Erro ao criar tema. Verifique os dados e tente novamente.");
      setSubmitting(false);
      return;
    }

    // Create calendar event for the initial review date
    const token = await getValidToken();
    if (token) {
      try {
        const eventId = await createOrUpdateCalendarEvent({
          providerToken: token,
          eventId: null,
          summary: inserted.title,
          description: `Área: ${inserted.area}\nPrimeira revisão.\nAtualização gerada pela plataforma SM-2.`,
          date: inserted.next_review_date,
        });
        if (eventId) {
          await supabase
            .from("themes")
            .update({ calendar_event_id: eventId })
            .eq("id", inserted.id);
        }
      } catch {
        showError("Tema criado, mas erro ao criar evento no calendário.");
      }
    }

    setNewThemeOpen(false);
    setTitle("");
    setArea("");
    setSubmitting(false);
    fetchThemes(session.user.id);
  };

  const updateTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTheme || !editTitle || !editArea) return;
    setSubmitting(true);

    const { error } = await supabase
      .from("themes")
      .update({ title: editTitle, area: editArea })
      .eq("id", editTheme.id);

    if (error) {
      showError("Erro ao atualizar tema.");
      setSubmitting(false);
      return;
    }

    // Update calendar event summary if one exists
    if (editTheme.calendar_event_id) {
      const token = await getValidToken();
      if (token) {
        try {
          await createOrUpdateCalendarEvent({
            providerToken: token,
            eventId: editTheme.calendar_event_id,
            summary: editTitle,
            description: `Área: ${editArea}\nContatos: ${editTheme.repetitions}\nAtualização gerada pela plataforma SM-2.`,
            date: editTheme.next_review_date,
          });
        } catch {
          showError("Tema atualizado, mas erro ao atualizar evento no calendário.");
        }
      }
    }

    setEditTheme(null);
    setSubmitting(false);
    fetchThemes(session.user.id);
  };

  const deleteTheme = async () => {
    if (!deleteConfirm) return;
    setSubmitting(true);

    // Delete calendar event (best-effort)
    if (deleteConfirm.calendar_event_id) {
      const token = await getValidToken();
      if (token) {
        try {
          await deleteCalendarEvent({
            providerToken: token,
            eventId: deleteConfirm.calendar_event_id,
          });
        } catch { /* calendar cleanup is best-effort */ }
      }
    }

    // Delete study sessions first (in case no CASCADE in DB)
    await supabase.from("study_sessions").delete().eq("theme_id", deleteConfirm.id);

    // Delete theme
    const { error } = await supabase.from("themes").delete().eq("id", deleteConfirm.id);
    if (error) {
      showError("Erro ao deletar tema.");
    }

    setDeleteConfirm(null);
    setSubmitting(false);
    fetchThemes(session.user.id);
  };

  const submitStudySession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyOpen) return;
    setSubmitting(true);

    const selectedDate = startOfDay(new Date(studyDate + "T00:00:00"));
    const scheduledDate = startOfDay(new Date(studyOpen.next_review_date));
    const daysDelayed = differenceInDays(selectedDate, scheduledDate);

    // Call SM-2
    const result = calculateSM2({
      accuracy,
      easiness,
      repetitions: studyOpen.repetitions,
      previousInterval: studyOpen.interval_days,
      previousEF: studyOpen.easiness_factor,
      daysDelayed
    });

    const nextDate = addDays(selectedDate, result.intervalDays);
    const formattedNextDate = format(nextDate, "yyyy-MM-dd");

    // 1. Create Study Session Log
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

    // Sync com Google Calendar
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

    // 2. Update Theme
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

    if (updateError) {
      showError("Erro ao atualizar o tema. A sessão foi salva, mas o tema pode estar desatualizado.");
    }

    setStudyOpen(null);
    setAccuracy(0);
    setEasiness("Médio");
    setStudyDate(format(new Date(), "yyyy-MM-dd"));
    setSubmitting(false);
    fetchThemes(session.user.id);
  };

  const openSessionsView = async (theme: Theme) => {
    setSessionsView(theme);
    const { data, error } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("theme_id", theme.id)
      .order("created_at", { ascending: false });

    if (error) {
      showError("Erro ao carregar sessões.");
      return;
    }
    setSessions(data || []);
  };

  const deleteSession = async (sessionId: string) => {
    const { error } = await supabase.from("study_sessions").delete().eq("id", sessionId);
    if (error) {
      showError("Erro ao deletar sessão.");
      return;
    }
    if (sessionsView) openSessionsView(sessionsView);
  };

  if (loading) return <div className="p-10">Carregando dados...</div>;

  const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
  const dueThemes = themes.filter(t => t.next_review_date <= todayStr);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 p-4 shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
          <BookOpen /> SM-2 Medicina
        </h1>
        <button onClick={handleLogout} className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium">
          <LogOut size={18} /> Sair
        </button>
      </header>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-6 space-y-8">

        {/* Backlog Widget */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <CalendarClock className="text-orange-500" /> Para Revisar Hoje ({dueThemes.length})
            </h2>
          </div>

          {dueThemes.length === 0 ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-200 font-medium">
              Todo o conteúdo está em dia! Bom trabalho.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dueThemes.map(theme => (
                <div key={theme.id} className="bg-white p-5 rounded-lg border border-orange-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded mb-2 inline-block">
                      {theme.area}
                    </span>
                    <h3 className="font-bold text-lg leading-tight mb-2">{theme.title}</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Revisões: {theme.repetitions} • EF: {theme.easiness_factor}
                    </p>
                  </div>
                  <button
                    onClick={() => setStudyOpen(theme)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-md transition-colors flex items-center justify-center gap-2"
                  >
                    <Play size={16} /> Estudar Agora
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Todos os Temas Table */}
        <section>
          <div className="flex items-center justify-between mb-4 mt-10">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="text-blue-500" /> Todos os Temas
            </h2>
            <button
              onClick={() => setNewThemeOpen(true)}
              className="bg-white border border-gray-300 shadow-sm hover:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> Novo Tema
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-4 font-semibold text-gray-600">Tema</th>
                  <th className="p-4 font-semibold text-gray-600">Área</th>
                  <th className="p-4 font-semibold text-gray-600">Contatos</th>
                  <th className="p-4 font-semibold text-gray-600">Próxima Revisão</th>
                  <th className="p-4 font-semibold text-gray-600">Fator (EF)</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {themes.map(theme => {
                  const isDue = theme.next_review_date <= todayStr;
                  return (
                    <tr key={theme.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4 font-medium text-gray-900">{theme.title}</td>
                      <td className="p-4 text-gray-500">{theme.area}</td>
                      <td className="p-4 text-gray-500">{theme.repetitions}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDue ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                          {isDue ? 'Atrasado/Hoje' : 'Em Dia'}
                        </span>
                        <div className="mt-1 text-xs text-gray-400">{theme.next_review_date}</div>
                      </td>
                      <td className="p-4 text-gray-500">{theme.easiness_factor}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => setStudyOpen(theme)}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Estudar
                          </button>
                          <button
                            onClick={() => openSessionsView(theme)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Histórico"
                          >
                            <History size={15} />
                          </button>
                          <button
                            onClick={() => {
                              setEditTheme(theme);
                              setEditTitle(theme.title);
                              setEditArea(theme.area);
                            }}
                            className="text-gray-400 hover:text-gray-600"
                            title="Editar"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(theme)}
                            className="text-red-400 hover:text-red-600"
                            title="Deletar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* MODAL NOVO TEMA */}
      {newThemeOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Adicionar Tema</h3>
            <form onSubmit={addTheme} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título do Tema</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder="Ex: Insuficiência Cardíaca" className="w-full border border-gray-300 rounded-md p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Área Médica</label>
                <input required value={area} onChange={e => setArea(e.target.value)} type="text" placeholder="Ex: Cardiologia" className="w-full border border-gray-300 rounded-md p-2" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setNewThemeOpen(false)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : "Salvar Tema"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR TEMA */}
      {editTheme && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">Editar Tema</h3>
            <form onSubmit={updateTheme} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título</label>
                <input required value={editTitle} onChange={e => setEditTitle(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md p-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Área Médica</label>
                <input required value={editArea} onChange={e => setEditArea(e.target.value)} type="text" className="w-full border border-gray-300 rounded-md p-2" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button type="button" onClick={() => setEditTheme(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIRMAR EXCLUSÃO */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-2 text-red-600">Deletar Tema</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja deletar <span className="font-semibold">&quot;{deleteConfirm.title}&quot;</span>?
              Todas as sessões de estudo associadas serão removidas. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={deleteTheme} disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                {submitting ? "Deletando..." : "Deletar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ESTUDO */}
      {studyOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-2">Sessão de Estudos</h3>
            <p className="text-gray-500 text-sm mb-6">Avaliando: <span className="font-semibold text-gray-900">{studyOpen.title}</span></p>

            <form onSubmit={submitStudySession} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Data do Estudo</label>
                <input type="date" value={studyDate} onChange={e => setStudyDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} className="w-full border border-gray-300 rounded-md p-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Porcentagem de Acerto nas Questões (%)</label>
                <div className="flex items-center gap-4">
                  <input type="range" min="0" max="100" value={accuracy} onChange={e => setAccuracy(Number(e.target.value))} className="flex-1" />
                  <span className="font-bold text-lg w-12 text-center text-blue-600">{accuracy}%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Como foi a Facilidade do Tema?</label>
                <select value={easiness} onChange={e => setEasiness(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 bg-white">
                  <option>Muito Fácil</option>
                  <option>Fácil</option>
                  <option>Médio</option>
                  <option>Difícil</option>
                  <option>Muito Difícil</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setStudyOpen(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                  <Play size={16} /> {submitting ? "Salvando..." : "Concluir Sessão"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTÓRICO DE SESSÕES */}
      {sessionsView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-1">Histórico de Sessões</h3>
            <p className="text-gray-500 text-sm mb-4">{sessionsView.title}</p>
            {sessions.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhuma sessão registrada.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                    <div>
                      <div className="text-sm font-medium">{format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}</div>
                      <div className="text-xs text-gray-500">
                        Acerto: {s.accuracy_percentage}% | Facilidade: {s.easiness_rating} | Nota SM-2: {s.sm2_grade_calculated}
                      </div>
                    </div>
                    <button onClick={() => deleteSession(s.id)} className="text-red-400 hover:text-red-600 ml-3 shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-4">
              <button onClick={() => setSessionsView(null)} className="px-4 py-2 text-gray-500 hover:text-gray-700">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
