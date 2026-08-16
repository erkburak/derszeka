import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { runStructured } from "@/lib/ai/service";
import { guidedStudyPrompt, withContext } from "@/lib/ai/prompts";
import { guidedStepSchema } from "@/lib/ai/schemas";
import { buildContext, retrieveRelevantChunks } from "@/lib/rag/retrieval";
import { hasFeature } from "@/lib/limits";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { recordStudySession, recordTopicOutcome } from "@/lib/study/progress";
import type { SourceRef } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const DIFFICULTY_LABELS = ["çok kolay", "kolay", "orta", "zor"];

interface Body {
  sessionId?: string;
  documentId?: string;
  topicId?: string | null;
  answer?: string;
  finish?: boolean;
}

interface TranscriptEntry {
  role: "tutor" | "student";
  text: string;
}

interface GuidedStep {
  phase: "teach" | "question" | "evaluate" | "recap" | "finished";
  message: string;
  question: string;
  options: string[];
  expected_answer: string;
  evaluation: { was_correct: boolean; feedback: string };
  difficulty_delta: number;
  progress: number;
  citations: SourceRef[];
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  if (!(await hasFeature(profile.plan, "feature_guided_mode"))) {
    throw new AppError(
      "Çalışma modu planında bulunmuyor.",
      402,
      "feature_unavailable",
    );
  }

  const body = await readJson<Body>(request);
  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  interface SessionRow {
    id: string;
    document_id: string;
    topic_id: string | null;
    step: number;
    difficulty_level: number;
    correct_streak: number;
    wrong_streak: number;
    transcript: TranscriptEntry[];
    state: Record<string, unknown>;
  }

  let session: SessionRow;

  if (body.sessionId) {
    const { data } = await supabase
      .from("guided_sessions")
      .select("*")
      .eq("id", body.sessionId)
      .maybeSingle();
    if (!data) throw new AppError("Çalışma oturumu bulunamadı.", 404, "not_found");
    session = data as unknown as SessionRow;
  } else {
    if (!body.documentId) {
      throw new AppError("Materyal seçmelisin.", 400, "invalid_request");
    }
    const { data: document } = await supabase
      .from("documents")
      .select("id, status")
      .eq("id", body.documentId)
      .maybeSingle();
    if (!document) throw new AppError("Materyal bulunamadı.", 404, "not_found");
    if (document.status !== "completed") {
      throw new AppError(
        "Bu materyal hâlâ hazırlanıyor. Birkaç dakika sonra tekrar dene.",
        409,
        "not_ready",
      );
    }

    const { data: created, error } = await admin
      .from("guided_sessions")
      .insert({
        user_id: profile.id,
        document_id: body.documentId,
        topic_id: body.topicId ?? null,
      })
      .select("*")
      .single();
    if (error) throw new AppError("Oturum başlatılamadı.", 500, "db_error");
    session = created as unknown as SessionRow;
  }

  if (body.finish) {
    await admin
      .from("guided_sessions")
      .update({ status: "completed" })
      .eq("id", session.id);
    return NextResponse.json({ finished: true });
  }

  const transcript: TranscriptEntry[] = Array.isArray(session.transcript)
    ? session.transcript
    : [];
  const answer = (body.answer ?? "").trim();
  if (answer) transcript.push({ role: "student", text: answer });

  const { data: topic } = session.topic_id
    ? await admin
        .from("topics")
        .select("title, description")
        .eq("id", session.topic_id)
        .maybeSingle()
    : { data: null };

  const lastQuestion = [...transcript]
    .reverse()
    .find((entry) => entry.role === "tutor")?.text;

  const query = topic?.title
    ? `${topic.title} ${answer || lastQuestion || ""}`.trim()
    : (answer || lastQuestion || "genel konu özeti");

  const chunks = await retrieveRelevantChunks({
    profile,
    query,
    documentIds: [session.document_id],
    topK: 6,
  });
  const { context } = await buildContext(chunks);

  const difficultyLabel =
    DIFFICULTY_LABELS[Math.min(Math.max(session.difficulty_level - 1, 0), 3)];

  const historyText = transcript
    .slice(-10)
    .map((entry) => `${entry.role === "tutor" ? "ÖĞRETMEN" : "ÖĞRENCİ"}: ${entry.text}`)
    .join("\n");

  const instruction = [
    `Adım: ${session.step + 1}`,
    `Hedef zorluk: ${difficultyLabel}`,
    topic?.title ? `Konu: ${topic.title}` : "Konu: materyalin tamamı",
    transcript.length === 0
      ? "Bu ilk adım. Konuyu tanıtan kısa bir anlatımla başla ve ardından bir soru sor."
      : "Öğrencinin son cevabını değerlendir, gerekiyorsa eksik kısmı yeniden anlat ve yeni bir soru sor.",
    historyText ? `\nÖNCEKİ KONUŞMA:\n${historyText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { data: step } = await runStructured<GuidedStep>({
    profile,
    operation: "GUIDED_STUDY",
    documentId: session.document_id,
    system: guidedStudyPrompt,
    jsonSchema: guidedStepSchema,
    maxOutputTokens: 3000,
    messages: [{ role: "user", content: withContext(context, instruction) }],
  });

  transcript.push({
    role: "tutor",
    text: step.question ? `${step.message}\n\n${step.question}` : step.message,
  });

  const wasCorrect = answer ? Boolean(step.evaluation?.was_correct) : null;
  const correctStreak = wasCorrect === true ? session.correct_streak + 1 : 0;
  const wrongStreak = wasCorrect === false ? session.wrong_streak + 1 : 0;

  // Zorluk hem modelin önerisiyle hem de seri sonuçlarla ayarlanır.
  let difficulty = session.difficulty_level + (step.difficulty_delta || 0);
  if (correctStreak >= 2) difficulty += 1;
  if (wrongStreak >= 2) difficulty -= 1;
  difficulty = Math.min(Math.max(difficulty, 1), 4);

  await admin
    .from("guided_sessions")
    .update({
      step: session.step + 1,
      difficulty_level: difficulty,
      correct_streak: correctStreak,
      wrong_streak: wrongStreak,
      transcript,
      status: step.phase === "finished" ? "completed" : "active",
      state: { last_expected_answer: step.expected_answer, progress: step.progress },
    })
    .eq("id", session.id);

  if (wasCorrect !== null) {
    await recordTopicOutcome({
      userId: profile.id,
      documentId: session.document_id,
      topicId: session.topic_id,
      correct: wasCorrect,
    });
  }

  if (step.phase === "finished") {
    await recordStudySession({
      userId: profile.id,
      documentId: session.document_id,
      topicId: session.topic_id,
      mode: "guided",
      durationSeconds: (session.step + 1) * 90,
      xp: (session.step + 1) * 8,
    });
  }

  return NextResponse.json({
    sessionId: session.id,
    phase: step.phase,
    message: step.message,
    question: step.question,
    options: step.options ?? [],
    evaluation: answer ? step.evaluation : null,
    progress: Math.min(Math.max(step.progress ?? 0, 0), 100),
    difficulty,
    citations: step.citations ?? [],
  });
});
