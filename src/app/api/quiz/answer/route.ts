import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { gradeAnswer } from "@/lib/study/grading";
import { recordTopicOutcome } from "@/lib/study/progress";
import type { QuizQuestion } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  attemptId: string;
  questionId: string;
  answer: string;
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<Body>(request);

  if (!body.attemptId || !body.questionId) {
    throw new AppError("Eksik cevap bilgisi.", 400, "invalid_request");
  }

  const supabase = await createServerSupabase();

  const [{ data: attempt }, { data: question }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("id, quiz_id, completed_at")
      .eq("id", body.attemptId)
      .maybeSingle(),
    supabase
      .from("quiz_questions")
      .select("*")
      .eq("id", body.questionId)
      .maybeSingle(),
  ]);

  if (!attempt) throw new AppError("Deneme bulunamadı.", 404, "not_found");
  if (attempt.completed_at) {
    throw new AppError("Bu deneme zaten tamamlandı.", 409, "attempt_closed");
  }
  if (!question) throw new AppError("Soru bulunamadı.", 404, "not_found");

  const admin = createAdminSupabase();
  const { data: alreadyAnswered } = await admin
    .from("quiz_answers")
    .select("id")
    .eq("attempt_id", body.attemptId)
    .eq("question_id", body.questionId)
    .maybeSingle();

  if (alreadyAnswered) {
    throw new AppError("Bu soruyu zaten cevapladın.", 409, "already_answered");
  }

  const grade = await gradeAnswer({
    profile,
    question: question as QuizQuestion,
    userAnswer: body.answer ?? "",
  });

  await admin.from("quiz_answers").insert({
    attempt_id: body.attemptId,
    question_id: body.questionId,
    user_id: profile.id,
    user_answer: { value: body.answer ?? "" },
    is_correct: grade.isCorrect,
    score: grade.score,
    ai_feedback: grade.feedback,
  });

  const { data: quiz } = await admin
    .from("quizzes")
    .select("document_id, topic_id")
    .eq("id", attempt.quiz_id)
    .single();

  if (quiz) {
    await recordTopicOutcome({
      userId: profile.id,
      documentId: quiz.document_id as string,
      topicId: (quiz.topic_id as string | null) ?? null,
      correct: grade.isCorrect,
    });
  }

  return NextResponse.json({
    isCorrect: grade.isCorrect,
    score: grade.score,
    feedback: grade.feedback,
    correctAnswer: (question as QuizQuestion).correct_answer?.value ?? "",
    explanation: (question as QuizQuestion).explanation,
    source: (question as QuizQuestion).source_ref,
  });
});
