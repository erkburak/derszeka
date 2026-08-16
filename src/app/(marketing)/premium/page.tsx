import Link from "next/link";
import type { Metadata } from "next";
import {
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Info,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent } from "@/components/ui";
import { PaymentForm } from "@/components/marketing/payment-form";
import { getPublicSettings } from "@/lib/settings";
import { getCurrentProfile } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Premium",
  description:
    "DersAI Premium ile daha yüksek yapay zekâ kotası, daha fazla dosya yükleme, kişisel çalışma planı ve gelişmiş analiz.",
  alternates: { canonical: "/premium" },
};

const FEATURES = [
  "Çok daha yüksek günlük ve aylık AI kullanım hakkı",
  "Daha fazla dosya yükleme ve daha büyük dosya boyutu",
  "Uzun materyallerin tamamının işlenmesi",
  "Daha fazla flashcard ve quiz üretimi",
  "AI Öğretmen için genişletilmiş mesaj hakkı",
  "Kişisel çalışma planı ve aralıklı tekrar takvimi",
  "Gelişmiş ilerleme analizi",
  "Gelişmiş yapay zekâ modelleri",
];

const STEPS = [
  {
    icon: Building2,
    title: "Havale/EFT yap",
    text: "Aşağıdaki hesap bilgilerine aylık ücreti gönder.",
  },
  {
    icon: CreditCard,
    title: "Ödemeni bildir",
    text: "Formu doldur, istersen dekontunu yükle.",
  },
  {
    icon: Clock,
    title: "Onayı bekle",
    text: "Kontrol edildikten sonra üyeliğin otomatik aktifleşir.",
  },
];

export default async function PremiumPage() {
  const [settings, profile] = await Promise.all([
    getPublicSettings(),
    getCurrentProfile(),
  ]);

  const price = formatCurrency(Number(settings.premiumPrice), settings.premiumCurrency);
  const bankConfigured = Boolean(settings.bankIban && settings.bankAccountHolder);

  let pendingRequest: { created_at: string } | null = null;
  let subscriptionEnd: string | null = null;

  if (profile) {
    const supabase = await createServerSupabase();
    const [{ data: pending }, { data: subscription }] = await Promise.all([
      supabase
        .from("payment_requests")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("ends_at")
        .eq("status", "active")
        .order("ends_at", { ascending: false })
        .maybeSingle(),
    ]);
    pendingRequest = pending as { created_at: string } | null;
    subscriptionEnd = (subscription?.ends_at as string) ?? null;
  }

  const transferNote = settings.bankTransferNote.replace(
    "{kullanici}",
    profile?.email ?? "e-posta adresin",
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <Badge tone="brand" className="mb-4">
          <Crown className="size-3.5" aria-hidden />
          Premium
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
          Sınırlarını kaldır, çalışmaya odaklan
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-500">
          Aylık {price} karşılığında tüm özellikler ve çok daha yüksek kullanım
          hakkı.
        </p>
      </div>

      {profile?.plan === "premium" ? (
        <Alert tone="success" className="mx-auto mt-8 max-w-2xl">
          <span className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Premium üyeliğin aktif
              {subscriptionEnd ? ` — ${formatDate(subscriptionEnd)} tarihine kadar` : ""}
              . Süre bitiminden önce yeni bir ödeme bildirimi yaparak uzatabilirsin.
            </span>
          </span>
        </Alert>
      ) : null}

      {pendingRequest ? (
        <Alert tone="warning" className="mx-auto mt-8 max-w-2xl">
          <span className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {formatDate(pendingRequest.created_at, true)} tarihli ödeme bildirimin
              inceleniyor. Onaylandığında bildirim alacaksın.
            </span>
          </span>
        </Alert>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Fiyat + özellikler */}
        <div className="space-y-6">
          <Card className="border-brand-300 shadow-[var(--shadow-lift)]">
            <CardContent className="p-6">
              <p className="text-sm text-ink-500">Aylık üyelik</p>
              <p className="mt-1">
                <span className="text-4xl font-semibold text-ink-900">{price}</span>
                <span className="text-ink-400"> / ay</span>
              </p>
              <p className="mt-2 text-sm text-ink-500">
                Otomatik yenileme yok. Süre bitiminde dilersen tekrar ödersin.
              </p>

              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success-500"
                      aria-hidden
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="card p-4">
                <div className="flex items-center gap-2 text-brand-600">
                  <step.icon className="size-4" aria-hidden />
                  <span className="text-xs font-semibold">Adım {index + 1}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-ink-900">{step.title}</p>
                <p className="mt-1 text-xs text-ink-500">{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Banka bilgileri + form */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
                <Building2 className="size-5 text-brand-600" aria-hidden />
                Banka bilgileri
              </h2>

              {bankConfigured ? (
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <dt className="text-ink-500">Banka</dt>
                    <dd className="text-right font-medium text-ink-900">
                      {settings.bankName}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <dt className="flex items-center gap-1.5 text-ink-500">
                      <User className="size-3.5" aria-hidden />
                      Hesap sahibi
                    </dt>
                    <dd className="text-right font-medium text-ink-900">
                      {settings.bankAccountHolder}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <dt className="text-ink-500">IBAN</dt>
                    <dd className="text-right font-mono text-sm font-medium break-all text-ink-900">
                      {settings.bankIban}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                    <dt className="text-ink-500">Tutar</dt>
                    <dd className="text-right font-medium text-ink-900">{price}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <dt className="flex items-center gap-1.5 text-ink-500">
                      <Copy className="size-3.5" aria-hidden />
                      Açıklama
                    </dt>
                    <dd className="text-right font-medium text-ink-900">
                      {transferNote}
                    </dd>
                  </div>
                </dl>
              ) : (
                <Alert tone="warning" className="mt-4">
                  <span className="flex items-start gap-2">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Banka bilgileri henüz tanımlanmamış. Lütfen{" "}
                    <a
                      href={`mailto:${settings.supportEmail}`}
                      className="underline"
                    >
                      {settings.supportEmail}
                    </a>{" "}
                    adresinden bize ulaş.
                  </span>
                </Alert>
              )}

              <p className="mt-4 text-xs text-ink-400">
                Açıklama kısmına e-posta adresini yazman, ödemeni hızlıca
                eşleştirmemizi sağlar.
              </p>
            </CardContent>
          </Card>

          {!profile ? (
            <Card>
              <CardContent className="space-y-3 p-6 text-center">
                <p className="text-sm text-ink-500">
                  Ödeme bildirimi yapabilmek için giriş yapmalısın.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Link href="/giris?next=/premium">
                    <Button variant="secondary">Giriş yap</Button>
                  </Link>
                  <Link href="/kayit">
                    <Button>Ücretsiz kayıt ol</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : pendingRequest ? null : (
            <PaymentForm
              defaultName={profile.full_name ?? ""}
              defaultEmail={profile.email ?? ""}
              amount={Number(settings.premiumPrice)}
              currency={settings.premiumCurrency}
            />
          )}
        </div>
      </div>
    </div>
  );
}
