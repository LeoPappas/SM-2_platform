import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELEVANCE_EXPERIMENT,
  calculateRelevanceShadowInterval,
  relevanceToIntervalFactor,
} from "./relevance-engine";
import { calculateNextInterval } from "./revision-engine";

describe("numeric relevance shadow experiment", () => {
  it("maps the 1–10 range linearly from 1.2 to 0.8", () => {
    expect(relevanceToIntervalFactor(1)).toBeCloseTo(1.2, 10);
    expect(relevanceToIntervalFactor(5.5)).toBeCloseTo(1, 10);
    expect(relevanceToIntervalFactor(10)).toBeCloseTo(0.8, 10);
  });

  it("clamps scores to the declared experimental bounds", () => {
    expect(relevanceToIntervalFactor(-5)).toBeCloseTo(1.2, 10);
    expect(relevanceToIntervalFactor(12)).toBeCloseTo(0.8, 10);
  });

  it("keeps the first contact unchanged", () => {
    const active = calculateNextInterval({
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      importance: "alta",
      isFirstContact: true,
    });
    const shadow = calculateRelevanceShadowInterval({
      relevanceScore: 10,
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      legacyImportance: "alta",
      isFirstContact: true,
    });

    expect(shadow.intervalDays).toBe(active.intervalDays);
    expect(shadow.relevanceFactor).toBeCloseTo(0.8, 10);
  });

  it("replaces the categorical interval factor without multiplying both", () => {
    const high = calculateRelevanceShadowInterval({
      relevanceScore: 10,
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      legacyImportance: "baixa",
      previousIntervalDays: 30,
      isFirstContact: false,
    });
    const low = calculateRelevanceShadowInterval({
      relevanceScore: 1,
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      legacyImportance: "alta",
      previousIntervalDays: 30,
      isFirstContact: false,
    });

    expect(high.rawIntervalDays).toBeCloseTo(72, 10);
    expect(low.rawIntervalDays).toBeCloseTo(108, 10);
    expect(high.intervalDays).toBe(72);
    expect(low.intervalDays).toBe(108);
  });

  it("rejects invalid experimental ranges", () => {
    expect(() => relevanceToIntervalFactor(5, {
      ...DEFAULT_RELEVANCE_EXPERIMENT,
      minimumScore: 10,
      maximumScore: 1,
    })).toThrow("faixa de relevância");
  });

  it("snapshots custom experimental bounds with a stable formula identifier", () => {
    const relevanceConfig = {
      ...DEFAULT_RELEVANCE_EXPERIMENT,
      minimumFactor: 0.7,
      maximumFactor: 1.3,
    };
    const result = calculateRelevanceShadowInterval({
      relevanceScore: 7,
      questionCount: 20,
      correctCount: 16,
      perceivedDifficulty: "Médio",
      legacyImportance: "media",
      previousIntervalDays: 30,
      isFirstContact: false,
      relevanceConfig,
    });

    expect(result.formulaVersion).toBe("global-linear-bounded-v1");
    expect(result.relevanceConfig).toEqual(relevanceConfig);
    expect(result.relevanceConfig).not.toBe(relevanceConfig);
  });
});
