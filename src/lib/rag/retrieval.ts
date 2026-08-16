import "server-only";

import { runEmbedding } from "@/lib/ai/service";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { Citation, Profile, RetrievedChunk } from "@/lib/types";

const EMBED_BATCH_SIZE = 64;

/** Parçaları gömüp vektör tablosuna yazar. Büyük belgelerde partiler halinde çalışır. */
export async function embedAndStoreChunks(params: {
  profile: Profile;
  documentId: string;
  chunkIds: string[];
  contents: string[];
  modelKey?: string;
}): Promise<number> {
  const supabase = createAdminSupabase();
  const model = params.modelKey ?? "text-embedding-3-small";
  let stored = 0;

  for (let i = 0; i < params.contents.length; i += EMBED_BATCH_SIZE) {
    const slice = params.contents.slice(i, i + EMBED_BATCH_SIZE);
    const ids = params.chunkIds.slice(i, i + EMBED_BATCH_SIZE);

    const vectors = await runEmbedding({
      profile: params.profile,
      inputs: slice,
      documentId: params.documentId,
      skipQuota: true,
    });

    const rows = vectors.map((embedding, index) => ({
      chunk_id: ids[index],
      document_id: params.documentId,
      owner_id: params.profile.id,
      model,
      embedding: JSON.stringify(embedding),
    }));

    const { error } = await supabase
      .from("document_embeddings")
      .upsert(rows, { onConflict: "chunk_id,model" });
    if (error) throw new Error(`Embedding kaydedilemedi: ${error.message}`);
    stored += rows.length;
  }

  return stored;
}

/**
 * Hibrit arama: anlamsal (pgvector) + anahtar kelime (tsvector).
 * İkisinin birleşimi, terim eşleşmesi güçlü ama anlamsal olarak uzak
 * sorularda da doğru parçayı bulur.
 */
export async function retrieveRelevantChunks(params: {
  profile: Profile;
  query: string;
  documentIds?: string[] | null;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const settings = await getSettings();
  const topK = params.topK ?? Number(settings.rag_top_k);
  const supabase = createAdminSupabase();

  const [vectorResult, keywordResult] = await Promise.allSettled([
    (async () => {
      const [vector] = await runEmbedding({
        profile: params.profile,
        inputs: [params.query],
        skipQuota: true,
      });
      const { data } = await supabase.rpc("match_document_chunks", {
        p_owner_id: params.profile.id,
        p_query: JSON.stringify(vector),
        p_document_ids: params.documentIds ?? null,
        p_match_count: topK,
        p_min_score: 0.1,
      });
      return (data ?? []) as RetrievedChunk[];
    })(),
    (async () => {
      const { data } = await supabase.rpc("keyword_search_chunks", {
        p_owner_id: params.profile.id,
        p_query: params.query,
        p_document_ids: params.documentIds ?? null,
        p_match_count: Math.ceil(topK / 2),
      });
      return (data ?? []) as RetrievedChunk[];
    })(),
  ]);

  const merged = new Map<string, RetrievedChunk>();
  if (vectorResult.status === "fulfilled") {
    for (const chunk of vectorResult.value) merged.set(chunk.chunk_id, chunk);
  }
  if (keywordResult.status === "fulfilled") {
    for (const chunk of keywordResult.value) {
      const existing = merged.get(chunk.chunk_id);
      // Her iki yöntemde de çıkan parça daha güvenilirdir.
      if (existing) existing.score = Math.min(1, existing.score + 0.15);
      else merged.set(chunk.chunk_id, chunk);
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Bulunan parçaları başlıklı bağlam metnine ve kaynak listesine çevirir. */
export async function buildContext(
  chunks: RetrievedChunk[],
): Promise<{ context: string; citations: Citation[] }> {
  if (chunks.length === 0) return { context: "", citations: [] };

  const supabase = createAdminSupabase();
  const documentIds = [...new Set(chunks.map((c) => c.document_id))];
  const { data } = await supabase
    .from("documents")
    .select("id, title")
    .in("id", documentIds);

  const titles = new Map((data ?? []).map((d) => [d.id, d.title as string]));

  const parts: string[] = [];
  const citations: Citation[] = [];

  chunks.forEach((chunk, index) => {
    const title = titles.get(chunk.document_id) ?? "Materyal";
    const pageLabel =
      chunk.page_from && chunk.page_to && chunk.page_from !== chunk.page_to
        ? `Sayfa ${chunk.page_from}-${chunk.page_to}`
        : chunk.page_from
          ? `Sayfa ${chunk.page_from}`
          : "";

    parts.push(
      [
        `[KAYNAK ${index + 1}]`,
        `Materyal: ${title}`,
        chunk.section_title ? `Bölüm: ${chunk.section_title}` : null,
        pageLabel || null,
        "---",
        chunk.content,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    citations.push({
      document_id: chunk.document_id,
      document_title: title,
      page: chunk.page_from,
      section: chunk.section_title,
      quote: null,
    });
  });

  return { context: parts.join("\n\n"), citations };
}
