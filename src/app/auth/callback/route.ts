import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E-posta doğrulama ve şifre sıfırlama bağlantılarının döndüğü nokta. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next");
  const next = nextParam?.startsWith("/") ? nextParam : "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      new URL("/giris?error=gecersiz_baglanti", url.origin),
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/giris?error=baglanti_suresi_doldu", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
