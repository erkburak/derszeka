import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Oturum gerektiren alanlar. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/materials",
  "/study",
  "/flashcards",
  "/quiz",
  "/ai-teacher",
  "/plan",
  "/achievements",
  "/notifications",
  "/settings",
  "/admin",
  "/onboarding",
];

/** Girişliyken anlamsız olan sayfalar. */
const AUTH_PAGES = ["/giris", "/kayit", "/sifremi-unuttum"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/giris";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Kullanıcıya özel alanların indekslenmesini engelle.
  if (isProtected) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
