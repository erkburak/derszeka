import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AlertTriangle, Bell, Crown, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Progress,
  Select,
  Textarea,
} from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { getUsageSummary } from "@/lib/limits";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Ayarlar" };

const DAILY_MINUTES = [15, 30, 45, 60, 90, 120, 180, 240];

async function updateProfile(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  const supabase = createAdminSupabase();

  await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("fullName") ?? "").slice(0, 80),
      education_level: String(formData.get("educationLevel") ?? "").slice(0, 100),
      field_of_study: String(formData.get("fieldOfStudy") ?? "").slice(0, 120),
      study_goal: String(formData.get("studyGoal") ?? "").slice(0, 500),
      daily_goal_minutes: Math.min(
        Math.max(Number(formData.get("dailyGoalMinutes")) || 30, 5),
        600,
      ),
    })
    .eq("id", profile.id);

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function updatePreferences(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  await createAdminSupabase()
    .from("profiles")
    .update({
      email_notifications: formData.get("emailNotifications") === "on",
      study_reminders: formData.get("studyReminders") === "on",
      leaderboard_opt_in: formData.get("leaderboardOptIn") === "on",
    })
    .eq("id", profile.id);

  revalidatePath("/settings");
  revalidatePath("/achievements");
}

async function changePassword(formData: FormData) {
  "use server";

  await requireProfile();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect("/settings?error=sifre_kisa");

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  redirect(error ? "/settings?error=sifre_guncellenemedi" : "/settings?ok=sifre");
}

