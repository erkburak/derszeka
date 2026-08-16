#!/usr/bin/env node
/**
 * Bağımsız arka plan işçisi.
 * Uygulama yükleme sonrası worker'ı zaten tetikliyor; bu betik
 * takılı kalan işleri toparlamak için periyodik olarak aynı endpoint'i çağırır.
 *
 * Kullanım: npm run worker
 * Üretimde bunun yerine bir cron (ör. Vercel Cron) /api/worker/tick adresini çağırmalı.
 */

import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local yoksa ortam değişkenlerine güven.
  }
}

loadEnv();

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const secret = process.env.WORKER_SECRET;
const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 10_000);

if (!secret) {
  console.error("WORKER_SECRET tanımlı değil. .env.local dosyasını kontrol edin.");
  process.exit(1);
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(`${baseUrl}/api/worker/tick`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await response.json().catch(() => ({}));
    if (body.processed > 0) {
      console.log(`[worker] ${body.processed} iş işlendi`);
    }
  } catch (error) {
    console.error("[worker] tetikleme hatası:", error.message);
  } finally {
    running = false;
  }
}

console.log(`[worker] ${baseUrl} adresini ${intervalMs / 1000}sn aralıkla yokluyor`);
void tick();
setInterval(tick, intervalMs);
