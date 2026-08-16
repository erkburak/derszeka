import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Kullanıcıya özel çalışma alanları hiçbir zaman indekslenmemeli.
        disallow: [
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
          "/onboarding",
          "/admin",
          "/api",
          "/auth",
          "/giris",
          "/kayit",
          "/sifremi-unuttum",
          "/sifre-yenile",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
