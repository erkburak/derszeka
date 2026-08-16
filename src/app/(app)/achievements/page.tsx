import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  Award,
  Clock,
  Crown,
  Flame,
  Layers,
  Library,
  ListChecks,
  Lock,
  Medal,
  MessageCircleQuestion,
  Target,
  Trophy,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Progress,
  Stat,
} from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import {
  loadBadgeBoard,
  loadLeaderboards,
  loadOwnRank,
  type BadgeTier,
} from "@/lib/study/badges";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export const metadata = { title: "Rozetler" };
export const dynamic = "force-dynamic";

const ICONS: Record<string, typeof Award> = {
  upload: Upload,
  library: Library,
  "library-big": Library,
  flame: Flame,
  "list-check": ListChecks,
  target: Target,
  layers: Layers,
  clock: Clock,
  message: MessageCircleQuestion,
  award: Award,
};

const TIER_STYLE: Record<BadgeTier, { ring: string; chip: string; label: string }> = {
  bronze: {
    ring: "bg-[#fdf1e6] text-[#b45309]",
    chip: "bg-[#fdf1e6] text-[#b45309]",
    label: "Bronz",
  },
  silver: {
    ring: "bg-surface-sunken text-ink-700",
    chip: "bg-surface-sunken text-ink-700",
    label: "Gümüş",
  },
  gold: {
    ring: "bg-warning-50 text-warning-700",
    chip: "bg-warning-50 text-warning-700",
    label: "Altın",
  },
  platinum: {
    ring: "bg-brand-50 text-brand-700",
    chip: "bg-brand-50 text-brand-700",
    label: "Platin",
  },
};

const METRIC_LABEL: Record<string, string> = {
  documents_completed: "materyal",
  streak: "gün",
  quizzes_completed: "quiz",
  perfect_quizzes: "tam puan",
  flashcards_reviewed: "kart",
  study_minutes: "dakika",
  tutor_messages: "soru",
};

async function toggleLeaderboard(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  const optIn = String(formData.get("optIn") ?? "") === "true";

  await createAdminSupabase()
    .from("profiles")
    .update({ leaderboard_opt_in: !optIn })
    .eq("id", profile.id);

  revalidatePath("/achievements");
}

