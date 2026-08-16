import "server-only";

import { runStructured } from "@/lib/ai/service";
import { answerEvaluationPrompt } from "@/lib/ai/prompts";
import { answerEvaluationSchema } from "@/lib/ai/schemas";
import type { Profile, QuizQuestion } from "@/lib/types";

export interface GradeResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  usedAI: boolean;
}

/** Türkçe karakterleri ve noktalamayı normalize ederek karşılaştırma yapar. */
function normalize(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,;:!?"'`()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePairs(value: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const line of value.split(/\r?\n/)) {
    const [left, right] = line.split("=");
    if (left && right) pairs.set(normalize(left), normalize(right));
  }
  return pairs;
}

/**
 * Objektif sorular kod ile, açık uçlu sorular yapay zekâ ile değerlendirilir.
 * Böylece her cevap için gereksiz AI çağrısı yapılmaz.
 */
export async function gradeAnswer(params: {
  profile: Profile;
  question: QuizQuestion;
  userAnswer: string;
  skipQuota?: boolean;
}): Promise<GradeResult> {
  const expected = params.question.correct_answer?.value ?? "";
  const given = params.userAnswer ?? "";

  if (!given.trim()) {
    return {
      isCorrect: false,
      score: 0,
      feedback: "Bu soruyu boş bıraktın. Doğru cevabı ve açıklamasını inceleyebilirsin.",
      usedAI: false,
    };
  }

  if (
    params.question.q_type === "multiple_choice" ||
    params.question.q_type === "true_false"
  ) {
    const isCorrect = normalize(given) === normalize(expected);
    return {
      isCorrect,
      score: isCorrect ? 1 : 0,
      feedback: params.question.explanation ?? "",
      usedAI: false,
    };
  }

  if (params.question.q_type === "matching") {
    const expectedPairs = parsePairs(expected);
    const givenPairs = parsePairs(given);
    let correct = 0;
    for (const [left, right] of expectedPairs) {
      if (givenPairs.get(left) === right) correct += 1;
    }
    const score = expectedPairs.size > 0 ? correct / expectedPairs.size : 0;
    return {
      isCorrect: score === 1,
      score: Number(score.toFixed(2)),
      feedback:
        score === 1
          ? (params.question.explanation ?? "Tüm eşleştirmeler doğru.")
          : `${correct}/${expectedPairs.size} eşleştirme doğru. ${params.question.explanation ?? ""}`.trim(),
      usedAI: false,
    };
  }

  // Kısa cevap / boşluk doldurma: birebir eşleşiyorsa AI'ya gitmeye gerek yok.
  if (
    params.question.q_type !== "open_ended" &&
    normalize(given) === normalize(expected)
  ) {
    return {
      isCorrect: true,
      score: 1,
      feedback: params.question.explanation ?? "Doğru cevap.",
      usedAI: false,
    };
  }

  const { data } = await runStructured<{
    is_correct: boolean;
    score: number;
    feedback: string;
    missing_points: string[];
  }>({
    profile: params.profile,
    operation: "ANSWER_EVALUATION",
    system: answerEvaluationPrompt,
    jsonSchema: answerEvaluationSchema,
    maxOutputTokens: 1500,
    skipQuota: params.skipQuota,
    messages: [
      {
        role: "user",
        content: [
          `SORU: ${params.question.prompt}`,
          `BEKLENEN CEVAP: ${expected}`,
          params.question.explanation
            ? `AÇIKLAMA: ${params.question.explanation}`
            : "",
          `ÖĞRENCİNİN CEVABI: ${given}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const missing =
    data.missing_points?.length > 0
      ? `\n\nEksik kalan noktalar:\n${data.missing_points.map((point) => `• ${point}`).join("\n")}`
      : "";

  return {
    isCorrect: Boolean(data.is_correct),
    score: Math.min(Math.max(Number(data.score) || 0, 0), 1),
    feedback: `${data.feedback}${missing}`,
    usedAI: true,
  };
}
