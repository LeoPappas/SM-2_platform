/**
 * Question and correct-answer fields keep the text the student types, so a
 * field can be emptied and retyped; the numbers are read from it when needed.
 */

/** Digits only, without leading zeros: "011" becomes "11", "" stays empty. */
export function cleanCount(value: string) {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

export function readCounts(questions: string, correct: string) {
  const questionCount = questions === "" ? null : Number(questions);
  const correctCount = correct === "" ? null : Number(correct);
  const tooManyCorrect = questionCount !== null && correctCount !== null && correctCount > questionCount;
  return {
    questionCount,
    correctCount,
    tooManyCorrect,
    valid: questionCount !== null && questionCount >= 1 && correctCount !== null && !tooManyCorrect,
  };
}
