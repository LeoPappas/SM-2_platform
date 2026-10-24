"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
  BookOpenCheck,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { SessionEditModal } from "@/components/session-edit-modal";
import { TopicFormModal } from "@/components/topic-form-modal";
import { TopicTableHeader, TopicTableRow } from "@/components/topic-table";
import { deleteQuestionBlock, setQuestionBlockArchived } from "@/lib/question-block-writes";
import { displayArea, loadCourseAreas, matchesSearch } from "@/lib/course-catalog";
import type { BlockReview, QuestionBlock, StudentProfile } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export default function TemasPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [courseAreas, setCourseAreas] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("todas");
  const [formBlock, setFormBlock] = useState<QuestionBlock | "new" | null>(null);
  const [sessionBlock, setSessionBlock] = useState<QuestionBlock | null>(null);
  const [historyBlock, setHistoryBlock] = useState<QuestionBlock | null>(null);
  const [history, setHistory] = useState<BlockReview[]>([]);
  const [deleteBlock, setDeleteBlock] = useState<QuestionBlock | null>(null);
  const [archiveBlock, setArchiveBlock] = useState<QuestionBlock | null>(null);
  const [view, setView] = useState<"active" | "archived">("active");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async (userId: string) => {
    const [blocksResult, profileResult, reviewsResult] = await Promise.all([
      supabase
        .from("question_blocks")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      supabase
        .from("student_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("block_reviews")
        .select("block_id")
        .eq("user_id", userId)
        .eq("contact_type", "review"),
    ]);

    if (blocksResult.error) setError("Não foi possível carregar os temas.");
    setBlocks(blocksResult.data ?? []);
    setCourseAreas(await loadCourseAreas(blocksResult.data ?? []).catch(() => new Map<string, string>()));
    setProfile(profileResult.data ?? null);
    setReviewCounts((reviewsResult.data ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.block_id] = (counts[row.block_id] ?? 0) + 1;
      return counts;
    }, {}));
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      setSession(activeSession);
      if (activeSession) loadData(activeSession.user.id);
      else setLoading(false);
    });
  }, [loadData]);

  const filteredBlocks = useMemo(() => {
    return blocks.filter(block => {
      if ((view === "archived") !== Boolean(block.archived_at)) return false;
      const matchesArea = areaFilter === "todas" || displayArea(block, courseAreas) === areaFilter;
      const matchesQuery = [block.title, block.specialty, block.source ?? ""].some(value => matchesSearch(value, query));
      return matchesArea && matchesQuery;
    });
  }, [areaFilter, blocks, courseAreas, query, view]);
  const areaOptions = useMemo(
    () => [...new Set(blocks.map(block => displayArea(block, courseAreas)))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [blocks, courseAreas],
  );

  const openHistory = async (block: QuestionBlock) => {
    setHistoryBlock(block);
    const { data, error: historyError } = await supabase
      .from("block_reviews")
      .select("*")
      .eq("block_id", block.id)
      .order("review_date", { ascending: false });
    if (historyError) setError("Não foi possível carregar o histórico.");
    setHistory(data ?? []);
  };

  const confirmDelete = async () => {
    if (!session || !deleteBlock) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      await deleteQuestionBlock({ block: deleteBlock, userId: session.user.id });
      await loadData(session.user.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o tema.");
    }
    setDeleteBlock(null);
    setSubmitting(false);
  };

  const changeArchived = async (block: QuestionBlock, archived: boolean) => {
    if (!session) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await setQuestionBlockArchived({ block, userId: session.user.id, archived });
      await loadData(session.user.id);
      setNotice(archived
        ? `${block.title} foi arquivado. Ele está em "Arquivados" e pode ser restaurado.`
        : `${block.title} voltou para o planejamento.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o tema.");
    }
    setArchiveBlock(null);
    setSubmitting(false);
  };

  if (loading) return <LoadingState />;

  const activeCount = blocks.filter(block => !block.archived_at).length;
  const archivedCount = blocks.length - activeCount;

  return (
    <div className="page-shell">
      {error && (
        <div className="mb-5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="icon-button"><X size={16} /></button>
        </div>
      )}
      {notice && <div role="status" className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}

      <header className="page-header">
        <div>
          <h1 className="page-title">
            Temas estudados <span className="ml-2 align-middle text-base font-semibold text-blue-700">{activeCount}</span>
          </h1>
        </div>
        <button type="button" onClick={() => setFormBlock("new")} className="button-primary">
          <Plus size={16} /> Novo tema
        </button>
      </header>

      {(archivedCount > 0 || view === "archived") && (
        <div className="mb-4 flex w-fit gap-1 rounded-md border border-gray-200 bg-white p-1 shadow-xs" aria-label="Temas exibidos">
          {([["active", `Ativos · ${activeCount}`], ["archived", `Arquivados · ${archivedCount}`]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`rounded-[6px] px-3 py-2 text-xs font-semibold transition-colors ${view === value ? "bg-blue-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</button>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tema ou especialidade" className="field-control pl-9" />
        </label>
        <select value={areaFilter} onChange={event => setAreaFilter(event.target.value)} className="field-control sm:w-56">
          <option value="todas">Todas as áreas</option>
          {areaOptions.map(area => <option key={area}>{area}</option>)}
        </select>
      </div>

      {filteredBlocks.length === 0 ? (
        <div className="empty-state">
          <BookOpenCheck size={24} />
          <p>{view === "archived" ? "Nenhum tema arquivado corresponde aos filtros." : activeCount === 0 ? "Cadastre o primeiro tema que você já estudou." : "Nenhum tema corresponde aos filtros."}</p>
          {view === "active" && activeCount === 0 && <button type="button" onClick={() => setFormBlock("new")} className="button-secondary"><Plus size={15} /> Novo tema</button>}
        </div>
      ) : (
        <div className="card">
          <TopicTableHeader archived={view === "archived"} />
          <div className="divide-y divide-gray-100">
            {filteredBlocks.map(block => (
              <TopicTableRow
                key={block.id}
                block={block}
                area={displayArea(block, courseAreas)}
                reviewCount={reviewCounts[block.id] ?? 0}
                onEdit={() => setSessionBlock(block)}
                onHistory={() => openHistory(block)}
                onArchive={() => setArchiveBlock(block)}
                onRestore={() => void changeArchived(block, false)}
                onDelete={() => setDeleteBlock(block)}
                busy={submitting}
              />
            ))}
          </div>
        </div>
      )}

      {session && sessionBlock && (
        <SessionEditModal
          block={sessionBlock}
          userId={session.user.id}
          examDate={profile?.exam_date}
          timezone={profile?.timezone}
          onClose={() => setSessionBlock(null)}
          onSaved={() => loadData(session.user.id)}
          onEditClassification={() => {
            setSessionBlock(null);
            setFormBlock(sessionBlock);
          }}
        />
      )}

      {session && formBlock && (
        <TopicFormModal
          userId={session.user.id}
          profile={profile}
          block={formBlock === "new" ? null : formBlock}
          onClose={() => setFormBlock(null)}
          onSaved={() => loadData(session.user.id)}
        />
      )}

      {historyBlock && (
        <HistoryModal block={historyBlock} area={displayArea(historyBlock, courseAreas)} history={history} onClose={() => {
          setHistoryBlock(null);
          setHistory([]);
        }} />
      )}

      {archiveBlock && (
        <ConfirmArchive block={archiveBlock} submitting={submitting} onCancel={() => setArchiveBlock(null)} onConfirm={() => void changeArchived(archiveBlock, true)} />
      )}

      {deleteBlock && (
        <ConfirmDelete block={deleteBlock} submitting={submitting} onCancel={() => setDeleteBlock(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}

function HistoryModal({ block, area, history, onClose }: { block: QuestionBlock; area: string; history: BlockReview[]; onClose: () => void }) {
  const reviews = history.filter(item => item.contact_type === "review");
  const firstContact = history.find(item => item.contact_type === "first_contact");
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="page-eyebrow">Histórico estruturado</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">{block.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{area} · {block.specialty}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
          <div className="grid grid-cols-[7rem_1fr_7rem_7rem] border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500">
            <span>Data</span><span>Registro</span><span>Resultado</span><span>Intervalo</span>
          </div>
          <div className="divide-y divide-gray-100">
            {reviews.map((review, index) => (
              <div key={review.id} className="grid grid-cols-[7rem_1fr_7rem_7rem] items-center px-4 py-3 text-sm">
                <span className="text-gray-600">{formatDate(review.review_date)}</span>
                <span>
                  <span className="block font-medium text-gray-900">R{reviews.length - index}</span>
                  <span className="text-xs text-gray-500">{review.calculation_mode === "small_sample" ? "Dificuldade comandou" : "Desempenho comandou"}</span>
                </span>
                <span className="font-semibold tabular-nums text-gray-900">{review.accuracy_percentage}%</span>
                <span className="tabular-nums text-gray-700">{review.new_interval_days ?? "—"} dias</span>
              </div>
            ))}
            <div className="grid grid-cols-[7rem_1fr_7rem_7rem] items-center bg-blue-50 px-4 py-3 text-sm">
              <span className="text-gray-600">{formatDate(firstContact?.review_date ?? block.study_date)}</span>
              <span>
                <span className="block font-medium text-gray-900">Primeiro contato</span>
                <span className="text-xs text-gray-500">{firstContact ? firstContact.calculation_mode === "small_sample" ? "Dificuldade comandou" : "Desempenho comandou" : "Registro legado"}</span>
              </span>
              <span className="font-semibold tabular-nums text-gray-900">{firstContact ? `${firstContact.accuracy_percentage}%` : "—"}</span>
              <span className="tabular-nums text-gray-700">{firstContact?.new_interval_days ? `${firstContact.new_interval_days} dias` : "—"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmArchive({ block, submitting, onCancel, onConfirm }: { block: QuestionBlock; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-label={`Arquivar ${block.title}`}>
      <div className="modal-panel w-full max-w-sm p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 text-gray-700"><Archive size={19} /></div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Arquivar {block.title}?</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">O tema sai do planejamento e do calendário. O histórico de revisões continua guardado, e você pode restaurá-lo quando quiser.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="button-secondary">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="button-primary">
            <Archive size={15} /> {submitting ? "Arquivando..." : "Arquivar tema"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDelete({ block, submitting, onCancel, onConfirm }: { block: QuestionBlock; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-panel w-full max-w-sm p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-700"><Trash2 size={19} /></div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">Excluir {block.title} definitivamente?</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">O tema e todo o histórico de revisões serão apagados. Esta ação não pode ser desfeita.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="button-secondary">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="button-danger">
            <Trash2 size={15} /> {submitting ? "Excluindo..." : "Excluir definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Carregando temas...</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
