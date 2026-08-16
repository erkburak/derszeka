import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizRunner } from "@/components/app/quiz-runner";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import type { QuizQuestion } from "@/lib/types";

export const metadata = { title: "Quiz" };

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, document_id, question_count")
    .eq("id", id)
    .maybeSingle();

  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", id)
    .order("order_index", { ascending: true });

  // Doğru cevap ve açıklama istemciye gönderilmez; cevap sonrası API döner.
  const safeQuestions = ((questions ?? []) as QuizQuestion[]).map((question) => ({
    ...question,
    correct_answer: {},
    explanation: null,
    source_ref: {},
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/quiz" className="text-sm text-brand-600 hover:underline">
        ← Quizler
      </Link>
      <QuizRunner
        quizId={quiz.id as string}
        quizTitle={quiz.title as string}
        questions={safeQuestions}
      />
    </div>
  );
}
