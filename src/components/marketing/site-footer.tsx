import Link from "next/link";
import { Sparkles } from "lucide-react";

const COLUMNS = [
  {
    title: "Ürün",
    links: [
      { href: "/#nasil-calisir", label: "Nasıl çalışır?" },
      { href: "/#ozellikler", label: "Özellikler" },
      { href: "/#ai-ogretmen", label: "AI Öğretmen" },
      { href: "/premium", label: "Premium" },
    ],
  },
  {
    title: "Kaynaklar",
    links: [
      { href: "/#sss", label: "Sıkça sorulan sorular" },
      { href: "/kayit", label: "Ücretsiz hesap oluştur" },
      { href: "/giris", label: "Giriş yap" },
    ],
  },
  {
    title: "Yasal",
    links: [
      { href: "/kvkk", label: "KVKK Aydınlatma Metni" },
      { href: "/gizlilik", label: "Gizlilik Politikası" },
      { href: "/kosullar", label: "Kullanım Koşulları" },
      { href: "/cerezler", label: "Çerez Politikası" },
    ],
  },
];

export function SiteFooter({
  siteName,
  supportEmail,
}: {
  siteName: string;
  supportEmail: string;
}) {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 font-semibold text-ink-900">
              <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-white">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <span className="text-lg tracking-tight">{siteName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-ink-500">
              Notlarını yükle, gerisini yapay zekâ ile birlikte çalış.
            </p>
            <a
              href={`mailto:${supportEmail}`}
              className="mt-4 inline-block text-sm text-brand-600 hover:text-brand-700"
            >
              {supportEmail}
            </a>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h4 className="text-sm font-semibold text-ink-900">{column.title}</h4>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-500 transition-colors hover:text-ink-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteName}. Tüm hakları saklıdır.
          </p>
          <p>Türkiye&apos;de öğrenciler için tasarlandı.</p>
        </div>
      </div>
    </footer>
  );
}
