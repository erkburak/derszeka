"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import { writeAuditLog, type AuditAction } from "@/lib/audit";
import { activatePremium, revokePremium } from "@/lib/billing";
import { encryptSecret, secretHint } from "@/lib/security/crypto";
import { invalidateAICache } from "@/lib/ai/service";
import { invalidateLimitCache } from "@/lib/limits";
import { setSetting, type SettingKey } from "@/lib/settings";
import {
  queuePaymentApprovedEmail,
  queuePaymentRejectedEmail,
  queuePremiumActivatedEmail,
} from "@/lib/email/triggers";
import { sendRawEmail } from "@/lib/email/send";
import { formatCurrency } from "@/lib/utils";
import type { AIProviderName } from "@/lib/types";

async function auditRequest() {
  const headerList = await headers();
  return new Request("http://internal", {
    headers: {
      "x-forwarded-for": headerList.get("x-forwarded-for") ?? "",
      "user-agent": headerList.get("user-agent") ?? "",
    },
  });
}

async function log(
  actor: { id: string; email: string | null },
  action: AuditAction,
  details: {
    entityType?: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await writeAuditLog({ actor, action, ...details, request: await auditRequest() });
}

/* ------------------------------------------------------------- Kullanıcı */

export async function grantPremiumAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const months = Math.min(Math.max(Number(formData.get("months")) || 1, 1), 24);

  const { endsAt } = await activatePremium({
    userId,
    months,
    createdBy: admin.id,
    source: "admin",
  });

  await createAdminSupabase().from("notifications").insert({
    user_id: userId,
    type: "success",
    title: "Premium üyeliğin aktif!",
    body: `Üyeliğin ${endsAt.toLocaleDateString("tr-TR")} tarihine kadar geçerli.`,
    link: "/dashboard",
  });
  await queuePremiumActivatedEmail(userId, endsAt);

  await log(admin, "user.premium_granted", {
    entityType: "profile",
    entityId: userId,
    after: { months, endsAt },
  });

  revalidatePath("/admin/users");
}

export async function revokePremiumAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");

  await revokePremium(userId);
  await log(admin, "user.premium_revoked", {
    entityType: "profile",
    entityId: userId,
  });

  revalidatePath("/admin/users");
}

export async function toggleUserActiveAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";

  if (userId === admin.id) return;

  const supabase = createAdminSupabase();
  await supabase.from("profiles").update({ is_active: !isActive }).eq("id", userId);

  await log(admin, isActive ? "user.deactivated" : "user.activated", {
    entityType: "profile",
    entityId: userId,
  });

  revalidatePath("/admin/users");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) return;

  const supabase = createAdminSupabase();
  await supabase.storage.from("documents").remove([`${userId}`]);
  await supabase.rpc("anonymize_user", { p_user_id: userId });
  await supabase.auth.admin.deleteUser(userId);

  await log(admin, "user.deleted", { entityType: "profile", entityId: userId });
  revalidatePath("/admin/users");
}

/* ---------------------------------------------------------------- Ödeme */

export async function reviewPaymentAction(formData: FormData) {
  const admin = await requireAdmin();
  const paymentId = String(formData.get("paymentId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const adminNote = String(formData.get("adminNote") ?? "").slice(0, 500);
  const months = Math.min(Math.max(Number(formData.get("months")) || 1, 1), 24);

  if (decision !== "approve" && decision !== "reject") return;

  const supabase = createAdminSupabase();
  const { data: payment } = await supabase
    .from("payment_requests")
    .select("id, user_id, status, amount, currency")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment || payment.status !== "pending") return;

  await supabase
    .from("payment_requests")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      admin_note: adminNote || null,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  if (decision === "approve") {
    const { endsAt } = await activatePremium({
      userId: payment.user_id as string,
      months,
      paymentRequestId: paymentId,
      createdBy: admin.id,
    });

    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "success",
      title: "Premium üyeliğin aktif!",
      body: `Üyeliğin ${new Date(endsAt).toLocaleDateString("tr-TR")} tarihine kadar geçerli.`,
      link: "/dashboard",
    });

    await queuePaymentApprovedEmail(
      payment.user_id as string,
      formatCurrency(Number(payment.amount), payment.currency as string),
      endsAt,
    );
  } else {
    await supabase.from("notifications").insert({
      user_id: payment.user_id,
      type: "error",
      title: "Ödeme bildirimin onaylanmadı",
      body: adminNote || "Lütfen ödeme bilgilerini kontrol edip tekrar bildir.",
      link: "/premium",
    });

    await queuePaymentRejectedEmail(payment.user_id as string, adminNote);
  }

  await log(admin, decision === "approve" ? "payment.approved" : "payment.rejected", {
    entityType: "payment_request",
    entityId: paymentId,
    after: { decision, months, adminNote },
  });

  revalidatePath("/admin/payments");
}

/* ------------------------------------------------------------ AI modeli */

