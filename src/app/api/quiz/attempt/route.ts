import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  quizId: string;
}

/** Yeni bir quiz denemesi başlatır. */
export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const { quizId } = await readJson<Body>(request);
  if (!quizId) throw new AppError("Quiz seçilmedi.", 400, "invalid_request");

  const supabase = await createServerSupabase();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, question_count")
    .eq("id", quizId)
    .maybeSingle();

  if (!quiz) throw new AppError("Quiz bulunamadı.", 404, "not_found");

  const admin = createAdminSupabase();
  const { data: attempt, error } = await admin
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      user_id: profile.id,
      total_questions: quiz.question_count,
    })
    .select("id, started_at")
    .single();

  if (error) throw new AppError("Deneme başlatılamadı.", 500, "db_error");

  return NextResponse.json({ attemptId: attempt.id, startedAt: attempt.started_at });
});
