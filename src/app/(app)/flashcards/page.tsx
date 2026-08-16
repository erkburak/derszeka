import Link from "next/link";
import { Layers, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, EmptyState, Select } from "@/components/ui";
import { FlashcardReview } from "@/components/app/flashcard-review";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildFlashcardSession } from "@/lib/study/session";
import type { Flashcard } from "@/lib/types";

export const metadata = { title: "Flashcards" };

const SESSION_SIZE = 25;

export default async function FlashcardsPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; mode?: string }>;
}) {
  const profile = await requireProfile();
  const { document: documentId, mode } = await searchParams;

  const supabase = await createServerSupabase();

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title")
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  let query = supabase
    .from("flashcards")
    .select("*")
    .order("created_at", { ascending: true });

  if (documentId) query = query.eq("document_id", documentId);

  const { data: allCards } = await query;
  const cards = (allCards ?? []) as Flashcard[];

  // Tekrar zamanı gelen ve zorlanılan kartlar önceliklidir.
  const { session: sessionCards, dueCount } = await buildFlashcardSession({
    userId: profile.id,
    cards,
    includeAll: mode === "all",
    size: SESSION_SIZE,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Flashcards
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {dueCount} kart tekrar zamanı geldi · toplam {cards.length} kart
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone={mode === "all" ? "neutral" : "brand"}>
            {mode === "all" ? "Tüm kartlar" : "Tekrar zamanı gelenler"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <form>
            <label htmlFor="document" className="mb-1.5 block text-xs text-ink-500">
              Materyal
            </label>
            {/* Basit GET formu: JS olmadan da filtreleme çalışır. */}
            <Select id="document" name="document" defaultValue={documentId ?? ""}>
              <option value="">Tüm materyaller</option>
              {(documents ?? []).map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </Select>
            {mode ? <input type="hidden" name="mode" value={mode} /> : null}
            <Button type="submit" variant="secondary" size="sm" className="mt-2" block>
              Filtrele
            </Button>
          </form>

          <div className="flex flex-col justify-end gap-2">
            <Link
              href={{
                pathname: "/flashcards",
                query: {
                  ...(documentId ? { document: documentId } : {}),
                  ...(mode === "all" ? {} : { mode: "all" }),
                },
              }}
            >
              <Button variant="ghost" size="sm" block>
                {mode === "all"
                  ? "Sadece tekrar zamanı gelenler"
                  : "Tüm kartları çalış"}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {cards.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden />}
          title="Henüz flashcardın yok"
          description="Bir materyal yükle; yapay zekâ senin için otomatik kart üretsin."
          action={
            <Link href="/materials?upload=1">
              <Button>
                <Upload aria-hidden />
                Materyal Yükle
              </Button>
            </Link>
          }
        />
      ) : (
        <FlashcardReview cards={sessionCards} />
      )}
    </div>
  );
}
