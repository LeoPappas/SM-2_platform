import { describe, expect, it } from "vitest";
import { cleanCount, readCounts } from "./count-input";

describe("count input", () => {
  it("keeps digits only and drops leading zeros, but lets the field be empty", () => {
    expect(cleanCount("011")).toBe("11");
    expect(cleanCount("0")).toBe("0");
    expect(cleanCount("")).toBe("");
    expect(cleanCount("1,5")).toBe("15");
  });

  it("is valid only with at least one question and no more correct answers than questions", () => {
    expect(readCounts("20", "11")).toEqual({ questionCount: 20, correctCount: 11, tooManyCorrect: false, valid: true });
    expect(readCounts("20", "0").valid).toBe(true);
    expect(readCounts("", "11").valid).toBe(false);
    expect(readCounts("0", "0").valid).toBe(false);
    expect(readCounts("20", "").valid).toBe(false);
    expect(readCounts("10", "12")).toMatchObject({ tooManyCorrect: true, valid: false });
  });
});
