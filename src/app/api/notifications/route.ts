import { NextResponse } from "next/server";
import { readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Zil bileşeni bunu periyodik olarak yoklar. */
export const GET = withApi(async (request: Request) => {
  await requireProfile();
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 50);

  const supabase = await createServerSupabase();

  const [{ data: notifications }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, title, body, link, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false),
  ]);

  return NextResponse.json({
    notifications: notifications ?? [],
    unreadCount: count ?? 0,
  });
});

interface ReadBody {
  /** Boş bırakılırsa tüm bildirimler okundu sayılır. */
  ids?: string[];
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<ReadBody>(request).catch(() => ({}) as ReadBody);

  const supabase = createAdminSupabase();
  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  if (body.ids?.length) query = query.in("id", body.ids);

  await query;
  return NextResponse.json({ ok: true });
});
