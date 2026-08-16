import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { assertWithinLimit, incrementUsage } from "@/lib/limits";
import { createServerSupabase } from "@/lib/supabase/server";
import { generateFlashcards, generateQuiz } from "@/lib/study/generate";
import type { CardDifficulty } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

interface Body {
  kind: "flashcards" | "quiz";
  documentId: string;
  topicId?: string | null;
  count?: number;
  mode?: string;
  difficulty?: CardDifficulty;
}

/** Kullanıcının talebiyle ek flashcard veya quiz üretir. */
export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<Body>(request);

  if (!body.documentId) {
    throw new AppError("Materyal seçmelisin.", 400, "invalid_request");
  }

  const supabase = await createServerSupabase();
  const { data: document } = await supabase
    .from("documents")
    .select("id, status")
    .eq("id", body.documentId)
    .maybeSingle();

  if (!document) throw new AppError("Materyal bulunamadı.", 404, "not_found");
  if (document.status !== "completed") {
    throw new AppError(
      "Materyal hâlâ hazırlanıyor. İşlem bitince tekrar dene.",
      409,
      "not_ready",
    );
  }

  const { data: studySet } = await supabase
    .from("study_sets")
    .select("id")
    .eq("document_id", body.documentId)
    .maybeSingle();

  let topicTitle: string | null = null;
  if (body.topicId) {
    const { data: topic } = await supabase
      .from("topics")
      .select("title")
      .eq("id", body.topicId)
      .maybeSingle();
    topicTitle = (topic?.title as string) ?? null;
  }

  if (body.kind === "flashcards") {
    const count = Math.min(Math.max(Number(body.count) || 15, 5), 50);
    await assertWithinLimit(
      profile,
      "monthly_flashcards",
      "flashcards",
      "month",
      count,
    );

    const created = await generateFlashcards({
      profile,
      documentId: body.documentId,
      studySetId: (studySet?.id as string) ?? null,
      count,
      topicId: body.topicId ?? null,
      topicTitle,
    });

    await incrementUsage(profile.id, "flashcards", "month", created);
    return NextResponse.json({ created });
  }

  if (body.kind === "quiz") {
    const count = Math.min(Math.max(Number(body.count) || 10, 3), 30);
    await assertWithinLimit(profile, "monthly_quizzes", "quizzes", "month", 1);

    const result = await generateQuiz({
      profile,
      documentId: body.documentId,
      studySetId: (studySet?.id as string) ?? null,
      count,
      mode: body.mode ?? "mixed",
      difficulty: body.difficulty,
      topicId: body.topicId ?? null,
      topicTitle,
    });

    await incrementUsage(profile.id, "quizzes", "month", 1);
    return NextResponse.json(result);
  }

  throw new AppError("Bilinmeyen üretim türü.", 400, "invalid_request");
});
