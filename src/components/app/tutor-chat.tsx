"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Quote, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Select, Textarea } from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";
import { cn, renderMarkdown } from "@/lib/utils";
import type { Citation } from "@/lib/types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

const SUGGESTIONS = [
  "Bu konuyu bana 10 yaşındaki bir çocuğa anlatır gibi anlat.",
  "Bu konudan sınavda ne sorulabilir?",
  "Bu bölümü daha kolay ezberlemem için yöntem geliştir.",
  "Bu konuyu bana soru sorarak öğret.",
  "Bu konunun en kritik 10 bilgisini söyle.",
];

export function TutorChat({
  documents,
  initialDocumentId,
  initialConversationId,
  initialMessages,
}: {
  documents: { id: string; title: string }[];
  initialDocumentId?: string;
  initialConversationId?: string;
  initialMessages: ChatMessage[];
}) {
  const [documentId, setDocumentId] = useState(initialDocumentId ?? "");
  const [conversationId, setConversationId] = useState(initialConversationId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;

    setError(null);
    setSending(true);
    setInput("");
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: "user", content: question },
    ]);

    try {
      const data = await apiFetch<{
        conversationId: string;
        reply: string;
        citations: Citation[];
      }>("/api/tutor", {
        json: {
          conversationId,
          documentIds: documentId ? [documentId] : undefined,
          message: question,
        },
      });

      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          citations: data.citations,
        },
      ]);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Mesaj gönderilemedi. Lütfen tekrar dene.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="flex h-[calc(100dvh-11rem)] flex-col gap-4">
        <Card className="shrink-0">
          <CardContent className="p-3">
            <Select
              value={documentId}
              onChange={(event) => {
                setDocumentId(event.target.value);
                setConversationId(null);
                setMessages([]);
              }}
              aria-label="Materyal seç"
            >
              <option value="">Tüm materyallerim</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </Select>
          </CardContent>
        </Card>

        <div className="scroll-slim flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <div className="card p-6 text-center">
              <div className="gradient-brand mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl text-white">
                <Sparkles className="size-5" aria-hidden />
              </div>
              <h2 className="font-semibold text-ink-900">
                Kendi notlarınla çalışan öğretmenin
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
                Cevaplar yalnızca yüklediğin materyallere dayanır ve kaynak gösterir.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border border-line bg-white px-3.5 py-2 text-xs text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-ink-900 text-white"
                      : "card",
                  )}
                >
                  {message.role === "assistant" ? (
                    <>
                      <div
                        className="prose-study text-sm"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(message.content),
                        }}
                      />
                      {message.citations && message.citations.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                          {message.citations.slice(0, 5).map((citation, index) => (
                            <span
                              key={`${citation.document_id}-${index}`}
                              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700"
                            >
                              <Quote className="size-3" aria-hidden />
                              {citation.document_title}
                              {citation.page ? ` · s.${citation.page}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))
          )}

          {sending ? (
            <div className="flex justify-start">
              <div className="card flex items-center gap-2 px-4 py-3 text-sm text-ink-500">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Öğretmenin düşünüyor...
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Card className="shrink-0">
          <CardContent className="p-3">
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder="Materyalinle ilgili bir şey sor... (Enter ile gönder)"
                className="min-h-0 resize-none border-0 focus:ring-0"
                disabled={sending}
              />
              <Button
                size="icon"
                onClick={() => send(input)}
                loading={sending}
                disabled={!input.trim()}
                aria-label="Gönder"
              >
                <Send aria-hidden />
              </Button>
            </div>
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
