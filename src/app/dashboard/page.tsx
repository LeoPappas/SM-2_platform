"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Theme } from "@/lib/database.types";
import { calculateSM2 } from "@/lib/sm2";
import { createOrUpdateCalendarEvent } from "@/lib/calendar";
import { format, differenceInDays, isBefore, startOfDay, addDays } from "date-fns";
import { LogOut, Plus, Play, CalendarClock, Activity, BookOpen, X } from "lucide-react";

export default function Dashboard() {
  const [session, setSession] = useState<any>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [newThemeOpen, setNewThemeOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState<Theme | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    const newTheme = {
      user_id: session.user.id,
      title,
      area,
    };

    const { error } = await supabase.from("themes").insert(newTheme);
    if (error) {
      showError("Erro ao criar tema. Verifique os dados e tente novamente.");
      return;
    }
    setNewThemeOpen(false);
    setTitle("");
    setArea("");
    fetchThemes(session.user.id);
  };

  const submitStudySession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studyOpen) return;

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
      return;
    }

    // Sync com Google Calendar
    let newEventId = studyOpen.calendar_event_id;
    if (session?.provider_token) {
      try {
        const eventId = await createOrUpdateCalendarEvent({
          providerToken: session.provider_token,
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
    fetchThemes(session.user.id);
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
                        <button 
                          onClick={() => setStudyOpen(theme)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Estudar
                        </button>
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
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Salvar Tema</button>
              </div>
            </form>
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
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2">
                  <Play size={16} /> Concluir Sessão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
