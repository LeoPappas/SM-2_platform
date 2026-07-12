"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { format, startOfDay } from "date-fns";
import { AlertTriangle, CheckCircle2, Layers, Target, X } from "lucide-react";
import type { BlockReview, QuestionBlock } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export default function MetricasPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [blocks, setBlocks] = useState<QuestionBlock[]>([]);
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 6000);
  }, []);

  const fetchData = useCallback(async (userId: string) => {
    const [blocksRes, reviewsRes] = await Promise.all([
      supabase.from("question_blocks").select("*").eq("user_id", userId),
      supabase.from("block_reviews").select("*").eq("user_id", userId).order("review_date", { ascending: false }),
    ]);

    if (blocksRes.error) showError("Erro ao carregar blocos.");
    else setBlocks(blocksRes.data ?? []);
    if (reviewsRes.error) showError("Erro ao carregar revisões.");
    else setReviews(reviewsRes.data ?? []);
    setLoading(false);
  }, [showError]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchData(session.user.id);
      else setLoading(false);
    });
  }, [fetchData]);

  const metrics = useMemo(() => {
    const todayStr = format(startOfDay(new Date()), "yyyy-MM-dd");
    const totalQuestions = blocks.reduce((sum, block) => sum + block.question_count, 0);
    const totalCorrect = blocks.reduce((sum, block) => sum + block.correct_count, 0);
    const overdue = blocks.filter(block => block.next_review_date < todayStr).length;
    const dueToday = blocks.filter(block => block.next_review_date === todayStr).length;
    const averageAccuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    const reviewedQuestions = reviews.reduce((sum, review) => sum + review.question_count, 0);

    const byArea = Object.values(blocks.reduce<Record<string, { area: string; blocks: number; questions: number; accuracySum: number }>>((acc, block) => {
      acc[block.area_name] = acc[block.area_name] ?? { area: block.area_name, blocks: 0, questions: 0, accuracySum: 0 };
      acc[block.area_name].blocks += 1;
      acc[block.area_name].questions += block.question_count;
      acc[block.area_name].accuracySum += block.accuracy_percentage;
      return acc;
    }, {})).map(item => ({
      ...item,
      averageAccuracy: Math.round(item.accuracySum / item.blocks),
    })).sort((a, b) => b.questions - a.questions);

    const weakAreas = [...byArea].sort((a, b) => a.averageAccuracy - b.averageAccuracy).slice(0, 5);

    return {
      totalQuestions,
      totalCorrect,
      overdue,
      dueToday,
      averageAccuracy,
      reviewedQuestions,
      byArea,
      weakAreas,
    };
  }, [blocks, reviews]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const firstName =
    session?.user.user_metadata?.full_name?.split(" ")[0] ??
    session?.user.email?.split("@")[0] ??
    "Estudante";

  return (
    <div className="min-h-screen bg-gray-50">
      {errorMsg && (
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-red-200 bg-red-50 px-6 py-3 text-red-700">
          <span className="text-sm font-medium">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X size={16} /></button>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Métricas</h1>
          <p className="mt-1 text-sm text-gray-500">Acompanhamento operacional dos blocos de {firstName}.</p>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard icon={<Layers size={18} />} label="Blocos" value={blocks.length.toString()} />
          <MetricCard icon={<Target size={18} />} label="Questões únicas" value={metrics.totalQuestions.toString()} />
          <MetricCard icon={<CheckCircle2 size={18} />} label="Acurácia global" value={`${metrics.averageAccuracy}%`} />
          <MetricCard icon={<AlertTriangle size={18} />} label="Atrasadas" value={metrics.overdue.toString()} danger />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Volume por área</h2>
            </div>
            <div className="p-5">
              {metrics.byArea.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum bloco registrado.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.byArea.map(area => (
                    <AreaRow key={area.area} label={area.area} value={`${area.questions} questões`} percentage={area.averageAccuracy} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-800">Áreas com menor acurácia</h2>
            </div>
            <div className="p-5">
              {metrics.weakAreas.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum dado suficiente ainda.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.weakAreas.map(area => (
                    <AreaRow key={area.area} label={area.area} value={`${area.blocks} blocos`} percentage={area.averageAccuracy} inverse />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="mt-5 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-800">Estado da fila</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InlineStat label="Revisões para hoje" value={metrics.dueToday.toString()} />
            <InlineStat label="Questões revisadas em retornos" value={metrics.reviewedQuestions.toString()} />
            <InlineStat label="Acertos no último estado dos blocos" value={metrics.totalCorrect.toString()} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, danger }: { icon: React.ReactNode; label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>{icon}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${danger ? "text-red-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function AreaRow({ label, value, percentage, inverse }: { label: string; value: string; percentage: number; inverse?: boolean }) {
  const tone = inverse && percentage < 60 ? "bg-red-500" : percentage >= 75 ? "bg-green-500" : "bg-blue-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="text-gray-500">{value} · {percentage}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }} />
      </div>
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
