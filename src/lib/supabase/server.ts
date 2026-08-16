import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Kullanıcı oturumuna bağlı sunucu istemcisi. RLS aktiftir:
 * kullanıcı yalnızca kendi verisine erişir.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(serverEnv.supabaseUrl, serverEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component içinden çağrıldığında cookie yazılamaz;
          // oturum yenilemesi middleware tarafından yapılır.
        }
      },
    },
  });
}

/**
 * Servis anahtarlı istemci — RLS'i aşar.
 * SADECE sunucu tarafında, yetki kontrolü yapıldıktan sonra kullanılmalı:
 * admin işlemleri, arka plan job'ları, sistem tabloları.
 */
export function createAdminSupabase() {
  return createSupabaseClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
