import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import type { Flashcard } from "@/lib/types";

const SESSION_SIZE = 25;

/** Son cevaba göre öncelik: bilinmeyen > emin değil > hiç çalışılmamış > bilinen. */
function priority(lastResult?: string | null): number {
  if (lastResult === "unknown") return 0;
  if (lastResult === "unsure") return 1;
  if (!lastResult) return 2;
  return 3;
}

/**
 * Aralıklı tekrar durumuna göre bir çalışma seansı oluşturur.
 * Zamanı burada okuyoruz; sayfa bileşenleri saf kalsın.
 */
export async function buildFlashcardSession(params: {
  userId: string;
  cards: Flashcard[];
  includeAll: boolean;
  size?: number;
}): Promise<{ session: Flashcard[]; dueCount: number }> {
  const supabase = createAdminSupabase();
  const { data: progressRows } = await supabase
    .from("flashcard_progress")
    .select("flashcard_id, due_at, last_result")
    .eq("user_id", params.userId);

  const progressByCard = new Map(
    (progressRows ?? []).map((row) => [
      row.flashcard_id as string,
      {
        dueAt: row.due_at as string,
        lastResult: (row.last_result as string | null) ?? null,
      },
    ]),
  );

  const now = Date.now();
  const dueCards = params.cards.filter((card) => {
    const progress = progressByCard.get(card.id);
    return !progress || new Date(progress.dueAt).getTime() <= now;
  });

  const pool = params.includeAll ? params.cards : dueCards;
  const session = [...pool]
    .sort(
      (a, b) =>
        priority(progressByCard.get(a.id)?.lastResult) -
        priority(progressByCard.get(b.id)?.lastResult),
    )
    .slice(0, params.size ?? SESSION_SIZE);

  return { session, dueCount: dueCards.length };
}
