import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CalendarClock, Crown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
} from "@/components/ui";
import { PlanCreator } from "@/components/app/plan-creator";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/limits";
import { formatDate } from "@/lib/utils";
import type { StudyPlanItem } from "@/lib/types";

export const metadata = { title: "Çalışma Planı" };

const ACTIVITY_LABEL: Record<string, string> = {
  read: "Konu çalış",
  flashcard: "Flashcard",
  quiz: "Quiz",
  review: "Tekrar",
};

async function toggleItem(formData: FormData) {
  "use server";

  const profile = await requireProfile();
  const itemId = String(formData.get("itemId") ?? "");
  const completed = String(formData.get("completed") ?? "") === "true";

  const supabase = createAdminSupabase();
  await supabase
    .from("study_plan_items")
    .update({
      is_completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("user_id", profile.id);

  revalidatePath("/plan");
}

export default async function PlanPage() {
  const profile = await requireProfile();
  const allowed = await hasFeature(profile.plan, "feature_study_plan");

  const supabase = await createServerSupabase();
  const [{ data: documents }, { data: plans }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title")
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("study_plans")
      .select("id, title, exam_name, exam_date, daily_minutes, status")
      .order("created_at", { ascending: false }),
  ]);

  const planIds = (plans ?? []).map((plan) => plan.id as string);
  const { data: items } = planIds.length
    ? await supabase
        .from("study_plan_items")
        .select("*")
        .in("plan_id", planIds)
        .order("scheduled_date", { ascending: true })
        .order("order_index", { ascending: true })
    : { data: [] };

  const itemsByPlan = new Map<string, StudyPlanItem[]>();
  for (const item of (items ?? []) as StudyPlanItem[]) {
    const list = itemsByPlan.get(item.plan_id) ?? [];
    list.push(item);
    itemsByPlan.set(item.plan_id, list);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Çalışma Planı
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Sınavına kadar hangi gün ne çalışacağını yapay zekâ planlasın.
        </p>
      </div>

      {!allowed ? (
        <Card className="border-brand-200">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="gradient-brand flex size-12 items-center justify-center rounded-2xl text-white">
              <Crown className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink-900">
                Kişisel çalışma planı Premium özelliğidir
              </h2>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-500">
                Sınav tarihine göre gün gün planlama, aralıklı tekrar takvimi ve
                zayıf konulara ağırlık verme.
              </p>
            </div>
            <Link href="/premium">
              <Button>Premium&apos;a geç</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (documents ?? []).length === 0 ? (
        <EmptyState
          icon={<Upload className="size-6" aria-hidden />}
          title="Önce materyal yükle"
          description="Plan, materyallerinden çıkarılan konulara göre oluşturulur."
          action={
            <Link href="/materials?upload=1">
              <Button>Materyal Yükle</Button>
            </Link>
          }
        />
      ) : (
        <PlanCreator
          documents={(documents ?? []).map((doc) => ({
            id: doc.id as string,
            title: doc.title as string,
          }))}
          defaultDailyMinutes={profile.daily_goal_minutes}
        />
      )}

      {(plans ?? []).length === 0 ? (
        allowed ? (
          <EmptyState
            icon={<CalendarClock className="size-6" aria-hidden />}
            title="Henüz planın yok"
            description="Yukarıdaki formu doldurarak ilk çalışma planını oluştur."
          />
        ) : null
      ) : (
        <div className="space-y-6">
          {(plans ?? []).map((plan) => {
            const planItems = itemsByPlan.get(plan.id as string) ?? [];
            const completed = planItems.filter((item) => item.is_completed).length;
            const progress =
              planItems.length > 0 ? (completed / planItems.length) * 100 : 0;

            const byDate = new Map<string, StudyPlanItem[]>();
            for (const item of planItems) {
              const list = byDate.get(item.scheduled_date) ?? [];
              list.push(item);
              byDate.set(item.scheduled_date, list);
            }

            return (
              <Card key={plan.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{plan.title}</CardTitle>
                      <p className="mt-0.5 text-sm text-ink-500">
                        {plan.exam_name} ·{" "}
                        {plan.exam_date ? formatDate(plan.exam_date as string) : ""} ·
                        günlük {plan.daily_minutes} dk
                      </p>
                    </div>
                    <Badge tone={progress >= 100 ? "success" : "brand"}>
                      {completed}/{planItems.length} tamamlandı
                    </Badge>
                  </div>
                  <Progress
                    value={progress}
                    className="mt-3"
                    tone={progress >= 100 ? "success" : "brand"}
                  />
                </CardHeader>

                <CardContent className="space-y-4">
                  {[...byDate.entries()].map(([date, dayItems]) => (
                    <div key={date}>
                      <div className="mb-2 flex items-center gap-2">
                        <h4
                          className={
                            date === today
                              ? "text-sm font-semibold text-brand-700"
                              : "text-sm font-medium text-ink-700"
                          }
                        >
                          {formatDate(date)}
                        </h4>
                        {date === today ? <Badge tone="brand">Bugün</Badge> : null}
                      </div>

                      <ul className="space-y-1.5">
                        {dayItems.map((item) => (
                          <li key={item.id}>
                            <form action={toggleItem}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <input
                                type="hidden"
                                name="completed"
                                value={String(item.is_completed)}
                              />
                              <button
                                type="submit"
                                className="flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition-colors hover:bg-surface-sunken"
                              >
                                <span
                                  className={
                                    item.is_completed
                                      ? "flex size-4.5 shrink-0 items-center justify-center rounded-full bg-success-500 text-xs text-white"
                                      : "size-4.5 shrink-0 rounded-full border border-line"
                                  }
                                >
                                  {item.is_completed ? "✓" : ""}
                                </span>
                                <span
                                  className={
                                    item.is_completed
                                      ? "min-w-0 flex-1 truncate text-sm text-ink-400 line-through"
                                      : "min-w-0 flex-1 truncate text-sm text-ink-900"
                                  }
                                >
                                  {item.topic_title}
                                </span>
                                <Badge tone="neutral">
                                  {ACTIVITY_LABEL[item.activity] ?? item.activity}
                                </Badge>
                                <span className="shrink-0 text-xs text-ink-400">
                                  {item.duration_minutes} dk
                                </span>
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {planItems.length === 0 ? (
                    <Alert tone="warning">
                      Bu plan için madde oluşturulamadı. Yeni bir plan deneyebilirsin.
                    </Alert>
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
