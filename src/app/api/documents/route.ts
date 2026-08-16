import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

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

  return NextResponse.json({ documents: data ?? [] });
});
