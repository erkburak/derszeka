import { NextResponse } from "next/server";
import { AppError, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import {
  assertDocumentQuota,
  assertWithinLimit,
  incrementUsage,
} from "@/lib/limits";
import { getSettings } from "@/lib/settings";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";
import { createAdminSupabase } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/documents/validate";
import { paginateText } from "@/lib/documents/extract";
import { enqueueJob, triggerWorker } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

interface UploadedDocument {
  id: string;
  title: string;
  status: string;
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const settings = await getSettings();

  await enforceRateLimit(
    "upload",
    profile.id,
    Number(settings.rate_limit_upload_per_hour),
    3600,
  );
  await enforceRateLimit("upload-ip", clientIp(request), 120, 3600);

  const form = await request.formData().catch(() => null);
  if (!form) throw new AppError("Geçersiz yükleme isteği.", 400, "invalid_form");

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const pastedText = (form.get("text") as string | null)?.trim() ?? "";
  const pastedTitle = (form.get("title") as string | null)?.trim() ?? "";

  if (files.length === 0 && !pastedText) {
    throw new AppError("Yüklenecek bir dosya veya metin seçmelisin.", 400, "no_input");
  }

  const maxFiles = Number(settings.max_upload_files);
  if (files.length > maxFiles) {
    throw new AppError(
      `Aynı anda en fazla ${maxFiles} dosya yükleyebilirsin.`,
      400,
      "too_many_files",
    );
  }

  const totalItems = files.length + (pastedText ? 1 : 0);
  await assertWithinLimit(profile, "monthly_uploads", "uploads", "month", totalItems);
  await assertDocumentQuota(profile);

  const supabase = createAdminSupabase();
  const created: UploadedDocument[] = [];

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { safeName } = await validateUpload({
      profile,
      filename: file.name,
      mimeType: file.type,
      size: buffer.byteLength,
      buffer,
    });

    const title = safeName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();

    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        owner_id: profile.id,
        title: title || safeName,
        original_filename: safeName,
        mime_type: file.type,
        file_size: buffer.byteLength,
        source_kind: "upload",
        status: "queued",
        status_message: "Sıraya alındı...",
      })
      .select("id, title, status")
      .single();

    if (error) throw new AppError("Materyal kaydedilemedi.", 500, "db_error");

    const storagePath = `${profile.id}/${document.id}/${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      await supabase.from("documents").delete().eq("id", document.id);
      throw new AppError("Dosya yüklenemedi. Lütfen tekrar dene.", 500, "storage_error");
    }

    await supabase
      .from("documents")
      .update({ storage_path: storagePath })
      .eq("id", document.id);

    await enqueueJob({
      jobType: "document.process",
      documentId: document.id as string,
      userId: profile.id,
    });

    created.push(document as UploadedDocument);
  }

  if (pastedText) {
    if (pastedText.length < 100) {
      throw new AppError(
        "Yapıştırdığın metin çok kısa. En az 100 karakter olmalı.",
        400,
        "text_too_short",
      );
    }

    const title = pastedTitle || `Not — ${new Date().toLocaleDateString("tr-TR")}`;
    const { data: document, error } = await supabase
      .from("documents")
      .insert({
        owner_id: profile.id,
        title,
        original_filename: `${title}.txt`,
        mime_type: "text/plain",
        file_size: Buffer.byteLength(pastedText, "utf8"),
        source_kind: "pasted_text",
        status: "queued",
        status_message: "Sıraya alındı...",
      })
      .select("id, title, status")
      .single();

    if (error) throw new AppError("Metin kaydedilemedi.", 500, "db_error");

    const pages = paginateText(pastedText);
    await supabase.from("document_pages").insert(
      pages.map((page) => ({
        document_id: document.id,
        owner_id: profile.id,
        page_number: page.pageNumber,
        content: page.content,
        extraction_method: "text",
      })),
    );

    await supabase
      .from("documents")
      .update({
        page_count: pages.length,
        char_count: pastedText.length,
        extraction_method: "text",
      })
      .eq("id", document.id);

    await enqueueJob({
      jobType: "document.process",
      documentId: document.id as string,
      userId: profile.id,
    });

    created.push(document as UploadedDocument);
  }

  await incrementUsage(profile.id, "uploads", "month", created.length);
  triggerWorker();

  return NextResponse.json({ documents: created });
});
