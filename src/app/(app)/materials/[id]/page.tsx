import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  FileText,
  Layers,
  ListChecks,
  MessageCircleQuestion,
  Quote,
  Sigma,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { RetryProcessing } from "@/components/app/retry-processing";
import { DocumentProgress } from "@/components/app/document-progress";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { renderMarkdown, relativeTime } from "@/lib/utils";
import type { DocumentStatus, SourceRef, StudySet, Topic } from "@/lib/types";

export const metadata = { title: "Materyal" };

function SourceTag({ source }: { source?: SourceRef }) {
  if (!source?.page && !source?.section) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600">
      <Quote className="size-3" aria-hidden />
      {source.section ? `${source.section}` : ""}
      {source.section && source.page ? " · " : ""}
      {source.page ? `Sayfa ${source.page}` : ""}
    </span>
  );
}

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;

  const supabase = await createServerSupabase();
  const { data: document } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!document) notFound();

  const status = document.status as DocumentStatus;

  const [
    { data: studySetRow },
    { data: topicRows },
    flashcardCount,
    { data: quizRows },
  ] = await Promise.all([
      supabase.from("study_sets").select("*").eq("document_id", id).maybeSingle(),
      supabase
        .from("topics")
        .select("*")
        .eq("document_id", id)
        .is("parent_id", null)
        .order("order_index", { ascending: true }),
      supabase
        .from("flashcards")
        .select("id", { count: "exact", head: true })
        .eq("document_id", id),
      supabase
        .from("quizzes")
        .select("id, title, question_count, created_at")
        .eq("document_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const studySet = studySetRow as StudySet | null;
  const topics = (topicRows ?? []) as Topic[];

  if (status !== "completed") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href="/materials" className="text-sm text-brand-600 hover:underline">
          ← Materyaller
        </Link>

        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="text-xl font-semibold text-ink-900">{document.title}</h1>

            {status === "failed" ? (
              <>
                <Alert tone="danger">
                  <span className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {document.error_message ??
                      "Materyal işlenirken bir sorun oluştu."}
                  </span>
                </Alert>
                <RetryProcessing documentId={id} />
              </>
            ) : (
              <DocumentProgress
                documentId={id}
                initialProgress={Number(document.progress)}
                initialMessage={document.status_message as string | null}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/materials" className="text-sm text-brand-600 hover:underline">
          ← Materyaller
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {studySet?.title ?? document.title}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-400">
              <span className="flex items-center gap-1">
                <FileText className="size-3.5" aria-hidden />
                {document.page_count} sayfa
              </span>
              <span className="flex items-center gap-1">
                <Layers className="size-3.5" aria-hidden />
                {flashcardCount.count ?? 0} flashcard
              </span>
              <span className="flex items-center gap-1">
                <ListChecks className="size-3.5" aria-hidden />
                {(quizRows ?? []).length} quiz
              </span>
              <span>{relativeTime(document.created_at as string)}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href={`/study?document=${id}`}>
              <Button size="sm">
                <Sparkles aria-hidden />
                Beni Çalıştır
              </Button>
            </Link>
            <Link href={`/flashcards?document=${id}`}>
              <Button size="sm" variant="secondary">
                <Layers aria-hidden />
                Flashcards
              </Button>
            </Link>
            <Link href={`/quiz?document=${id}`}>
              <Button size="sm" variant="secondary">
                <ListChecks aria-hidden />
                Quiz
              </Button>
            </Link>
            <Link href={`/ai-teacher?document=${id}`}>
              <Button size="sm" variant="secondary">
                <MessageCircleQuestion aria-hidden />
                AI Öğretmen
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {studySet ? (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Kısa özet</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-ink-700">
                  {studySet.summary_short}
                </p>
              </CardContent>
            </Card>

            {studySet.summary_detailed ? (
              <Card>
                <CardHeader>
                  <CardTitle>Detaylı özet</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="prose-study"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(studySet.summary_detailed),
                    }}
                  />
                </CardContent>
              </Card>
            ) : null}

            {studySet.section_summaries?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Bölüm bölüm özet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {studySet.section_summaries.map((section, index) => (
                    <div key={`${section.title}-${index}`}>
                      <h4 className="font-medium text-ink-900">{section.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-ink-700">
                        {section.content}
                      </p>
                      {section.page ? (
                        <SourceTag source={{ page: section.page }} />
                      ) : null}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {studySet.definitions?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Tanımlar</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="divide-y divide-line">
                    {studySet.definitions.map((item, index) => (
                      <div key={`${item.term}-${index}`} className="py-3 first:pt-0 last:pb-0">
                        <dt className="text-sm font-semibold text-ink-900">
                          {item.term}
                        </dt>
                        <dd className="mt-0.5 text-sm text-ink-700">
                          {item.definition}
                        </dd>
                        <SourceTag source={item.source} />
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            {studySet.formulas?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sigma className="size-4 text-accent-600" aria-hidden />
                    Formüller
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studySet.formulas.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="rounded-xl border border-line bg-surface-muted p-3.5"
                    >
                      <p className="text-sm font-medium text-ink-900">{item.name}</p>
                      <p className="mt-1 font-mono text-sm text-accent-600">
                        {item.expression}
                      </p>
                      {item.explanation ? (
                        <p className="mt-1 text-sm text-ink-500">{item.explanation}</p>
                      ) : null}
                      <SourceTag source={item.source} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {studySet.comparisons?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Karşılaştırmalar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studySet.comparisons.map((item, index) => (
                    <div key={`${item.title}-${index}`} className="rounded-xl border border-line p-3.5">
                      <p className="text-sm font-medium text-ink-900">{item.title}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-brand-50 p-2.5 text-sm text-brand-900">
                          {item.left}
                        </div>
                        <div className="rounded-lg bg-surface-sunken p-2.5 text-sm text-ink-700">
                          {item.right}
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-ink-500">{item.difference}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {studySet.cause_effects?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Sebep-sonuç ilişkileri</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {studySet.cause_effects.map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-1.5 rounded-xl border border-line p-3.5 sm:flex-row sm:items-center"
                    >
                      <span className="flex-1 text-sm text-ink-700">{item.cause}</span>
                      <span className="text-brand-500">→</span>
                      <span className="flex-1 text-sm font-medium text-ink-900">
                        {item.effect}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            {studySet.exam_critical?.length > 0 ? (
              <Card className="border-warning-500/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="size-4 text-warning-500" aria-hidden />
                    Sınavda kritik
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {studySet.exam_critical.map((item, index) => (
                      <li key={index} className="text-sm text-ink-700">
                        <span className="flex gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning-500" />
                          <span>
                            {item.text}
                            <SourceTag source={item.source} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {studySet.key_points?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Önemli bilgiler</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {studySet.key_points.map((item, index) => (
                      <li key={index} className="text-sm text-ink-700">
                        <span className="flex gap-2">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                          <span>
                            {item.text}
                            <SourceTag source={item.source} />
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {topics.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="size-4 text-brand-600" aria-hidden />
                    Konular
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {topics.map((topic) => (
                      <li key={topic.id}>
                        <Link
                          href={`/study?document=${id}&topic=${topic.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 transition-colors hover:bg-surface-sunken"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                            {topic.title}
                          </span>
                          <Badge tone={topic.importance >= 4 ? "warning" : "neutral"}>
                            {topic.importance}/5
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {studySet.dates?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-ink-500" aria-hidden />
                    Tarihler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {studySet.dates.map((item, index) => (
                      <li key={index} className="flex gap-3">
                        <span className="shrink-0 font-medium text-brand-600">
                          {item.date}
                        </span>
                        <span className="text-ink-700">{item.event}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {studySet.names?.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="size-4 text-ink-500" aria-hidden />
                    İsimler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {studySet.names.map((item, index) => (
                      <li key={index}>
                        <span className="font-medium text-ink-900">{item.name}</span>
                        <span className="text-ink-500"> — {item.description}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            {(quizRows ?? []).length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Quizler</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {(quizRows ?? []).map((quiz) => (
                      <li key={quiz.id}>
                        <Link
                          href={`/quiz/${quiz.id}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-sunken"
                        >
                          <span className="min-w-0 flex-1 truncate text-ink-900">
                            {quiz.title}
                          </span>
                          <Badge>{quiz.question_count} soru</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      ) : (
        <Alert tone="warning">
          Bu materyal için özet oluşturulamadı. Yeniden denemeyi seçebilirsin.
        </Alert>
      )}
    </div>
  );
}
