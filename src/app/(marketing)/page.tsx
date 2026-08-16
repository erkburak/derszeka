import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  CalendarClock,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  MessageCircleQuestion,
  Quote,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui";
import { getPublicSettings } from "@/lib/settings";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notlarını Yapay Zekâ ile Çalışma Sistemine Dönüştür",
  description:
    "PDF, fotoğraf ve ders notlarını yükle. Yapay zekâ senin için özetler, flashcardlar, quizler ve kişisel çalışma planları oluştursun. Ücretsiz başla.",
  alternates: { canonical: "/" },
};

const STEPS = [
  {
    icon: Upload,
    title: "Materyalini yükle",
    text: "PDF, kitap sayfası fotoğrafı, el yazısı notun veya kopyaladığın metin — hepsi olur.",
  },
  {
    icon: Brain,
    title: "Yapay zekâ analiz etsin",
    text: "Metin çıkarılır, görseller okunur, konular ve sınavda çıkacak kritik bilgiler belirlenir.",
  },
  {
    icon: BookOpenCheck,
    title: "Çalışmaya başla",
    text: "Özet, flashcard, quiz ve AI Öğretmen hazır. Sen sadece çalış.",
  },
];

const FEATURES = [
  {
    icon: FileText,
    title: "Akıllı ders özeti",
    text: "Kısa ve detaylı özet, konu konu bölümler, tanımlar, formüller, tarihler ve sınav açısından kritik bilgiler.",
  },
  {
    icon: Layers,
    title: "Otomatik flashcard",
    text: "Materyalinden kart üretilir; zorlandığın kartlar aralıklı tekrar sistemiyle karşına daha sık çıkar.",
  },
  {
    icon: ListChecks,
    title: "Her tür quiz",
    text: "Çoktan seçmeli, doğru-yanlış, boşluk doldurma, eşleştirme, kısa ve açık uçlu sorular — açıklamalarıyla.",
  },
  {
    icon: MessageCircleQuestion,
    title: "AI Öğretmen",
    text: "Kendi notların üzerinden soru sor, anlamadığın yeri tekrar anlattır, seni sorularla çalıştırsın.",
  },
  {
    icon: CalendarClock,
    title: "Kişisel çalışma planı",
    text: "Sınav tarihini ve günlük süreni söyle; hangi gün ne çalışacağın planlansın.",
  },
  {
    icon: BarChart3,
    title: "İlerleme analizi",
    text: "Çalışma süresi, konu başarı oranları, güçlü ve zayıf konular tek ekranda.",
  },
  {
    icon: ImageIcon,
    title: "Fotoğraf ve el yazısı",
    text: "Kitap sayfalarının fotoğrafını çek, yükle. Tablolar ve grafikler de yorumlanır.",
  },
  {
    icon: Quote,
    title: "Kaynak gösterimi",
    text: "Her bilgi hangi materyalin hangi sayfasından geldiğini gösterir. Uydurma bilgi yok.",
  },
];

const TUTOR_PROMPTS = [
  "Bu konuyu bana 10 yaşındaki bir çocuğa anlatır gibi anlat.",
  "Bu konudan sınavda ne sorulabilir?",
  "Bu bölümü daha kolay ezberlemem için yöntem geliştir.",
  "Bu konuyu bana soru sorarak öğret.",
  "Bu konunun en kritik 10 bilgisini söyle.",
];

const FAQ = [
  {
    q: "Hangi dosya türlerini yükleyebilirim?",
    a: "PDF, JPG, JPEG, PNG, WEBP, TXT ve DOCX dosyalarını yükleyebilirsin. Ayrıca kopyaladığın metni doğrudan yapıştırabilirsin. Aynı anda birden fazla dosya yükleyebilirsin.",
  },
  {
    q: "El yazısı notlarım okunuyor mu?",
    a: "Evet. Fotoğrafını çektiğin el yazısı notlar, kitap sayfaları, tablolar ve grafikler görüntü analizi ile okunur ve çalışma materyaline dönüştürülür.",
  },
  {
    q: "Yapay zekâ uydurma bilgi verir mi?",
    a: "Sistem, cevaplarını yalnızca senin yüklediğin materyale dayandıracak şekilde kurgulandı. Her çıktının hangi materyalden ve hangi sayfadan geldiği gösterilir. Materyalde olmayan bir bilgi sorulduğunda bunu açıkça belirtir.",
  },
  {
    q: "Ücretsiz plan ne kadar yeterli?",
    a: "Ücretsiz planla sistemi rahatça deneyebilirsin: dosya yükleme, özet, flashcard, quiz ve AI Öğretmen için günlük ve aylık kullanım hakkın var. Limitine ulaştığında Premium'a geçebilirsin.",
  },
  {
    q: "Ödeme nasıl yapılıyor?",
    a: "Şu anda banka havalesi/EFT ile ödeme alıyoruz. Premium sayfasındaki hesap bilgilerine ödemeni yaptıktan sonra 'Ödeme Bildir' formunu doldurman yeterli. Onaylandığında üyeliğin anında aktifleşir.",
  },
  {
    q: "Yüklediğim materyalleri başkaları görebilir mi?",
    a: "Hayır. Dosyaların özel bir alanda saklanır ve yalnızca senin hesabından erişilebilir. Hesabını sildiğinde materyallerin de silinir.",
  },
];

