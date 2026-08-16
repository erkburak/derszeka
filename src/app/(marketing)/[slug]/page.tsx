import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminSupabase } from "@/lib/supabase/server";
import { renderMarkdown, formatDate } from "@/lib/utils";

/** Yasal metinler admin panelinden düzenlenir; URL'ler sabittir. */
const SLUG_MAP: Record<string, string> = {
  kvkk: "kvkk",
  gizlilik: "privacy",
  kosullar: "terms",
  cerezler: "cookies",
};

export function generateStaticParams() {
  return Object.keys(SLUG_MAP).map((slug) => ({ slug }));
}

async function loadDocument(slug: string) {
  const key = SLUG_MAP[slug];
  if (!key) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("legal_documents")
    .select("title, content, version, updated_at")
    .eq("slug", key)
    .maybeSingle();

  return data;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const document = await loadDocument(slug);
  if (!document) return {};

  return {
    title: document.title as string,
    alternates: { canonical: `/${slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const document = await loadDocument(slug);
  if (!document) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900">
        {document.title}
      </h1>
      <p className="mt-2 text-sm text-ink-400">
        Son güncelleme: {formatDate(document.updated_at as string)} · Sürüm{" "}
        {document.version}
      </p>

      <div
        className="prose-study mt-8"
        dangerouslySetInnerHTML={{
          __html: renderMarkdown((document.content as string) || ""),
        }}
      />
    </article>
  );
}
