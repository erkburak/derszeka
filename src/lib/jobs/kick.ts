import "server-only";

import { after } from "next/server";
import { drainJobs } from "@/lib/jobs/worker";
import { triggerWorker } from "@/lib/jobs/queue";

/**
 * İş kuyruğunu aynı istek içinde, yanıt gönderildikten sonra çalıştırır.
 *
 * Önceki yaklaşım kendi kendine HTTP isteği atıyordu; hem geliştirme
 * ortamında hem serverless'ta bu istek yanıt döndükten sonra iptal
 * edilebiliyor ve iş hiç başlamıyordu. `after()` aynı invocation içinde
 * çalıştığı için güvenilir.
 */
export function kickWorker(maxJobs = 2): void {
  try {
    after(async () => {
      try {
        await drainJobs(maxJobs);
      } catch (error) {
        console.error("[kick-worker]", error);
      }
    });
  } catch {
    // İstek bağlamı dışındaysak (ör. cron içi) HTTP tetiklemeye düş.
    triggerWorker();
  }
}
