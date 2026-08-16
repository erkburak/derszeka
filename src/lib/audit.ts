import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export type AuditAction =
  | "user.premium_granted"
  | "user.premium_revoked"
  | "user.deactivated"
  | "user.activated"
  | "user.deleted"
  | "user.role_changed"
  | "payment.approved"
  | "payment.rejected"
  | "ai_model.created"
  | "ai_model.updated"
  | "ai_model.deleted"
  | "ai_provider.key_updated"
  | "ai_provider.toggled"
  | "settings.updated"
  | "plan_limit.updated"
  | "document.deleted"
  | "legal.updated";

/** Admin işlemleri geri izlenebilir olmalı: kim, neyi, neden değiştirdi. */
export async function writeAuditLog(params: {
  actor: Pick<Profile, "id" | "email">;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  request?: Request;
}) {
  const supabase = createAdminSupabase();
  await supabase.from("audit_logs").insert({
    actor_id: params.actor.id,
    actor_email: params.actor.email,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    before: params.before ?? null,
    after: params.after ?? null,
    ip:
      params.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null,
    user_agent: params.request?.headers.get("user-agent") ?? null,
  });
}
