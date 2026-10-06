import { format, startOfWeek, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";
export { planningToday as todayInTimezone } from "./planning-date";

type QuestionSample = { question_count: number; correct_count: number };
type DatedQuestionSample = QuestionSample & { review_date: string };

export function questionWeightedAccuracy(samples: readonly QuestionSample[]) {
  const measured = samples.filter(sample => Number.isFinite(sample.question_count)
    && sample.question_count > 0
    && Number.isFinite(sample.correct_count)
    && sample.correct_count >= 0
    && sample.correct_count <= sample.question_count);
  const questionCount = measured.reduce((total, sample) => total + sample.question_count, 0);
  const correctCount = measured.reduce((total, sample) => total + sample.correct_count, 0);
  return {
    accuracy: questionCount > 0 ? Math.round(correctCount / questionCount * 100) : null,
    questionCount,
    correctCount,
    sampleCount: measured.length,
  };
}

export function buildWeeklyPerformanceTrend({
  reviews,
  referenceDate,
  weekStartsOn = 1,
}: {
  reviews: readonly DatedQuestionSample[];
  referenceDate: string;
  weekStartsOn?: number;
}) {
  const weekStart = (Number.isInteger(weekStartsOn) && weekStartsOn >= 0 && weekStartsOn <= 6
    ? weekStartsOn : 1) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const options = { weekStartsOn: weekStart };
  const currentWeek = startOfWeek(new Date(`${referenceDate}T12:00:00`), options);
  return Array.from({ length: 8 }, (_, index) => {
    const start = subWeeks(currentWeek, 7 - index);
    const key = format(start, "yyyy-MM-dd");
    const weekReviews = reviews.filter(review => format(startOfWeek(new Date(`${review.review_date}T12:00:00`), options), "yyyy-MM-dd") === key);
    const accuracy = questionWeightedAccuracy(weekReviews);
    return {
      key,
      label: format(start, "dd/MM", { locale: ptBR }),
      count: weekReviews.length,
      average: accuracy.accuracy,
      questionCount: accuracy.questionCount,
      correctCount: accuracy.correctCount,
    };
  });
}
