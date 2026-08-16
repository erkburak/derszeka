"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/#nasil-calisir", label: "Nasıl çalışır?" },
  { href: "/#ozellikler", label: "Özellikler" },
  { href: "/#ai-ogretmen", label: "AI Öğretmen" },
  { href: "/premium", label: "Premium" },
  { href: "/#sss", label: "SSS" },
];

export function SiteHeader({
  siteName,
  isAuthenticated,
}: {
  siteName: string;
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-ink-900">
          <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="text-lg tracking-tight">{siteName}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Ana menü">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-surface-sunken hover:text-ink-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="sm">Panele git</Button>
            </Link>
          ) : (
            <>
              <Link href="/giris">
                <Button variant="ghost" size="sm">
                  Giriş yap
                </Button>
              </Link>
              <Link href="/kayit">
                <Button size="sm">Ücretsiz başla</Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-ink-700 md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line bg-white md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="Mobil menü">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-ink-700 hover:bg-surface-sunken"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              {isAuthenticated ? (
                <Link href="/dashboard" onClick={() => setOpen(false)}>
                  <Button block>Panele git</Button>
                </Link>
              ) : (
                <>
                  <Link href="/giris" onClick={() => setOpen(false)}>
                    <Button variant="secondary" block>
                      Giriş yap
                    </Button>
                  </Link>
                  <Link href="/kayit" onClick={() => setOpen(false)}>
                    <Button block>Ücretsiz başla</Button>
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
