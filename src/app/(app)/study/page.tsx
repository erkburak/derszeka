import Link from "next/link";
import { Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui";
import { GuidedStudy } from "@/components/app/guided-study";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Beni Çalıştır" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; topic?: string }>;
}) {
  await requireProfile();
  const { document: documentId, topic: topicId } = await searchParams;

  const supabase = await createServerSupabase();
  const [{ data: documents }, { data: topics }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title")
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("topics")
      .select("id, title, document_id")
      .is("parent_id", null)
      .order("order_index", { ascending: true }),
  ]);

  const docs = (documents ?? []).map((doc) => ({
    id: doc.id as string,
    title: doc.title as string,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Beni Çalıştır
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Anlat → sor → değerlendir döngüsüyle interaktif ders.
        </p>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-6" aria-hidden />}
          title="Önce bir materyal yükle"
          description="Çalışma modu, yüklediğin materyal üzerinden sana ders anlatır."
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
        <GuidedStudy
          documents={docs}
          topics={(topics ?? []).map((topic) => ({
            id: topic.id as string,
            title: topic.title as string,
            documentId: topic.document_id as string,
          }))}
          initialDocumentId={documentId}
          initialTopicId={topicId}
        />
      )}
    </div>
  );
}
