"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";

interface DocumentStatusRow {
  id: string;
  status: string;
  progress: number;
  status_message: string | null;
  error_message: string | null;
}

const POLL_MS = 3000;
const TERMINAL = ["completed", "failed"];

/**
 * İşlenmekte olan materyalin durumunu canlı gösterir.
 *
 * Yoklama isteği aynı zamanda sunucuda iş kuyruğunu tetikler: bir süreç
 * yarıda öldüyse (dev sunucusu yeniden başladı, serverless zaman aşımı)
 * iş burada yeniden alınır. Bu sayfa açık olduğu sürece takılı kalmaz.
 */
export function DocumentProgress({
  documentId,
  initialProgress,
  initialMessage,
}: {
  documentId: string;
  initialProgress: number;
  initialMessage: string | null;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [message, setMessage] = useState(initialMessage);
  const [stalledFor, setStalledFor] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const timer = setInterval(async () => {
      try {
        const data = await apiFetch<{ documents: DocumentStatusRow[] }>(
          `/api/documents?ids=${documentId}`,
        );
        const doc = data.documents[0];
        if (!doc || cancelled) return;

        setProgress((current) => {
          if (doc.progress !== current) setStalledFor(0);
          return doc.progress;
        });
        setMessage(doc.status_message);
        setStalledFor((value) => value + POLL_MS);

        if (TERMINAL.includes(doc.status)) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // Geçici ağ hatası — sonraki turda tekrar denenir.
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [documentId, router]);

  return (
    <div className="space-y-3">
      <p className="flex items-center justify-center gap-2 text-sm text-ink-500">
        <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />
        {message ?? "Hazırlanıyor..."}
      </p>

      <Progress value={progress} />

      <p className="text-xs text-ink-400">
        Bu işlem arka planda devam ediyor. Sayfayı kapatabilirsin — hazır
        olduğunda bildirim alacaksın.
      </p>

      {stalledFor > 90_000 ? (
        <p className="text-xs text-warning-700">
          Bu adım beklenenden uzun sürüyor. Uzun materyallerde analiz birkaç
          dakika alabilir; sayfayı açık bırakman yeterli.
        </p>
      ) : null}
    </div>
  );
}
