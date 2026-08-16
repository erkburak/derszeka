import Link from "next/link";
import { ListChecks, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui";
import { GeneratePanel } from "@/components/app/generate-panel";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Quiz" };

export default async function QuizListPage({
  searchParams,
}: {
  searchParams: Promise<{ document?: string }>;
}) {
  await requireProfile();
  const { document: documentId } = await searchParams;

  const supabase = await createServerSupabase();

  const { data: documents } = await supabase
    .from("documents")
    .select("id, title")
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  let quizQuery = supabase
    .from("quizzes")
    .select("id, title, question_count, mode, difficulty, created_at, document_id")
    .order("created_at", { ascending: false });

  if (documentId) quizQuery = quizQuery.eq("document_id", documentId);

  const [{ data: quizzes }, { data: attempts }] = await Promise.all([
    quizQuery,
    supabase
      .from("quiz_attempts")
      .select("quiz_id, score, completed_at")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(300),
  ]);

  const bestByQuiz = new Map<string, number>();
  for (const attempt of attempts ?? []) {
    const quizId = attempt.quiz_id as string;
    const score = Number(attempt.score ?? 0);
    bestByQuiz.set(quizId, Math.max(bestByQuiz.get(quizId) ?? 0, score));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Quiz</h1>
        <p className="mt-1 text-sm text-ink-500">
          Materyallerinden üretilen quizleri çöz, eksiklerini gör.
        </p>
      </div>

      <GeneratePanel
        kind="quiz"
        documents={(documents ?? []).map((doc) => ({
          id: doc.id as string,
          title: doc.title as string,
        }))}
        defaultDocumentId={documentId}
      />

      {(quizzes ?? []).length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-6" aria-hidden />}
          title="Henüz quizin yok"
          description="Bir materyal yükle; yapay zekâ senin için quiz hazırlasın."
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {(quizzes ?? []).map((quiz) => {
            const best = bestByQuiz.get(quiz.id as string);
            return (
              <li key={quiz.id}>
                <Link href={`/quiz/${quiz.id}`}>
                  <Card className="card-interactive h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900">
                            {quiz.title}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-400">
                            {quiz.question_count} soru ·{" "}
                            {relativeTime(quiz.created_at as string)}
                          </p>
                        </div>
                        {best !== undefined ? (
                          <Badge
                            tone={best >= 70 ? "success" : best >= 40 ? "warning" : "danger"}
                          >
                            En iyi %{Math.round(best)}
                          </Badge>
                        ) : (
                          <Badge tone="brand">Yeni</Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
