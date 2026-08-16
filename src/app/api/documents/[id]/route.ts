import { NextResponse } from "next/server";
import { AppError, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { enqueueJob } from "@/lib/jobs/queue";
import { kickWorker } from "@/lib/jobs/kick";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withApi(async (_request: Request, ctx: Params) => {
  const profile = await requireProfile();
  const { id } = await ctx.params;

  // RLS ile sahiplik doğrulanır: başkasının materyali bulunamaz.
  const supabase = await createServerSupabase();
  const { data: document } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!document) throw new AppError("Materyal bulunamadı.", 404, "not_found");

  const admin = createAdminSupabase();
  if (document.storage_path) {
    await admin.storage.from("documents").remove([document.storage_path as string]);
  }
  await admin.from("documents").delete().eq("id", id).eq("owner_id", profile.id);

  return NextResponse.json({ ok: true });
});

/** İşlemi yeniden dener (başarısız veya eksik kalan materyaller için). */
export const POST = withApi(async (_request: Request, ctx: Params) => {
  const profile = await requireProfile();
  const { id } = await ctx.params;

  const supabase = await createServerSupabase();
  const { data: document } = await supabase
    .from("documents")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!document) throw new AppError("Materyal bulunamadı.", 404, "not_found");
  if (document.status === "completed") {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  // Tamamlanmış aşamaları tekrarlamayalım: analiz 1-2 dakika sürüyor ve
  // para maliyeti var. Nereye kadar gelindiyse oradan devam edilir.
  const admin = createAdminSupabase();
  const [{ data: studySet }, { count: chunkCount }, { count: pageCount }] =
    await Promise.all([
      admin.from("study_sets").select("id").eq("document_id", id).maybeSingle(),
      admin
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", id),
      admin
        .from("document_pages")
        .select("id", { count: "exact", head: true })
        .eq("document_id", id),
    ]);

  const resume = studySet
    ? { status: "generating" as const, progress: 75 }
    : (chunkCount ?? 0) > 0
      ? { status: "analyzing" as const, progress: 55 }
      : (pageCount ?? 0) > 0
        ? { status: "embedding" as const, progress: 35 }
        : { status: "queued" as const, progress: 0 };

  await admin
    .from("documents")
    .update({ ...resume, error_message: null })
    .eq("id", id);

  await enqueueJob({
    jobType: "document.process",
    documentId: id,
    userId: profile.id,
    priority: 50,
  });
  kickWorker();

  return NextResponse.json({ ok: true });
});
