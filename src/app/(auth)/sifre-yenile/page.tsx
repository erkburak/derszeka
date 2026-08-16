import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, Input, Label } from "@/components/ui";
import { updatePasswordAction } from "@/app/(auth)/actions";

export const metadata: Metadata = {
  title: "Yeni şifre belirle",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardContent className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Yeni şifre belirle
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-ink-500">
          Güvenliğin için daha önce kullanmadığın bir şifre seç.
        </p>

        <AuthForm action={updatePasswordAction} submitLabel="Şifremi güncelle">
          <div>
            <Label htmlFor="password">Yeni şifre</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="En az 8 karakter"
              required
            />
          </div>

          <div>
            <Label htmlFor="passwordConfirm">Yeni şifre (tekrar)</Label>
            <Input
              id="passwordConfirm"
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              required
            />
          </div>
        </AuthForm>
      </CardContent>
    </Card>
  );
}
