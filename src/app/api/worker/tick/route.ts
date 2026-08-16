import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { drainJobs } from "@/lib/jobs/worker";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Arka plan işleyicisi. İki şekilde tetiklenir:
 * 1) Yükleme sonrası uygulama tarafından (fire-and-forget),
 * 2) Cron ile periyodik olarak (takılı kalan işleri toparlamak için).
 *
 * WORKER_SECRET olmadan çağrılamaz.
 */
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");

  if (auth !== `Bearer ${serverEnv.workerSecret}` && !cronHeader) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    const processed = await drainJobs(3);
    return NextResponse.json({ processed });
  } catch (error) {
    console.error("[worker-tick]", error);
    return NextResponse.json({ error: "worker_failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
