import Link from "next/link";
import { revalidatePath } from "next/cache";
import { AlertCircle, Bell, CheckCheck, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, EmptyState } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Bildirimler" };
export const dynamic = "force-dynamic";

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const TONES: Record<string, string> = {
  success: "text-success-500",
  error: "text-danger-500",
  info: "text-brand-500",
};

async function markAllRead() {
  "use server";

  const profile = await requireProfile();
  await createAdminSupabase()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  await requireProfile();

  const supabase = await createServerSupabase();
  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, type, title, body, link, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = notifications ?? [];
  const unread = rows.filter((row) => !row.is_read).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Bildirimler
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {unread > 0 ? `${unread} okunmamış bildirim` : "Hepsi okundu"}
          </p>
        </div>

        {unread > 0 ? (
          <form action={markAllRead}>
            <Button type="submit" variant="secondary" size="sm">
              <CheckCheck aria-hidden />
              Tümünü okundu işaretle
            </Button>
          </form>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-6" aria-hidden />}
          title="Henüz bildirimin yok"
          description="Materyallerin hazır olduğunda, rozet kazandığında veya ödemen onaylandığında burada göreceksin."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-line">
              {rows.map((item) => {
                const Icon = ICONS[item.type as keyof typeof ICONS] ?? Info;
                const content = (
                  <div
                    className={cn(
                      "flex gap-3 px-5 py-4 transition-colors",
                      item.link && "hover:bg-surface-muted",
                      !item.is_read && "bg-brand-50/40",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-4.5 shrink-0",
                        TONES[item.type as string] ?? "text-ink-400",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="mt-0.5 text-sm text-ink-500">{item.body}</p>
                      ) : null}
                      <p className="mt-1.5 text-xs text-ink-400">
                        {formatDate(item.created_at as string, true)}
                      </p>
                    </div>
                    {!item.is_read ? (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                        aria-label="Okunmamış"
                      />
                    ) : null}
                  </div>
                );

                return (
                  <li key={item.id}>
                    {item.link ? (
                      <Link href={item.link as string} className="block">
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
