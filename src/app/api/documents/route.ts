import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { kickWorker } from "@/lib/jobs/kick";

const PENDING_STATUSES = [
  "queued",
  "extracting",
  "embedding",
  "analyzing",
  "generating",
];

export const runtime = "nodejs";

/** Materyal listesi + işlem durumu. Yükleme ekranı bunu kısa aralıklarla yoklar. */
export const GET = withApi(async (request: Request) => {
  await requireProfile();
  const supabase = await createServerSupabase();
  const url = new URL(request.url);
  const ids = url.searchParams.get("ids");

  let query = supabase
    .from("documents")
    .select(
      "id, title, mime_type, file_size, status, progress, status_message, error_message, page_count, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (ids) query = query.in("id", ids.split(",").filter(Boolean));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // İşlenmeyi bekleyen materyal varsa kuyruğu dürt. Yükleme anındaki
  // tetikleme kaçırılmış olsa bile arayüz yokladıkça iş devam eder.
  if ((data ?? []).some((doc) => PENDING_STATUSES.includes(doc.status as string))) {
    kickWorker(1);
  }

  return NextResponse.json({ documents: data ?? [] });
});