export async function upsertAIModelAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabase();

  const id = String(formData.get("id") ?? "");
  const payload = {
    provider: String(formData.get("provider") ?? "anthropic") as AIProviderName,
    model_key: String(formData.get("modelKey") ?? "").trim(),
    display_name: String(formData.get("displayName") ?? "").trim(),
    purpose: String(formData.get("purpose") ?? "chat"),
    is_active: formData.get("isActive") === "on",
    is_default: formData.get("isDefault") === "on",
    requires_premium: formData.get("requiresPremium") === "on",
    input_price_per_1m: Number(formData.get("inputPrice")) || 0,
    output_price_per_1m: Number(formData.get("outputPrice")) || 0,
    max_input_tokens: Number(formData.get("maxInputTokens")) || 200000,
    max_output_tokens: Number(formData.get("maxOutputTokens")) || 8192,
    supports_vision: formData.get("supportsVision") === "on",
    supports_pdf: formData.get("supportsPdf") === "on",
    supports_effort: formData.get("supportsEffort") === "on",
    supports_json_schema: formData.get("supportsJsonSchema") === "on",
    priority: Number(formData.get("priority")) || 100,
  };

  if (!payload.model_key || !payload.display_name) return;

  // Aynı amaç için tek bir varsayılan model olmalı.
  if (payload.is_default) {
    await supabase
      .from("ai_models")
      .update({ is_default: false })
      .eq("purpose", payload.purpose);
  }

  if (id) {
    await supabase.from("ai_models").update(payload).eq("id", id);
  } else {
    await supabase.from("ai_models").insert(payload);
  }

  invalidateAICache();
  await log(admin, id ? "ai_model.updated" : "ai_model.created", {
    entityType: "ai_model",
    entityId: id || payload.model_key,
    after: payload,
  });

  revalidatePath("/admin/ai-models");
}

/** Her AI işlemine hangi modelin bakacağını belirler — maliyetin ana kaldıracı. */
export async function updateOperationRoutingAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabase();

  const changes: Record<string, string | null> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("routing.")) continue;
    const operation = key.slice("routing.".length);
    const modelId = String(value) || null;

    await supabase
      .from("ai_operation_models")
      .upsert(
        { operation, model_id: modelId, updated_at: new Date().toISOString() },
        { onConflict: "operation" },
      );
    changes[operation] = modelId;
  }

  invalidateAICache();
  await log(admin, "ai_model.updated", {
    entityType: "ai_operation_models",
    after: changes,
  });

  revalidatePath("/admin/ai-models");
}

export async function deleteAIModelAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminSupabase();
  await supabase.from("ai_models").delete().eq("id", id);

  invalidateAICache();
  await log(admin, "ai_model.deleted", { entityType: "ai_model", entityId: id });
  revalidatePath("/admin/ai-models");
}

export async function updateProviderKeyAction(formData: FormData) {
  const admin = await requireAdmin();
  const provider = String(formData.get("provider") ?? "") as AIProviderName;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const isEnabled = formData.get("isEnabled") === "on";
  const baseUrl = String(formData.get("baseUrl") ?? "").trim();

  const supabase = createAdminSupabase();
  const update: Record<string, unknown> = {
    is_enabled: isEnabled,
    base_url: baseUrl || null,
  };

  // Anahtar boş bırakıldıysa mevcut anahtar korunur.
  if (apiKey) {
    update.api_key_encrypted = encryptSecret(apiKey);
    update.api_key_hint = secretHint(apiKey);
  }

  await supabase.from("ai_providers").update(update).eq("provider", provider);

  invalidateAICache();
  await log(admin, apiKey ? "ai_provider.key_updated" : "ai_provider.toggled", {
    entityType: "ai_provider",
    entityId: provider,
    after: { isEnabled, keyChanged: Boolean(apiKey) },
  });

  revalidatePath("/admin/ai-models");
}

/* ------------------------------------------------------------- Limitler */

export async function updatePlanLimitsAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabase();

  const updates: { plan: string; limit_key: string; limit_value: number }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^limit\.(free|premium)\.(.+)$/);
    if (!match) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    updates.push({
      plan: match[1]!,
      limit_key: match[2]!,
      limit_value: Math.max(0, Math.round(parsed)),
    });
  }

  for (const update of updates) {
    await supabase
      .from("plan_limits")
      .update({ limit_value: update.limit_value })
      .eq("plan", update.plan)
      .eq("limit_key", update.limit_key);
  }

  invalidateLimitCache();
  await log(admin, "plan_limit.updated", {
    entityType: "plan_limits",
    after: updates,
  });

  revalidatePath("/admin/limits");
}

/* --------------------------------------------------------- Sistem ayarı */

const NUMERIC_SETTINGS: SettingKey[] = [
  "premium_price",
  "premium_period_days",
  "usd_try_rate",
  "rag_chunk_size",
  "rag_chunk_overlap",
  "rag_top_k",
  "max_upload_files",
  "rate_limit_ai_per_minute",
  "rate_limit_upload_per_hour",
  "login_max_attempts",
  "login_lockout_minutes",
];

