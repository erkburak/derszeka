import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { getLimit } from "@/lib/limits";
import { extractDocument } from "@/lib/documents/extract";
import { chunkPages } from "@/lib/documents/chunk";
import { embedAndStoreChunks } from "@/lib/rag/retrieval";
import { generateFlashcards, generateQuiz, generateStudySet } from "@/lib/study/generate";
import { AIProviderError } from "@/lib/ai/errors";
import { sendTemplatedEmail, type EmailTemplateKey } from "@/lib/email/send";
import { queueDocumentReadyEmail } from "@/lib/email/triggers";
import { awardBadges } from "@/lib/study/progress";
import type { DocumentStatus, ProcessingJob, Profile } from "@/lib/types";

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const LEASE_SECONDS = 600;

/** Kullanıcıya gösterilen aşama metinleri. */
const STAGE_MESSAGES: Record<DocumentStatus, string> = {
  queued: "Sıraya alındı...",
  extracting: "Metin ve görseller inceleniyor...",
  embedding: "İçerik aranabilir hale getiriliyor...",
  analyzing: "Konular ve önemli bilgiler belirleniyor...",
  generating: "Flashcard ve quiz hazırlanıyor...",
  completed: "Çalışma materyalin hazır!",
  failed: "İşlem tamamlanamadı.",
};

