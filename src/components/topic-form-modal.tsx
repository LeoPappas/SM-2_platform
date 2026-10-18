"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, Link2, Search, X } from "lucide-react";
import { updateQuestionBlock } from "@/lib/question-block-writes";
import {
  CUSTOM_TOPIC_SOURCE,
  findCatalogMatches,
  findLegacyCatalogMatch,
  getCatalogAreas,
  getCatalogSpecialties,
  getCatalogTopics,
  loadCatalogSuggestions,
  topicKey,
} from "@/lib/course-catalog";
import type {
  DifficultyRating,
  Importance,
  QuestionBlock,
  StudentProfile,
} from "@/lib/database.types";
import { MAJOR_AREAS, SPECIALTIES_BY_AREA, type CatalogTopic } from "@/lib/medical-catalog";
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

const importanceOptions: Array<{ value: Importance; label: string }> = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Média" },
  { value: "baixa", label: "Baixa" },
];

type CustomArea = (typeof MAJOR_AREAS)[number];

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
  // A linked catalog item is immutable in the database, so it cannot be swapped here.
  const linked = Boolean(block?.catalog_item_id);
  const releaseId = profile?.course_catalog_source === "course" ? profile.course_catalog_release_id : null;
  const [mode, setMode] = useState<"catalog" | "custom">(block?.source === CUSTOM_TOPIC_SOURCE ? "custom" : "catalog");
  const [selectedKey, setSelectedKey] = useState("");
  const [catalogArea, setCatalogArea] = useState(block?.major_area ?? "");
  const [specialty, setSpecialty] = useState(block?.specialty ?? "");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CatalogTopic[]>([]);
  const [customTitle, setCustomTitle] = useState(block?.source === CUSTOM_TOPIC_SOURCE ? block.title : "");
  const [customArea, setCustomArea] = useState<CustomArea>(
    MAJOR_AREAS.find(area => area === block?.major_area) ?? "Clínica Médica",
  );
  const [customSpecialty, setCustomSpecialty] = useState(block?.source === CUSTOM_TOPIC_SOURCE ? block.specialty : "");
  const [customImportance, setCustomImportance] = useState<Importance>(
    block?.source === CUSTOM_TOPIC_SOURCE ? block.importance : "media",
  );
  const [customMatches, setCustomMatches] = useState<CatalogTopic[]>([]);
  const [studyDate, setStudyDate] = useState(block?.study_date ?? format(new Date(), "yyyy-MM-dd"));
  const [questionCount, setQuestionCount] = useState(block?.question_count ?? 20);
  const [correctCount, setCorrectCount] = useState(block?.correct_count ?? 0);
  const [difficulty, setDifficulty] = useState<DifficultyRating>(block?.perceived_difficulty ?? "Médio");
  const [timeSpent, setTimeSpent] = useState(block?.time_spent_minutes?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(!linked);
  const [catalogTopics, setCatalogTopics] = useState<CatalogTopic[]>([]);

  useEffect(() => {
    if (linked) return;
    let active = true;
    loadCatalogSuggestions(userId, profile)
      .then(topics => {
        if (!active) return;
        let options = topics;
        let selected: CatalogTopic | undefined = topics[0];
        if (block) {
          const match = findLegacyCatalogMatch(topics, block);
          if (match) {
            selected = match;
          } else {
            selected = {
              title: block.title,
              catalogArea: block.major_area,
              majorArea: block.major_area,
              specialty: block.specialty,
              suggestedImportance: block.suggested_importance ?? block.importance,
              sourceLabel: block.source ?? undefined,
            };
            options = [selected, ...topics];
          }
        }
        setCatalogTopics(options);
        if (selected) {
          setCatalogArea(selected.catalogArea);
          setSpecialty(selected.specialty);
          setSelectedKey(topicKey(selected));
        }
      })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar a lista de temas.");
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => { active = false; };
  }, [block, linked, profile, userId]);

  useDebouncedSearch(mode === "catalog" ? query : "", catalogTopics, releaseId, setMatches);
  useDebouncedSearch(mode === "custom" ? customTitle : "", catalogTopics, releaseId, setCustomMatches);

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
    () => mode === "catalog" ? topicOptions.find(topic => topicKey(topic) === selectedKey) ?? null : null,
    [mode, selectedKey, topicOptions],
  );
  const attachesCatalog = Boolean(editing && selectedTopic?.catalogItemId);
  const customReady = Boolean(customTitle.trim() && customSpecialty.trim());
  const accuracy = calculateAccuracy(correctCount, questionCount);
  const smallSample = getCalculationMode(questionCount) === "small_sample";
  const canSubmit = !linked && !submitting && correctCount <= questionCount
    && (mode === "custom" ? customReady : !catalogLoading && Boolean(selectedTopic));

  const chooseTopic = (topic: CatalogTopic) => {
    setMode("catalog");
    setCatalogArea(topic.catalogArea);
    setSpecialty(topic.specialty);
    setSelectedKey(topicKey(topic));
    setQuery("");
  };

  const changeArea = (area: string) => {
    const nextSpecialty = getCatalogSpecialties(catalogTopics, area)[0] ?? "";
    const nextTopic = getCatalogTopics(catalogTopics, area, nextSpecialty)[0];
    setCatalogArea(area);
    setSpecialty(nextSpecialty);
    setSelectedKey(nextTopic ? topicKey(nextTopic) : "");
  };

  const changeSpecialty = (value: string) => {
    const nextTopic = getCatalogTopics(catalogTopics, catalogArea, value)[0];
    setSpecialty(value);
    setSelectedKey(nextTopic ? topicKey(nextTopic) : "");
  };

  const openCustom = () => {
    if (!customTitle && query.trim()) setCustomTitle(query.trim());
    setMode("custom");
  };

  const classification = () => {
    if (mode === "custom") {
      return {
        title: customTitle.trim(),
        major_area: customArea,
        specialty: customSpecialty.trim(),
        area_name: customSpecialty.trim(),
        importance: customImportance,
        suggested_importance: null,
        source: CUSTOM_TOPIC_SOURCE,
        catalog: null,
      };
    }
    if (!selectedTopic) throw new Error("Escolha um tema da lista.");
    return {
      title: selectedTopic.title.trim(),
      major_area: selectedTopic.majorArea,
      specialty: selectedTopic.specialty,
      area_name: selectedTopic.specialty,
      importance: selectedTopic.suggestedImportance,
      suggested_importance: selectedTopic.suggestedImportance,
      source: selectedTopic.sourceLabel ?? block?.source ?? "MetaMed",
      catalog: selectedTopic.catalogItemId && selectedTopic.relevanceVersionId && selectedTopic.relevanceScore != null
        ? {
          catalog_item_id: selectedTopic.catalogItemId,
          relevance_version_id: selectedTopic.relevanceVersionId,
          relevance_score: selectedTopic.relevanceScore,
        }
        : null,
    };
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
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
    const { catalog, ...topic } = classification();
    const calculation = calculateNextInterval({
      questionCount,
      correctCount,
      perceivedDifficulty: difficulty,
      importance: topic.importance,
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
      ...topic,
      area_id: null,
      exam_target_id: null,
      question_count: questionCount,
      correct_count: correctCount,
      accuracy_percentage: calculation.accuracy,
      perceived_difficulty: difficulty,
      time_spent_minutes: timeSpent ? Number(timeSpent) : null,
      priority_weight: importanceToLegacyWeight(topic.importance),
      study_date: studyDate,
      repetitions: 0,
      easiness_factor: 2.5,
      interval_days: calculation.intervalDays,
      next_review_date: calculation.nextReviewDate,
      last_review_date: studyDate,
      planned_review_date: plannedReviewDate,
      planning_source: "automatic",
      backlog_since: null,
      backlog_urgency: null,
      pre_exam_review_requested: false,
      performance_band: calculation.performanceBand,
      calculation_mode: calculation.calculationMode,
      engine_version: ENGINE_VERSION,
      ...catalog,
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
      importance: topic.importance,
      previous_interval_days: null,
      new_interval_days: calculation.intervalDays,
      priority_score: null,
      ...catalog,
    });

    if (contactError) {
      await supabase.from("question_blocks").delete().eq("id", inserted.id).eq("user_id", userId);
      throw new Error("O tema foi revertido porque o primeiro contato não pôde ser salvo.");
    }
  };

  const updateExistingBlock = async (existing: QuestionBlock) => {
    const { catalog, ...topic } = classification();
    await updateQuestionBlock({
      blockId: existing.id,
      userId,
      changes: {
        ...topic,
        priority_weight: importanceToLegacyWeight(topic.importance),
        ...(existing.catalog_item_id ? {} : catalog),
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
      <div className="modal-panel max-h-[calc(100vh-2rem)] w-full max-w-4xl overflow-y-auto p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">{editing ? "Organização do tema" : "Primeiro contato"}</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">{editing ? "Editar tema" : "Registrar tema estudado"}</h2>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-6">
          {linked && block ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm">
              <p className="font-semibold text-gray-900">{block.title}</p>
              <p className="mt-0.5 text-gray-600">{block.source} · {block.specialty}</p>
              <p className="mt-3 leading-6 text-gray-600">
                Este tema está vinculado a uma aula do seu cursinho, e o histórico de revisões depende desse vínculo.
                Para trocar de aula, exclua o tema e registre-o de novo.
              </p>
            </div>
          ) : mode === "catalog" ? (
            <div className="space-y-4">
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-gray-900">Buscar tema</span>
                  <span className="relative block">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      disabled={catalogLoading}
                      placeholder={releaseId ? "Nome da aula ou sigla, ex.: ICC" : "Nome do tema"}
                      className="field-control pl-9"
                    />
                  </span>
                </label>
                {query.trim().length >= 2 && (
                  <ul aria-label="Resultados da busca" className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {matches.length === 0 ? (
                      <li className="px-3.5 py-2.5 text-sm text-gray-500">Nenhum tema encontrado.</li>
                    ) : matches.map(topic => (
                      <li key={topicKey(topic)}>
                        <button type="button" onClick={() => chooseTopic(topic)} className="block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-blue-50">
                          <span className="block text-sm font-medium text-gray-900">{topic.title}</span>
                          <span className="block text-xs text-gray-500">{topic.catalogArea} · {topic.specialty}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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
                  <select required value={selectedKey} onChange={event => setSelectedKey(event.target.value)} disabled={catalogLoading || topicOptions.length === 0} className="field-control" title={selectedTopic?.title}>
                    {topicOptions.map(topic => <option key={topicKey(topic)} value={topicKey(topic)}>{topic.title}</option>)}
                  </select>
                </Field>
              </div>

              {attachesCatalog && selectedTopic && (
                <div className="flex gap-2.5 rounded-md border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm leading-6 text-blue-900">
                  <Link2 size={16} className="mt-1 shrink-0" />
                  <span>Ao salvar, este tema passa a usar a aula “{selectedTopic.title}” de {selectedTopic.sourceLabel}. O histórico de revisões continua o mesmo.</span>
                </div>
              )}

              <button type="button" onClick={openCustom} className="text-sm font-semibold text-blue-700 hover:underline">
                Não encontrei meu tema
              </button>
            </div>
          ) : (
            <div className="space-y-4 rounded-md border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Tema próprio</h3>
                <button type="button" onClick={() => setMode("catalog")} className="text-sm font-semibold text-blue-700 hover:underline">
                  Voltar para a lista
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nome do tema">
                  <input required value={customTitle} onChange={event => setCustomTitle(event.target.value)} placeholder="Ex.: Síndrome disfágica" className="field-control" />
                </Field>
                <Field label="Grande área do tema">
                  <select value={customArea} onChange={event => setCustomArea(event.target.value as CustomArea)} className="field-control">
                    {MAJOR_AREAS.map(area => <option key={area}>{area}</option>)}
                  </select>
                </Field>
                <Field label="Especialidade do tema">
                  <input required list="custom-topic-specialties" value={customSpecialty} onChange={event => setCustomSpecialty(event.target.value)} placeholder="Ex.: Gastroenterologia" className="field-control" />
                  <datalist id="custom-topic-specialties">
                    {SPECIALTIES_BY_AREA[customArea].map(option => <option key={option} value={option} />)}
                  </datalist>
                </Field>
                <Field label="Importância">
                  <select value={customImportance} onChange={event => setCustomImportance(event.target.value as Importance)} className="field-control">
                    {importanceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
              </div>
              <p className="text-xs leading-5 text-gray-500">
                Temas próprios entram no planejamento com importância média, a menos que você escolha outra.
              </p>
              {customMatches.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <p className="text-sm font-medium text-amber-900">Parece com estas aulas da sua lista. Quer usar uma delas?</p>
                  <ul aria-label="Aulas parecidas" className="mt-2 space-y-1.5">
                    {customMatches.slice(0, 4).map(topic => (
                      <li key={topicKey(topic)} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 text-gray-800"><span className="font-medium">{topic.title}</span> <span className="text-gray-500">· {topic.catalogArea}</span></span>
                        <button type="button" onClick={() => chooseTopic(topic)} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Usar esta aula</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!editing && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-900">Desempenho no primeiro contato</h3>
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
                  <span className="font-semibold tabular-nums text-gray-900">{correctCount}/{questionCount} · {accuracy}%</span>
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
            <button type="button" onClick={onClose} className="button-secondary">{linked ? "Fechar" : "Cancelar"}</button>
            {!linked && (
              <button type="submit" disabled={!canSubmit} className="button-primary">
                <Check size={16} /> {submitting ? "Salvando..." : editing ? "Salvar alterações" : "Registrar tema"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Searches the catalog shortly after the student stops typing. */
function useDebouncedSearch(
  query: string,
  topics: readonly CatalogTopic[],
  releaseId: string | null | undefined,
  onResults: (topics: CatalogTopic[]) => void,
) {
  useEffect(() => {
    if (query.trim().length < 2) {
      onResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      findCatalogMatches({ topics, query, releaseId })
        .then(results => { if (active) onResults(results); })
        .catch(() => { if (active) onResults([]); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [onResults, query, releaseId, topics]);
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-gray-900">
        {label}
        {optional && <span className="text-xs font-normal text-gray-500">Opcional</span>}
      </span>
      {children}
    </label>
  );
}
