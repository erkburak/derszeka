import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getCurrentProfile } from "@/lib/auth";
import { getPublicSettings } from "@/lib/settings";
import { createAdminSupabase } from "@/lib/supabase/server";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [profile, settings] = await Promise.all([
    getCurrentProfile(),
    getPublicSettings(),
  ]);

  if (!profile) redirect("/giris");

  const { count: unread } = await createAdminSupabase()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  return (
    <AppShell
      siteName={settings.siteName}
      fullName={profile.full_name ?? "Öğrenci"}
      email={profile.email ?? ""}
      plan={profile.plan}
      isAdmin={profile.role === "admin"}
      streak={profile.streak_count}
      unreadNotifications={unread ?? 0}
    >
      {children}
    </AppShell>
  );
}
