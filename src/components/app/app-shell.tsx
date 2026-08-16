"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  CalendarClock,
  Crown,
  LayoutDashboard,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  MessageCircleQuestion,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/app/notification-bell";
import { signOutAction } from "@/app/(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/materials", label: "Materyaller", icon: BookOpen },
  { href: "/study", label: "Beni Çalıştır", icon: Sparkles },
  { href: "/flashcards", label: "Flashcards", icon: Layers },
  { href: "/quiz", label: "Quiz", icon: ListChecks },
  { href: "/ai-teacher", label: "AI Öğretmen", icon: MessageCircleQuestion },
  { href: "/plan", label: "Çalışma Planı", icon: CalendarClock },
  { href: "/achievements", label: "Rozetler", icon: Trophy },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

export function AppShell({
  children,
  siteName,
  fullName,
  email,
  plan,
  isAdmin,
  streak,
  unreadNotifications,
}: {
  children: React.ReactNode;
  siteName: string;
  fullName: string;
  email: string;
  plan: "free" | "premium";
  isAdmin: boolean;
  streak: number;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5" aria-label="Uygulama menüsü">
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-700 hover:bg-surface-sunken",
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="size-4.5 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}

      {isAdmin ? (
        <Link
          href="/admin"
          onClick={() => setOpen(false)}
          className={cn(
            "mt-2 flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-sm transition-colors",
            pathname.startsWith("/admin")
              ? "bg-ink-900 font-medium text-white"
              : "text-ink-700 hover:bg-surface-sunken",
          )}
        >
          <Shield className="size-4.5 shrink-0" aria-hidden />
          Admin Panel
        </Link>
      ) : null}
    </nav>
  );

  const sidebarFooter = (
    <div className="space-y-3 border-t border-line pt-4">
      {plan === "free" ? (
        <Link href="/premium" onClick={() => setOpen(false)}>
          <div className="gradient-brand rounded-xl p-4 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Crown className="size-4" aria-hidden />
              Premium&apos;a geç
            </div>
            <p className="mt-1 text-xs text-white/85">
              Daha fazla yükleme, daha fazla AI, çalışma planı.
            </p>
          </div>
        </Link>
      ) : null}

      <div className="flex items-center gap-3 px-1">
        <div className="gradient-brand flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white">
          {fullName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{fullName}</p>
          <p className="truncate text-xs text-ink-400">{email}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-surface-sunken hover:text-danger-700"
            aria-label="Çıkış yap"
          >
            <LogOut className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Masaüstü kenar çubuğu */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r border-line bg-white p-4 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-1 py-2">
          <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink-900">
            {siteName}
          </span>
        </Link>
        {nav}
        {sidebarFooter}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Üst çubuk */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 text-ink-700 lg:hidden"
              aria-label="Menüyü aç"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
              <span className="gradient-brand flex size-7 items-center justify-center rounded-lg text-white">
                <Sparkles className="size-3.5" aria-hidden />
              </span>
              <span className="font-semibold text-ink-900">{siteName}</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {streak > 0 ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-warning-50 px-3 py-1.5 text-xs font-medium text-warning-700 sm:inline-flex">
                <BarChart3 className="size-3.5" aria-hidden />
                {streak} günlük seri
              </span>
            ) : null}
            <NotificationBell initialUnread={unreadNotifications} />
            <Link href="/materials?upload=1">
              <Button size="sm">
                <Upload aria-hidden />
                <span className="hidden sm:inline">Materyal Yükle</span>
              </Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {/* Mobil kenar çubuğu */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setOpen(false)}
            aria-label="Menüyü kapat"
          />
          <div className="animate-fade-up absolute inset-y-0 left-0 flex w-72 flex-col gap-4 bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-white">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <span className="text-lg font-semibold text-ink-900">{siteName}</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-ink-500"
                aria-label="Kapat"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {sidebarFooter}
          </div>
        </div>
      ) : null}
    </div>
  );
}
