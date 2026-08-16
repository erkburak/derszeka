"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Label, Select } from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";

interface DocumentOption {
  id: string;
  title: string;
}

/** Kullanıcının istediği zaman ek flashcard veya quiz üretmesini sağlar. */
export function GeneratePanel({
  kind,
  documents,
  defaultDocumentId,
}: {
  kind: "flashcards" | "quiz";
  documents: DocumentOption[];
  defaultDocumentId?: string;
}) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState(
    defaultDocumentId ?? documents[0]?.id ?? "",
  );
  const [count, setCount] = useState(kind === "quiz" ? "10" : "15");
  const [mode, setMode] = useState("mixed");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );

  async function generate() {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (kind === "flashcards") {
        const data = await apiFetch<{ created: number }>("/api/generate", {
          json: { kind, documentId, count: Number(count) },
        });
        setSuccess(`${data.created} yeni flashcard üretildi.`);
      } else {
        const data = await apiFetch<{ quizId: string; questionCount: number }>(
          "/api/generate",
          { json: { kind, documentId, count: Number(count), mode, difficulty } },
        );
        setSuccess(`${data.questionCount} soruluk quiz hazır.`);
        router.push(`/quiz/${data.quizId}`);
        return;
      }
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Üretim başarısız oldu.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (documents.length === 0) return null;

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gen-document">Materyal</Label>
              <Select
                id="gen-document"
                value={documentId}
                onChange={(event) => setDocumentId(event.target.value)}
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="gen-count">
                {kind === "quiz" ? "Soru sayısı" : "Kart sayısı"}
              </Label>
              <Select
                id="gen-count"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              >
                {(kind === "quiz"
                  ? ["5", "10", "15", "20", "30"]
                  : ["10", "15", "20", "30", "50"]
                ).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>

            {kind === "quiz" ? (
              <>
                <div>
                  <Label htmlFor="gen-mode">Soru tipi</Label>
                  <Select
                    id="gen-mode"
                    value={mode}
                    onChange={(event) => setMode(event.target.value)}
                  >
                    <option value="mixed">Karma</option>
                    <option value="multiple_choice">Çoktan seçmeli</option>
                    <option value="true_false">Doğru / Yanlış</option>
                    <option value="fill_blank">Boşluk doldurma</option>
                    <option value="matching">Eşleştirme</option>
                    <option value="short_answer">Kısa cevap</option>
                    <option value="open_ended">Açık uçlu</option>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="gen-difficulty">Zorluk</Label>
                  <Select
                    id="gen-difficulty"
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value)}
                  >
                    <option value="easy">Kolay</option>
                    <option value="medium">Orta</option>
                    <option value="hard">Zor</option>
                    <option value="very_hard">Çok zor</option>
                  </Select>
                </div>
              </>
            ) : null}
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}
          {success ? <Alert tone="success">{success}</Alert> : null}

          <Button block loading={loading} onClick={generate} disabled={!documentId}>
            <Sparkles aria-hidden />
            {kind === "quiz" ? "Yeni quiz oluştur" : "Yeni flashcard üret"}
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
