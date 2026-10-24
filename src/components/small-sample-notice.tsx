"use client";

import { AlertTriangle } from "lucide-react";

/** Explains why a session with fewer than 20 questions follows the perceived difficulty, and asks the student to confirm. */
export function SmallSampleNotice({ confirmed, onConfirmedChange }: { confirmed: boolean; onConfirmedChange: (confirmed: boolean) => void }) {
  return (
    <div className="mt-2 border-t border-amber-200 pt-2 text-xs leading-5 text-amber-900">
      <p className="flex gap-2">
        <AlertTriangle className="mt-0.5 shrink-0" size={14} />
        <span>
          Com menos de 20 questões, o percentual de acerto ainda não é confiável. Por isso, a data da próxima revisão vai seguir a
          dificuldade que você marcou. Recomendamos fazer pelo menos 20 questões.
        </span>
      </p>
      <label className="mt-2 flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={confirmed} onChange={event => onConfirmedChange(event.target.checked)} className="h-4 w-4 accent-amber-700" />
        Entendi, quero registrar mesmo assim
      </label>
    </div>
  );
}
