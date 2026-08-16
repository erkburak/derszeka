import Link from "next/link";
import {
  AlertTriangle,
  Coins,
  CreditCard,
  Crown,
  FileText,
  Loader2,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Stat,
} from "@/components/ui";
import {
  CostChart,
  ModelPieChart,
  SignupChart,
  TokenUsageChart,
} from "@/components/admin/charts";
import {
  loadAdminOverview,
  loadCostPerUser,
  loadDailyUsage,
  loadModelBreakdown,
  loadSignupTrend,
} from "@/lib/admin-analytics";
import { formatCurrency, formatNumber } from "@/lib/utils";

export const metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [overview, usage7, usage30, models, signups, costPerUser] =
    await Promise.all([
      loadAdminOverview(),
      loadDailyUsage(7),
      loadDailyUsage(30),
      loadModelBreakdown(),
      loadSignupTrend(14),
      loadCostPerUser(),
    ]);

  const conversionRate =
    overview.totalUsers > 0
      ? (overview.premiumUsers / overview.totalUsers) * 100
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Sistem durumu, kullanım ve maliyet özeti.
        </p>
      </div>

      {overview.pendingPayments > 0 ? (
        <Alert tone="warning">
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <CreditCard className="size-4" aria-hidden />
              {overview.pendingPayments} ödeme bildirimi onay bekliyor.
            </span>
            <Link href="/admin/payments" className="font-medium underline">
              İncele
            </Link>
          </span>
        </Alert>
      ) : null}

      {overview.failedDocuments > 0 ? (
        <Alert tone="danger">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4" aria-hidden />
            {overview.failedDocuments} materyal işlenemedi. AI sağlayıcı ayarlarını
            ve logları kontrol et.
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Toplam kullanıcı"
          value={formatNumber(overview.totalUsers)}
          hint={`Bugün +${overview.newUsersToday} · 7 gün +${overview.newUsers7d}`}
          icon={<Users className="size-5" aria-hidden />}
        />
        <Stat
          label="Aktif kullanıcı (7g)"
          value={formatNumber(overview.activeUsers7d)}
          hint="Son 7 günde çalışma kaydı olan"
          icon={<TrendingUp className="size-5" aria-hidden />}
          tone="success"
        />
        <Stat
          label="Premium kullanıcı"
          value={formatNumber(overview.premiumUsers)}
          hint={`Dönüşüm: %${conversionRate.toFixed(1)}`}
          icon={<Crown className="size-5" aria-hidden />}
          tone="warning"
        />
        <Stat
          label="Bekleyen ödeme"
          value={formatNumber(overview.pendingPayments)}
          hint="Onay bekliyor"
          icon={<CreditCard className="size-5" aria-hidden />}
          tone="neutral"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Toplam token"
          value={formatNumber(overview.totalTokens)}
          hint={`Bugün ${formatNumber(overview.todayTokens)}`}
          icon={<Zap className="size-5" aria-hidden />}
        />
        <Stat
          label="Toplam AI maliyeti"
          value={formatCurrency(overview.totalCostTry)}
          hint={`${formatCurrency(overview.totalCostUsd, "USD")} · bugün ${formatCurrency(overview.todayCostTry)}`}
          icon={<Coins className="size-5" aria-hidden />}
          tone="warning"
        />
        <Stat
          label="Toplam materyal"
          value={formatNumber(overview.totalDocuments)}
          hint={`${overview.processingDocuments} işleniyor · ${overview.failedDocuments} hatalı`}
          icon={<FileText className="size-5" aria-hidden />}
          tone="neutral"
        />
        <Stat
          label="AI hata oranı (7g)"
          value={`%${overview.errorRate.toFixed(1)}`}
          hint={`${formatNumber(overview.totalAIRequests)} toplam istek`}
          icon={
            overview.errorRate > 5 ? (
              <AlertTriangle className="size-5" aria-hidden />
            ) : (
              <Loader2 className="size-5" aria-hidden />
            )
          }
          tone={overview.errorRate > 5 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI token kullanımı — 7 gün</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenUsageChart data={usage7} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI maliyeti — 30 gün</CardTitle>
          </CardHeader>
          <CardContent>
            <CostChart data={usage30} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model kullanım dağılımı</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelPieChart data={models} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Günlük kullanıcı kayıtları — 14 gün</CardTitle>
          </CardHeader>
          <CardContent>
            <SignupChart data={signups} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4 text-brand-600" aria-hidden />
            Kullanıcı başına AI maliyeti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500">Ücretsiz kullanıcılar</span>
                <Badge tone="neutral">{costPerUser.freeUserCount} kişi</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink-900">
                {formatCurrency(costPerUser.freeCostPerUser)}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Toplam {formatCurrency(costPerUser.freeCostTotal)}
              </p>
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500">Premium kullanıcılar</span>
                <Badge tone="brand">{costPerUser.premiumUserCount} kişi</Badge>
              </div>
              <p className="mt-2 text-2xl font-semibold text-ink-900">
                {formatCurrency(costPerUser.premiumCostPerUser)}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                Toplam {formatCurrency(costPerUser.premiumCostTotal)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
