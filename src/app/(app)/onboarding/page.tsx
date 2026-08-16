import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Başlangıç" };

const EDUCATION_LEVELS = [
  "Ortaokul",
  "Lise",
  "Üniversite — Lisans",
  "Üniversite — Yüksek Lisans / Doktora",
  "Sınav hazırlık (YKS, KPSS, ALES, TUS...)",
  "Diğer",
];

const DAILY_MINUTES = [15, 30, 45, 60, 90, 120, 180];

async function saveOnboarding(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  const supabase = createAdminSupabase();

  const dailyGoal = Math.min(
    Math.max(Number(formData.get("dailyGoalMinutes")) || 30, 5),
    600,
  );

  await supabase
    .from("profiles")
    .update({
      education_level: String(formData.get("educationLevel") ?? "").slice(0, 100),
      field_of_study: String(formData.get("fieldOfStudy") ?? "").slice(0, 120),
      study_goal: String(formData.get("studyGoal") ?? "").slice(0, 500),
      daily_goal_minutes: dailyGoal,
      onboarding_completed: true,
    })
    .eq("id", profile.id);

  const examName = String(formData.get("examName") ?? "").trim();
  const examDate = String(formData.get("examDate") ?? "").trim();

  if (examName && /^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    await supabase.from("study_plans").insert({
      user_id: profile.id,
      title: `${examName} hazırlık`,
      exam_name: examName.slice(0, 120),
      exam_date: examDate,
      daily_minutes: dailyGoal,
    });
  }

  revalidatePath("/", "layout");
  redirect("/materials?upload=1");
}

export default async function OnboardingPage() {
  const profile = await requireProfile();
  if (profile.onboarding_completed) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <div className="gradient-brand mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl text-white">
          <GraduationCap className="size-6" aria-hidden />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Seni biraz tanıyalım
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Bu bilgiler çalışma önerilerini ve planını kişiselleştirmek için kullanılır.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <form action={saveOnboarding} className="space-y-5">
            <div>
              <Label htmlFor="educationLevel">Ne okuyorsun?</Label>
              <Select id="educationLevel" name="educationLevel" defaultValue="">
                <option value="" disabled>
                  Seç
                </option>
                {EDUCATION_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="fieldOfStudy">Hangi alanda?</Label>
              <Input
                id="fieldOfStudy"
                name="fieldOfStudy"
                placeholder="Örn: Tıp, Hukuk, Makine Mühendisliği, Sayısal"
              />
            </div>

            <div>
              <Label htmlFor="studyGoal">Çalışma hedefin nedir?</Label>
              <Textarea
                id="studyGoal"
                name="studyGoal"
                rows={3}
                placeholder="Örn: Final sınavlarından yüksek not almak ve dönem boyunca düzenli çalışmak."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="examName">Yaklaşan sınavın var mı?</Label>
                <Input
                  id="examName"
                  name="examName"
                  placeholder="Örn: Biyoloji Final"
                />
              </div>
              <div>
                <Label htmlFor="examDate">Sınav tarihi</Label>
                <Input
                  id="examDate"
                  name="examDate"
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="dailyGoalMinutes">
                Günde kaç dakika çalışmak istiyorsun?
              </Label>
              <Select
                id="dailyGoalMinutes"
                name="dailyGoalMinutes"
                defaultValue="60"
              >
                {DAILY_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} dakika
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" size="lg" block>
              Kaydet ve materyal yükle
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
