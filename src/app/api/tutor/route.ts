import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { runChat } from "@/lib/ai/service";
import { tutorPrompt, withContext } from "@/lib/ai/prompts";
import { buildContext, retrieveRelevantChunks } from "@/lib/rag/retrieval";
import { assertWithinLimit, incrementUsage } from "@/lib/limits";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { recordStudySession } from "@/lib/study/progress";
import type { AIMessage } from "@/lib/ai/provider";

export const runtime = "nodejs";
export const maxDuration = 120;

const HISTORY_LIMIT = 12;

interface Body {
  conversationId?: string;
  documentIds?: string[];
  message: string;
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<Body>(request);

  const message = (body.message ?? "").trim();
  if (!message) throw new AppError("Bir mesaj yazmalısın.", 400, "empty_message");
  if (message.length > 4000) {
    throw new AppError("Mesajın çok uzun (en fazla 4000 karakter).", 400, "too_long");
  }

  await assertWithinLimit(
    profile,
    "daily_tutor_messages",
    "tutor_messages",
    "day",
  );

  const supabase = await createServerSupabase();
  const admin = createAdminSupabase();

  let conversationId = body.conversationId ?? null;
  let documentIds = body.documentIds?.filter(Boolean) ?? [];

  if (conversationId) {
    const { data: conversation } = await supabase
      .from("tutor_conversations")
      .select("id, document_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation) {
      throw new AppError("Sohbet bulunamadı.", 404, "not_found");
    }
    if (documentIds.length === 0 && conversation.document_id) {
      documentIds = [conversation.document_id as string];
    }
  } else {
    const { data: conversation, error } = await admin
      .from("tutor_conversations")
      .insert({
        user_id: profile.id,
        document_id: documentIds[0] ?? null,
        title: message.slice(0, 60),
      })
      .select("id")
      .single();
    if (error) throw new AppError("Sohbet başlatılamadı.", 500, "db_error");
    conversationId = conversation.id as string;
  }

  // RAG: tüm materyali değil, soruyla ilgili parçaları modele gönder.
  const chunks = await retrieveRelevantChunks({
    profile,
    query: message,
    documentIds: documentIds.length > 0 ? documentIds : null,
  });
  const { context, citations } = await buildContext(chunks);

  const { data: history } = await admin
    .from("tutor_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const messages: AIMessage[] = (history ?? [])
    .reverse()
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({
      role: row.role as "user" | "assistant",
      content: row.content as string,
    }));

  messages.push({ role: "user", content: withContext(context, message) });

  const response = await runChat({
    profile,
    operation: "AI_TUTOR",
    documentId: documentIds[0] ?? null,
    system: tutorPrompt,
    messages,
    maxOutputTokens: 4000,
  });

  await admin.from("tutor_messages").insert([
    {
      conversation_id: conversationId,
      user_id: profile.id,
      role: "user",
      content: message,
    },
    {
      conversation_id: conversationId,
      user_id: profile.id,
      role: "assistant",
      content: response.text,
      citations,
    },
  ]);

  await admin
    .from("tutor_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  await incrementUsage(profile.id, "tutor_messages", "day", 1);
  await recordStudySession({
    userId: profile.id,
    documentId: documentIds[0] ?? null,
    mode: "tutor",
    durationSeconds: 60,
    xp: 5,
  });

  return NextResponse.json({
    conversationId,
    reply: response.text,
    citations,
  });
});
