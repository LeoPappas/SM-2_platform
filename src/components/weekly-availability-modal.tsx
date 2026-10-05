"use client";

import { useId, useState } from "react";
import { addDays, format, getISODay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, RotateCcw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useModalAccessibility } from "@/lib/use-modal-accessibility";

export function WeeklyAvailabilityModal({
  weekStart, dailyCapacities, hasOverride, onClose, onSaved,
}: {
  weekStart: string;
  dailyCapacities: Record<string, number>;
  hasOverride: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [capacities, setCapacities] = useState({ ...dailyCapacities });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const panelRef = useModalAccessibility(onClose, saving);
  const days = Array.from({ length: 7 }, (_, offset) => addDays(new Date(`${weekStart}T12:00:00`), offset));
  const total = days.reduce((sum, day) => sum + (capacities[String(getISODay(day))] ?? 0), 0);

  const persist = async (reset = false) => {
    setSaving(true);
    setError(null);
    try {
      const result = reset
        ? await supabase.rpc("reset_weekly_availability", { p_week_start: weekStart })
        : await supabase.rpc("save_weekly_availability", {
          p_week_start: weekStart,
          p_study_days: days.filter(day => (capacities[String(getISODay(day))] ?? 0) > 0).map(day => getISODay(day)).sort(),
          p_daily_capacities: capacities,
        });
      if (result.error) throw new Error("Não foi possível salvar a disponibilidade desta semana.");
      setSaved(true);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar sua semana.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-modal-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={saving} onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <div ref={panelRef} tabIndex={-1} className="modal-panel max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">Ajustar esta semana</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">Escolha quantas revisões cabem em cada dia. Sua rotina habitual permanece igual.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" disabled={saving} onClick={onClose}><X size={18} /></button>
        </div>
        <form className="mt-5" onSubmit={event => { event.preventDefault(); void persist(); }}>
          <div className="divide-y divide-gray-100">
            {days.map(day => {
              const key = String(getISODay(day));
              const value = capacities[key] ?? 0;
              return (
                <label key={key} className="flex items-center justify-between gap-4 py-3">
                  <span className="capitalize text-sm font-medium text-gray-800">{format(day, "EEEE, dd/MM", { locale: ptBR })}</span>
                  <input type="number" min={0} max={20} step={1} required aria-label={`Revisões na ${format(day, "EEEE", { locale: ptBR })}`} value={value}
                    data-modal-initial-focus={day === days[0] ? "" : undefined}
                    disabled={saving || saved}
                    onChange={event => setCapacities(current => ({ ...current, [key]: Math.min(20, Math.max(0, Math.trunc(Number(event.target.value)))) }))}
                    className="field-control w-20 text-center tabular-nums" />
                </label>
              );
            })}
          </div>
          <p className="mt-4 text-sm text-gray-600"><strong className="font-semibold text-gray-900">{total} revisões</strong> de capacidade nesta semana.</p>
          {total === 0 && <p role="status" className="mt-2 text-sm leading-6 text-amber-800">Nenhuma revisão será distribuída automaticamente. Você ainda pode estudar ou escolher datas manualmente.</p>}
          {error && <p role="alert" className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">{saved ? "A disponibilidade foi salva. Atualize a página para conferir o plano." : error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4">
            {hasOverride && <button type="button" className="button-secondary mr-auto" disabled={saving || saved} onClick={() => void persist(true)}><RotateCcw size={15} /> Usar rotina habitual</button>}
            <button type="button" className="button-secondary" disabled={saving} onClick={onClose}>{saved ? "Fechar" : "Cancelar"}</button>
            <button type="submit" className="button-primary" disabled={saving || saved}><Check size={15} /> {saving ? "Salvando..." : "Salvar esta semana"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
