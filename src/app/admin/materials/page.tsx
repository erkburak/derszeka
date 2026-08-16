import Link from "next/link";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, EmptyState, Input, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatBytes, formatDate, formatNumber } from "@/lib/utils";
import { deleteDocumentAction } from "@/app/admin/actions";
import type { DocumentStatus } from "@/lib/types";

export const metadata = { title: "Materyaller" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

const TONE: Record<DocumentStatus, "neutral" | "brand" | "success" | "danger"> = {
  queued: "neutral",
  extracting: "brand",
  embedding: "brand",
  analyzing: "brand",
  generating: "brand",
  completed: "success",
  failed: "danger",
};

export default async function AdminMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const { q, status, page } = await searchParams;
  const pageIndex = Math.max(Number(page) || 1, 1);

  const supabase = createAdminSupabase();

  let query = supabase
    .from("documents")
    .select(
      "id, owner_id, title, mime_type, file_size, status, page_count, char_count, error_message, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE - 1);

  if (q) query = query.ilike("title", `%${q}%`);
  if (status) query = query.eq("status", status);

  const { data: documents, count } = await query;
  const ownerIds = [
    ...new Set((documents ?? []).map((doc) => doc.owner_id as string)),
  ];

  const { data: owners } = ownerIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", ownerIds)
    : { data: [] };

  const ownerById = new Map(
    (owners ?? []).map((owner) => [owner.id as string, owner]),
  );

  const totalPages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Materyaller
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatNumber(count ?? 0)} materyal
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
            <Input name="q" defaultValue={q ?? ""} placeholder="Başlığa göre ara" />
            <Select name="status" defaultValue={status ?? ""}>
              <option value="">Tüm durumlar</option>
              <option value="queued">Sırada</option>
              <option value="extracting">Metin çıkarılıyor</option>
              <option value="embedding">İndeksleniyor</option>
              <option value="analyzing">Analiz ediliyor</option>
              <option value="generating">Üretiliyor</option>
              <option value="completed">Hazır</option>
              <option value="failed">Başarısız</option>
            </Select>
            <Button type="submit" variant="secondary">
              <Search aria-hidden />
              Ara
            </Button>
          </form>
        </CardContent>
      </Card>

      {(documents ?? []).length === 0 ? (
        <EmptyState title="Materyal bulunamadı" />
      ) : (
        <Card>
          <CardContent className="scroll-slim overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-line bg-surface-muted text-left">
                <tr className="text-xs tracking-wide text-ink-500 uppercase">
                  <th className="px-4 py-3 font-medium">Materyal</th>
                  <th className="px-4 py-3 font-medium">Sahip</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 text-right font-medium">Boyut</th>
                  <th className="px-4 py-3 text-right font-medium">Sayfa</th>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(documents ?? []).map((doc) => {
                  const owner = ownerById.get(doc.owner_id as string);
                  return (
                    <tr key={doc.id} className="hover:bg-surface-muted/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/materials/${doc.id}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {doc.title}
                        </Link>
                        <p className="text-xs text-ink-400">{doc.mime_type}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-ink-700">{owner?.full_name ?? "—"}</p>
                        <p className="text-xs text-ink-400">{owner?.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={TONE[doc.status as DocumentStatus]}>
                          {doc.status}
                        </Badge>
                        {doc.error_message ? (
                          <p className="mt-1 max-w-56 truncate text-xs text-danger-700">
                            {doc.error_message}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700">
                        {formatBytes(Number(doc.file_size))}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-700">
                        {doc.page_count}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500">
                        {formatDate(doc.created_at as string)}
                      </td>
                      <td className="px-4 py-3">
                        <form action={deleteDocumentAction}>
                          <input type="hidden" name="documentId" value={doc.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            <Trash2 className="text-danger-500" aria-hidden />
                          </Button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 12) }, (_, i) => i + 1).map(
            (pageNumber) => (
              <a
                key={pageNumber}
                href={`/admin/materials?page=${pageNumber}${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`}
                className={
                  pageNumber === pageIndex
                    ? "gradient-brand rounded-lg px-3 py-1.5 text-sm text-white"
                    : "rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-sunken"
                }
              >
                {pageNumber}
              </a>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
