"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Quote,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  Input,
  Progress,
  Textarea,
} from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";
import { cn, formatDuration } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/types";

interface AnswerResult {
  isCorrect: boolean;
  score: number;
  feedback: string;
  correctAnswer: string;
  explanation: string | null;
  source: { page?: number | null; section?: string | null };
}

const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Çoktan seçmeli",
  true_false: "Doğru / Yanlış",
  fill_blank: "Boşluk doldurma",
  matching: "Eşleştirme",
  short_answer: "Kısa cevap",
  open_ended: "Açık uçlu",
};

export function QuizRunner({
  quizId,
  quizTitle,
  questions,
}: {
  quizId: string;
  quizTitle: string;
  questions: QuizQuestion[];
}) {
  const router = useRouter();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );
  const [summary, setSummary] = useState<{
    score: number;
    correctCount: number;
    totalQuestions: number;
    durationSeconds: number;
  } | null>(null);
  const [correctSoFar, setCorrectSoFar] = useState(0);
  const startedAt = useRef(0);

  const question = questions[index];

  useEffect(() => {
    let cancelled = false;
    startedAt.current = Date.now();
    async function start() {
      try {
        const data = await apiFetch<{ attemptId: string }>("/api/quiz/attempt", {
          json: { quizId },
        });
        if (!cancelled) setAttemptId(data.attemptId);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : "Quiz başlatılamadı.",
          );
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  async function submitAnswer() {
    if (!attemptId || !question || checking) return;
    setChecking(true);
    setError(null);
    try {
      const data = await apiFetch<AnswerResult>("/api/quiz/answer", {
        json: { attemptId, questionId: question.id, answer },
      });
      setResult(data);
      if (data.isCorrect) setCorrectSoFar((value) => value + 1);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Cevap gönderilemedi.");
      }
    } finally {
      setChecking(false);
    }
  }

  async function next() {
    setResult(null);
    setAnswer("");

    if (index + 1 < questions.length) {
      setIndex((value) => value + 1);
      return;
    }

    try {
      const data = await apiFetch<typeof summary>("/api/quiz/finish", {
        json: {
          attemptId,
          durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        },
      });
      setSummary(data);
      router.refresh();
    } catch {
      setSummary({
        score: Math.round((correctSoFar / questions.length) * 100),
        correctCount: correctSoFar,
        totalQuestions: questions.length,
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      });
    }
  }

  if (summary) {
    const passed = summary.score >= 70;
    return (
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <div
            className={cn(
              "mx-auto flex size-16 items-center justify-center rounded-2xl text-white",
              passed ? "bg-success-500" : "gradient-brand",
            )}
          >
            <span className="text-xl font-semibold">%{Math.round(summary.score)}</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink-900">
              {passed ? "Tebrikler!" : "Quiz tamamlandı"}
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {summary.correctCount} / {summary.totalQuestions} doğru ·{" "}
              {formatDuration(summary.durationSeconds)}
            </p>
          </div>

          {!passed ? (
            <Alert tone="warning">
              Yanlış yaptığın konuları flashcard ve &ldquo;Beni Çalıştır&rdquo; moduyla
              pekiştirebilirsin.
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              <RotateCcw aria-hidden />
              Tekrar çöz
            </Button>
            <Button onClick={() => router.push("/quiz")}>Quizlere dön</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!question) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-ink-500">
          Bu quizde soru bulunamadı.
        </CardContent>
      </Card>
    );
  }

  const isChoice =
    question.q_type === "multiple_choice" || question.q_type === "true_false";

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-500">{quizTitle}</p>
            <p className="text-xs text-ink-400">
              Soru {index + 1} / {questions.length}
            </p>
          </div>
          <Badge tone="neutral">{TYPE_LABEL[question.q_type] ?? question.q_type}</Badge>
        </div>

        <Progress value={((index + (result ? 1 : 0)) / questions.length) * 100} />

        <Card>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <p className="text-lg leading-relaxed font-medium text-ink-900">
              {question.prompt}
            </p>

            {isChoice ? (
              <div className="space-y-2">
                {question.options.map((option) => {
                  const selected = answer === option;
                  const isCorrectOption =
                    result && option === result.correctAnswer;
                  const isWrongSelection =
                    result && selected && !result.isCorrect;

                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={Boolean(result)}
                      onClick={() => setAnswer(option)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                        isCorrectOption
                          ? "border-success-500/40 bg-success-50 text-success-700"
                          : isWrongSelection
                            ? "border-danger-500/40 bg-danger-50 text-danger-700"
                            : selected
                              ? "border-brand-400 bg-brand-50 text-brand-900"
                              : "border-line bg-white text-ink-700 hover:bg-surface-sunken",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs",
                          selected || isCorrectOption
                            ? "border-transparent bg-current/15"
                            : "border-line",
                        )}
                      >
                        {isCorrectOption ? (
                          <CheckCircle2 className="size-4" aria-hidden />
                        ) : isWrongSelection ? (
                          <XCircle className="size-4" aria-hidden />
                        ) : null}
                      </span>
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : question.q_type === "open_ended" || question.q_type === "matching" ? (
              <Textarea
                rows={question.q_type === "matching" ? 6 : 5}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                disabled={Boolean(result)}
                placeholder={
                  question.q_type === "matching"
                    ? "Her satıra bir eşleştirme yaz: sol taraf = sağ taraf"
                    : "Cevabını yaz..."
                }
              />
            ) : (
              <Input
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                disabled={Boolean(result)}
                placeholder="Cevabın"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !result) void submitAnswer();
                }}
              />
            )}

            {question.q_type === "matching" && question.options.length > 0 ? (
              <div className="rounded-xl bg-surface-muted p-3 text-xs text-ink-500">
                Seçenekler: {question.options.join(" · ")}
              </div>
            ) : null}

            {error ? <Alert tone="danger">{error}</Alert> : null}

            {result ? (
              <div
                className={cn(
                  "space-y-2 rounded-xl border p-4",
                  result.isCorrect
                    ? "border-success-500/30 bg-success-50"
                    : "border-danger-500/30 bg-danger-50",
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-2 text-sm font-semibold",
                    result.isCorrect ? "text-success-700" : "text-danger-700",
                  )}
                >
                  {result.isCorrect ? (
                    <CheckCircle2 className="size-4" aria-hidden />
                  ) : (
                    <XCircle className="size-4" aria-hidden />
                  )}
                  {result.isCorrect
                    ? "Doğru"
                    : result.score > 0
                      ? `Kısmen doğru (%${Math.round(result.score * 100)})`
                      : "Yanlış"}
                </p>

                {!result.isCorrect ? (
                  <p className="text-sm text-ink-700">
                    <span className="font-medium">Doğru cevap:</span>{" "}
                    {result.correctAnswer}
                  </p>
                ) : null}

                <p className="text-sm leading-relaxed whitespace-pre-line text-ink-700">
                  {result.feedback || result.explanation}
                </p>

                {result.source?.page || result.source?.section ? (
                  <p className="flex items-center gap-1 text-xs text-brand-600">
                    <Quote className="size-3" aria-hidden />
                    Kaynak: {result.source.section ?? ""}
                    {result.source.section && result.source.page ? " · " : ""}
                    {result.source.page ? `Sayfa ${result.source.page}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <Button block onClick={next}>
                {index + 1 < questions.length ? "Sonraki soru" : "Quizi bitir"}
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                block
                loading={checking}
                disabled={!answer.trim() || !attemptId}
                onClick={submitAnswer}
              >
                Cevabı gönder
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {upgrade ? (
        <UpgradeDialog
          info={upgrade.info}
          message={upgrade.message}
          onClose={() => setUpgrade(null)}
        />
      ) : null}
    </>
  );
}
