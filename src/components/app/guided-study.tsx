"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Play,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, Progress, Select, Textarea } from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";
import { cn, renderMarkdown } from "@/lib/utils";

interface StepResponse {
  sessionId: string;
  phase: "teach" | "question" | "evaluate" | "recap" | "finished";
  message: string;
  question: string;
  options: string[];
  evaluation: { was_correct: boolean; feedback: string } | null;
  progress: number;
  difficulty: number;
}

interface Entry {
  id: string;
  kind: "tutor" | "student" | "feedback";
  text: string;
  correct?: boolean;
}

const DIFFICULTY_LABEL = ["Çok kolay", "Kolay", "Orta", "Zor"];

export function GuidedStudy({
  documents,
  topics,
  initialDocumentId,
  initialTopicId,
}: {
  documents: { id: string; title: string }[];
  topics: { id: string; title: string; documentId: string }[];
  initialDocumentId?: string;
  initialTopicId?: string;
}) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState(
    initialDocumentId ?? documents[0]?.id ?? "",
  );
  const [topicId, setTopicId] = useState(initialTopicId ?? "");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [current, setCurrent] = useState<StepResponse | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const availableTopics = topics.filter((topic) => topic.documentId === documentId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, loading]);

  async function step(payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<StepResponse>("/api/guided", { json: payload });
      setSessionId(data.sessionId);
      setCurrent(data);

      setEntries((currentEntries) => {
        const next = [...currentEntries];
        if (data.evaluation) {
          next.push({
            id: `feedback-${Date.now()}`,
            kind: "feedback",
            text: data.evaluation.feedback,
            correct: data.evaluation.was_correct,
          });
        }
        next.push({
          id: `tutor-${Date.now()}`,
          kind: "tutor",
          text: data.question ? `${data.message}\n\n**${data.question}**` : data.message,
        });
        return next;
      });

      if (data.phase === "finished") router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Bir sorun oluştu. Lütfen tekrar dene.");
      }
    } finally {
      setLoading(false);
    }
  }

  function start() {
    setEntries([]);
    setCurrent(null);
    void step({ documentId, topicId: topicId || null });
  }

  function submitAnswer(value: string) {
    const text = value.trim();
    if (!text || !sessionId) return;
    setEntries((currentEntries) => [
      ...currentEntries,
      { id: `student-${Date.now()}`, kind: "student", text },
    ]);
    setAnswer("");
    void step({ sessionId, answer: text });
  }

  if (!sessionId) {
    return (
      <>
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="text-center">
              <div className="gradient-brand mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl text-white">
                <Sparkles className="size-5" aria-hidden />
              </div>
              <h2 className="text-lg font-semibold text-ink-900">
                Beni Çalıştır modu
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
                Yapay zekâ sana konuyu anlatır, soru sorar, cevabını değerlendirir ve
                performansına göre zorluğu ayarlar.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="guided-document"
                  className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                  Materyal
                </label>
                <Select
                  id="guided-document"
                  value={documentId}
                  onChange={(event) => {
                    setDocumentId(event.target.value);
                    setTopicId("");
                  }}
                >
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label
                  htmlFor="guided-topic"
                  className="mb-1.5 block text-sm font-medium text-ink-700"
                >
                  Konu
                </label>
                <Select
                  id="guided-topic"
                  value={topicId}
                  onChange={(event) => setTopicId(event.target.value)}
                >
                  <option value="">Tüm konular</option>
                  {availableTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button block size="lg" loading={loading} onClick={start} disabled={!documentId}>
              <Play aria-hidden />
              Çalışmaya Başla
            </Button>
          </CardContent>
        </Card>

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

  const finished = current?.phase === "finished";

  return (
    <>
      <div className="flex h-[calc(100dvh-12rem)] flex-col gap-4">
        <Card className="shrink-0">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-ink-500">İlerleme</span>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">
                  {DIFFICULTY_LABEL[(current?.difficulty ?? 2) - 1] ?? "Orta"}
                </Badge>
                <span className="font-medium text-ink-900">
                  %{current?.progress ?? 0}
                </span>
              </div>
            </div>
            <Progress value={current?.progress ?? 0} />
          </CardContent>
        </Card>

        <div className="scroll-slim flex-1 space-y-4 overflow-y-auto pr-1">
          {entries.map((entry) => {
            if (entry.kind === "student") {
              return (
                <div key={entry.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white">
                    {entry.text}
                  </div>
                </div>
              );
            }

            if (entry.kind === "feedback") {
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-2xl border p-4 text-sm",
                    entry.correct
                      ? "border-success-500/30 bg-success-50 text-success-700"
                      : "border-warning-500/30 bg-warning-50 text-warning-700",
                  )}
                >
                  <p className="flex items-center gap-2 font-semibold">
                    {entry.correct ? (
                      <CheckCircle2 className="size-4" aria-hidden />
                    ) : (
                      <XCircle className="size-4" aria-hidden />
                    )}
                    {entry.correct ? "Doğru" : "Eksik kaldı"}
                  </p>
                  <p className="mt-1 leading-relaxed">{entry.text}</p>
                </div>
              );
            }

            return (
              <div key={entry.id} className="card p-4">
                <div
                  className="prose-study text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.text) }}
                />
              </div>
            );
          })}

          {loading ? (
            <div className="card flex items-center gap-2 p-4 text-sm text-ink-500">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Hazırlanıyor...
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {finished ? (
          <Card className="shrink-0">
            <CardContent className="flex flex-col gap-2 p-4 sm:flex-row">
              <Button
                block
                onClick={() => {
                  setSessionId(null);
                  setEntries([]);
                  setCurrent(null);
                }}
              >
                Yeni oturum başlat
              </Button>
              <Button variant="secondary" block onClick={() => router.push("/dashboard")}>
                Panele dön
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="shrink-0">
            <CardContent className="space-y-3 p-3">
              {current?.options && current.options.length > 0 ? (
                <div className="grid gap-2">
                  {current.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={loading}
                      onClick={() => submitAnswer(option)}
                      className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitAnswer(answer);
                      }
                    }}
                    placeholder="Cevabını yaz... (Enter ile gönder)"
                    className="resize-none border-0 focus:ring-0"
                    disabled={loading}
                  />
                  <Button
                    size="icon"
                    onClick={() => submitAnswer(answer)}
                    loading={loading}
                    disabled={!answer.trim()}
                    aria-label="Cevabı gönder"
                  >
                    <Send aria-hidden />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
