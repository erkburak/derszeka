import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";

export type JobType =
  | "document.process"
  | "document.regenerate"
  | "email.send";

export async function enqueueJob(params: {
  jobType: JobType;
  payload?: Record<string, unknown>;
  documentId?: string | null;
  userId?: string | null;
  priority?: number;
  runAfter?: Date;
}): Promise<string> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("processing_jobs")
    .insert({
      job_type: params.jobType,
      payload: params.payload ?? {},
      document_id: params.documentId ?? null,
      user_id: params.userId ?? null,
      priority: params.priority ?? 100,
      run_after: (params.runAfter ?? new Date()).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`İş kuyruğa alınamadı: ${error.message}`);
  return data.id as string;
}

/**
 * Worker'ı tetikler ama yanıtı beklemez.
 * Kullanıcı sayfayı kapatsa bile iş sunucuda devam eder; ayrıca
 * cron ile aynı endpoint periyodik olarak çağrılabilir.
 */
export function triggerWorker(): void {
  const url = `${serverEnv.siteUrl}/api/worker/tick`;
  void fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${serverEnv.workerSecret}` },
    cache: "no-store",
  }).catch(() => {
    // Tetikleme başarısız olursa cron bir sonraki turda alır.
  });
}