function LeaderboardTable({
  entries,
  currentUserId,
  unit,
  showBadges,
}: {
  entries: { rank: number; userId: string; displayName: string; value: number; streak: number; badgeCount?: number }[];
  currentUserId: string;
  unit: string;
  showBadges?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-ink-400">
        Henüz sıralama oluşmadı. Çalışmaya başla, ilk sen ol!
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line">
      {entries.map((entry) => {
        const isSelf = entry.userId === currentUserId;
        const medal =
          entry.rank === 1
            ? "text-warning-500"
            : entry.rank === 2
              ? "text-ink-400"
              : entry.rank === 3
                ? "text-[#b45309]"
                : null;

        return (
          <li
            key={entry.userId}
            className={cn(
              "flex items-center gap-3 px-5 py-3",
              isSelf && "bg-brand-50/50",
            )}
          >
            <span className="flex w-8 shrink-0 justify-center">
              {medal ? (
                <Medal className={cn("size-5", medal)} aria-hidden />
              ) : (
                <span className="text-sm text-ink-400">{entry.rank}</span>
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">
                {entry.displayName}
                {isSelf ? (
                  <span className="ml-2 text-xs font-normal text-brand-600">
                    (sen)
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-ink-400">
                {entry.streak > 0 ? `${entry.streak} günlük seri` : "—"}
                {showBadges && entry.badgeCount
                  ? ` · ${entry.badgeCount} rozet`
                  : ""}
              </span>
            </span>

            <span className="shrink-0 text-sm font-semibold text-ink-900">
              {formatNumber(entry.value)}{" "}
              <span className="text-xs font-normal text-ink-400">{unit}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AchievementsPage() {
  const profile = await requireProfile();
  const settings = await getSettings();

  const [board, leaderboards, ownRank] = await Promise.all([
    loadBadgeBoard(profile.id),
    settings.leaderboard_enabled
      ? loadLeaderboards(20)
      : Promise.resolve({ xp: [], weekly: [] }),
    settings.leaderboard_enabled
      ? loadOwnRank(profile.id)
      : Promise.resolve(null),
  ]);

  const totalBadges = board.earned.length + board.locked.length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Rozetler ve Sıralama
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Çalıştıkça XP kazan, rozet topla, sıralamada yüksel.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Toplam XP"
          value={formatNumber(profile.xp)}
          hint={`${formatNumber(board.totalXpFromBadges)} XP rozetlerden`}
          icon={<Trophy className="size-5" aria-hidden />}
        />
        <Stat
          label="Rozetler"
          value={`${board.earned.length} / ${totalBadges}`}
          hint="Kazanılan rozet sayısı"
          icon={<Award className="size-5" aria-hidden />}
          tone="warning"
        />
        <Stat
          label="Güncel seri"
          value={`${profile.streak_count} gün`}
          hint={`En uzun: ${profile.longest_streak} gün`}
          icon={<Flame className="size-5" aria-hidden />}
          tone="success"
        />
        <Stat
          label="XP sıralaman"
          value={ownRank ? `#${ownRank}` : "—"}
          hint={
            profile.leaderboard_opt_in
              ? "Sıralamaya dahilsin"
              : "Sıralamaya katılmıyorsun"
          }
          icon={<Users className="size-5" aria-hidden />}
          tone="neutral"
        />
      </div>

      {/* Kazanılan rozetler */}
      <Card>
        <CardHeader>
          <CardTitle>Kazandığın rozetler</CardTitle>
        </CardHeader>
        <CardContent>
          {board.earned.length === 0 ? (
            <div className="py-8 text-center">
              <Award className="mx-auto size-8 text-ink-400" aria-hidden />
              <p className="mt-3 text-sm text-ink-500">
                Henüz rozetin yok. İlk materyalini yükleyerek başla.
              </p>
              <Link href="/materials?upload=1" className="mt-4 inline-block">
                <Button size="sm">
                  <Upload aria-hidden />
                  Materyal Yükle
                </Button>
              </Link>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {board.earned.map((badge) => {
                const Icon = ICONS[badge.icon] ?? Award;
                const style = TIER_STYLE[badge.tier];
                return (
                  <li
                    key={badge.key}
                    className="flex gap-3 rounded-xl border border-line p-4"
                  >
                    <div
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-xl",
                        style.ring,
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {badge.name}
                        </p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            style.chip,
                          )}
                        >
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {badge.description}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {formatDate(badge.earned_at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Kilitli rozetler */}
      {board.locked.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4 text-ink-400" aria-hidden />
              Bir sonraki hedeflerin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-3 sm:grid-cols-2">
              {board.locked.slice(0, 8).map((badge) => {
                const Icon = ICONS[badge.icon] ?? Award;
                return (
                  <li
                    key={badge.key}
                    className="rounded-xl border border-dashed border-line p-4"
                  >
                    <div className="flex gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-400">
                        <Icon className="size-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-700">
                          {badge.name}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {badge.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-ink-400">
                        <span>
                          {formatNumber(badge.current)} /{" "}
                          {formatNumber(Number(badge.threshold))}{" "}
                          {METRIC_LABEL[badge.metric] ?? ""}
                        </span>
                        <span>+{badge.xp_reward} XP</span>
                      </div>
                      <Progress value={badge.progress} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Leaderboard */}
      {settings.leaderboard_enabled ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="size-4 text-warning-500" aria-hidden />
                XP sıralaması (tüm zamanlar)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <LeaderboardTable
                entries={leaderboards.xp}
                currentUserId={profile.id}
                unit="XP"
                showBadges
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-brand-600" aria-hidden />
                Bu haftanın çalışkanları
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <LeaderboardTable
                entries={leaderboards.weekly}
                currentUserId={profile.id}
                unit="dk"
              />
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Alert tone="brand">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Sıralamada isminin ilk adın ve soyadının baş harfi olarak
                  göründüğünü unutma. İstersen listeden çıkabilirsin.
                </span>
                <form action={toggleLeaderboard}>
                  <input
                    type="hidden"
                    name="optIn"
                    value={String(profile.leaderboard_opt_in ?? true)}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    {profile.leaderboard_opt_in
                      ? "Sıralamadan çık"
                      : "Sıralamaya katıl"}
                  </Button>
                </form>
              </div>
            </Alert>
          </div>
        </div>
      ) : null}
    </div>
  );
}
