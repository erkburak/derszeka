import "server-only";

import { cache } from "react";
import { createServerSupabase, createAdminSupabase } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number = 401,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Geçerli oturumun profilini döner. İstek başına önbelleklenir.
 * Plan süresi geçmişse kullanıcıyı otomatik olarak ücretsiz plana düşürür.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  const profile = data as Profile;

  if (
    profile.plan === "premium" &&
    profile.plan_expires_at &&
    new Date(profile.plan_expires_at).getTime() < Date.now()
  ) {
    const admin = createAdminSupabase();
    await admin
      .from("profiles")
      .update({ plan: "free", plan_expires_at: null })
      .eq("id", profile.id);
    await admin
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("user_id", profile.id)
      .eq("status", "active");
    return { ...profile, plan: "free", plan_expires_at: null };
  }

  return profile;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new AuthError("Giriş yapmanız gerekiyor.", 401);
  if (!profile.is_active) {
    throw new AuthError("Hesabınız devre dışı bırakılmış.", 403);
  }
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    throw new AuthError("Bu işlem için yetkiniz yok.", 403);
  }
  return profile;
}

export function isPremium(profile: Profile): boolean {
  if (profile.plan !== "premium") return false;
  if (!profile.plan_expires_at) return true;
  return new Date(profile.plan_expires_at).getTime() > Date.now();
}
