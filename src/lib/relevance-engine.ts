import type { DifficultyRating, Importance } from "./database.types";
import {
  DEFAULT_ENGINE_CONFIG,
  calculateNextInterval,
  type EngineConfig,
  type IntervalCalculationResult,
} from "./revision-engine";

export const RELEVANCE_FORMULA_VERSION = "global-linear-bounded-v1";

export type RelevanceExperimentConfig = {
  minimumScore: number;
  maximumScore: number;
  minimumFactor: number;
  maximumFactor: number;
};

export const DEFAULT_RELEVANCE_EXPERIMENT: RelevanceExperimentConfig = {
  minimumScore: 1,
  maximumScore: 10,
  minimumFactor: 0.8,
  maximumFactor: 1.2,
};

export type RelevanceShadowInput = {
  relevanceScore: number;
  questionCount: number;
  correctCount: number;
  perceivedDifficulty: DifficultyRating;
  /** Only identifies which legacy factor is replaced in the cloned config. */
  legacyImportance: Importance;
  previousIntervalDays?: number;
  isFirstContact: boolean;
  reviewDate?: string;
  examDate?: string | null;
  engineConfig?: EngineConfig;
  relevanceConfig?: RelevanceExperimentConfig;
};

export type RelevanceShadowResult = IntervalCalculationResult & {
  relevanceScore: number;
  relevanceFactor: number;
  formulaVersion: typeof RELEVANCE_FORMULA_VERSION;
  relevanceConfig: RelevanceExperimentConfig;
};

/**
 * Maps a published 1–10 relevance score to a conservative interval factor.
 * A higher relevance shortens the interval. Inputs outside the configured
 * range are clamped so malformed experimental calls cannot escape the bounds.
 */
export function relevanceToIntervalFactor(
  score: number,
  config: RelevanceExperimentConfig = DEFAULT_RELEVANCE_EXPERIMENT,
) {
  validateConfig(config);
  if (!Number.isFinite(score)) throw new Error("A relevância precisa ser um número finito.");

  const clampedScore = Math.min(config.maximumScore, Math.max(config.minimumScore, score));
  const position = (clampedScore - config.minimumScore) / (config.maximumScore - config.minimumScore);
  return config.maximumFactor - position * (config.maximumFactor - config.minimumFactor);
}

/**
 * Calculates the numeric-relevance candidate without changing the active
 * engine configuration or persisted schedule. First contacts intentionally
 * remain unchanged in this experiment.
 */
export function calculateRelevanceShadowInterval({
  relevanceScore,
  questionCount,
  correctCount,
  perceivedDifficulty,
  legacyImportance,
  previousIntervalDays,
  isFirstContact,
  reviewDate,
  examDate,
  engineConfig = DEFAULT_ENGINE_CONFIG,
  relevanceConfig = DEFAULT_RELEVANCE_EXPERIMENT,
}: RelevanceShadowInput): RelevanceShadowResult {
  const relevanceFactor = relevanceToIntervalFactor(relevanceScore, relevanceConfig);
  const shadowConfig: EngineConfig = {
    ...engineConfig,
    importanceFactors: {
      ...engineConfig.importanceFactors,
      [legacyImportance]: relevanceFactor,
    },
  };
  const result = calculateNextInterval({
    questionCount,
    correctCount,
    perceivedDifficulty,
    importance: legacyImportance,
    previousIntervalDays,
    isFirstContact,
    reviewDate,
    examDate,
    config: shadowConfig,
  });

  return {
    ...result,
    relevanceScore,
    relevanceFactor,
    formulaVersion: RELEVANCE_FORMULA_VERSION,
    relevanceConfig: { ...relevanceConfig },
  };
}

function validateConfig(config: RelevanceExperimentConfig) {
  if (!Number.isFinite(config.minimumScore)
    || !Number.isFinite(config.maximumScore)
    || config.minimumScore >= config.maximumScore) {
    throw new Error("A faixa de relevância é inválida.");
  }
  if (!Number.isFinite(config.minimumFactor)
    || !Number.isFinite(config.maximumFactor)
    || config.minimumFactor <= 0
    || config.minimumFactor > config.maximumFactor) {
    throw new Error("A faixa do multiplicador é inválida.");
  }
}
