import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Coins,
  CreditCard,
  Cpu,
  FileText,
  LayoutDashboard,
  Mail,
  ScrollText,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/auth";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Kullanıcılar", icon: Users },
  { href: "/admin/payments", label: "Ödemeler", icon: CreditCard },
  { href: "/admin/materials", label: "Materyaller", icon: FileText },
  { href: "/admin/ai-usage", label: "AI Kullanımı", icon: BarChart3 },
  { href: "/admin/ai-models", label: "AI Modelleri", icon: Cpu },
  { href: "/admin/limits", label: "Plan Limitleri", icon: Coins },
  { href: "/admin/email", label: "E-posta", icon: Mail },
  { href: "/admin/settings", label: "Sistem Ayarları", icon: Settings },
  { href: "/admin/logs", label: "Audit Logs", icon: ScrollText },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/giris?next=/admin");
  if (profile.role !== "admin") redirect("/dashboard");

  return (
    <div className="flex min-h-dvh bg-surface-muted">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r border-line bg-ink-900 p-4 lg:flex">
        <div className="flex items-center gap-2 px-1 py-2 text-white">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/10">
            <Shield className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">Admin</span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Admin menüsü">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <item.icon className="size-4.5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Uygulamaya dön
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobil menü */}
        <div className="scroll-slim flex gap-1 overflow-x-auto border-b border-line bg-ink-900 px-3 py-2 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
            >
              <item.icon className="size-3.5" aria-hidden />
              {item.label}
            </Link>
          ))}
        </div>

        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