async function setStage(
  documentId: string,
  status: DocumentStatus,
  progress: number,
) {
  const supabase = createAdminSupabase();
  await supabase
    .from("documents")
    .update({
      status,
      progress,
      status_message: STAGE_MESSAGES[status],
      ...(status === "completed"
        ? { processing_completed_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", documentId);
}

async function loadProfile(userId: string): Promise<Profile> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`Kullanıcı bulunamadı: ${error.message}`);
  return data as Profile;
}

async function stageExtract(profile: Profile, documentId: string) {
  const supabase = createAdminSupabase();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path, mime_type, source_kind")
    .eq("id", documentId)
    .single();

  if (!doc) throw new Error("Materyal bulunamadı.");

  // Yapıştırılan metin yükleme sırasında zaten sayfalara yazıldı.
  if (doc.source_kind === "pasted_text") return;
  if (!doc.storage_path) throw new Error("Dosya yolu bulunamadı.");

  const { data: file, error } = await supabase.storage
    .from("documents")
    .download(doc.storage_path as string);
  if (error || !file) throw new Error(`Dosya indirilemedi: ${error?.message}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  const maxPages = await getLimit(profile.plan, "max_pages_per_document");

  const result = await extractDocument({
    buffer,
    mimeType: doc.mime_type as string,
    profile,
    documentId,
    maxPages,
  });

  if (result.pages.length === 0) {
    throw new Error("Bu dosyadan okunabilir metin çıkarılamadı.");
  }

  await supabase.from("document_pages").delete().eq("document_id", documentId);
  await supabase.from("document_pages").insert(
    result.pages.map((page) => ({
      document_id: documentId,
      owner_id: profile.id,
      page_number: page.pageNumber,
      content: page.content,
      extraction_method: page.method,
    })),
  );

  await supabase
    .from("documents")
    .update({
      page_count: result.pages.length,
      char_count: result.charCount,
      extraction_method: result.method,
    })
    .eq("id", documentId);
}

async function stageEmbed(profile: Profile, documentId: string) {
  const supabase = createAdminSupabase();
  const settings = await getSettings();

  const { data: pages } = await supabase
    .from("document_pages")
    .select("page_number, content, extraction_method")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });

  const chunks = chunkPages(
    (pages ?? []).map((page) => ({
      pageNumber: page.page_number as number,
      content: page.content as string,
      method: page.extraction_method as "text" | "vision" | "ocr",
    })),
    {
      chunkSize: Number(settings.rag_chunk_size),
      overlap: Number(settings.rag_chunk_overlap),
    },
  );

  if (chunks.length === 0) return;

  await supabase.from("document_chunks").delete().eq("document_id", documentId);
  const { data: inserted, error } = await supabase
    .from("document_chunks")
    .insert(
      chunks.map((chunk) => ({
        document_id: documentId,
        owner_id: profile.id,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        token_estimate: chunk.tokenEstimate,
        page_from: chunk.pageFrom,
        page_to: chunk.pageTo,
        section_title: chunk.sectionTitle,
      })),
    )
    .select("id, chunk_index");

  if (error) throw new Error(`Parçalar kaydedilemedi: ${error.message}`);

  const ordered = (inserted ?? []).sort(
    (a, b) => (a.chunk_index as number) - (b.chunk_index as number),
  );

  await embedAndStoreChunks({
    profile,
    documentId,
    chunkIds: ordered.map((row) => row.id as string),
    contents: chunks.map((chunk) => chunk.content),
  });
}

async function stageAnalyze(profile: Profile, documentId: string) {
  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("study_sets")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { studySetId } = await generateStudySet({ profile, documentId });
  return studySetId;
}

async function stageGenerate(profile: Profile, documentId: string) {
  const supabase = createAdminSupabase();
  const { data: studySet } = await supabase
    .from("study_sets")
    .select("id")
    .eq("document_id", documentId)
    .maybeSingle();

  const studySetId = (studySet?.id as string) ?? null;
  const isPremium = profile.plan === "premium";

  const { count: cardCount } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);

  if ((cardCount ?? 0) === 0) {
    await generateFlashcards({
      profile,
      documentId,
      studySetId,
      count: isPremium ? 30 : 15,
      skipQuota: true,
    });
  }

  const { count: quizCount } = await supabase
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId);

  if ((quizCount ?? 0) === 0) {
    await generateQuiz({
      profile,
      documentId,
      studySetId,
      count: isPremium ? 15 : 8,
      mode: "mixed",
      skipQuota: true,
    });
  }
}

/**
 * Aşamalı pipeline. Her aşama bittiğinde belge durumu güncellenir;
 * iş yarıda kalırsa yeniden denemede kaldığı aşamadan devam eder.
 */
async function processDocument(job: ProcessingJob) {
  const documentId = job.document_id;
  const userId = job.user_id;
  if (!documentId || !userId) throw new Error("Eksik iş parametreleri.");

  const profile = await loadProfile(userId);
  const supabase = createAdminSupabase();

  const { data: doc } = await supabase
    .from("documents")
    .select("status")
    .eq("id", documentId)
    .single();

  let status = (doc?.status as DocumentStatus) ?? "queued";

  if (status === "queued" || status === "failed") {
    await supabase
      .from("documents")
      .update({ processing_started_at: new Date().toISOString(), error_message: null })
      .eq("id", documentId);
    await setStage(documentId, "extracting", 10);
    status = "extracting";
  }

  if (status === "extracting") {
    await stageExtract(profile, documentId);
    await setStage(documentId, "embedding", 35);
    status = "embedding";
  }

  if (status === "embedding") {
    await stageEmbed(profile, documentId);
    await setStage(documentId, "analyzing", 55);
    status = "analyzing";
  }

  if (status === "analyzing") {
    await stageAnalyze(profile, documentId);
    await setStage(documentId, "generating", 75);
    status = "generating";
  }

  if (status === "generating") {
    await stageGenerate(profile, documentId);
    await setStage(documentId, "completed", 100);
  }

  const { data: finished } = await supabase
    .from("documents")
    .select("title")
    .eq("id", documentId)
    .maybeSingle();

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "success",
    title: "Çalışma materyalin hazır",
    body: `"${finished?.title ?? "Materyal"}" için özet, flashcard ve quiz oluşturuldu.`,
    link: `/materials/${documentId}`,
  });

  await queueDocumentReadyEmail(
    userId,
    documentId,
    (finished?.title as string) ?? "Materyal",
  );
  await awardBadges(userId);
}

/** Kuyruğa alınmış e-postayı gönderir; başarısızsa iş yeniden denenir. */
async function processEmail(job: ProcessingJob) {
  const payload = job.payload as {
    to: string;
    templateKey: EmailTemplateKey;
    variables: Record<string, string>;
    transactional?: boolean;
    userId?: string | null;
  };

  if (!payload?.to || !payload?.templateKey) {
    throw new Error("Eksik e-posta parametreleri.");
  }

  await sendTemplatedEmail({
    to: payload.to,
    templateKey: payload.templateKey,
    variables: payload.variables ?? {},
    transactional: payload.transactional,
    userId: payload.userId ?? job.user_id,
  });
}

async function markJobResult(
  job: ProcessingJob,
  outcome: "completed" | "failed",
  error?: string,
  options: { retryable?: boolean; userMessage?: string } = {},
) {
  const supabase = createAdminSupabase();
  const canRetry =
    outcome === "failed" &&
    options.retryable !== false &&
    job.attempts < job.max_attempts;

  await supabase
    .from("processing_jobs")
    .update({
      status: canRetry ? "queued" : outcome,
      last_error: error ?? null,
      locked_at: null,
      locked_by: null,
      run_after: canRetry
        ? new Date(Date.now() + 2 ** job.attempts * 15_000).toISOString()
        : job.run_after,
    })
    .eq("id", job.id);

  if (outcome === "failed" && !canRetry && job.document_id) {
    await supabase
      .from("documents")
      .update({
        status: "failed",
        status_message: STAGE_MESSAGES.failed,
        error_message:
          options.userMessage ??
          "Materyal işlenirken bir sorun oluştu. Dosyayı tekrar yüklemeyi deneyebilirsin.",
        progress: 0,
      })
      .eq("id", job.document_id);

    if (job.user_id) {
      await supabase.from("notifications").insert({
        user_id: job.user_id,
        type: "error",
        title: "Materyal işlenemedi",
        body:
          options.userMessage ??
          "Dosyanı tekrar yüklemeyi veya farklı bir format denemeyi öneririz.",
        link: `/materials/${job.document_id}`,
      });
    }
  }
}

/** Kuyruktan bir iş alıp işler. İş yoksa null döner. */
export async function runNextJob(): Promise<{ id: string; type: string } | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("claim_job", {
    p_worker: WORKER_ID,
    p_lease_seconds: LEASE_SECONDS,
  });

  if (error) throw new Error(`İş alınamadı: ${error.message}`);
  const job = (data as ProcessingJob[] | null)?.[0];
  if (!job) return null;

  try {
    switch (job.job_type) {
      case "document.process":
      case "document.regenerate":
        await processDocument(job);
        break;
      case "email.send":
        await processEmail(job);
        break;
      default:
        throw new Error(`Bilinmeyen iş türü: ${job.job_type}`);
    }
    await markJobResult(job, "completed");
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);

    // Yapılandırma hatalarını (eksik API anahtarı gibi) tekrar denemek
    // anlamsız; kullanıcıyı bekletmeden net mesajla bitir.
    const aiError = caught instanceof AIProviderError ? caught : null;
    const retryable = aiError ? aiError.retryable : true;
    const userMessage =
      aiError?.code === "auth"
        ? "Yapay zekâ servisi henüz yapılandırılmamış. Yönetici panelinden API anahtarı girilmesi gerekiyor."
        : aiError?.message;

    console.error(
      "[worker]",
      job.id,
      job.job_type,
      aiError?.technicalMessage ?? message,
    );
    await markJobResult(job, "failed", message.slice(0, 1000), {
      retryable,
      userMessage,
    });
  }

  return { id: job.id, type: job.job_type };
}

/** Bir tetiklemede en fazla `max` iş işler. */
export async function drainJobs(max = 3): Promise<number> {
  let processed = 0;
  for (let i = 0; i < max; i += 1) {
    const job = await runNextJob();
    if (!job) break;
    processed += 1;
  }
  return processed;
}
