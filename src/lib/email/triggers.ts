import "server-only";

import { enqueueJob, triggerWorker } from "@/lib/jobs/queue";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import type { EmailTemplateKey } from "@/lib/email/send";

/**
 * E-postalar iş kuyruğuna alınır: gönderim gecikirse veya sağlayıcı
 * hata verirse kullanıcının isteği beklemez, iş yeniden denenir.
 */
async function queueEmail(params: {
  userId?: string | null;
  to: string;
  templateKey: EmailTemplateKey;
  variables: Record<string, string>;
  transactional?: boolean;
}) {
  const settings = await getSettings();
  if (!settings.email_enabled) return;
  if (!params.to) return;

  await enqueueJob({
    jobType: "email.send",
    userId: params.userId ?? null,
    priority: 20,
    payload: {
      to: params.to,
      templateKey: params.templateKey,
      variables: params.variables,
      transactional: params.transactional ?? false,
      userId: params.userId ?? null,
    },
  });
  triggerWorker();
}

async function profileOf(userId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("email, full_name, daily_goal_minutes")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  return trimmed ? trimmed.split(" ")[0]! : "öğrenci";
}

export async function queueWelcomeEmail(userId: string, email: string, fullName: string) {
  const settings = await getSettings();
  if (!settings.email_welcome_enabled) return;

  await queueEmail({
    userId,
    to: email,
    templateKey: "welcome",
    variables: { ad: firstName(fullName) },
    transactional: true,
  });
}

export async function queuePremiumActivatedEmail(userId: string, endsAt: Date) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "premium_activated",
    variables: {
      ad: firstName(profile.full_name as string),
      bitis_tarihi: endsAt.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    },
    transactional: true,
  });
}

export async function queuePaymentApprovedEmail(
  userId: string,
  amount: string,
  endsAt: Date,
) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "payment_approved",
    variables: {
      ad: firstName(profile.full_name as string),
      tutar: amount,
      bitis_tarihi: endsAt.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    },
    transactional: true,
  });
}

export async function queuePaymentRejectedEmail(userId: string, reason: string) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "payment_rejected",
    variables: {
      ad: firstName(profile.full_name as string),
      sebep: reason || "Ödeme bilgileri doğrulanamadı.",
    },
    transactional: true,
  });
}

export async function queueDocumentReadyEmail(
  userId: string,
  documentId: string,
  documentTitle: string,
) {
  const settings = await getSettings();
  if (!settings.email_document_ready_enabled) return;

  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "document_ready",
    variables: {
      ad: firstName(profile.full_name as string),
      materyal: documentTitle,
      materyal_id: documentId,
    },
  });
}

export async function queueBadgeEmail(
  userId: string,
  badgeName: string,
  badgeDescription: string,
) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "badge_earned",
    variables: {
      ad: firstName(profile.full_name as string),
      rozet: badgeName,
      rozet_aciklama: badgeDescription,
    },
  });
}

export async function queuePremiumExpiringEmail(
  userId: string,
  endsAt: Date,
  daysLeft: number,
) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "premium_expiring",
    variables: {
      ad: firstName(profile.full_name as string),
      kalan_gun: String(daysLeft),
      bitis_tarihi: endsAt.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    },
    transactional: true,
  });
}

export async function queueStudyReminderEmail(
  userId: string,
  dueCards: number,
) {
  const profile = await profileOf(userId);
  if (!profile?.email) return;

  await queueEmail({
    userId,
    to: profile.email as string,
    templateKey: "study_reminder",
    variables: {
      ad: firstName(profile.full_name as string),
      dakika: String(profile.daily_goal_minutes ?? 30),
      tekrar_bilgisi:
        dueCards > 0
          ? `**${dueCards} flashcard** tekrar zamanı geldi.`
          : "Bugün yeni bir konuya başlayabilirsin.",
    },
  });
}
