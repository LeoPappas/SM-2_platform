"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BookOpenCheck,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { TopicFormModal } from "@/components/topic-form-modal";
import { deleteQuestionBlockWithCalendar } from "@/lib/calendar-sync";
import type { BlockReview, MajorArea, QuestionBlock, StudentProfile } from "@/lib/database.types";
import { persistGoogleProviderToken } from "@/lib/google-provider-token";
import { MAJOR_AREAS } from "@/lib/medical-catalog";
import { supabase } from "@/lib/supabase";

export default function TemasPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviewCounts, setReviewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState<MajorArea | "todas">("todas");
  const [formBlock, setFormBlock] = useState<QuestionBlock | "new" | null>(null);
  const [historyBlock, setHistoryBlock] = useState<QuestionBlock | null>(null);
  const [history, setHistory] = useState<BlockReview[]>([]);
  const [deleteBlock, setDeleteBlock] = useState<QuestionBlock | null>(null);
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
    setProfile(profileResult.data ?? null);
    setReviewCounts((reviewsResult.data ?? []).reduce<Record<string, number>>((counts, row) => {
      counts[row.block_id] = (counts[row.block_id] ?? 0) + 1;
      return counts;
    }, {}));
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

  const filteredBlocks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return blocks.filter(block => {
      const matchesArea = areaFilter === "todas" || block.major_area === areaFilter;
      const matchesQuery = !normalizedQuery || [block.title, block.specialty, block.source ?? ""]
        .some(value => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      return matchesArea && matchesQuery;
    });
  }, [areaFilter, blocks, query]);

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

    try {
      await deleteQuestionBlockWithCalendar({ block: deleteBlock, userId: session.user.id });
      await loadData(session.user.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir o tema.");
    }
    setDeleteBlock(null);
    setSubmitting(false);
  };

  if (loading) return <LoadingState />;

  const legacyCount = blocks.filter(block => block.major_area === "A classificar").length;

  return (
    <div className="page-shell">
      {error && (
        <div className="mb-5 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="icon-button"><X size={16} /></button>
        </div>
      )}

      <header className="page-header">
        <div>
          <h1 className="page-title">
            Temas estudados <span className="ml-2 align-middle text-base font-semibold text-emerald-700">{blocks.length}</span>
          </h1>
        </div>
        <button type="button" onClick={() => setFormBlock("new")} className="button-primary">
          <Plus size={16} /> Novo tema
        </button>
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tema ou especialidade" className="field-control pl-9" />
        </label>
        <select value={areaFilter} onChange={event => setAreaFilter(event.target.value as MajorArea | "todas")} className="field-control sm:w-56">
          <option value="todas">Todas as áreas</option>
          {MAJOR_AREAS.map(area => <option key={area}>{area}</option>)}
          {legacyCount > 0 && <option>A classificar</option>}
        </select>
      </div>

      {filteredBlocks.length === 0 ? (
        <div className="empty-state">
          <BookOpenCheck size={24} />
          <p>{blocks.length === 0 ? "Cadastre o primeiro tema que você já estudou." : "Nenhum tema corresponde aos filtros."}</p>
          {blocks.length === 0 && <button type="button" onClick={() => setFormBlock("new")} className="button-secondary"><Plus size={15} /> Novo tema</button>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <div className="hidden grid-cols-[minmax(18rem,1fr)_10rem_11rem_8rem] border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold text-gray-500 lg:grid">
            <span>Tema</span>
            <span>Número de contatos</span>
            <span>Próxima revisão</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredBlocks.map(block => (
              <TopicRow
                key={block.id}
                block={block}
                reviewCount={reviewCounts[block.id] ?? 0}
                onEdit={() => setFormBlock(block)}
                onHistory={() => openHistory(block)}
                onDelete={() => setDeleteBlock(block)}
              />
            ))}
          </div>
        </div>
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
        <HistoryModal block={historyBlock} history={history} onClose={() => {
          setHistoryBlock(null);
          setHistory([]);
        }} />
      )}

      {deleteBlock && (
        <ConfirmDelete block={deleteBlock} submitting={submitting} onCancel={() => setDeleteBlock(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}

function TopicRow({
  block,
  reviewCount,
  onEdit,
  onHistory,
  onDelete,
}: {
  block: QuestionBlock;
  reviewCount: number;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const contactCount = reviewCount + 1;

  return (
    <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(18rem,1fr)_10rem_11rem_8rem] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold text-gray-950">{block.title}</h2>
          {block.major_area === "A classificar" && <span className="status-badge bg-amber-100 text-amber-800">Classificar</span>}
          {block.calendar_sync_enabled && block.calendar_sync_status === "pending" && <span className="status-badge bg-gray-100 text-gray-600">Sincronizando</span>}
          {block.calendar_sync_enabled && block.calendar_sync_status === "failed" && <span className="status-badge bg-red-100 text-red-700">Reconectar Calendar</span>}
        </div>
        <p className="mt-1 truncate text-xs font-medium text-gray-500">{block.major_area} · {block.specialty}</p>
      </div>
      <div>
        <span className="block text-sm font-semibold tabular-nums text-gray-950">{contactCount}</span>
        <span className="text-xs text-gray-500">{contactCount === 1 ? "contato" : "contatos"}</span>
      </div>
      <div className="text-sm font-medium text-gray-700">
        {formatDate(block.next_review_date)}
      </div>
      <div className="flex justify-start gap-1 lg:justify-end">
        <ActionButton label="Histórico" onClick={onHistory}><History size={15} /></ActionButton>
        <ActionButton label="Editar" onClick={onEdit}><Pencil size={15} /></ActionButton>
        <ActionButton label="Excluir" onClick={onDelete} danger><Trash2 size={15} /></ActionButton>
      </div>
    </div>
  );
}

function HistoryModal({ block, history, onClose }: { block: QuestionBlock; history: BlockReview[]; onClose: () => void }) {
  const reviews = history.filter(item => item.contact_type === "review");
  const firstContact = history.find(item => item.contact_type === "first_contact");
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-700">Histórico estruturado</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-950">{block.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{block.major_area} · {block.specialty}</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="mt-6 overflow-hidden rounded-md border border-gray-200">
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
            <div className="grid grid-cols-[7rem_1fr_7rem_7rem] items-center bg-blue-50/50 px-4 py-3 text-sm">
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

function ConfirmDelete({ block, submitting, onCancel, onConfirm }: { block: QuestionBlock; submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-100 text-red-700"><Trash2 size={19} /></div>
        <h2 className="mt-4 text-lg font-semibold text-gray-950">Excluir {block.title}?</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">O histórico de revisões também será removido. Esta ação não pode ser desfeita.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="button-secondary">Cancelar</button>
          <button type="button" onClick={onConfirm} disabled={submitting} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            <Trash2 size={15} /> {submitting ? "Excluindo..." : "Excluir tema"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`icon-button ${danger ? "hover:bg-red-50 hover:text-red-700" : ""}`}>
      {children}
    </button>
  );
}

function LoadingState() {
  return <div className="flex min-h-[60vh] items-center justify-center text-sm text-gray-500">Carregando temas...</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}
