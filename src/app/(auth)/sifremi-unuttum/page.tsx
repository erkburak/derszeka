import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, Input, Label } from "@/components/ui";
import { forgotPasswordAction } from "@/app/(auth)/actions";

export const metadata: Metadata = {
  title: "Şifremi unuttum",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Şifreni mi unuttun?
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-500">
          E-posta adresini gir, sıfırlama bağlantısı gönderelim.
        </p>

        <AuthForm action={forgotPasswordAction} submitLabel="Bağlantı gönder">
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
        </AuthForm>

        <p className="mt-6 text-center text-sm text-ink-500">
          <Link href="/giris" className="font-medium text-brand-600 hover:text-brand-700">
            Giriş sayfasına dön
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
