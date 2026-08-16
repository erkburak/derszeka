import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { updatePlanLimitsAction } from "@/app/admin/actions";

export const metadata = { title: "Plan Limitleri" };
export const dynamic = "force-dynamic";

const GROUPS: { title: string; keys: string[] }[] = [
  {
    title: "Yapay zekâ kullanımı",
    keys: ["daily_ai_requests", "daily_tokens", "monthly_tokens", "max_output_tokens"],
  },
  {
    title: "Materyal ve yükleme",
    keys: [
      "monthly_uploads",
      "max_documents",
      "max_file_size_mb",
      "max_pages_per_document",
    ],
  },
  {
    title: "Çalışma materyalleri",
    keys: ["monthly_flashcards", "monthly_quizzes", "daily_tutor_messages"],
  },
  {
    title: "Özellikler (0 = kapalı, 1 = açık)",
    keys: [
      "feature_study_plan",
      "feature_guided_mode",
      "feature_spaced_repetition",
      "feature_advanced_models",
    ],
  },
];

export default async function AdminLimitsPage() {
  await requireAdmin();
  const supabase = createAdminSupabase();

  const { data: limits } = await supabase
    .from("plan_limits")
    .select("plan, limit_key, limit_value, description");

  const byKey = new Map<string, { free: number; premium: number; description: string }>();
  for (const row of limits ?? []) {
    const entry = byKey.get(row.limit_key as string) ?? {
      free: 0,
      premium: 0,
      description: (row.description as string) ?? "",
    };
    entry[row.plan as "free" | "premium"] = Number(row.limit_value);
    if (row.description) entry.description = row.description as string;
    byKey.set(row.limit_key as string, entry);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Plan Limitleri
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Ücretsiz ve Premium planların tüm kısıtları buradan yönetilir.
        </p>
      </div>

      <Alert tone="brand">
        Bu değerler kod içinde sabit değildir; kaydettiğin an tüm sistemde geçerli olur.
      </Alert>

      <form action={updatePlanLimitsAction} className="space-y-6">
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="scroll-slim overflow-x-auto p-0">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="border-b border-line bg-surface-muted text-left">
                  <tr className="text-xs tracking-wide text-ink-500 uppercase">
                    <th className="px-4 py-3 font-medium">Limit</th>
                    <th className="w-40 px-4 py-3 font-medium">Ücretsiz</th>
                    <th className="w-40 px-4 py-3 font-medium">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {group.keys.map((key) => {
                    const entry = byKey.get(key);
                    if (!entry) return null;
                    return (
                      <tr key={key}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900">
                            {entry.description || key}
                          </p>
                          <p className="font-mono text-xs text-ink-400">{key}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            name={`limit.free.${key}`}
                            type="number"
                            min="0"
                            defaultValue={entry.free}
                            aria-label={`${key} ücretsiz limiti`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            name={`limit.premium.${key}`}
                            type="number"
                            min="0"
                            defaultValue={entry.premium}
                            aria-label={`${key} premium limiti`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}

        <Button type="submit" size="lg">
          Limitleri kaydet
        </Button>
      </form>
    </div>
  );
}
