"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Info,
} from "lucide-react";
import { apiFetch } from "@/lib/client/api";
import { cn, relativeTime } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

const POLL_MS = 45_000;

const ICONS: Record<string, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const TONES: Record<string, string> = {
  success: "text-success-500",
  error: "text-danger-500",
  info: "text-brand-500",
};

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{
        notifications: NotificationRow[];
        unreadCount: number;
      }>("/api/notifications?limit=10");
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // Geçici hata — bir sonraki turda tekrar denenir.
    }
  }, []);

  // Arka planda tamamlanan materyaller ve ödeme onayları buradan görünür.
  useEffect(() => {
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Panel dışına tıklayınca kapan.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function markAllRead() {
    setUnread(0);
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    try {
      await apiFetch("/api/notifications", { json: {} });
      router.refresh();
    } catch {
      void load();
    }
  }

  async function openNotification(item: NotificationRow) {
    setOpen(false);
    if (!item.is_read) {
      setUnread((value) => Math.max(0, value - 1));
      try {
        await apiFetch("/api/notifications", { json: { ids: [item.id] } });
      } catch {
        // Okundu işareti başarısız olsa bile yönlendirmeyi engelleme.
      }
    }
    if (item.link) router.push(item.link);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative rounded-lg p-2 text-ink-500 transition-colors hover:bg-surface-sunken hover:text-ink-900"
        aria-label={
          unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler"
        }
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-up card absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Bildirimler</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Tümünü okundu işaretle
              </button>
            ) : null}
          </div>

          <div className="scroll-slim max-h-96 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="skeleton h-14 rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-400">
                Henüz bildirimin yok.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const Icon = ICONS[item.type] ?? Info;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(item)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted",
                          !item.is_read && "bg-brand-50/50",
                        )}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            TONES[item.type] ?? "text-ink-400",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink-900">
                            {item.title}
                          </span>
                          {item.body ? (
                            <span className="mt-0.5 block text-xs text-ink-500">
                              {item.body}
                            </span>
                          ) : null}
                          <span className="mt-1 block text-xs text-ink-400">
                            {relativeTime(item.created_at)}
                          </span>
                        </span>
                        {!item.is_read ? (
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                            aria-label="Okunmamış"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-3 text-center text-sm text-brand-600 hover:bg-surface-muted"
          >
            Tümünü gör
          </Link>
        </div>
      ) : null}
    </div>
  );
}
