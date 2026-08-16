"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import {
  isLoginLocked,
  recordLoginAttempt,
  enforceRateLimit,
  RateLimitError,
} from "@/lib/security/rate-limit";
import { serverEnv } from "@/lib/env";
import { queueWelcomeEmail } from "@/lib/email/triggers";

export interface AuthFormState {
  error?: string;
  success?: string;
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "E-posta adresi gerekli.")
  .email("Geçerli bir e-posta adresi gir.");

const passwordSchema = z
  .string()
  .min(8, "Şifre en az 8 karakter olmalı.")
  .max(72, "Şifre en fazla 72 karakter olabilir.")
  .regex(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/, "Şifre en az bir harf içermeli.")
  .regex(/\d/, "Şifre en az bir rakam içermeli.");

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Adını yaz.").max(80),
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal("on", { message: "Devam etmek için koşulları onaylamalısın." }),
});

async function requestIp(): Promise<string> {
  const headerList = await headers();
  return (
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headerList.get("x-real-ip") ??
    "unknown"
  );
}

/** Supabase hata mesajlarını kullanıcı diline çevirir; teknik detay sızdırmaz. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "E-posta veya şifre hatalı.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-posta adresini doğrulaman gerekiyor. Gelen kutunu kontrol et.";
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return "Bu e-posta adresi zaten kayıtlı. Giriş yapmayı dene.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Çok fazla deneme yapıldı. Lütfen biraz bekle.";
  }
  if (lower.includes("weak password")) {
    return "Şifren yeterince güçlü değil.";
  }
  return "İşlem tamamlanamadı. Lütfen tekrar dene.";
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (!password) return { error: "Şifreni gir." };

  const ip = await requestIp();
  const settings = await getSettings();

  if (
    await isLoginLocked(
      email,
      ip,
      Number(settings.login_max_attempts),
      Number(settings.login_lockout_minutes),
    )
  ) {
    return {
      error: `Çok fazla başarısız deneme. ${settings.login_lockout_minutes} dakika sonra tekrar dene.`,
    };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  await recordLoginAttempt(email, ip, !error);

  if (error) return { error: friendlyAuthError(error.message) };

  const admin = createAdminSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await admin
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed, is_active")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: "Hesabın devre dışı bırakılmış. Destek ile iletişime geç." };
  }

  revalidatePath("/", "layout");
  redirect(profile?.onboarding_completed ? next : "/onboarding");
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    consent: String(formData.get("consent") ?? ""),
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const ip = await requestIp();
  try {
    await enforceRateLimit("signup", ip, 5, 3600);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    throw error;
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${serverEnv.siteUrl}/auth/callback?next=/onboarding`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  if (data.user) {
    const admin = createAdminSupabase();
    await admin.from("consents").insert([
      { user_id: data.user.id, consent_type: "terms", ip },
      { user_id: data.user.id, consent_type: "privacy", ip },
      { user_id: data.user.id, consent_type: "kvkk", ip },
    ]);

    await admin.from("notifications").insert({
      user_id: data.user.id,
      type: "info",
      title: "Hoş geldin!",
      body: "İlk ders materyalini yükleyerek başlayabilirsin.",
      link: "/materials",
    });

    await queueWelcomeEmail(data.user.id, parsed.data.email, parsed.data.fullName);
  }

  // E-posta doğrulaması kapalıysa oturum hemen açılır.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/onboarding");
  }

  return {
    success:
      "Hesabın oluşturuldu. E-posta adresine gönderdiğimiz bağlantıya tıklayarak doğrula.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const ip = await requestIp();
  try {
    await enforceRateLimit("password-reset", ip, 5, 3600);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.message };
    throw error;
  }

  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${serverEnv.siteUrl}/auth/callback?next=/sifre-yenile`,
  });

  // Kayıtlı e-postaları sızdırmamak için her durumda aynı mesaj döner.
  return {
    success:
      "Eğer bu adresle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.",
  };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (password !== confirm) return { error: "Şifreler eşleşmiyor." };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Bağlantının süresi dolmuş. Yeniden dene." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyAuthError(error.message) };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
