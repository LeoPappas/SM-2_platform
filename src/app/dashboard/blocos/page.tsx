"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { addDays, differenceInDays, format, startOfDay } from "date-fns";
import { History, Pencil, Play, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  calendarSyncDisabledPatch,
  calendarSyncPatchFromResult,
  deleteCalendarEvent,
} from "@/lib/calendar";
import { createOrUpdateCalendarEventWithAuth } from "@/lib/calendar-auth";
import type { BlockReview, DifficultyRating, QuestionBlock } from "@/lib/database.types";
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

const today = () => format(new Date(), "yyyy-MM-dd");

export default function BlocosPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [areaName, setAreaName] = useState("");
  const [source, setSource] = useState("");
  const [examTargetName, setExamTargetName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [studyDate, setStudyDate] = useState(today());
  const [questionCount, setQuestionCount] = useState(20);
  const [correctCount, setCorrectCount] = useState(0);
  const [difficulty, setDifficulty] = useState<DifficultyRating>("Médio");
  const [timeSpent, setTimeSpent] = useState("");
  const [priorityWeight, setPriorityWeight] = useState(3);
  const [syncToCalendar, setSyncToCalendar] = useState(true);

  const [editBlock, setEditBlock] = useState<QuestionBlock | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAreaName, setEditAreaName] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editPriorityWeight, setEditPriorityWeight] = useState(3);
  const [editSyncEnabled, setEditSyncEnabled] = useState(true);

  const [reviewOpen, setReviewOpen] = useState<QuestionBlock | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<QuestionBlock | null>(null);
  const [historyBlock, setHistoryBlock] = useState<QuestionBlock | null>(null);
  const [history, setHistory] = useState<BlockReview[]>([]);

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

    if (error) {
      showError("Erro ao carregar blocos.");
      setBlocks([]);
      setReviewCounts({});
      setLoading(false);
      return;
    }

    const nextBlocks = data ?? [];
    setBlocks(nextBlocks);

    if (nextBlocks.length === 0) {
      setReviewCounts({});
      setLoading(false);
      return;
    }

    const { data: reviewRows, error: reviewCountError } = await supabase
      .from("block_reviews")
      .select("block_id")
      .eq("user_id", userId)
      .in("block_id", nextBlocks.map(block => block.id));

    if (reviewCountError) {
      showError("Erro ao carregar contagem de revisoes.");
      setReviewCounts({});
    } else {
      setReviewCounts(
        (reviewRows ?? []).reduce<Record<string, number>>((counts, row) => {
          counts[row.block_id] = (counts[row.block_id] ?? 0) + 1;
          return counts;
        }, {}),
      );
    }

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

  const getCalendarPatch = async ({
    eventId,
    summary,
    description,
    date,
  }: {
    eventId?: string | null;
    summary: string;
    description: string;
    date: string;
  }) => {
    await getValidToken();
    const syncResult = await createOrUpdateCalendarEventWithAuth({ eventId, summary, description, date });
    return calendarSyncPatchFromResult(syncResult);
  };

  const ensureArea = async (userId: string, name: string) => {
    const cleanName = name.trim();
    if (!cleanName) return null;
    const { data: existing } = await supabase
      .from("areas")
      .select("id")
      .eq("user_id", userId)
      .eq("name", cleanName)
      .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("areas")
      .insert({ user_id: userId, name: cleanName })
      .select("id")
      .single();
    if (error) return null;
    return data.id;
  };

  const ensureExamTarget = async (userId: string) => {
    const cleanName = examTargetName.trim();
    if (!cleanName) return null;
    const { data: existing } = await supabase
      .from("exam_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("name", cleanName)
      .maybeSingle();
    if (existing) return existing.id;

    const { data, error } = await supabase
      .from("exam_targets")
      .insert({ user_id: userId, name: cleanName, exam_date: examDate || null })
      .select("id")
      .single();
    if (error) return null;
    return data.id;
  };

  const resetNewForm = () => {
    setTitle("");
    setAreaName("");
    setSource("");
    setExamTargetName("");
    setExamDate("");
    setStudyDate(today());
    setQuestionCount(20);
    setCorrectCount(0);
    setDifficulty("Médio");
    setTimeSpent("");
    setPriorityWeight(3);
    setSyncToCalendar(true);
  };

  const addBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !title.trim() || !areaName.trim() || correctCount > questionCount) return;
    setSubmitting(true);

    const accuracy = calculateAccuracy(correctCount, questionCount);
    const result = calculateBlockReview({
      accuracy,
      perceivedDifficulty: difficulty,
      repetitions: 0,
      previousInterval: 1,
      previousEF: 2.5,
      daysDelayed: 0,
      priorityWeight,
    });

    const selectedDate = startOfDay(new Date(`${studyDate}T00:00:00`));
    const nextReviewDate = format(addDays(selectedDate, result.intervalDays), "yyyy-MM-dd");
    const areaId = await ensureArea(session.user.id, areaName);
    const examTargetId = await ensureExamTarget(session.user.id);

    const { data: inserted, error } = await supabase
      .from("question_blocks")
      .insert({
        user_id: session.user.id,
        title: title.trim(),
        area_id: areaId,
        area_name: areaName.trim(),
        exam_target_id: examTargetId,
        source: source.trim() || null,
        question_count: questionCount,
        correct_count: correctCount,
        accuracy_percentage: accuracy,
        perceived_difficulty: difficulty,
        time_spent_minutes: timeSpent ? Number(timeSpent) : null,
        priority_weight: priorityWeight,
        study_date: studyDate,
        repetitions: result.repetitions,
        easiness_factor: result.easinessFactor,
        interval_days: result.intervalDays,
        next_review_date: nextReviewDate,
        ...(syncToCalendar
          ? {
              calendar_sync_enabled: true,
              calendar_sync_status: "pending" as const,
              calendar_last_error: null,
            }
          : calendarSyncDisabledPatch()),
      })
      .select()
      .single();

    if (error || !inserted) {
      showError("Erro ao criar bloco. Verifique os dados e tente novamente.");
      setSubmitting(false);
      return;
    }

    if (syncToCalendar) {
      const calendarPatch = await getCalendarPatch({
        eventId: null,
        summary: inserted.title,
        description: [
          `Área: ${inserted.area_name}`,
          `Questões: ${inserted.question_count}`,
          `Acurácia inicial: ${inserted.accuracy_percentage}%`,
          "Primeira revisão do bloco.",
        ].join("\n"),
        date: inserted.next_review_date,
      });
      await supabase.from("question_blocks").update(calendarPatch).eq("id", inserted.id);
    }

    resetNewForm();
    setNewOpen(false);
    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  const openEdit = (block: QuestionBlock) => {
    setEditBlock(block);
    setEditTitle(block.title);
    setEditAreaName(block.area_name);
    setEditSource(block.source ?? "");
    setEditPriorityWeight(block.priority_weight);
    setEditSyncEnabled(block.calendar_sync_enabled);
  };

  const updateBlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !editBlock || !editTitle.trim() || !editAreaName.trim()) return;
    setSubmitting(true);

    const areaId = await ensureArea(session.user.id, editAreaName);
    const { error } = await supabase
      .from("question_blocks")
      .update({
        title: editTitle.trim(),
        area_id: areaId,
        area_name: editAreaName.trim(),
        source: editSource.trim() || null,
        priority_weight: editPriorityWeight,
      })
      .eq("id", editBlock.id);

    if (error) {
      showError("Erro ao atualizar bloco.");
      setSubmitting(false);
      return;
    }

    if (editSyncEnabled) {
      const registeredReviews = reviewCounts[editBlock.id] ?? 0;
      const calendarPatch = await getCalendarPatch({
        eventId: editBlock.calendar_event_id,
        summary: editTitle.trim(),
        description: `Área: ${editAreaName.trim()}\nQuestões: ${editBlock.question_count}\nRevisões registradas: ${registeredReviews}`,
        date: editBlock.next_review_date,
      });
      await supabase.from("question_blocks").update(calendarPatch).eq("id", editBlock.id);
    } else {
      if (editBlock.calendar_event_id) {
        const token = await getValidToken();
        if (token) {
          await deleteCalendarEvent({ providerToken: token, eventId: editBlock.calendar_event_id });
        }
      }
      await supabase.from("question_blocks").update(calendarSyncDisabledPatch()).eq("id", editBlock.id);
    }

    setEditBlock(null);
    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  const openReview = (block: QuestionBlock) => {
    setReviewOpen(block);
    setStudyDate(today());
    setQuestionCount(block.question_count);
    setCorrectCount(block.correct_count);
    setDifficulty(block.perceived_difficulty);
    setTimeSpent(block.time_spent_minutes?.toString() ?? "");
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !reviewOpen || correctCount > questionCount) return;
    setSubmitting(true);

    const selectedDate = startOfDay(new Date(`${studyDate}T00:00:00`));
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
      review_date: studyDate,
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
      showError("Erro ao salvar revisão.");
      setSubmitting(false);
      return;
    }

    let calendarPatch = {};
    if (reviewOpen.calendar_sync_enabled) {
      calendarPatch = await getCalendarPatch({
        eventId: reviewOpen.calendar_event_id,
        summary: reviewOpen.title,
        description: `Área: ${reviewOpen.area_name}\nQuestões: ${questionCount}\nAcertos: ${correctCount} (${accuracy}%)`,
        date: nextReviewDate,
      });
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

    if (updateError) showError("Revisão salva, mas o bloco não foi atualizado.");

    setReviewOpen(null);
    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  const deleteBlock = async () => {
    if (!session || !deleteConfirm) return;
    setSubmitting(true);

    if (deleteConfirm.calendar_event_id) {
      const token = await getValidToken();
      if (token) {
        await deleteCalendarEvent({ providerToken: token, eventId: deleteConfirm.calendar_event_id });
      }
    }

    const { error } = await supabase.from("question_blocks").delete().eq("id", deleteConfirm.id);
    if (error) showError("Erro ao excluir bloco.");

    setDeleteConfirm(null);
    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  const resyncBlock = async (block: QuestionBlock) => {
    if (!session) return;
    setSubmitting(true);

    const calendarPatch = await getCalendarPatch({
      eventId: block.calendar_event_id,
      summary: block.title,
      description: [
        `Área: ${block.area_name}`,
        `Questões: ${block.question_count}`,
        `Acurácia atual: ${block.accuracy_percentage}%`,
        `Próxima revisão: ${block.next_review_date}`,
      ].join("\n"),
      date: block.next_review_date,
    });

    const { error } = await supabase.from("question_blocks").update(calendarPatch).eq("id", block.id);
    if (error) showError("Erro ao atualizar status do Calendar.");

    setSubmitting(false);
    fetchBlocks(session.user.id);
  };

  const openHistory = async (block: QuestionBlock) => {
    setHistoryBlock(block);
    const { data, error } = await supabase
      .from("block_reviews")
      .select("*")
      .eq("block_id", block.id)
      .order("created_at", { ascending: false });

    if (error) showError("Erro ao carregar histórico.");
    else setHistory(data ?? []);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const todayStr = today();

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
            <h1 className="text-2xl font-bold text-gray-900">Blocos de questões</h1>
            <p className="mt-1 text-sm text-gray-500">Cadastro e revisão espaçada de blocos completos.</p>
          </div>
          <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700">
            <Plus size={17} /> Novo bloco
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {blocks.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400">
              Nenhum bloco cadastrado ainda.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <TableHead>Bloco</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Desempenho</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Próxima revisão</TableHead>
                  <TableHead>Calendar</TableHead>
                  <TableHead align="right">Ações</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {blocks.map(block => {
                  const isDue = block.next_review_date <= todayStr;
                  const registeredReviews = reviewCounts[block.id] ?? 0;
                  return (
                    <tr key={block.id} className="hover:bg-gray-50">
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{block.title}</div>
                        <div className="mt-0.5 text-xs text-gray-400">{block.source || "Sem fonte"} · {block.question_count} questões</div>
                      </td>
                      <td className="p-4 text-gray-600">{block.area_name}</td>
                      <td className="p-4">
                        <div className="font-medium text-gray-800">{block.accuracy_percentage}%</div>
                        <div className="mt-0.5 text-xs text-gray-400">{block.correct_count}/{block.question_count} acertos · {formatRegisteredReviews(registeredReviews)}</div>
                      </td>
                      <td className="p-4 text-gray-600">{block.priority_weight}/5</td>
                      <td className="p-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${isDue ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                          {isDue ? "Revisar" : "Agendado"}
                        </span>
                        <div className="mt-1 text-xs text-gray-400">{block.next_review_date}</div>
                      </td>
                      <td className="p-4">
                        <CalendarSyncBadge block={block} />
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openReview(block)} className="text-sm font-medium text-blue-600 hover:text-blue-800">Revisar</button>
                          {block.calendar_sync_enabled && block.calendar_sync_status !== "synced" && (
                            <button
                              onClick={() => resyncBlock(block)}
                              className="text-gray-400 hover:text-blue-600 disabled:opacity-40"
                              title="Re-sincronizar Calendar"
                              disabled={submitting}
                            >
                              <RefreshCw size={15} />
                            </button>
                          )}
                          <button onClick={() => openHistory(block)} className="text-gray-400 hover:text-gray-600" title="Histórico"><History size={15} /></button>
                          <button onClick={() => openEdit(block)} className="text-gray-400 hover:text-gray-600" title="Editar"><Pencil size={15} /></button>
                          <button onClick={() => setDeleteConfirm(block)} className="text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {newOpen && (
        <Modal title="Novo bloco" onClose={() => setNewOpen(false)}>
          <form onSubmit={addBlock} className="space-y-4">
            <TextField label="Título" value={title} onChange={setTitle} required placeholder="Ex: Cardiologia - questões de insuficiência cardíaca" />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Área" value={areaName} onChange={setAreaName} required placeholder="Cardiologia" />
              <TextField label="Fonte" value={source} onChange={setSource} placeholder="Banco, prova, lista..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Prova-alvo" value={examTargetName} onChange={setExamTargetName} placeholder="ENARE, R1 USP..." />
              <DateField label="Data da prova" value={examDate} onChange={setExamDate} />
            </div>
            <DateField label="Data do primeiro contato" value={studyDate} onChange={setStudyDate} max={today()} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Questões" value={questionCount} min={1} onChange={setQuestionCount} />
              <NumberField label="Acertos" value={correctCount} min={0} max={questionCount} onChange={setCorrectCount} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Dificuldade" value={difficulty} onChange={value => setDifficulty(value as DifficultyRating)} options={difficultyOptions} />
              <NumberField label="Prioridade (1-5)" value={priorityWeight} min={1} max={5} onChange={setPriorityWeight} />
            </div>
            <NumberField label="Tempo em minutos" value={timeSpent} min={0} onChange={value => setTimeSpent(value.toString())} optional />
            <ComputedAccuracy questionCount={questionCount} correctCount={correctCount} />
            <CheckboxField
              checked={syncToCalendar}
              label="Adicionar ao Google Calendar"
              description="Cria um evento de dia inteiro para a próxima revisão e atualiza a data quando o bloco for revisado."
              onChange={setSyncToCalendar}
            />
            <ModalActions submitting={submitting} submitLabel="Salvar bloco" onCancel={() => setNewOpen(false)} disabled={correctCount > questionCount} />
          </form>
        </Modal>
      )}

      {editBlock && (
        <Modal title="Editar bloco" onClose={() => setEditBlock(null)}>
          <form onSubmit={updateBlock} className="space-y-4">
            <TextField label="Título" value={editTitle} onChange={setEditTitle} required />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Área" value={editAreaName} onChange={setEditAreaName} required />
              <TextField label="Fonte" value={editSource} onChange={setEditSource} />
            </div>
            <NumberField label="Prioridade (1-5)" value={editPriorityWeight} min={1} max={5} onChange={setEditPriorityWeight} />
            <CheckboxField
              checked={editSyncEnabled}
              label="Manter sincronizado com Google Calendar"
              description="Ao desligar, o vínculo local com o evento é removido e o app tenta apagar o evento existente."
              onChange={setEditSyncEnabled}
            />
            <ModalActions submitting={submitting} submitLabel="Salvar" onCancel={() => setEditBlock(null)} />
          </form>
        </Modal>
      )}

      {reviewOpen && (
        <Modal title="Registrar revisão" subtitle={reviewOpen.title} onClose={() => setReviewOpen(null)}>
          <form onSubmit={submitReview} className="space-y-4">
            <DateField label="Data da revisão" value={studyDate} onChange={setStudyDate} max={today()} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Questões" value={questionCount} min={1} onChange={setQuestionCount} />
              <NumberField label="Acertos" value={correctCount} min={0} max={questionCount} onChange={setCorrectCount} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Dificuldade" value={difficulty} onChange={value => setDifficulty(value as DifficultyRating)} options={difficultyOptions} />
              <NumberField label="Tempo em minutos" value={timeSpent} min={0} onChange={value => setTimeSpent(value.toString())} optional />
            </div>
            <ComputedAccuracy questionCount={questionCount} correctCount={correctCount} />
            <ModalActions submitting={submitting} submitLabel="Salvar revisão" onCancel={() => setReviewOpen(null)} disabled={correctCount > questionCount} icon={<Play size={15} />} />
          </form>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Excluir bloco" subtitle={deleteConfirm.title} onClose={() => setDeleteConfirm(null)}>
          <p className="mb-6 text-sm text-gray-600">
            Esta ação remove o bloco e todo o histórico de revisões associado.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancelar</button>
            <button onClick={deleteBlock} disabled={submitting} className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {submitting ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </Modal>
      )}

      {historyBlock && (
        <Modal title="Histórico de revisões" subtitle={historyBlock.title} onClose={() => setHistoryBlock(null)} wide>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma revisão registrada além do primeiro contato.</p>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {history.map(review => (
                <div key={review.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="text-sm font-medium text-gray-900">{review.review_date}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {review.correct_count}/{review.question_count} acertos · {review.accuracy_percentage}% · {review.perceived_difficulty} · nota {review.sm2_grade_calculated}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">Próxima revisão: {review.new_next_review_date}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-4">
            <button onClick={() => setHistoryBlock(null)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Fechar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function TableHead({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th className={`p-4 text-xs font-semibold uppercase tracking-wide text-gray-500 ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function CalendarSyncBadge({ block }: { block: QuestionBlock }) {
  const config = {
    synced: {
      label: "Sincronizado",
      className: "bg-green-50 text-green-700 ring-green-200",
    },
    pending: {
      label: "Pendente",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    failed: {
      label: "Falhou",
      className: "bg-red-50 text-red-700 ring-red-200",
    },
    disabled: {
      label: "Desligado",
      className: "bg-gray-50 text-gray-500 ring-gray-200",
    },
  }[block.calendar_sync_status];

  return (
    <span
      title={block.calendar_last_error ?? undefined}
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`max-h-[88vh] w-full overflow-y-auto rounded-lg bg-white p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CheckboxField({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>
        <span className="block text-sm font-medium text-gray-800">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-gray-500">{description}</span>
      </span>
    </label>
  );
}

function TextField({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <input required={required} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>
  );
}

function DateField({ label, value, onChange, max }: { label: string; value: string; onChange: (value: string) => void; max?: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <input type="date" value={value} max={max} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>
  );
}

function NumberField({ label, value, min, max, optional, onChange }: { label: string; value: number | string; min: number; max?: number; optional?: boolean; onChange: (value: number) => void }) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    if (rawValue === "") {
      onChange(optional ? 0 : min);
      return;
    }

    const parsedValue = Number(rawValue);
    if (Number.isNaN(parsedValue)) return;

    const boundedValue = Math.min(max ?? parsedValue, Math.max(min, parsedValue));
    event.currentTarget.value = String(boundedValue);
    onChange(boundedValue);
  };

  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <input type="number" required={!optional} value={value} min={min} max={max} onChange={handleChange} className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>
  );
}

function formatRegisteredReviews(count: number) {
  return count === 1 ? "1 revisão registrada" : `${count} revisões registradas`;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map(option => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ComputedAccuracy({ questionCount, correctCount }: { questionCount: number; correctCount: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
      Acurácia calculada: <span className="font-semibold text-gray-900">{calculateAccuracy(correctCount, questionCount)}%</span>
      {correctCount > questionCount && <span className="ml-2 text-red-600">Acertos não podem exceder questões.</span>}
    </div>
  );
}

function ModalActions({ submitting, submitLabel, onCancel, disabled, icon }: { submitting: boolean; submitLabel: string; onCancel: () => void; disabled?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">Cancelar</button>
      <button type="submit" disabled={submitting || disabled} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
        {icon}
        {submitting ? "Salvando..." : submitLabel}
      </button>
    </div>
  );
}
