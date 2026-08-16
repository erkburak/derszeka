"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Tarayıcı istemcisi — yalnızca publishable (anon) anahtar kullanır ve
 * her sorgu RLS altında çalışır. Servis anahtarı buraya asla gelmez.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
