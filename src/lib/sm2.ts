import type { DifficultyRating } from "./database.types";

const priorityMultipliers: Record<number, number> = {
  1: 1.2,
  2: 1.1,
  3: 1,
  4: 0.85,
  5: 0.7,
};

export function calculateAccuracy(correctCount: number, questionCount: number) {
  if (questionCount <= 0) return 0;
  return Math.round((correctCount / questionCount) * 100);
}

export function calculateBlockReview({
  accuracy,
  perceivedDifficulty,
  repetitions,
  previousInterval,
  previousEF,
  daysDelayed,
  priorityWeight,
}: {
  accuracy: number;
  perceivedDifficulty: DifficultyRating;
  repetitions: number;
  previousInterval: number;
  previousEF: number;
  daysDelayed: number;
  priorityWeight: number;
}) {
  let q = 0;

  if (accuracy >= 85) q = 5;
  else if (accuracy >= 70) q = 4;
  else if (accuracy >= 55) q = 3;
  else if (accuracy >= 40) q = 2;
  else if (accuracy >= 20) q = 1;

  if (perceivedDifficulty === "Muito fácil" && q < 5) q += 1;
  if (perceivedDifficulty === "Médio") q = Math.max(0, q - 1);
  if (perceivedDifficulty === "Difícil") q = Math.max(0, q - 2);
  if (perceivedDifficulty === "Muito difícil") q = 0;

  let nextRepetitions = repetitions;
  let nextInterval = Math.max(1, previousInterval);
  let nextEF = previousEF;

  if (q >= 3) {
    if (repetitions === 0) {
      nextInterval = 3;
    } else if (repetitions === 1) {
      nextInterval = 6;
    } else {
      const realInterval = previousInterval + Math.max(0, daysDelayed);
      nextInterval = Math.round(realInterval * previousEF);
    }
    nextRepetitions += 1;
  } else {
    nextRepetitions = 0;
    nextInterval = 1;
  }

  const multiplier = priorityMultipliers[priorityWeight] ?? 1;
  nextInterval = Math.max(1, Math.round(nextInterval * multiplier));

  nextEF = previousEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (nextEF < 1.3) nextEF = 1.3;

  return {
    q,
    repetitions: nextRepetitions,
    intervalDays: nextInterval,
    easinessFactor: Number(nextEF.toFixed(2)),
  };
}