/** KVKK: kişisel veriler silinir, analitik satırlar anonimleştirilir. */
async function deleteAccount(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  const confirmation = String(formData.get("confirm") ?? "").trim();
  if (confirmation !== "HESABIMI SİL") redirect("/settings?error=onay_hatali");

  const admin = createAdminSupabase();
  await admin.storage.from("documents").remove([`${profile.id}`]);
  await admin.rpc("anonymize_user", { p_user_id: profile.id });
  await admin.auth.admin.deleteUser(profile.id);

  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const profile = await requireProfile();
  const { ok, error } = await searchParams;
  const usage = await getUsageSummary(profile);

  const supabase = await createServerSupabase();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, starts_at, ends_at")
    .eq("status", "active")
    .order("ends_at", { ascending: false })
    .maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Ayarlar</h1>
        <p className="mt-1 text-sm text-ink-500">
          Profilini, üyeliğini ve hesap güvenliğini yönet.
        </p>
      </div>

      {ok === "sifre" ? <Alert tone="success">Şifren güncellendi.</Alert> : null}
      {error ? (
        <Alert tone="danger">
          {error === "sifre_kisa"
            ? "Şifre en az 8 karakter olmalı."
            : error === "onay_hatali"
              ? "Onay metnini tam olarak yazmalısın."
              : "İşlem tamamlanamadı. Lütfen tekrar dene."}
        </Alert>
      ) : null}

      {/* Üyelik */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Üyelik</CardTitle>
          <Badge tone={profile.plan === "premium" ? "brand" : "neutral"}>
            {profile.plan === "premium" ? "Premium" : "Ücretsiz"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {profile.plan === "premium" && subscription?.ends_at ? (
            <p className="text-sm text-ink-500">
              Premium üyeliğin {formatDate(subscription.ends_at as string)} tarihine
              kadar geçerli.
            </p>
          ) : (
            <p className="text-sm text-ink-500">
              Ücretsiz plandasın. Daha yüksek limitler ve çalışma planı için
              Premium&apos;a geçebilirsin.
            </p>
          )}

          <div className="space-y-3">
            {usage.map((item) => (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink-500">{item.label}</span>
                  <span className="text-ink-700">{item.display}</span>
                </div>
                <Progress
                  value={item.percent}
                  tone={item.percent > 85 ? "warning" : "brand"}
                />
              </div>
            ))}
          </div>

          {profile.plan === "free" ? (
            <Link href="/premium">
              <Button block>
                <Crown aria-hidden />
                Premium&apos;a geç
              </Button>
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateProfile} className="space-y-4">
            <div>
              <Label htmlFor="fullName">Ad Soyad</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={profile.full_name ?? ""}
              />
            </div>

            <div>
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" value={profile.email ?? ""} disabled />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="educationLevel">Eğitim seviyesi</Label>
                <Input
                  id="educationLevel"
                  name="educationLevel"
                  defaultValue={profile.education_level ?? ""}
                  placeholder="Örn: Üniversite — Lisans"
                />
              </div>
              <div>
                <Label htmlFor="fieldOfStudy">Alan</Label>
                <Input
                  id="fieldOfStudy"
                  name="fieldOfStudy"
                  defaultValue={profile.field_of_study ?? ""}
                  placeholder="Örn: Tıp"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="studyGoal">Çalışma hedefin</Label>
              <Textarea
                id="studyGoal"
                name="studyGoal"
                rows={3}
                defaultValue={profile.study_goal ?? ""}
              />
            </div>

            <div>
              <Label htmlFor="dailyGoalMinutes">Günlük hedef</Label>
              <Select
                id="dailyGoalMinutes"
                name="dailyGoalMinutes"
                defaultValue={String(profile.daily_goal_minutes)}
              >
                {DAILY_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} dakika
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit">Değişiklikleri kaydet</Button>
          </form>
        </CardContent>
      </Card>

      {/* Bildirim tercihleri */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4 text-brand-600" aria-hidden />
            Bildirimler ve gizlilik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updatePreferences} className="space-y-4">
            {(
              [
                [
                  "emailNotifications",
                  profile.email_notifications ?? true,
                  "E-posta bildirimleri",
                  "Materyal hazır olduğunda, rozet kazandığında ve önemli güncellemelerde e-posta al. Ödeme ve üyelik e-postaları bu ayardan bağımsızdır.",
                ],
                [
                  "studyReminders",
                  profile.study_reminders ?? true,
                  "Çalışma hatırlatmaları",
                  "Birkaç gün çalışmadığında hatırlatma e-postası gönderelim.",
                ],
                [
                  "leaderboardOptIn",
                  profile.leaderboard_opt_in ?? true,
                  "Sıralamada görün",
                  "Adın \"Burak E.\" biçiminde maskelenerek gösterilir. Kapatırsan listede yer almazsın.",
                ],
              ] as const
            ).map(([name, checked, title, description]) => (
              <label
                key={name}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4"
              >
                <input
                  type="checkbox"
                  name={name}
                  defaultChecked={Boolean(checked)}
                  className="mt-0.5 size-4 rounded border-line text-brand-600 focus:ring-brand-400"
                />
                <span>
                  <span className="block text-sm font-medium text-ink-900">
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {description}
                  </span>
                </span>
              </label>
            ))}

            <Button type="submit" variant="secondary">
              Tercihleri kaydet
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Güvenlik */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-success-500" aria-hidden />
            Güvenlik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={changePassword} className="space-y-4">
            <div>
              <Label htmlFor="password">Yeni şifre</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="En az 8 karakter"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" variant="secondary">
              Şifremi değiştir
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Hesap silme */}
      <Card className="border-danger-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-danger-700">
            <AlertTriangle className="size-4" aria-hidden />
            Hesabı sil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-ink-500">
            Hesabın kalıcı olarak silinir. Materyallerin, flashcardların, quizlerin
            ve çalışma geçmişin geri getirilemez. KVKK kapsamında kişisel verilerin
            silinir, kalan kayıtlar anonimleştirilir.
          </p>
          <form action={deleteAccount} className="space-y-3">
            <div>
              <Label htmlFor="confirm">
                Onaylamak için <strong>HESABIMI SİL</strong> yaz
              </Label>
              <Input id="confirm" name="confirm" placeholder="HESABIMI SİL" required />
            </div>
            <Button type="submit" variant="danger">
              <Trash2 aria-hidden />
              Hesabımı kalıcı olarak sil
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
