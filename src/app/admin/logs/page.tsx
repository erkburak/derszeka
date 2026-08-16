import { Badge, Card, CardContent, EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Audit Logs" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  "user.premium_granted": "Premium verildi",
  "user.premium_revoked": "Premium iptal edildi",
  "user.deactivated": "Kullanıcı pasifleştirildi",
  "user.activated": "Kullanıcı aktifleştirildi",
  "user.deleted": "Kullanıcı silindi",
  "user.role_changed": "Rol değiştirildi",
  "payment.approved": "Ödeme onaylandı",
  "payment.rejected": "Ödeme reddedildi",
  "ai_model.created": "AI modeli eklendi",
  "ai_model.updated": "AI modeli güncellendi",
  "ai_model.deleted": "AI modeli silindi",
  "ai_provider.key_updated": "Sağlayıcı anahtarı güncellendi",
  "ai_provider.toggled": "Sağlayıcı durumu değişti",
  "settings.updated": "Sistem ayarı değiştirildi",
  "plan_limit.updated": "Plan limiti değiştirildi",
  "document.deleted": "Materyal silindi",
  "legal.updated": "Yasal metin güncellendi",
};

function tone(action: string) {
  if (action.includes("deleted") || action.includes("rejected")) return "danger";
  if (action.includes("approved") || action.includes("granted")) return "success";
  if (action.startsWith("ai_")) return "brand";
  return "neutral";
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const { page } = await searchParams;
  const pageIndex = Math.max(Number(page) || 1, 1);

  const supabase = createAdminSupabase();
  const { data: logs, count } = await supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE - 1);

  const totalPages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Tüm admin işlemleri kayıt altında tutulur.
        </p>
      </div>

      {(logs ?? []).length === 0 ? (
        <EmptyState title="Henüz kayıt yok" />
      ) : (
        <Card>
          <CardContent className="scroll-slim overflow-x-auto p-0">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-line bg-surface-muted text-left">
                <tr className="text-xs tracking-wide text-ink-500 uppercase">
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">İşlem</th>
                  <th className="px-4 py-3 font-medium">Hedef</th>
                  <th className="px-4 py-3 font-medium">Detay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(logs ?? []).map((log) => (
                  <tr key={log.id} className="align-top hover:bg-surface-muted/60">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-500">
                      {formatDate(log.created_at as string, true)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-900">{log.actor_email ?? "—"}</p>
                      <p className="text-xs text-ink-400">{log.ip ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={tone(log.action as string)}>
                        {ACTION_LABEL[log.action as string] ?? log.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      <p>{log.entity_type ?? "—"}</p>
                      <p className="font-mono">{log.entity_id ?? ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      {log.after ? (
                        <pre className="scroll-slim max-w-md overflow-x-auto rounded-lg bg-surface-sunken p-2 text-xs text-ink-700">
                          {JSON.stringify(log.after, null, 1).slice(0, 400)}
                        </pre>
                      ) : (
                        <span className="text-xs text-ink-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
                href={`/admin/logs?page=${pageNumber}`}
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
