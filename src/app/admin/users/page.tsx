import { Ban, CheckCircle2, Crown, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input, Select } from "@/components/ui";
import { createAdminSupabase } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { formatCurrency, formatDate, formatNumber, relativeTime } from "@/lib/utils";
import {
  deleteUserAction,
  grantPremiumAction,
  revokePremiumAction,
  toggleUserActiveAction,
} from "@/app/admin/actions";

export const metadata = { title: "Kullanıcılar" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; page?: string }>;
}) {
  const currentAdmin = await requireAdmin();
  const { q, plan, page } = await searchParams;
  const pageIndex = Math.max(Number(page) || 1, 1);

  const supabase = createAdminSupabase();

  let query = supabase
    .from("profiles")
    .select(
      "id, email, full_name, role, plan, plan_expires_at, is_active, created_at, last_login_at, xp, streak_count",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE - 1);

  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  if (plan === "free" || plan === "premium") query = query.eq("plan", plan);

  const { data: users, count } = await query;
  const userIds = (users ?? []).map((user) => user.id as string);

  const [{ data: usageRows }, { data: documentRows }] = await Promise.all([
    userIds.length
      ? supabase
          .from("ai_usage_daily")
          .select("user_id, total_tokens, cost_try")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; total_tokens: number; cost_try: number }[] }),
    userIds.length
      ? supabase.from("documents").select("owner_id").in("owner_id", userIds)
      : Promise.resolve({ data: [] as { owner_id: string }[] }),
  ]);

  const usageByUser = new Map<string, { tokens: number; cost: number }>();
  for (const row of usageRows ?? []) {
    const key = row.user_id as string;
    const entry = usageByUser.get(key) ?? { tokens: 0, cost: 0 };
    entry.tokens += Number(row.total_tokens ?? 0);
    entry.cost += Number(row.cost_try ?? 0);
    usageByUser.set(key, entry);
  }

  const documentsByUser = new Map<string, number>();
  for (const row of documentRows ?? []) {
    const key = row.owner_id as string;
    documentsByUser.set(key, (documentsByUser.get(key) ?? 0) + 1);
  }

  const totalPages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Kullanıcılar
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {formatNumber(count ?? 0)} kayıtlı kullanıcı
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="E-posta veya ada göre ara"
            />
            <Select name="plan" defaultValue={plan ?? ""}>
              <option value="">Tüm planlar</option>
              <option value="free">Ücretsiz</option>
              <option value="premium">Premium</option>
            </Select>
            <Button type="submit" variant="secondary">
              <Search aria-hidden />
              Ara
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="scroll-slim overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line bg-surface-muted text-left">
              <tr className="text-xs tracking-wide text-ink-500 uppercase">
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Materyal</th>
                <th className="px-4 py-3 text-right font-medium">Token</th>
                <th className="px-4 py-3 text-right font-medium">AI maliyeti</th>
                <th className="px-4 py-3 font-medium">Son giriş</th>
                <th className="px-4 py-3 font-medium">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(users ?? []).map((user) => {
                const usage = usageByUser.get(user.id as string);
                const isSelf = user.id === currentAdmin.id;

                return (
                  <tr key={user.id} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-ink-900">
                            {user.full_name ?? "—"}
                          </p>
                          <p className="text-xs text-ink-400">{user.email ?? "—"}</p>
                        </div>
                        {user.role === "admin" ? (
                          <Badge tone="brand">Admin</Badge>
                        ) : null}
                        {!user.is_active ? <Badge tone="danger">Pasif</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-400">
                        Kayıt: {formatDate(user.created_at as string)}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <Badge tone={user.plan === "premium" ? "brand" : "neutral"}>
                        {user.plan === "premium" ? "Premium" : "Ücretsiz"}
                      </Badge>
                      {user.plan_expires_at ? (
                        <p className="mt-1 text-xs text-ink-400">
                          {formatDate(user.plan_expires_at as string)}
                        </p>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-ink-700">
                      {documentsByUser.get(user.id as string) ?? 0}
                    </td>

                    <td className="px-4 py-3 text-right text-ink-700">
                      {formatNumber(usage?.tokens ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-right text-ink-700">
                      {formatCurrency(usage?.cost ?? 0)}
                    </td>

                    <td className="px-4 py-3 text-xs text-ink-500">
                      {user.last_login_at
                        ? relativeTime(user.last_login_at as string)
                        : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {user.plan === "premium" ? (
                          <form action={revokePremiumAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Premium iptal
                            </Button>
                          </form>
                        ) : (
                          <form action={grantPremiumAction} className="flex gap-1">
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="months" value="1" />
                            <Button type="submit" size="sm" variant="outline">
                              <Crown aria-hidden />
                              Premium
                            </Button>
                          </form>
                        )}

                        {!isSelf ? (
                          <>
                            <form action={toggleUserActiveAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <input
                                type="hidden"
                                name="isActive"
                                value={String(user.is_active)}
                              />
                              <Button type="submit" size="sm" variant="ghost">
                                {user.is_active ? (
                                  <Ban aria-hidden />
                                ) : (
                                  <CheckCircle2 aria-hidden />
                                )}
                                {user.is_active ? "Pasifleştir" : "Aktifleştir"}
                              </Button>
                            </form>

                            <form action={deleteUserAction}>
                              <input type="hidden" name="userId" value={user.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                <Trash2 className="text-danger-500" aria-hidden />
                              </Button>
                            </form>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, index) => index + 1).map(
            (pageNumber) => (
              <a
                key={pageNumber}
                href={`/admin/users?page=${pageNumber}${q ? `&q=${encodeURIComponent(q)}` : ""}${plan ? `&plan=${plan}` : ""}`}
                className={
                  pageNumber === pageIndex
                    ? "gradient-brand rounded-lg px-3 py-1.5 text-sm text-white"
                    : "rounded-lg border border-line px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-sunken"
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
