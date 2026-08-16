"use client";

import Link from "next/link";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpgradeInfo } from "@/lib/client/api";

const BENEFITS = [
  "Çok daha yüksek günlük ve aylık AI kotası",
  "Daha fazla ve daha büyük dosya yükleme",
  "Uzun materyallerin tamamının işlenmesi",
  "Kişisel çalışma planı ve gelişmiş analiz",
];

/** Limit aşımında gösterilen dönüşüm odaklı ekran. */
export function UpgradeDialog({
  info,
  message,
  onClose,
}: {
  info: UpgradeInfo;
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <div className="animate-fade-up card w-full max-w-md overflow-hidden p-0">
        <div className="gradient-brand relative px-6 py-6 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-white/80 hover:bg-white/15"
            aria-label="Kapat"
          >
            <X className="size-4" />
          </button>
          <Crown className="size-7" aria-hidden />
          <h2 id="upgrade-title" className="mt-3 text-xl font-semibold">
            Limitine ulaştın
          </h2>
          <p className="mt-1 text-sm text-white/85">{message}</p>
        </div>

        <div className="space-y-4 p-6">
          <p className="text-sm text-ink-500">
            Bu özelliği kullanmaya devam etmek için Premium&apos;a geç.
          </p>
          <ul className="space-y-2 text-sm text-ink-700">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {benefit}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-400">
            Mevcut kullanım: {info.current} / {info.limit}
          </p>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Link href="/premium" className="flex-1">
              <Button block>Premium&apos;a geç</Button>
            </Link>
            <Button variant="ghost" onClick={onClose} className="sm:w-auto">
              Daha sonra
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
