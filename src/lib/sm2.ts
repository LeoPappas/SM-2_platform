export function calculateSM2({
  accuracy,
  easiness,
  repetitions,
  previousInterval,
  previousEF,
  daysDelayed
}: {
  accuracy: number;
  easiness: string; // "Muito Fácil", "Fácil", "Médio", "Difícil", "Muito Difícil"
  repetitions: number;
  previousInterval: number;
  previousEF: number;
  daysDelayed: number;
}) {
  // 1. Mapear a precisão e facilidade para a nota (q) de 0 a 5 do SM-2
  let q = 0;
  
  if (accuracy >= 85) q = 5;
  else if (accuracy >= 70) q = 4;
  else if (accuracy >= 60) q = 3;
  else if (accuracy >= 40) q = 2;
  else if (accuracy >= 20) q = 1;
  else q = 0;

  // Ajustes com base na auto-avaliação (Facilidade)
  if (easiness === "Muito Fácil" && q < 5) q += 1;
  if (easiness === "Médio") Math.max(0, q - 1);
  if (easiness === "Difícil") q = Math.max(0, q - 2);
  if (easiness === "Muito Difícil") q = 0; // Blackout

  // 2. Cálculo do SM-2
  let nextRepetitions = repetitions;
  let nextInterval = previousInterval;
  let nextEF = previousEF;

  if (q >= 3) {
    // Aprovado / Lembrado
    if (repetitions === 0) {
      nextInterval = 3; // Primeiro pulo é de 3 dias para macro-tópicos
    } else if (repetitions === 1) {
      nextInterval = 6; // Segundo pulo é 6 dias
    } else {
      // Bônus de atraso (Delay Bonus).
      // Se não houvesse bônus, usaríamos apenas: previousInterval * previousEF
      const realInterval = previousInterval + Math.max(0, daysDelayed);
      nextInterval = Math.round(realInterval * previousEF);
    }
    nextRepetitions += 1;
  } else {
    // Reprovado / Esquecido
    nextRepetitions = 0;
    nextInterval = 1; // Revisar amanhã
  }

  // 3. Atualizar Easiness Factor (EF)
  nextEF = previousEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (nextEF < 1.3) {
    nextEF = 1.3; // Limite mínimo do algoritmo
  }

  return {
    q,
    repetitions: nextRepetitions,
    intervalDays: nextInterval,
    easinessFactor: Number(nextEF.toFixed(2)),
  };
}
