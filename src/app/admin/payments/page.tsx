import { Check, FileDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { reviewPaymentAction } from "@/app/admin/actions";
import type { PaymentStatus } from "@/lib/types";

export const metadata = { title: "Ödemeler" };
export const dynamic = "force-dynamic";

const TONE: Record<PaymentStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

const LABEL: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = (status ?? "pending") as PaymentStatus | "all";

  const supabase = createAdminSupabase();
  let query = supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter !== "all") query = query.eq("status", filter);

  const { data: payments } = await query;
  const userIds = [...new Set((payments ?? []).map((row) => row.user_id as string))];

  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, email, full_name, plan, plan_expires_at")
        .in("id", userIds)
    : { data: [] };

  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile]),
  );

  // Dekontlar özel bucket'ta; kısa ömürlü imzalı bağlantı üretilir.
  const receiptUrls = new Map<string, string>();
  for (const payment of payments ?? []) {
    if (!payment.receipt_path) continue;
    const { data } = await supabase.storage
      .from("receipts")
      .createSignedUrl(payment.receipt_path as string, 600);
    if (data?.signedUrl) receiptUrls.set(payment.id as string, data.signedUrl);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Ödemeler
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Havale/EFT bildirimlerini incele ve onayla.
          </p>
        </div>

        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          {(
            [
              ["pending", "Bekleyen"],
              ["approved", "Onaylanan"],
              ["rejected", "Reddedilen"],
              ["all", "Tümü"],
            ] as const
          ).map(([value, label]) => (
            <a
              key={value}
              href={`/admin/payments?status=${value}`}
              className={
                filter === value
                  ? "gradient-brand rounded-lg px-3 py-1.5 text-sm text-white"
                  : "rounded-lg px-3 py-1.5 text-sm text-ink-600 hover:bg-surface-sunken"
              }
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      {(payments ?? []).length === 0 ? (
        <EmptyState
          title="Bu filtrede ödeme bildirimi yok"
          description="Kullanıcılar Premium sayfasından ödeme bildirdiğinde burada görünür."
        />
      ) : (
        <div className="space-y-4">
          {(payments ?? []).map((payment) => {
            const profile = profileById.get(payment.user_id as string);
            const receiptUrl = receiptUrls.get(payment.id as string);
            const paymentStatus = payment.status as PaymentStatus;

            return (
              <Card key={payment.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-ink-900">
                          {payment.full_name}
                        </h3>
                        <Badge tone={TONE[paymentStatus]}>
                          {LABEL[paymentStatus]}
                        </Badge>
                        {profile?.plan === "premium" ? (
                          <Badge tone="brand">Şu an Premium</Badge>
                        ) : null}
                      </div>

                      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Bildirilen e-posta:</dt>
                          <dd className="text-ink-900">{payment.email}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Hesap e-postası:</dt>
                          <dd className="text-ink-900">{profile?.email ?? "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Tutar:</dt>
                          <dd className="font-medium text-ink-900">
                            {formatCurrency(
                              Number(payment.amount),
                              payment.currency as string,
                            )}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Tarih:</dt>
                          <dd className="text-ink-900">
                            {formatDate(payment.created_at as string, true)}
                          </dd>
                        </div>
                      </dl>

                      {payment.note ? (
                        <p className="mt-3 rounded-xl bg-surface-muted p-3 text-sm text-ink-700">
                          {payment.note}
                        </p>
                      ) : null}

                      {payment.admin_note ? (
                        <p className="mt-2 text-xs text-ink-400">
                          Admin notu: {payment.admin_note}
                        </p>
                      ) : null}
                    </div>

                    {receiptUrl ? (
                      <a
                        href={receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm text-brand-600 hover:bg-brand-50"
                      >
                        <FileDown className="size-4" aria-hidden />
                        Dekontu görüntüle
                      </a>
                    ) : (
                      <span className="text-xs text-ink-400">Dekont yüklenmemiş</span>
                    )}
                  </div>

                  {paymentStatus === "pending" ? (
                    <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_140px_auto_auto]">
                      <form
                        action={reviewPaymentAction}
                        className="contents"
                        id={`approve-${payment.id}`}
                      >
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <div>
                          <Label htmlFor={`note-${payment.id}`}>Admin notu</Label>
                          <Input
                            id={`note-${payment.id}`}
                            name="adminNote"
                            placeholder="Opsiyonel"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`months-${payment.id}`}>Süre</Label>
                          <Select
                            id={`months-${payment.id}`}
                            name="months"
                            defaultValue="1"
                          >
                            {[1, 2, 3, 6, 12].map((month) => (
                              <option key={month} value={month}>
                                {month} ay
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="submit"
                            name="decision"
                            value="approve"
                            variant="success"
                          >
                            <Check aria-hidden />
                            Onayla
                          </Button>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="submit"
                            name="decision"
                            value="reject"
                            variant="danger"
                          >
                            <X aria-hidden />
                            Reddet
                          </Button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
