import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ders Zeka — Notlarını Yapay Zekâ ile Çalışma Sistemine Dönüştür",
    template: "%s | Ders Zeka",
  },
  description:
    "PDF, fotoğraf ve ders notlarını yükle. Yapay zekâ senin için özetler, flashcardlar, quizler ve kişisel çalışma planları oluştursun.",
  keywords: [
    "yapay zeka ders çalışma",
    "pdf özetleme",
    "flashcard oluşturma",
    "quiz oluşturma",
    "ders notu özeti",
    "sınav hazırlık",
    "aralıklı tekrar",
  ],
  authors: [{ name: "Ders Zeka" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: siteUrl,
    siteName: "Ders Zeka",
    title: "Notlarını Yapay Zekâ ile Çalışma Sistemine Dönüştür",
    description:
      "Ders materyallerini yükle; özet, flashcard, quiz ve kişisel çalışma planı saniyeler içinde hazır olsun.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ders Zeka — Yapay zekâ destekli ders çalışma platformu",
    description:
      "PDF, fotoğraf ve ders notlarını yükle; özet, flashcard, quiz ve çalışma planı üret.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
