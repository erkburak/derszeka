import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getPublicSettings } from "@/lib/settings";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getPublicSettings();

  return (
    <div className="gradient-soft flex min-h-dvh flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 font-semibold text-ink-900"
        >
          <span className="gradient-brand flex size-9 items-center justify-center rounded-lg text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="text-xl tracking-tight">{settings.siteName}</span>
        </Link>

        {children}

        <p className="mt-8 text-center text-xs text-ink-400">
          Devam ederek{" "}
          <Link href="/kosullar" className="underline hover:text-ink-700">
            Kullanım Koşulları
          </Link>{" "}
          ve{" "}
          <Link href="/gizlilik" className="underline hover:text-ink-700">
            Gizlilik Politikası
          </Link>
          &apos;nı kabul etmiş olursun.
        </p>
      </div>
    </div>
  );
}
