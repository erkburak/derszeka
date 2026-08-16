"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Input, Label, Progress, Textarea } from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";
import { cn, formatBytes } from "@/lib/utils";

interface TrackedDocument {
  id: string;
  title: string;
  status: string;
  progress: number;
  status_message: string | null;
  error_message: string | null;
}

const POLL_INTERVAL_MS = 2500;

export function UploadPanel({
  maxFiles,
  maxFileSizeMb,
  allowedMimeTypes,
  onDone,
}: {
  maxFiles: number;
  maxFileSizeMb: number;
  allowedMimeTypes: string[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"file" | "text">("file");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );
  const [tracked, setTracked] = useState<TrackedDocument[]>([]);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError(null);
      const next: File[] = [];
      for (const file of Array.from(incoming)) {
        if (!allowedMimeTypes.includes(file.type)) {
          setError(`"${file.name}" desteklenmeyen bir dosya türü.`);
          continue;
        }
        if (file.size > maxFileSizeMb * 1024 * 1024) {
          setError(`"${file.name}" ${maxFileSizeMb} MB sınırını aşıyor.`);
          continue;
        }
        next.push(file);
      }
      setFiles((current) => [...current, ...next].slice(0, maxFiles));
    },
    [allowedMimeTypes, maxFileSizeMb, maxFiles],
  );

  // İşlenmekte olan materyalleri arka planda yokla; kullanıcı sayfayı
  // kapatsa bile sunucudaki iş devam eder.
  useEffect(() => {
    const pending = tracked.filter(
      (doc) => doc.status !== "completed" && doc.status !== "failed",
    );
    if (pending.length === 0) return;

    const timer = setInterval(async () => {
      try {
        const ids = pending.map((doc) => doc.id).join(",");
        const data = await apiFetch<{ documents: TrackedDocument[] }>(
          `/api/documents?ids=${ids}`,
        );
        setTracked((current) =>
          current.map(
            (doc) => data.documents.find((fresh) => fresh.id === doc.id) ?? doc,
          ),
        );
        if (
          data.documents.every(
            (doc) => doc.status === "completed" || doc.status === "failed",
          )
        ) {
          router.refresh();
          onDone?.();
        }
      } catch {
        // Geçici ağ hatası — bir sonraki turda tekrar denenir.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [tracked, router, onDone]);

  async function handleUpload() {
    setError(null);
    setUploading(true);

    try {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      if (tab === "text" && text.trim()) {
        form.append("text", text.trim());
        form.append("title", title.trim());
      }

      const data = await apiFetch<{ documents: TrackedDocument[] }>(
        "/api/documents/upload",
        { method: "POST", body: form },
      );

      setTracked((current) => [
        ...data.documents.map((doc) => ({
          ...doc,
          progress: 0,
          status_message: "Sıraya alındı...",
          error_message: null,
        })),
        ...current,
      ]);
      setFiles([]);
      setText("");
      setTitle("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Yükleme başarısız oldu. Lütfen tekrar dene.");
      }
    } finally {
      setUploading(false);
    }
  }

  const canSubmit =
    !uploading && (files.length > 0 || (tab === "text" && text.trim().length >= 100));

  return (
    <>
      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex gap-1 rounded-xl bg-surface-sunken p-1">
            {(
              [
                ["file", "Dosya yükle"],
                ["text", "Metin yapıştır"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === value
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-700",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "file" ? (
            <>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  addFiles(event.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                  dragging
                    ? "border-brand-400 bg-brand-50"
                    : "border-line bg-surface-muted",
                )}
              >
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Upload className="size-5" aria-hidden />
                </div>
                <p className="text-sm font-medium text-ink-900">
                  Dosyalarını buraya sürükle
                </p>
                <p className="mt-1 text-xs text-ink-400">
                  PDF, JPG, PNG, WEBP, TXT, DOCX · en fazla {maxFileSizeMb} MB ·{" "}
                  {maxFiles} dosya
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => inputRef.current?.click()}
                >
                  Dosya seç
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={allowedMimeTypes.join(",")}
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              {files.length > 0 ? (
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5"
                    >
                      {file.type.startsWith("image/") ? (
                        <ImageIcon className="size-4 shrink-0 text-ink-400" aria-hidden />
                      ) : (
                        <FileText className="size-4 shrink-0 text-ink-400" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-900">
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-ink-400">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((current) => current.filter((_, i) => i !== index))
                        }
                        className="rounded-lg p-1.5 text-ink-400 hover:text-danger-700"
                        aria-label={`${file.name} dosyasını kaldır`}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="paste-title">Başlık</Label>
                <Input
                  id="paste-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Örn: Genetik Ders Notları"
                />
              </div>
              <div>
                <Label htmlFor="paste-text">Metin</Label>
                <Textarea
                  id="paste-text"
                  rows={10}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Ders notlarını buraya yapıştır (en az 100 karakter)..."
                  className="scroll-slim"
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  {text.trim().length} karakter
                </p>
              </div>
            </div>
          )}

          {error ? (
            <Alert tone="danger">
              <span className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </span>
            </Alert>
          ) : null}

          <Button block size="lg" loading={uploading} disabled={!canSubmit} onClick={handleUpload}>
            {uploading ? "Yükleniyor..." : "Yükle ve analiz et"}
          </Button>
        </CardContent>
      </Card>

      {tracked.length > 0 ? (
        <div className="mt-5 space-y-3">
          {tracked.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {doc.status === "completed" ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success-500" aria-hidden />
                    ) : doc.status === "failed" ? (
                      <AlertCircle className="size-4 shrink-0 text-danger-500" aria-hidden />
                    ) : (
                      <Loader2 className="size-4 shrink-0 animate-spin text-brand-500" aria-hidden />
                    )}
                    <span className="truncate text-sm font-medium text-ink-900">
                      {doc.title}
                    </span>
                  </div>
                  {doc.status === "completed" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => router.push(`/materials/${doc.id}`)}
                    >
                      Aç
                    </Button>
                  ) : null}
                </div>

                <p className="mt-2 text-xs text-ink-500">
                  {doc.status === "failed"
                    ? (doc.error_message ?? "İşlem tamamlanamadı.")
                    : (doc.status_message ?? "Sıraya alındı...")}
                </p>

                {doc.status !== "failed" ? (
                  <Progress
                    value={doc.progress}
                    className="mt-2"
                    tone={doc.status === "completed" ? "success" : "brand"}
                  />
                ) : null}
              </CardContent>
            </Card>
          ))}

          <p className="flex items-center gap-1.5 text-xs text-ink-400">
            <Trash2 className="size-3.5" aria-hidden />
            İşlem arka planda devam eder; bu sayfayı kapatabilirsin.
          </p>
        </div>
      ) : null}

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
