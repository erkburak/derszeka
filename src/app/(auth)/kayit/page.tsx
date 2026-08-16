import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, Input, Label } from "@/components/ui";
import { signUpAction } from "@/app/(auth)/actions";

export const metadata: Metadata = {
  title: "Ücretsiz kayıt ol",
  robots: { index: false, follow: false },
};

export default function SignUpPage() {
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Ücretsiz hesap oluştur
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-500">
          Kredi kartı gerekmez. İlk materyalini hemen yükleyebilirsin.
        </p>

        <AuthForm action={signUpAction} submitLabel="Hesabımı oluştur">
          <div>
            <Label htmlFor="fullName">Ad Soyad</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              placeholder="Adın Soyadın"
              required
            />
          </div>

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
            <Label htmlFor="password">Şifre</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="En az 8 karakter"
              required
            />
            <p className="mt-1.5 text-xs text-ink-400">
              En az 8 karakter, bir harf ve bir rakam içermeli.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 size-4 rounded border-line text-brand-600 focus:ring-brand-400"
            />
            <span>
              <Link href="/kosullar" className="text-brand-600 hover:underline">
                Kullanım Koşulları
              </Link>
              ,{" "}
              <Link href="/gizlilik" className="text-brand-600 hover:underline">
                Gizlilik Politikası
              </Link>{" "}
              ve{" "}
              <Link href="/kvkk" className="text-brand-600 hover:underline">
                KVKK Aydınlatma Metni
              </Link>
              &apos;ni okudum, kabul ediyorum.
            </span>
          </label>
        </AuthForm>

        <p className="mt-6 text-center text-sm text-ink-500">
          Zaten hesabın var mı?{" "}
          <Link href="/giris" className="font-medium text-brand-600 hover:text-brand-700">
            Giriş yap
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
