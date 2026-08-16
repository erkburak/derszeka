import { NextResponse } from "next/server";
import { AppError, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { enqueueJob, triggerWorker } from "@/lib/jobs/queue";

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

  await createAdminSupabase()
    .from("documents")
    .update({ status: "queued", progress: 0, error_message: null })
    .eq("id", id);

  await enqueueJob({
    jobType: "document.process",
    documentId: id,
    userId: profile.id,
    priority: 50,
  });
  triggerWorker();

  return NextResponse.json({ ok: true });
});
