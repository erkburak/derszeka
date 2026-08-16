import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Input,
  Select,
  Stat,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Search, Zap, Coins, Activity } from "lucide-react";
import {
  CostChart,
  ModelPieChart,
  OperationBarChart,
  TokenUsageChart,
} from "@/components/admin/charts";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  loadDailyUsage,
  loadModelBreakdown,
  loadOperationBreakdown,
} from "@/lib/admin-analytics";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "AI Kullanımı" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const OPERATIONS = [
  "DOCUMENT_ANALYSIS",
  "OCR",
  "SUMMARY",
  "TOPIC_EXTRACTION",
  "FLASHCARD_GENERATION",
  "QUIZ_GENERATION",
  "QUESTION_GENERATION",
  "ANSWER_EVALUATION",
  "AI_TUTOR",
  "STUDY_PLAN",
  "GUIDED_STUDY",
  "EMBEDDING",
];

export default async function AdminAIUsagePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    operation?: string;
    model?: string;
    plan?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const pageIndex = Math.max(Number(params.page) || 1, 1);

  const [usage7, usage30, models, operations] = await Promise.all([
    loadDailyUsage(7),
    loadDailyUsage(30),
    loadModelBreakdown(),
    loadOperationBreakdown(),
  ]);

  const supabase = createAdminSupabase();

  let query = supabase
    .from("ai_requests")
    .select(
      "id, user_id, user_plan, provider, model_key, operation, input_tokens, output_tokens, total_tokens, cost_try, cost_usd, duration_ms, status, error_code, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE - 1);

  if (params.operation) query = query.eq("operation", params.operation);
  if (params.model) query = query.eq("model_key", params.model);
  if (params.plan) query = query.eq("user_plan", params.plan);
  if (params.from) query = query.gte("created_at", `${params.from}T00:00:00Z`);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59Z`);

  const { data: requests, count } = await query;

  const userIds = [
    ...new Set((requests ?? []).map((row) => row.user_id).filter(Boolean)),
  ] as string[];

  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [] };

  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id as string, profile]),
  );

  const totals = usage30.reduce(
    (acc, point) => ({
      tokens: acc.tokens + point.tokens,
      cost: acc.cost + point.costTry,
      requests: acc.requests + point.requests,
    }),
    { tokens: 0, cost: 0, requests: 0 },
  );

  const totalPages = Math.max(Math.ceil((count ?? 0) / PAGE_SIZE), 1);

  function pageHref(pageNumber: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") query.set(key, value);
    }
    query.set("page", String(pageNumber));
    return `/admin/ai-usage?${query.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          AI Kullanımı
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Token tüketimi, maliyet ve istek geçmişi.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="30 günlük token"
          value={formatNumber(totals.tokens)}
          icon={<Zap className="size-5" aria-hidden />}
        />
        <Stat
          label="30 günlük maliyet"
          value={formatCurrency(totals.cost)}
          icon={<Coins className="size-5" aria-hidden />}
          tone="warning"
        />
        <Stat
          label="30 günlük istek"
          value={formatNumber(totals.requests)}
          icon={<Activity className="size-5" aria-hidden />}
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Token kullanımı — 7 gün</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenUsageChart data={usage7} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maliyet — 30 gün</CardTitle>
          </CardHeader>
          <CardContent>
            <CostChart data={usage30} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelPieChart data={models} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>İşlem tipine göre token</CardTitle>
          </CardHeader>
          <CardContent>
            <OperationBarChart data={operations} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Select name="operation" defaultValue={params.operation ?? ""}>
              <option value="">Tüm işlemler</option>
              {OPERATIONS.map((operation) => (
                <option key={operation} value={operation}>
                  {operation}
                </option>
              ))}
            </Select>

            <Select name="model" defaultValue={params.model ?? ""}>
              <option value="">Tüm modeller</option>
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </Select>

            <Select name="plan" defaultValue={params.plan ?? ""}>
              <option value="">Tüm planlar</option>
              <option value="free">Ücretsiz</option>
              <option value="premium">Premium</option>
            </Select>

            <Input type="date" name="from" defaultValue={params.from ?? ""} />
            <Input type="date" name="to" defaultValue={params.to ?? ""} />

            <Button type="submit" variant="secondary">
              <Search aria-hidden />
              Filtrele
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="scroll-slim overflow-x-auto p-0">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="border-b border-line bg-surface-muted text-left">
              <tr className="text-xs tracking-wide text-ink-500 uppercase">
                <th className="px-4 py-3 font-medium">Kullanıcı</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">İşlem</th>
                <th className="px-4 py-3 text-right font-medium">Input</th>
                <th className="px-4 py-3 text-right font-medium">Output</th>
                <th className="px-4 py-3 text-right font-medium">Toplam</th>
                <th className="px-4 py-3 text-right font-medium">Maliyet</th>
                <th className="px-4 py-3 text-right font-medium">Süre</th>
                <th className="px-4 py-3 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(requests ?? []).map((row) => {
                const profile = row.user_id
                  ? profileById.get(row.user_id as string)
                  : null;
                return (
                  <tr key={row.id} className="hover:bg-surface-muted/60">
                    <td className="px-4 py-3">
                      <p className="text-ink-900">
                        {profile?.full_name ?? "Silinmiş kullanıcı"}
                      </p>
                      <p className="text-xs text-ink-400">
                        {profile?.email ?? "—"}{" "}
                        {row.user_plan ? `· ${row.user_plan}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-ink-700">{row.model_key}</span>
                      <p className="text-xs text-ink-400">{row.provider}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === "error" ? "danger" : "neutral"}>
                        {row.operation}
                      </Badge>
                      {row.status === "error" ? (
                        <p className="mt-1 text-xs text-danger-700">
                          {row.error_code}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-700">
                      {formatNumber(Number(row.input_tokens))}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-700">
                      {formatNumber(Number(row.output_tokens))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink-900">
                      {formatNumber(Number(row.total_tokens))}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-700">
                      {formatCurrency(Number(row.cost_try))}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-ink-500">
                      {(Number(row.duration_ms) / 1000).toFixed(1)} sn
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {formatDate(row.created_at as string, true)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: Math.min(totalPages, 12) }, (_, i) => i + 1).map(
            (pageNumber) => (
              <a
                key={pageNumber}
                href={pageHref(pageNumber)}
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