export default async function HomePage() {
  const settings = await getPublicSettings();
  const price = formatCurrency(Number(settings.premiumPrice), settings.premiumCurrency);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: settings.siteName,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        description: settings.siteDescription,
        offers: [
          {
            "@type": "Offer",
            name: "Ücretsiz",
            price: "0",
            priceCurrency: settings.premiumCurrency,
          },
          {
            "@type": "Offer",
            name: "Premium",
            price: String(settings.premiumPrice),
            priceCurrency: settings.premiumCurrency,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ------------------------------------------------------------ Hero */}
      <section className="gradient-soft relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:pb-28">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-fade-up">
              <Badge tone="brand" className="mb-5">
                <Sparkles className="size-3.5" aria-hidden />
                Yapay zekâ destekli çalışma platformu
              </Badge>

              <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-ink-900 sm:text-5xl lg:text-[3.4rem]">
                Notlarını{" "}
                <span className="text-gradient">yapay zekâ ile</span> çalışma
                sistemine dönüştür.
              </h1>

              <p className="mt-5 max-w-xl text-lg text-ink-500">
                PDF, fotoğraf ve ders notlarını yükle. Yapay zekâ senin için
                özetler, flashcardlar, quizler ve kişisel çalışma planları
                oluştursun.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/kayit">
                  <Button size="lg" block>
                    Ücretsiz Başla
                    <ArrowRight aria-hidden />
                  </Button>
                </Link>
                <Link href="/kayit?next=/materials">
                  <Button size="lg" variant="secondary" block>
                    <Upload aria-hidden />
                    Materyalimi Yükle
                  </Button>
                </Link>
              </div>

              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-success-500" aria-hidden />
                  Kredi kartı gerekmez
                </li>
                <li className="flex items-center gap-1.5">
                  <Zap className="size-4 text-warning-500" aria-hidden />
                  Dakikalar içinde hazır
                </li>
                <li className="flex items-center gap-1.5">
                  <GraduationCap className="size-4 text-brand-500" aria-hidden />
                  Türkçe destekli
                </li>
              </ul>
            </div>

            {/* Ürün önizlemesi */}
            <div className="animate-fade-up lg:pl-4">
              <div className="card overflow-hidden p-0">
                <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-4 py-3">
                  <span className="size-2.5 rounded-full bg-danger-500/60" />
                  <span className="size-2.5 rounded-full bg-warning-500/60" />
                  <span className="size-2.5 rounded-full bg-success-500/60" />
                  <span className="ml-2 truncate text-xs text-ink-400">
                    Anatomi Final Notları.pdf
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-xl border border-line bg-surface-muted p-4">
                    <p className="text-xs font-medium tracking-wide text-ink-400 uppercase">
                      Akıllı özet
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-700">
                      Kardiyovasküler sistem, kalp ve damarlardan oluşur. Kalp
                      dört odacıklıdır: iki atriyum, iki ventrikül...
                    </p>
                    <p className="mt-2 text-xs text-brand-600">
                      Kaynak: Anatomi Final.pdf · Sayfa 14
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
                      <Layers className="size-4 text-brand-600" aria-hidden />
                      <p className="mt-2 text-2xl font-semibold text-brand-900">
                        32
                      </p>
                      <p className="text-xs text-brand-700">flashcard hazır</p>
                    </div>
                    <div className="rounded-xl border border-line bg-surface-muted p-3">
                      <ListChecks className="size-4 text-accent-600" aria-hidden />
                      <p className="mt-2 text-2xl font-semibold text-ink-900">
                        15
                      </p>
                      <p className="text-xs text-ink-500">quiz sorusu</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line p-4">
                    <div className="mb-2 flex items-center justify-between text-xs text-ink-500">
                      <span>Bugünkü hedef</span>
                      <span className="font-medium text-ink-900">42 / 60 dk</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div className="gradient-brand h-full w-[70%] rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- Nasıl çalışır */}
      <section id="nasil-calisir" className="border-t border-line bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Üç adımda çalışmaya hazır
            </h2>
            <p className="mt-3 text-ink-500">
              Materyalini yüklemenle çalışmaya başlaman arasında yalnızca birkaç
              dakika var.
            </p>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="card relative p-6">
                <span className="gradient-brand absolute -top-3 left-6 flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <step.icon className="size-6 text-brand-600" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold text-ink-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- Özellikler */}
      <section id="ozellikler" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="brand" className="mb-4">
              Özellikler
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Basit bir özetleyiciden çok daha fazlası
            </h2>
            <p className="mt-3 text-ink-500">
              Materyalini anlayan, seni çalıştıran ve ilerlemeni takip eden
              eksiksiz bir çalışma sistemi.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="card p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <feature.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-ink-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {feature.text}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ AI Öğretmen */}
      <section id="ai-ogretmen" className="border-y border-line bg-white py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
          <div>
            <Badge tone="brand" className="mb-4">
              AI Öğretmen
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Kendi notlarınla konuşan bir öğretmen
            </h2>
            <p className="mt-4 text-ink-500">
              AI Öğretmen yalnızca senin yüklediğin materyale dayanarak cevap
              verir. Anlamadığın yeri tekrar anlattır, sınavda ne çıkabileceğini
              sor, hatta rolleri değiştirip sana soru sormasını iste.
            </p>

            <ul className="mt-6 space-y-2.5">
              {TUTOR_PROMPTS.map((prompt) => (
                <li
                  key={prompt}
                  className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-700"
                >
                  <MessageCircleQuestion
                    className="mt-0.5 size-4 shrink-0 text-brand-500"
                    aria-hidden
                  />
                  <span>&ldquo;{prompt}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card space-y-4 p-6">
            <div className="flex items-center gap-2 border-b border-line pb-4">
              <span className="gradient-brand flex size-8 items-center justify-center rounded-lg text-white">
                <Brain className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-900">Beni Çalıştır</p>
                <p className="text-xs text-ink-400">
                  Kardiyovasküler Sistem · Adım 3
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-surface-muted p-4 text-sm leading-relaxed text-ink-700">
              Kalbin sol ventrikülü, kanı aort yoluyla tüm vücuda pompalar. Bu
              yüzden duvarı diğer odacıklardan kalındır.
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
              <p className="font-medium">Soru</p>
              <p className="mt-1">
                Sol ventrikülün duvarı neden sağ ventrikülden daha kalındır?
              </p>
            </div>

            <div className="ml-auto max-w-[85%] rounded-xl bg-ink-900 p-4 text-sm text-white">
              Çünkü daha yüksek basınçla ve daha uzağa kan pompalaması gerekiyor.
            </div>

            <div className="rounded-xl border border-success-500/30 bg-success-50 p-4 text-sm text-success-700">
              <p className="font-medium">Doğru!</p>
              <p className="mt-1">
                Sistemik dolaşıma pompaladığı için direnç daha yüksektir. Bir
                sonraki soru biraz daha zor gelecek.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- Flashcard / Quiz / Plan */}
      <section className="py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-3">
          <article className="card p-6">
            <Layers className="size-6 text-brand-600" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold text-ink-900">Flashcards</h3>
            <p className="mt-2 text-sm text-ink-500">
              &ldquo;Biliyorum / Emin değilim / Bilmiyorum&rdquo; ile işaretle.
              Zorlandığın kartlar aralıklı tekrar algoritmasıyla önceliklendirilir.
            </p>
            <div className="mt-5 space-y-2">
              {["Kolay", "Orta", "Zor", "Çok zor"].map((level, index) => (
                <div key={level} className="flex items-center gap-3">
                  <span className="w-16 text-xs text-ink-400">{level}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className="gradient-brand h-full rounded-full"
                      style={{ width: `${[85, 62, 41, 24][index]}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="card p-6">
            <ListChecks className="size-6 text-accent-600" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold text-ink-900">Quiz</h3>
            <p className="mt-2 text-sm text-ink-500">
              Her soruda doğru cevap, açıklama ve materyaldeki kaynağı görürsün.
              Yalnızca &ldquo;yanlış&rdquo; demez, nedenini anlatır.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                "Çoktan seçmeli",
                "Doğru / Yanlış",
                "Boşluk doldurma",
                "Eşleştirme",
                "Kısa & açık uçlu",
              ].map((type) => (
                <li key={type} className="flex items-center gap-2 text-ink-700">
                  <span className="size-1.5 rounded-full bg-accent-500" />
                  {type}
                </li>
              ))}
            </ul>
          </article>

          <article className="card p-6">
            <CalendarClock className="size-6 text-success-500" aria-hidden />
            <h3 className="mt-4 text-xl font-semibold text-ink-900">
              Çalışma planı
            </h3>
            <p className="mt-2 text-sm text-ink-500">
              Sınavını ve günlük süreni gir; hangi gün hangi konuyu çalışacağın,
              ne zaman tekrar edeceğin planlansın.
            </p>
            <div className="mt-5 space-y-2">
              {[
                ["Pazartesi", "Hücre"],
                ["Salı", "Genetik"],
                ["Çarşamba", "DNA"],
                ["Perşembe", "Tekrar"],
                ["Cuma", "Quiz"],
              ].map(([day, topic]) => (
                <div
                  key={day}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span className="text-ink-400">{day}</span>
                  <span className="font-medium text-ink-900">{topic}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* ---------------------------------------------------------- Premium */}
      <section className="border-y border-line bg-white py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="text-center">
            <Badge tone="brand" className="mb-4">
              Premium
            </Badge>
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Sınırsıza yakın çalış
            </h2>
            <p className="mt-3 text-ink-500">
              Ücretsiz planla dene, ihtiyacın büyüdüğünde Premium&apos;a geç.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-ink-900">Ücretsiz</h3>
              <p className="mt-1 text-sm text-ink-500">Sistemi denemek için</p>
              <p className="mt-5 text-3xl font-semibold text-ink-900">0 ₺</p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                {[
                  "Dosya yükleme ve analiz",
                  "Akıllı özet ve konu çıkarımı",
                  "Flashcard ve quiz üretimi",
                  "AI Öğretmen (günlük limitli)",
                  "Aralıklı tekrar sistemi",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/kayit" className="mt-6 block">
                <Button variant="secondary" block>
                  Ücretsiz başla
                </Button>
              </Link>
            </div>

            <div className="card relative border-brand-300 p-6 shadow-[var(--shadow-lift)]">
              <Badge tone="brand" className="absolute -top-3 right-6">
                Önerilen
              </Badge>
              <h3 className="text-lg font-semibold text-ink-900">Premium</h3>
              <p className="mt-1 text-sm text-ink-500">Yoğun çalışan öğrenciler için</p>
              <p className="mt-5">
                <span className="text-3xl font-semibold text-ink-900">{price}</span>
                <span className="text-sm text-ink-400"> / ay</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-ink-700">
                {[
                  "Çok daha yüksek AI kullanım hakkı",
                  "Daha fazla ve daha büyük dosya",
                  "Uzun materyallerin tamamı işlenir",
                  "Kişisel çalışma planı",
                  "Gelişmiş AI modelleri",
                  "Detaylı ilerleme analizi",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/premium" className="mt-6 block">
                <Button block>
                  Premium&apos;a geç
                  <ArrowRight aria-hidden />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- SSS */}
      <section id="sss" className="py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
              Sıkça sorulan sorular
            </h2>
          </div>

          <div className="mt-10 space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="card group p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium text-ink-900">
                  {item.q}
                  <span className="text-ink-400 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-500">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Son CTA */}
      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="gradient-brand relative overflow-hidden rounded-2xl px-6 py-14 text-center sm:px-12">
            <RefreshCw
              className="pointer-events-none absolute -top-8 -right-8 size-40 text-white/10"
              aria-hidden
            />
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Notlarını yükle, gerisini birlikte çalışalım.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">
              İlk materyalini yükle ve dakikalar içinde kendi kişisel çalışma
              sistemine sahip ol.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/kayit">
                <Button size="lg" variant="secondary">
                  Ücretsiz Başla
                  <ArrowRight aria-hidden />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
