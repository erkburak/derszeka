import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: siteUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    {
      url: `${siteUrl}/premium`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...["kvkk", "gizlilik", "kosullar", "cerezler"].map((slug) => ({
      url: `${siteUrl}/${slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
