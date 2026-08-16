import Link from "next/link";
import { MessageCircleQuestion, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui";
import { TutorChat } from "@/components/app/tutor-chat";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Citation } from "@/lib/types";

export const metadata = { title: "AI Öğretmen" };

export default async function AiTeacherPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string; conversation?: string }>;
}) {
  await requireProfile();
  const { document: documentId, conversation: conversationId } = await searchParams;

  const supabase = await createServerSupabase();
  const { data: documents } = await supabase
    .from("documents")
    .select("id, title")
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const docs = (documents ?? []).map((doc) => ({
    id: doc.id as string,
    title: doc.title as string,
  }));

  let initialMessages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
  }[] = [];

  if (conversationId) {
    const { data: messages } = await supabase
      .from("tutor_messages")
      .select("id, role, content, citations")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    initialMessages = (messages ?? [])
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        id: row.id as string,
        role: row.role as "user" | "assistant",
        content: row.content as string,
        citations: (row.citations as Citation[]) ?? [],
      }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          AI Öğretmen
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Kendi materyallerin üzerinden soru sor, anlamadığın yeri tekrar anlattır.
        </p>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={<MessageCircleQuestion className="size-6" aria-hidden />}
          title="Önce bir materyal yükle"
          description="AI Öğretmen yalnızca senin yüklediğin materyallere dayanarak cevap verir."
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
        <TutorChat
          documents={docs}
          initialDocumentId={documentId}
          initialConversationId={conversationId}
          initialMessages={initialMessages}
        />
      )}
    </div>
  );
}
