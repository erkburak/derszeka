import { NextResponse } from "next/server";
import { AppError, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createAdminSupabase } from "@/lib/supabase/server";
import { clientIp, enforceRateLimit } from "@/lib/security/rate-limit";
import { sanitizeFilename } from "@/lib/documents/validate";

export const runtime = "nodejs";
export const maxDuration = 60;

const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/** Kullanıcının havale/EFT ödeme bildirimi. */
export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  await enforceRateLimit("payment-notice", profile.id, 5, 3600);
  await enforceRateLimit("payment-notice-ip", clientIp(request), 20, 3600);

  const form = await request.formData().catch(() => null);
  if (!form) throw new AppError("Geçersiz istek.", 400, "invalid_form");

  const fullName = String(form.get("fullName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const amount = Number(form.get("amount") ?? 0);
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const receipt = form.get("receipt");

  if (fullName.length < 3) {
    throw new AppError("Ad soyad bilgisini gir.", 400, "invalid_name");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new AppError("Geçerli bir e-posta adresi gir.", 400, "invalid_email");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Ödediğin tutarı gir.", 400, "invalid_amount");
  }

  const supabase = createAdminSupabase();
  const settings = await getSettings();

  const { data: pending } = await supabase
    .from("payment_requests")
    .select("id")
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .maybeSingle();

  if (pending) {
    throw new AppError(
      "Zaten inceleme bekleyen bir ödeme bildirimin var.",
      409,
      "pending_exists",
    );
  }

  const { data: paymentRequest, error } = await supabase
    .from("payment_requests")
    .insert({
      user_id: profile.id,
      full_name: fullName.slice(0, 120),
      email: email.slice(0, 160),
      amount,
      currency: settings.premium_currency,
      note: note || null,
    })
    .select("id")
    .single();

  if (error) throw new AppError("Bildirim kaydedilemedi.", 500, "db_error");

  if (receipt instanceof File && receipt.size > 0) {
    if (!RECEIPT_TYPES.includes(receipt.type)) {
      throw new AppError(
        "Dekont yalnızca JPG, PNG, WEBP veya PDF olabilir.",
        415,
        "unsupported_media_type",
      );
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      throw new AppError("Dekont 8 MB sınırını aşıyor.", 413, "file_too_large");
    }

    const safeName = sanitizeFilename(receipt.name);
    const path = `${profile.id}/${paymentRequest.id}/${safeName}`;
    const buffer = Buffer.from(await receipt.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(path, buffer, { contentType: receipt.type, upsert: true });

    if (!uploadError) {
      await supabase
        .from("payment_requests")
        .update({ receipt_path: path })
        .eq("id", paymentRequest.id);
    }
  }

  // Adminlere bildirim düş.
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (admins?.length) {
    await supabase.from("notifications").insert(
      admins.map((admin) => ({
        user_id: admin.id,
        type: "info",
        title: "Yeni ödeme bildirimi",
        body: `${fullName} — ${amount} ${settings.premium_currency}`,
        link: "/admin/payments",
      })),
    );
  }

  return NextResponse.json({ ok: true, id: paymentRequest.id });
});
