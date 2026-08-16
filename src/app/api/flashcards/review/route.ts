import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import {
  DEFAULT_SRS_STATE,
  scheduleNextReview,
} from "@/lib/study/spaced-repetition";
import { awardBadges, recordTopicOutcome } from "@/lib/study/progress";
import type { CardResult } from "@/lib/types";

export const runtime = "nodejs";

interface Body {
  flashcardId: string;
  result: CardResult;
  responseMs?: number;
}

const VALID: CardResult[] = ["known", "unsure", "unknown"];

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<Body>(request);

  if (!body.flashcardId || !VALID.includes(body.result)) {
    throw new AppError("Geçersiz değerlendirme.", 400, "invalid_review");
  }

  // Sahiplik RLS ile doğrulanır.
  const supabase = await createServerSupabase();
  const { data: card } = await supabase
    .from("flashcards")
    .select("id, topic_id, document_id")
    .eq("id", body.flashcardId)
    .maybeSingle();

  if (!card) throw new AppError("Kart bulunamadı.", 404, "not_found");

  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("flashcard_progress")
    .select("ease_factor, interval_days, repetitions, lapses, review_count")
    .eq("flashcard_id", card.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  const state = existing
    ? {
        easeFactor: Number(existing.ease_factor),
        intervalDays: Number(existing.interval_days),
        repetitions: Number(existing.repetitions),
        lapses: Number(existing.lapses),
      }
    : DEFAULT_SRS_STATE;

  const next = scheduleNextReview(state, body.result);

  await admin.from("flashcard_progress").upsert(
    {
      flashcard_id: card.id,
      user_id: profile.id,
      ease_factor: next.easeFactor,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      review_count: Number(existing?.review_count ?? 0) + 1,
      last_result: body.result,
      last_reviewed_at: new Date().toISOString(),
      due_at: next.dueAt.toISOString(),
    },
    { onConflict: "flashcard_id,user_id" },
  );

  await admin.from("flashcard_review_logs").insert({
    flashcard_id: card.id,
    user_id: profile.id,
    result: body.result,
    response_ms: body.responseMs ?? null,
  });

  await recordTopicOutcome({
    userId: profile.id,
    documentId: card.document_id as string,
    topicId: (card.topic_id as string | null) ?? null,
    correct: body.result === "known",
  });

  await awardBadges(profile.id);

  return NextResponse.json({
    dueAt: next.dueAt.toISOString(),
    intervalDays: next.intervalDays,
    repetitions: next.repetitions,
  });
});