const BOOLEAN_SETTINGS: SettingKey[] = ["maintenance_mode"];

export async function updateSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const changed: Record<string, unknown> = {};

  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("setting.")) continue;
    const settingKey = key.slice("setting.".length) as SettingKey;

    let value: unknown;
    if (NUMERIC_SETTINGS.includes(settingKey)) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) continue;
      value = parsed;
    } else if (BOOLEAN_SETTINGS.includes(settingKey)) {
      value = raw === "on";
    } else {
      value = String(raw);
    }

    await setSetting(settingKey, value, admin.id);
    changed[settingKey] = value;
  }

  // Checkbox işaretlenmediğinde form verisinde hiç görünmez.
  for (const key of BOOLEAN_SETTINGS) {
    if (!(key in changed) && formData.has(`_boolean.${key}`)) {
      await setSetting(key, false, admin.id);
      changed[key] = false;
    }
  }

  await log(admin, "settings.updated", { entityType: "system_settings", after: changed });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateLegalAction(formData: FormData) {
  const admin = await requireAdmin();
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").slice(0, 200);
  const content = String(formData.get("content") ?? "");

  const supabase = createAdminSupabase();
  await supabase
    .from("legal_documents")
    .update({ title, content, updated_at: new Date().toISOString() })
    .eq("slug", slug);

  await log(admin, "legal.updated", { entityType: "legal_document", entityId: slug });
  revalidatePath("/admin/settings");
}

/* --------------------------------------------------------------- E-posta */

export async function updateEmailSettingsAction(formData: FormData) {
  const admin = await requireAdmin();
  const supabase = createAdminSupabase();

  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const smtpPassword = String(formData.get("smtpPassword") ?? "").trim();

  const update: Record<string, unknown> = {
    provider: String(formData.get("provider") ?? "disabled"),
    from_name: String(formData.get("fromName") ?? "").slice(0, 80),
    from_email: String(formData.get("fromEmail") ?? "").slice(0, 160),
    reply_to: String(formData.get("replyTo") ?? "").slice(0, 160) || null,
    smtp_host: String(formData.get("smtpHost") ?? "").trim() || null,
    smtp_port: Number(formData.get("smtpPort")) || 587,
    smtp_secure: formData.get("smtpSecure") === "on",
    smtp_user: String(formData.get("smtpUser") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  // Boş bırakılan sır alanları mevcut değeri korur.
  if (apiKey) {
    update.api_key_encrypted = encryptSecret(apiKey);
    update.api_key_hint = secretHint(apiKey);
  }
  if (smtpPassword) {
    update.smtp_password_encrypted = encryptSecret(smtpPassword);
  }

  await supabase.from("email_settings").update(update).eq("id", true);
  await setSetting("email_enabled", formData.get("emailEnabled") === "on", admin.id);

  await log(admin, "settings.updated", {
    entityType: "email_settings",
    after: { provider: update.provider, keyChanged: Boolean(apiKey) },
  });

  revalidatePath("/admin/email");
}

export async function updateEmailTemplateAction(formData: FormData) {
  const admin = await requireAdmin();
  const key = String(formData.get("key") ?? "");

  const supabase = createAdminSupabase();
  await supabase
    .from("email_templates")
    .update({
      subject: String(formData.get("subject") ?? "").slice(0, 200),
      body: String(formData.get("body") ?? ""),
      is_enabled: formData.get("isEnabled") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("key", key);

  await log(admin, "settings.updated", {
    entityType: "email_template",
    entityId: key,
  });

  revalidatePath("/admin/email");
}

export async function sendTestEmailAction(formData: FormData) {
  const admin = await requireAdmin();
  const to = String(formData.get("to") ?? "").trim();
  if (!to) return;

  const result = await sendRawEmail({
    to,
    subject: "Ders Zeka — test e-postası",
    markdown:
      "Bu bir test e-postasıdır.\n\nBu mesajı görüyorsan e-posta yapılandırman **çalışıyor**.",
  });

  await log(admin, "settings.updated", {
    entityType: "email_test",
    entityId: to,
    after: { ok: result.ok, error: result.error ?? null },
  });

  revalidatePath("/admin/email");
}

/* ----------------------------------------------------------- Materyaller */

export async function deleteDocumentAction(formData: FormData) {
  const admin = await requireAdmin();
  const documentId = String(formData.get("documentId") ?? "");

  const supabase = createAdminSupabase();
  const { data: document } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (document?.storage_path) {
    await supabase.storage.from("documents").remove([document.storage_path as string]);
  }
  await supabase.from("documents").delete().eq("id", documentId);

  await log(admin, "document.deleted", {
    entityType: "document",
    entityId: documentId,
  });
  revalidatePath("/admin/materials");
}
