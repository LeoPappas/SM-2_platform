import { describe, expect, it } from "vitest";
import { calculateAccuracy, calculateBlockReview } from "./sm2";

describe("calculateAccuracy", () => {
  it("rounds correct answers into an accuracy percentage", () => {
    expect(calculateAccuracy(17, 20)).toBe(85);
    expect(calculateAccuracy(2, 3)).toBe(67);
  });

  it("returns zero when question count is invalid", () => {
    expect(calculateAccuracy(4, 0)).toBe(0);
    expect(calculateAccuracy(4, -10)).toBe(0);
  });
});

describe("calculateBlockReview", () => {
  const baseInput = {
    repetitions: 0,
    previousInterval: 1,
    previousEF: 2.5,
    daysDelayed: 0,
    priorityWeight: 3,
  };

  it("schedules a successful first contact in a few days", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 90,
        perceivedDifficulty: "Fácil",
      }),
    ).toEqual({
      q: 5,
      repetitions: 1,
      intervalDays: 3,
      easinessFactor: 2.6,
    });
  });

  it("resets the sequence after a poor result", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 35,
        perceivedDifficulty: "Médio",
      }),
    ).toEqual({
      q: 0,
      repetitions: 0,
      intervalDays: 1,
      easinessFactor: 1.7,
    });
  });

  it("shortens a good result when perceived difficulty is high", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 85,
        perceivedDifficulty: "Difícil",
      }),
    ).toEqual({
      q: 3,
      repetitions: 1,
      intervalDays: 3,
      easinessFactor: 2.36,
    });
  });

  it("uses priority to bring important blocks forward", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 90,
        perceivedDifficulty: "Fácil",
        priorityWeight: 5,
      }),
    ).toMatchObject({
      intervalDays: 2,
    });
  });

  it("uses low priority to stretch less urgent blocks", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 90,
        perceivedDifficulty: "Fácil",
        priorityWeight: 1,
      }),
    ).toMatchObject({
      intervalDays: 4,
    });
  });

  it("accounts for delayed reviews when calculating the next interval", () => {
    expect(
      calculateBlockReview({
        accuracy: 90,
        perceivedDifficulty: "Fácil",
        repetitions: 2,
        previousInterval: 6,
        previousEF: 2.5,
        daysDelayed: 4,
        priorityWeight: 3,
      }),
    ).toEqual({
      q: 5,
      repetitions: 3,
      intervalDays: 25,
      easinessFactor: 2.6,
    });
  });

  it("never lets the easiness factor fall below the SM-2 floor", () => {
    expect(
      calculateBlockReview({
        ...baseInput,
        accuracy: 0,
        perceivedDifficulty: "Muito difícil",
        previousEF: 1.31,
      }),
    ).toMatchObject({
      q: 0,
      easinessFactor: 1.3,
    });
  });
});
