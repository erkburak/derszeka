import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

export interface AdminOverview {
  totalUsers: number;
  activeUsers7d: number;
  premiumUsers: number;
  newUsersToday: number;
  newUsers7d: number;
  totalDocuments: number;
  processingDocuments: number;
  failedDocuments: number;
  totalAIRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  totalCostTry: number;
  todayTokens: number;
  todayCostTry: number;
  pendingPayments: number;
  errorRate: number;
}

export interface DailyUsagePoint {
  day: string;
  tokens: number;
  costTry: number;
  requests: number;
}

function dayKey(offset: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const supabase = createAdminSupabase();
  const today = dayKey(0);
  const weekAgo = dayKey(6);

  const [
    users,
    premium,
    newToday,
    newWeek,
    activeWeek,
    documents,
    processing,
    failed,
    daily,
    todayRollup,
    pending,
    errors,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("plan", "premium"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${today}T00:00:00Z`),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", `${weekAgo}T00:00:00Z`),
    supabase
      .from("study_sessions")
      .select("user_id")
      .gte("started_at", `${weekAgo}T00:00:00Z`)
      .limit(5000),
    supabase.from("documents").select("id", { count: "exact", head: true }),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "extracting", "embedding", "analyzing", "generating"]),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("ai_usage_daily")
      .select("total_tokens, cost_usd, cost_try, request_count, error_count"),
    supabase
      .from("ai_usage_daily")
      .select("total_tokens, cost_try")
      .eq("day", today),
    supabase
      .from("payment_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("ai_usage_daily")
      .select("error_count, request_count")
      .gte("day", weekAgo),
  ]);

  const dailyRows = daily.data ?? [];
  const totalTokens = dailyRows.reduce(
    (sum, row) => sum + Number(row.total_tokens ?? 0),
    0,
  );
  const totalCostUsd = dailyRows.reduce(
    (sum, row) => sum + Number(row.cost_usd ?? 0),
    0,
  );
  const totalCostTry = dailyRows.reduce(
    (sum, row) => sum + Number(row.cost_try ?? 0),
    0,
  );
  const totalRequests = dailyRows.reduce(
    (sum, row) => sum + Number(row.request_count ?? 0),
    0,
  );

  const errorRows = errors.data ?? [];
  const weekRequests = errorRows.reduce(
    (sum, row) => sum + Number(row.request_count ?? 0),
    0,
  );
  const weekErrors = errorRows.reduce(
    (sum, row) => sum + Number(row.error_count ?? 0),
    0,
  );

  return {
    totalUsers: users.count ?? 0,
    activeUsers7d: new Set((activeWeek.data ?? []).map((row) => row.user_id)).size,
    premiumUsers: premium.count ?? 0,
    newUsersToday: newToday.count ?? 0,
    newUsers7d: newWeek.count ?? 0,
    totalDocuments: documents.count ?? 0,
    processingDocuments: processing.count ?? 0,
    failedDocuments: failed.count ?? 0,
    totalAIRequests: totalRequests,
    totalTokens,
    totalCostUsd,
    totalCostTry,
    todayTokens: (todayRollup.data ?? []).reduce(
      (sum, row) => sum + Number(row.total_tokens ?? 0),
      0,
    ),
    todayCostTry: (todayRollup.data ?? []).reduce(
      (sum, row) => sum + Number(row.cost_try ?? 0),
      0,
    ),
    pendingPayments: pending.count ?? 0,
    errorRate: weekRequests > 0 ? (weekErrors / weekRequests) * 100 : 0,
  };
}

export async function loadDailyUsage(days: number): Promise<DailyUsagePoint[]> {
  const supabase = createAdminSupabase();
  const from = dayKey(days - 1);

  const { data } = await supabase
    .from("ai_usage_daily")
    .select("day, total_tokens, cost_try, request_count")
    .gte("day", from)
    .order("day", { ascending: true });

  const byDay = new Map<string, DailyUsagePoint>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(i);
    byDay.set(key, { day: key, tokens: 0, costTry: 0, requests: 0 });
  }

  for (const row of data ?? []) {
    const key = row.day as string;
    const point = byDay.get(key);
    if (!point) continue;
    point.tokens += Number(row.total_tokens ?? 0);
    point.costTry += Number(row.cost_try ?? 0);
    point.requests += Number(row.request_count ?? 0);
  }

  return [...byDay.values()];
}

export async function loadModelBreakdown() {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_usage_daily")
    .select("provider, model_key, total_tokens, cost_try, request_count");

  const byModel = new Map<
    string,
    { name: string; tokens: number; costTry: number; requests: number }
  >();

  for (const row of data ?? []) {
    const key = `${row.provider}/${row.model_key}`;
    const entry = byModel.get(key) ?? {
      name: row.model_key as string,
      tokens: 0,
      costTry: 0,
      requests: 0,
    };
    entry.tokens += Number(row.total_tokens ?? 0);
    entry.costTry += Number(row.cost_try ?? 0);
    entry.requests += Number(row.request_count ?? 0);
    byModel.set(key, entry);
  }

  return [...byModel.values()].sort((a, b) => b.tokens - a.tokens);
}

export async function loadOperationBreakdown() {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_usage_daily")
    .select("operation, total_tokens, cost_try, request_count");

  const byOperation = new Map<
    string,
    { name: string; tokens: number; costTry: number; requests: number }
  >();

  for (const row of data ?? []) {
    const key = row.operation as string;
    const entry = byOperation.get(key) ?? {
      name: key,
      tokens: 0,
      costTry: 0,
      requests: 0,
    };
    entry.tokens += Number(row.total_tokens ?? 0);
    entry.costTry += Number(row.cost_try ?? 0);
    entry.requests += Number(row.request_count ?? 0);
    byOperation.set(key, entry);
  }

  return [...byOperation.values()].sort((a, b) => b.tokens - a.tokens);
}

/** Kullanıcı başına AI maliyeti — plan bazlı kırılımla. */
export async function loadCostPerUser() {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ai_requests")
    .select("user_id, user_plan, total_tokens, cost_try")
    .limit(50000);

  const freeUsers = new Set<string>();
  const premiumUsers = new Set<string>();
  let freeCost = 0;
  let premiumCost = 0;

  for (const row of data ?? []) {
    const cost = Number(row.cost_try ?? 0);
    if (row.user_plan === "premium") {
      premiumCost += cost;
      if (row.user_id) premiumUsers.add(row.user_id as string);
    } else {
      freeCost += cost;
      if (row.user_id) freeUsers.add(row.user_id as string);
    }
  }

  return {
    freeUserCount: freeUsers.size,
    premiumUserCount: premiumUsers.size,
    freeCostTotal: freeCost,
    premiumCostTotal: premiumCost,
    freeCostPerUser: freeUsers.size > 0 ? freeCost / freeUsers.size : 0,
    premiumCostPerUser: premiumUsers.size > 0 ? premiumCost / premiumUsers.size : 0,
  };
}

export async function loadSignupTrend(days: number) {
  const supabase = createAdminSupabase();
  const from = dayKey(days - 1);

  const { data } = await supabase
    .from("profiles")
    .select("created_at")
    .gte("created_at", `${from}T00:00:00Z`)
    .limit(10000);

  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i -= 1) byDay.set(dayKey(i), 0);

  for (const row of data ?? []) {
    const key = (row.created_at as string).slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return [...byDay.entries()].map(([day, count]) => ({ day, count }));
}
