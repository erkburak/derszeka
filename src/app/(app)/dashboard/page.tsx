import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Clock,
  Flame,
  Layers,
  Lightbulb,
  ListChecks,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Stat,
} from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { loadDashboard } from "@/lib/dashboard";
import { getUsageSummary } from "@/lib/limits";
import { formatDate, formatDuration, formatNumber } from "@/lib/utils";

export const metadata = { title: "Panel" };

const DAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export default async function DashboardPage() {
  const profile = await requireProfile();
  if (!profile.onboarding_completed) redirect("/onboarding");

  const [data, usage] = await Promise.all([
    loadDashboard(profile),
    getUsageSummary(profile),
  ]);

  const goalProgress =
    data.dailyGoalMinutes > 0
      ? (data.todaySeconds / 60 / data.dailyGoalMinutes) * 100
      : 0;
  const maxWeekly = Math.max(...data.weeklyMinutes.map((d) => d.minutes), 1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Merhaba, {profile.full_name?.split(" ")[0] ?? "öğrenci"} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Bu hafta {formatDuration(data.weekSeconds)} çalıştın.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/materials?upload=1">
            <Button>
              <Upload aria-hidden />
              Materyal Yükle
            </Button>
          </Link>
          <Link href="/study">
            <Button variant="secondary">
              <Sparkles aria-hidden />
              Çalışmaya Başla
            </Button>
          </Link>
        </div>
      </div>

      {/* Özet kartları */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Bugünkü çalışma"
          value={formatDuration(data.todaySeconds)}
          hint={`Hedef: ${data.dailyGoalMinutes} dk`}
          icon={<Clock className="size-5" aria-hidden />}
        />
        <Stat
          label="Toplam çalışma"
          value={formatDuration(data.totalSeconds)}
          hint={`${data.readyDocumentCount} materyal hazır`}
          icon={<BookOpen className="size-5" aria-hidden />}
          tone="neutral"
        />
        <Stat
          label="Quiz başarı ortalaması"
          value={`%${Math.round(data.averageQuizScore)}`}
          hint={`${data.quizAttempts} tamamlanan quiz`}
          icon={<ListChecks className="size-5" aria-hidden />}
          tone="success"
        />
        <Stat
          label="Flashcard başarısı"
          value={`%${Math.round(data.flashcardAccuracy)}`}
          hint={`${formatNumber(data.dueFlashcards)} kart tekrar bekliyor`}
          icon={<Layers className="size-5" aria-hidden />}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Günlük hedef + haftalık ilerleme */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Haftalık ilerleme</CardTitle>
              <Badge tone={goalProgress >= 100 ? "success" : "brand"}>
                <Target className="size-3.5" aria-hidden />
                Bugün %{Math.min(Math.round(goalProgress), 999)}
              </Badge>
            </CardHeader>
            <CardContent>
              <Progress
                value={goalProgress}
                tone={goalProgress >= 100 ? "success" : "brand"}
              />
              <p className="mt-2 text-xs text-ink-400">
                Günlük hedef: {data.dailyGoalMinutes} dakika ·{" "}
                {Math.round(data.todaySeconds / 60)} dakika tamamlandı
              </p>

              <div className="mt-6 flex h-40 items-end gap-2">
                {data.weeklyMinutes.map((day) => {
                  const height = Math.max((day.minutes / maxWeekly) * 100, 4);
                  const label = DAY_LABELS[new Date(day.date).getDay()];
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className="gradient-brand w-full rounded-t-lg transition-all"
                          style={{ height: `${height}%` }}
                          title={`${day.minutes} dakika`}
                        />
                      </div>
                      <span className="text-xs text-ink-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Güçlü / zayıf konular */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="size-4 text-danger-500" aria-hidden />
                  Zayıf konular
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.weakTopics.length === 0 ? (
                  <p className="text-sm text-ink-400">
                    Henüz yeterli veri yok. Quiz çözdükçe burası dolacak.
                  </p>
                ) : (
                  data.weakTopics.map((topic) => (
                    <div key={`${topic.documentId}-${topic.topicId}`}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate text-ink-700">{topic.title}</span>
                        <span className="ml-2 shrink-0 font-medium text-danger-700">
                          %{Math.round(topic.mastery * 100)}
                        </span>
                      </div>
                      <Progress value={topic.mastery * 100} tone="danger" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-success-500" aria-hidden />
                  Güçlü konular
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.strongTopics.length === 0 ? (
                  <p className="text-sm text-ink-400">
                    Çalışmaya devam et, güçlü konuların burada görünecek.
                  </p>
                ) : (
                  data.strongTopics.map((topic) => (
                    <div key={`${topic.documentId}-${topic.topicId}`}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="truncate text-ink-700">{topic.title}</span>
                        <span className="ml-2 shrink-0 font-medium text-success-700">
                          %{Math.round(topic.mastery * 100)}
                        </span>
                      </div>
                      <Progress value={topic.mastery * 100} tone="success" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          {/* AI önerileri */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="size-4 text-warning-500" aria-hidden />
                Öneriler
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.suggestions.map((suggestion) => (
                <p
                  key={suggestion}
                  className="rounded-xl bg-surface-muted px-3.5 py-3 text-sm text-ink-700"
                >
                  {suggestion}
                </p>
              ))}
            </CardContent>
          </Card>

          {/* Yaklaşan sınavlar */}
          <Card>
            <CardHeader>
              <CardTitle>Yaklaşan sınavlar</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcomingExams.length === 0 ? (
                <div className="text-sm text-ink-400">
                  Planlanmış sınavın yok.{" "}
                  <Link href="/plan" className="text-brand-600 hover:underline">
                    Çalışma planı oluştur
                  </Link>
                  .
                </div>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingExams.map((exam) => {
                    const daysLeft = exam.daysLeft;
                    return (
                      <li
                        key={exam.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink-900">
                            {exam.examName ?? exam.title}
                          </p>
                          <p className="text-xs text-ink-400">
                            {formatDate(exam.examDate)}
                          </p>
                        </div>
                        <Badge tone={daysLeft <= 7 ? "warning" : "neutral"}>
                          {daysLeft} gün
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Kullanım */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Kullanım</CardTitle>
              <Badge tone={profile.plan === "premium" ? "brand" : "neutral"}>
                {profile.plan === "premium" ? "Premium" : "Ücretsiz"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {usage.map((item) => (
                <div key={item.key}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-ink-500">{item.label}</span>
                    <span className="text-ink-700">
                      {formatNumber(item.used)} / {formatNumber(item.limit)}
                    </span>
                  </div>
                  <Progress
                    value={item.limit > 0 ? (item.used / item.limit) * 100 : 0}
                    tone={
                      item.limit > 0 && item.used / item.limit > 0.85
                        ? "warning"
                        : "brand"
                    }
                  />
                </div>
              ))}
              {profile.plan === "free" ? (
                <Link href="/premium" className="block pt-1">
                  <Button variant="outline" size="sm" block>
                    Limitleri yükselt
                  </Button>
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      {data.documentCount === 0 ? (
        <EmptyState
          icon={<Flame className="size-6" aria-hidden />}
          title="Henüz materyalin yok"
          description="İlk ders materyalini yükle ve yapay zekâ ile çalışmaya başla."
          action={
            <Link href="/materials?upload=1">
              <Button size="lg">
                <Upload aria-hidden />
                Materyal Yükle
              </Button>
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
