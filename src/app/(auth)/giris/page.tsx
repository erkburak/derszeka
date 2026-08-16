import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, Input, Label } from "@/components/ui";
import { signInAction } from "@/app/(auth)/actions";

export const metadata: Metadata = {
  title: "Giriş yap",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") ? next : "/dashboard";

  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Tekrar hoş geldin
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-500">
          Kaldığın yerden çalışmaya devam et.
        </p>

        <AuthForm action={signInAction} submitLabel="Giriş yap">
          <input type="hidden" name="next" value={safeNext} />

          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ornek@eposta.com"
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="password" className="mb-0">
                Şifre
              </Label>
              <Link
                href="/sifremi-unuttum"
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                Şifremi unuttum
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
        </AuthForm>

        <p className="mt-6 text-center text-sm text-ink-500">
          Hesabın yok mu?{" "}
          <Link href="/kayit" className="font-medium text-brand-600 hover:text-brand-700">
            Ücretsiz kayıt ol
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
