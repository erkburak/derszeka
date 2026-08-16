import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Badge, Card, CardContent, EmptyState, Progress } from "@/components/ui";
import { UploadPanel } from "@/components/app/upload-panel";
import { requireProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { getPublicSettings } from "@/lib/settings";
import { getLimit } from "@/lib/limits";
import { kickWorker } from "@/lib/jobs/kick";
import { formatBytes, relativeTime } from "@/lib/utils";
import type { DocumentStatus } from "@/lib/types";

export const metadata = { title: "Materyaller" };

const STATUS_TONE: Record<DocumentStatus, "neutral" | "brand" | "success" | "danger"> = {
  queued: "neutral",
  extracting: "brand",
  embedding: "brand",
  analyzing: "brand",
  generating: "brand",
  completed: "success",
  failed: "danger",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  queued: "Sırada",
  extracting: "Metin çıkarılıyor",
  embedding: "İndeksleniyor",
  analyzing: "Analiz ediliyor",
  generating: "Materyal üretiliyor",
  completed: "Hazır",
  failed: "Başarısız",
};

export default async function MaterialsPage() {
  const profile = await requireProfile();
  const [settings, maxFileSizeMb] = await Promise.all([
    getPublicSettings(),
    getLimit(profile.plan, "max_file_size_mb"),
  ]);

  const supabase = await createServerSupabase();
  const { data: documents } = await supabase
    .from("documents")
    .select(
      "id, title, mime_type, file_size, status, progress, status_message, page_count, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const rows = documents ?? [];

  // Yarıda kalmış bir iş varsa bu sayfanın açılması onu yeniden başlatır.
  if (
    rows.some(
      (doc) => !["completed", "failed"].includes(doc.status as string),
    )
  ) {
    kickWorker(1);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Materyaller
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          PDF, fotoğraf, Word dosyası veya kopyaladığın metni yükle.
        </p>
      </div>

      <UploadPanel
        maxFiles={settings.maxUploadFiles}
        maxFileSizeMb={maxFileSizeMb}
        allowedMimeTypes={settings.allowedMimeTypes}
      />

      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink-900">
          Yüklediklerin{" "}
          <span className="text-sm font-normal text-ink-400">({rows.length})</span>
        </h2>

        {rows.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-6" aria-hidden />}
            title="Henüz materyalin yok"
            description="İlk ders materyalini yükle ve yapay zekâ ile çalışmaya başla."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((doc) => {
              const status = doc.status as DocumentStatus;
              const inProgress = !["completed", "failed"].includes(status);

              return (
                <li key={doc.id}>
                  <Link href={`/materials/${doc.id}`} className="block">
                    <Card className="card-interactive h-full">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                            {(doc.mime_type as string).startsWith("image/") ? (
                              <ImageIcon className="size-5" aria-hidden />
                            ) : (
                              <FileText className="size-5" aria-hidden />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink-900">
                              {doc.title}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-400">
                              {formatBytes(Number(doc.file_size))}
                              {doc.page_count ? ` · ${doc.page_count} sayfa` : ""} ·{" "}
                              {relativeTime(doc.created_at as string)}
                            </p>
                          </div>

                          <Badge tone={STATUS_TONE[status]} className="shrink-0">
                            {status === "completed" ? (
                              <CheckCircle2 className="size-3" aria-hidden />
                            ) : status === "failed" ? (
                              <AlertCircle className="size-3" aria-hidden />
                            ) : (
                              <Loader2 className="size-3 animate-spin" aria-hidden />
                            )}
                            {STATUS_LABEL[status]}
                          </Badge>
                        </div>

                        {inProgress ? (
                          <>
                            <Progress value={Number(doc.progress)} className="mt-3" />
                            <p className="mt-1.5 text-xs text-ink-400">
                              {doc.status_message}
                            </p>
                          </>
                        ) : null}
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
