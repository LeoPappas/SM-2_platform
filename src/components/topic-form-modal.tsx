"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, X } from "lucide-react";
import { syncQuestionBlockCalendar, updateQuestionBlockAndSync } from "@/lib/calendar-sync";
import {
  getCatalogAreas,
  getCatalogSpecialties,
  getCatalogTopics,
  loadCatalogSuggestions,
} from "@/lib/course-catalog";
import type {
  DifficultyRating,
  QuestionBlock,
  StudentProfile,
} from "@/lib/database.types";
import type { CatalogTopic } from "@/lib/medical-catalog";
import { findAutomaticReviewDate, importanceToLegacyWeight } from "@/lib/revision-actions";
import {
  ENGINE_VERSION,
  calculateAccuracy,
  calculateNextInterval,
  getCalculationMode,
  toLegacyGrade,
} from "@/lib/revision-engine";
import { supabase } from "@/lib/supabase";

const difficulties: DifficultyRating[] = [
  "Muito fácil",
  "Fácil",
  "Médio",
  "Difícil",
  "Muito difícil",
];

export function TopicFormModal({
  userId,
  profile,
  block,
  onClose,
  onSaved,
}: {
  userId: string;
  profile?: StudentProfile | null;
  block?: QuestionBlock | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const editing = Boolean(block);
  const [title, setTitle] = useState(block?.title ?? "");
  const [catalogArea, setCatalogArea] = useState(block?.major_area ?? "");
  const [specialty, setSpecialty] = useState(block?.specialty ?? "");
  const [studyDate, setStudyDate] = useState(block?.study_date ?? format(new Date(), "yyyy-MM-dd"));
  const [questionCount, setQuestionCount] = useState(block?.question_count ?? 20);
  const [correctCount, setCorrectCount] = useState(block?.correct_count ?? 0);
  const [difficulty, setDifficulty] = useState<DifficultyRating>(block?.perceived_difficulty ?? "Médio");
  const [timeSpent, setTimeSpent] = useState(block?.time_spent_minutes?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogTopics, setCatalogTopics] = useState<CatalogTopic[]>([]);

  useEffect(() => {
    let active = true;
    loadCatalogSuggestions(userId, profile)
      .then(topics => {
        if (!active) return;
        let options = topics;
        const currentTopic = block
          ? topics.find(topic => topic.title === block.title && topic.specialty === block.specialty)
          : topics[0];
        if (block && !currentTopic) {
          options = [{
            title: block.title,
            catalogArea: block.major_area,
            majorArea: block.major_area,
            specialty: block.specialty,
            suggestedImportance: block.suggested_importance ?? block.importance,
          }, ...topics];
        }
        const selected = currentTopic ?? options[0];
        setCatalogTopics(options);
        if (selected) {
          setCatalogArea(selected.catalogArea);
          setSpecialty(selected.specialty);
          setTitle(selected.title);
        }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista de temas.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => { active = false; };
  }, [block, profile, userId]);

  const areaOptions = useMemo(() => getCatalogAreas(catalogTopics), [catalogTopics]);
  const specialtyOptions = useMemo(
    () => getCatalogSpecialties(catalogTopics, catalogArea),
    [catalogArea, catalogTopics],
  );
  const topicOptions = useMemo(
    () => getCatalogTopics(catalogTopics, catalogArea, specialty),
    [catalogArea, catalogTopics, specialty],
  );
  const selectedTopic = useMemo(
    () => topicOptions.find(topic => topic.title === title) ?? null,
    [title, topicOptions],
  );
  const majorArea = selectedTopic?.majorArea ?? block?.major_area ?? "A classificar";
  const importance = selectedTopic?.suggestedImportance ?? block?.importance ?? "media";
  const suggestedImportance = selectedTopic?.suggestedImportance ?? block?.suggested_importance ?? null;
  const accuracy = calculateAccuracy(correctCount, questionCount);
  const smallSample = getCalculationMode(questionCount) === "small_sample";

  const changeArea = (area: string) => {
    const nextSpecialty = getCatalogSpecialties(catalogTopics, area)[0] ?? "";
    const nextTopic = getCatalogTopics(catalogTopics, area, nextSpecialty)[0];
    setCatalogArea(area);
    setSpecialty(nextSpecialty);
    setTitle(nextTopic?.title ?? "");
  };

  const changeSpecialty = (value: string) => {
    const nextTopic = getCatalogTopics(catalogTopics, catalogArea, value)[0];
    setSpecialty(value);
    setTitle(nextTopic?.title ?? "");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTopic || correctCount > questionCount) return;
    setSubmitting(true);
    setError(null);

    try {
      if (block) {
        await updateExistingBlock(block);
      } else {
        await createBlock();
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o tema.");
    } finally {
      setSubmitting(false);
    }
  };

  const createBlock = async () => {
    const calculation = calculateNextInterval({
      questionCount,
      correctCount,
      perceivedDifficulty: difficulty,
      importance,
      isFirstContact: true,
      reviewDate: studyDate,
      examDate: profile?.exam_date,
    });
    if (!calculation.nextReviewDate) throw new Error("Não foi possível calcular a primeira revisão.");
    const plannedReviewDate = await findAutomaticReviewDate({
      userId,
      targetDate: calculation.nextReviewDate,
    });

    const { data: inserted, error: insertError } = await supabase.from("question_blocks").insert({
      user_id: userId,
      title: title.trim(),
      area_id: null,
      area_name: specialty,
      exam_target_id: null,
      source: profile?.course_catalog_source === "upload"
        ? profile.course_catalog_filename || "Lista do cursinho"
        : "MetaMed",
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: calculation.accuracy,
      perceived_difficulty: difficulty,
      time_spent_minutes: timeSpent ? Number(timeSpent) : null,
      priority_weight: importanceToLegacyWeight(importance),
      study_date: studyDate,
      repetitions: 0,
      easiness_factor: 2.5,
      interval_days: calculation.intervalDays,
      next_review_date: calculation.nextReviewDate,
      calendar_event_id: null,
      major_area: majorArea,
      specialty,
      importance,
      suggested_importance: suggestedImportance,
      last_review_date: studyDate,
      planned_review_date: plannedReviewDate,
      planning_source: "automatic",
      backlog_since: null,
      backlog_urgency: null,
      pre_exam_review_requested: false,
      performance_band: calculation.performanceBand,
      calculation_mode: calculation.calculationMode,
      engine_version: ENGINE_VERSION,
    }).select("*").single();

    if (insertError || !inserted) throw new Error("Não foi possível cadastrar o primeiro contato.");

    const { error: contactError } = await supabase.from("block_reviews").insert({
      block_id: inserted.id,
      user_id: userId,
      review_date: studyDate,
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: calculation.accuracy,
      perceived_difficulty: difficulty,
      time_spent_minutes: timeSpent ? Number(timeSpent) : null,
      sm2_grade_calculated: toLegacyGrade(calculation.performanceBand),
      previous_next_review_date: null,
      new_next_review_date: calculation.nextReviewDate,
      contact_type: "first_contact",
      engine_version: ENGINE_VERSION,
      calculation_mode: calculation.calculationMode,
      performance_band: calculation.performanceBand,
      importance,
      previous_interval_days: null,
      new_interval_days: calculation.intervalDays,
      priority_score: null,
    });

    if (contactError) {
      await supabase.from("question_blocks").delete().eq("id", inserted.id).eq("user_id", userId);
      throw new Error("O tema foi revertido porque o primeiro contato não pôde ser salvo.");
    }

    await syncQuestionBlockCalendar({ blockId: inserted.id, userId });
  };

  const updateExistingBlock = async (existing: QuestionBlock) => {
    await updateQuestionBlockAndSync({
      blockId: existing.id,
      userId,
      changes: {
        title: title.trim(),
        area_name: specialty,
        source: profile?.course_catalog_source === "upload"
          ? profile.course_catalog_filename || "Lista do cursinho"
          : "MetaMed",
        priority_weight: importanceToLegacyWeight(importance),
        major_area: majorArea,
        specialty,
        importance,
        suggested_importance: suggestedImportance,
      },
    });
  };

  return (
    <div
      className="dashboard-modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">{editing ? "Organização do tema" : "Primeiro contato"}</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950">{editing ? "Editar tema" : "Registrar tema estudado"}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-[minmax(12rem,0.8fr)_minmax(15rem,1fr)_minmax(22rem,1.5fr)]">
            <Field label="Grande área">
              <select required value={catalogArea} onChange={event => changeArea(event.target.value)} disabled={catalogLoading || areaOptions.length === 0} className="field-control" title={catalogArea}>
                {catalogLoading && <option value="">Carregando...</option>}
                {!catalogLoading && areaOptions.length === 0 && <option value="">Nenhuma área</option>}
                {areaOptions.map(area => <option key={area}>{area}</option>)}
              </select>
            </Field>
            <Field label="Especialidade">
              <select required value={specialty} onChange={event => changeSpecialty(event.target.value)} disabled={catalogLoading || specialtyOptions.length === 0} className="field-control" title={specialty}>
                {specialtyOptions.map(option => <option key={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Tema">
              <select required value={title} onChange={event => setTitle(event.target.value)} disabled={catalogLoading || topicOptions.length === 0} className="field-control" title={title}>
                {topicOptions.map(topic => <option key={`${topic.specialty}-${topic.title}`} value={topic.title}>{topic.title}</option>)}
              </select>
            </Field>
          </div>

          {!editing && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-950">Desempenho no primeiro contato</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field label="Data do primeiro contato">
                  <input type="date" required max={format(new Date(), "yyyy-MM-dd")} value={studyDate} onChange={event => setStudyDate(event.target.value)} className="field-control" />
                </Field>
                <Field label="Questões">
                  <input type="number" min={1} required value={questionCount} onChange={event => {
                    const value = Math.max(1, Number(event.target.value));
                    setQuestionCount(value);
                    setCorrectCount(current => Math.min(current, value));
                  }} className="field-control" />
                </Field>
                <Field label="Acertos">
                  <input type="number" min={0} max={questionCount} required value={correctCount} onChange={event => setCorrectCount(Math.max(0, Number(event.target.value)))} className="field-control" />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Dificuldade percebida">
                  <select value={difficulty} onChange={event => setDifficulty(event.target.value as DifficultyRating)} className="field-control">
                    {difficulties.map(option => <option key={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Tempo em minutos" optional>
                  <input type="number" min={0} value={timeSpent} onChange={event => setTimeSpent(event.target.value)} className="field-control" />
                </Field>
              </div>
              <div className={`mt-4 rounded-md border px-3.5 py-3 text-sm ${smallSample ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-600"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span>Acurácia</span>
                  <span className="font-semibold tabular-nums text-gray-950">{correctCount}/{questionCount} · {accuracy}%</span>
                </div>
                {smallSample && (
                  <div className="mt-2 flex gap-2 border-t border-amber-200 pt-2 text-xs leading-5">
                    <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                    A dificuldade percebida comandará o primeiro intervalo porque a amostra tem menos de 20 questões.
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-5">
            <button type="button" onClick={onClose} className="button-secondary">Cancelar</button>
            <button type="submit" disabled={submitting || catalogLoading || !selectedTopic || correctCount > questionCount} className="button-primary">
              <Check size={16} /> {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Registrar tema"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="text-xs font-normal text-gray-400">Opcional</span>}
      </span>
      {children}
    </label>
  );
}
