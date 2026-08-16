# Ders Zeka

Yapay zekâ destekli ders çalışma platformu. Öğrenci materyalini (PDF, fotoğraf,
Word, düz metin) yükler; sistem materyali analiz eder ve özet, flashcard, quiz,
AI Öğretmen, interaktif çalışma modu ve kişisel çalışma planına dönüştürür.

---

## 1. Teknoloji stack

| Katman | Seçim | Neden |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, RSC, Server Actions) | Tek kod tabanında SSR arayüz + API; SEO ve performans |
| Dil | TypeScript (strict) | Tip güvenliği, sürdürülebilirlik |
| Arayüz | Tailwind CSS v4 + kendi bileşen kitaplığı | Açık tema tasarım sistemi, mobil öncelikli |
| Veritabanı | Supabase Postgres 15 + pgvector | İlişkisel veri + vektör arama tek yerde |
| Auth | Supabase Auth (e-posta/şifre) | RLS ile doğal entegrasyon |
| Depolama | Supabase Storage (özel bucket) | Dosya erişimi yetkilendirmeye bağlı |
| AI | Anthropic / OpenAI / Google — sağlayıcı soyutlaması | Model bağımsızlığı, admin panelinden değiştirilebilir |
| Grafik | Recharts | Admin analitiği |
| Arka plan | Postgres tabanlı iş kuyruğu + worker endpoint | Serverless uyumlu, sayfa kapansa da devam eder |

## 2. Sistem mimarisi

```
Tarayıcı
   │  (yalnızca anon anahtar, RLS altında)
   ▼
Next.js  ── Server Components / Server Actions / Route Handlers
   │
   ├── lib/auth      → oturum + rol kontrolü
   ├── lib/limits    → plan limitleri ve kota sayaçları
   ├── lib/security  → rate limit, brute-force, şifreleme
   ├── lib/ai        → AIService → AnthropicProvider | OpenAIProvider | GoogleProvider
   ├── lib/documents → metin çıkarımı, OCR, chunking
   ├── lib/rag       → embedding + hibrit arama
   └── lib/jobs      → kuyruk + aşamalı worker
   │
   ▼
Supabase (Postgres + pgvector + Storage + Auth)
```

API anahtarları asla istemciye gönderilmez. Tüm AI çağrıları
`Tarayıcı → Next.js sunucusu → Sağlayıcı` yolunu izler.

## 3. Veritabanı şeması

`supabase/migrations/0001_init.sql` içinde:

- **Kimlik**: `profiles` (auth.users uzantısı, rol/plan/onboarding/gamification)
- **Ödeme**: `payment_requests`, `subscriptions`
- **Materyal**: `documents`, `document_pages`, `document_chunks`, `document_embeddings`, `topics`
- **Çalışma**: `study_sets`, `flashcards`, `flashcard_progress`, `flashcard_review_logs`,
  `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers`
- **İlerleme**: `study_sessions`, `study_progress`, `tutor_conversations`,
  `tutor_messages`, `guided_sessions`, `study_plans`, `study_plan_items`
- **AI**: `ai_providers`, `ai_models`, `ai_requests`, `ai_usage_daily` (trigger ile rollup)
- **Sistem**: `plan_limits`, `usage_counters`, `system_settings`, `legal_documents`,
  `consents`, `notifications`, `audit_logs`, `processing_jobs`, `login_attempts`, `rate_limits`

RLS tüm kullanıcı tablolarında açıktır: kullanıcı yalnızca kendi satırlarına erişir.
Admin ve arka plan işleri servis anahtarıyla sunucu tarafında çalışır.

RPC fonksiyonları: `increment_usage`, `bump_rate_limit`, `claim_job` (SKIP LOCKED),
`match_document_chunks` (pgvector), `keyword_search_chunks` (tsvector), `anonymize_user` (KVKK).

## 4. AI mimarisi

```
AIService (lib/ai/service.ts)
  ├─ model seçimi        ai_models tablosundan (aktif, varsayılan, premium gerektiren)
  ├─ anahtar çözümleme   ai_providers (AES-256-GCM şifreli) → env fallback
  ├─ kota + rate limit   plan_limits + usage_counters + rate_limits
  ├─ çağrı               AIProvider arayüzü
  └─ kayıt               ai_requests (gerçek token kullanımı + maliyet) → ai_usage_daily
```

Maliyet: `input_tokens × input_fiyat + output_tokens × output_fiyat` (USD),
`usd_try_rate` ayarıyla TL'ye çevrilir. Fiyatlar admin panelinden düzenlenir.

Yapılandırılmış üretimlerde (özet, flashcard, quiz, plan, çalışma modu)
JSON Schema kullanılır; model şemaya uymak zorundadır.

## 5. RAG mimarisi

```
Doküman → Metin çıkarımı → Sayfalara ayırma → Örtüşmeli chunking
        → Embedding (1536d) → pgvector
Soru    → Embedding → Kosinüs benzerliği ⊕ tsvector anahtar kelime araması
        → İlgili parçalar (+ kaynak bilgisi) → LLM
```

Tüm doküman modele gönderilmez; yalnızca ilgili parçalar gider. Her yanıtta
materyal adı, bölüm ve sayfa numarası kaynak olarak gösterilir.

## 6. Dosya işleme

| Tür | Yöntem |
| --- | --- |
| PDF (metin katmanlı) | `unpdf` ile sayfa sayfa metin |
| PDF (taranmış) | Sayfa başına karakter yoğunluğu düşükse doğrudan görsel yeteneği olan modele gönderilir |
| JPG / PNG / WEBP | Görsel analiz: metin, tablo, grafik, el yazısı |
| DOCX | `mammoth` |
| TXT / yapıştırılan metin | Doğrudan, sayfalara bölünür |

Güvenlik: MIME + uzantı + dosya imzası (magic bytes) üçlü doğrulaması,
plan bazlı boyut sınırı, dosya adı temizleme, kullanıcıya özel depolama yolu.

## 7. Kimlik doğrulama

Supabase Auth + Server Actions. Kayıt, giriş, şifre sıfırlama, şifre değiştirme,
hesap silme. Brute-force koruması `login_attempts` üzerinden (e-posta ve IP bazlı,
admin panelinden ayarlanabilir eşik ve kilit süresi). Korunan rotalar `src/proxy.ts`
içinde kapıda tutulur ve `X-Robots-Tag: noindex` ile indekslenmez.

## 8. Premium üyelik

Fiyat **299 TL/ay** (admin panelinden değiştirilebilir). Ödeme banka havalesi/EFT ile:
kullanıcı Premium sayfasındaki hesap bilgilerine ödeme yapar, "Ödeme Bildir" formunu
doldurur (dekont yüklemesi opsiyonel), admin onaylar. Onayda abonelik **gerçek takvim
ayı** mantığıyla hesaplanır (`addCalendarMonths`), aktif abonelik varsa bitiş
tarihinden itibaren uzatılır.

## 9. Admin paneli

`/admin` — dashboard, kullanıcılar, ödemeler, materyaller, AI kullanımı (filtreli
tablo + grafikler), AI modelleri ve anahtarları, plan limitleri, e-posta,
sistem ayarları, audit log. Tüm admin işlemleri `audit_logs` tablosuna yazılır.

## 10. Bildirimler, rozetler ve e-posta

**Bildirimler** — üst çubuktaki zil okunmamış sayısını gösterir, 45 saniyede bir
yoklar. Materyal hazır olduğunda, rozet kazanıldığında, ödeme onaylandığında ve
üyelik değiştiğinde bildirim düşer. `/notifications` tüm geçmişi listeler.

**Rozetler ve sıralama** — 19 rozet, dört kademe (bronz/gümüş/altın/platin) ve
yedi metrik üzerinden verilir: seri, materyal, quiz, tam puan, flashcard, çalışma
süresi, AI Öğretmen sorusu. Motor idempotenttir; çalışma/quiz/flashcard olayları
sonrası çalışır ve rozet XP'sini profile ekler. `/achievements` sayfasında
kazanılan rozetler, bir sonraki hedefler (ilerleme çubuğuyla) ve iki sıralama
tablosu vardır: tüm zamanlar XP ve son 7 günün çalışma süresi. Gizlilik için
isimler `Burak E.` biçiminde maskelenir ve kullanıcı sıralamadan çıkabilir.

**E-posta** — `EmailSender` soyutlaması altında Resend (HTTP API) ve SMTP
(nodemailer) desteklenir. Sekiz şablon admin panelinden düzenlenir, gövde
Markdown'dur ve `{{degisken}}` yer tutucularıyla doldurulur. Gönderim iş
kuyruğundan geçer; başarısız gönderimler yeniden denenir ve tümü `email_log`
tablosuna yazılır. API anahtarı ve SMTP şifresi AES-256-GCM ile şifreli saklanır.

## 11. Deployment

- **Uygulama**: Vercel (Node.js runtime).
- **Veritabanı**: Supabase (pgvector eklentisi gerekli).
- **Cron**: `vercel.json` iki zamanlayıcı tanımlar — `/api/worker/tick` (2 dakikada
  bir, takılı işleri toparlar) ve `/api/cron/daily` (her sabah 06:00 UTC; süresi
  dolan üyelikleri düşürür, bitmek üzere olanlara hatırlatma yollar, çalışmayan
  kullanıcılara hatırlatma gönderir, eski rate-limit kayıtlarını temizler).

Adım adım kurulum için aşağıdaki **Vercel'e deploy** bölümüne bak.

---

## Kurulum

### 1. Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayıp doldur:

```bash
cp .env.example .env.local
```

| Değişken | Açıklama |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje URL'i |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable (anon) anahtar |
| `SUPABASE_SERVICE_ROLE_KEY` | **Gerekli.** Supabase → Settings → API Keys → secret |
| `ENCRYPTION_KEY` | 32 byte hex; DB'deki API anahtarlarını şifreler |
| `WORKER_SECRET` | Arka plan worker endpoint'ini korur |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Opsiyonel fallback; asıl kaynak admin panelidir |

### 2. Veritabanı

**Yol A — Supabase Dashboard (kurulum gerektirmez).**
[supabase.com/dashboard](https://supabase.com/dashboard) → proje → sol menüden
**SQL Editor** → **New query**. Aşağıdaki dosyaların içeriğini **sırayla** yapıştırıp
her birinde **Run**'a bas:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_seed.sql`
3. `supabase/migrations/0003_badges_email.sql`

Sıra önemli: 0001 tabloları, 0002 varsayılan verileri, 0003 rozet ve e-posta
altyapısını kurar. Hepsi idempotenttir — yanlışlıkla ikinci kez çalıştırmak zarar vermez.

**Yol B — CLI (terminalden).** Global kurulum gerekmez, `npx` yeter:

```bash
npm run db:login
npm run db:link
npm run db:push
```

`db:login` tarayıcıda bir sayfa açar; oradaki kodu terminale yapıştırırsın.

`vector` ve `pgcrypto` eklentileri migration içinde otomatik açılır.

### 3. İlk admin kullanıcısı

Uygulamadan normal şekilde kayıt ol, ardından SQL Editor'de:

```sql
update public.profiles set role = 'admin' where email = 'senin@epostan.com';
```

### 4. Çalıştır

```bash
npm install
npm run dev
```

Ayrı bir terminalde arka plan işçisi (opsiyonel, dev için):

```bash
npm run worker
```

---

## Vercel'e deploy (derszeka.com)

### 1. Kodu GitHub'a at

```bash
git init
```

```bash
git add . && git commit -m "Ders Zeka ilk sürüm"
```

GitHub'da boş bir repo aç, sonra:

```bash
git remote add origin https://github.com/<kullanici>/derszeka.git && git push -u origin main
```

`.env.local` `.gitignore`'da olduğu için repoya gitmez — anahtarlar Vercel'e ayrıca girilir.

### 2. Vercel projesini oluştur

[vercel.com/new](https://vercel.com/new) → GitHub reposunu içe aktar. Framework
otomatik **Next.js** algılanır; build ayarlarını değiştirme.

### 3. Ortam değişkenleri

Vercel → Project → Settings → Environment Variables. Hepsini **Production**,
**Preview** ve **Development** için ekle:

| Değişken | Değer |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://derszeka.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://isonhubfzuivvpmkwjxv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` |
| `ENCRYPTION_KEY` | `.env.local` içindeki 64 karakterlik hex — **aynısını kullan** |
| `WORKER_SECRET` | `.env.local` içindeki değer |
| `ANTHROPIC_API_KEY` | opsiyonel fallback |
| `OPENAI_API_KEY` | opsiyonel fallback |
| `RESEND_API_KEY` | opsiyonel fallback |

> `ENCRYPTION_KEY` production'da farklı olursa admin panelinden girilmiş AI ve
> e-posta anahtarları çözülemez. Yerelde ve Vercel'de aynı değer olmalı.

### 4. Domain bağla

Vercel → Settings → Domains → `derszeka.com` ve `www.derszeka.com` ekle.
Vercel sana DNS kayıtlarını verir; domain sağlayıcında gir:

| Tip | Ad | Değer |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

DNS yayılması 5 dakika ile birkaç saat sürebilir. SSL sertifikası Vercel
tarafından otomatik alınır.

### 5. Supabase'i production'a hazırla

**a) Migration'ları uygula** (henüz yapmadıysan) — yukarıdaki *2. Veritabanı*
bölümündeki Yol A veya Yol B.

**b) Auth URL'lerini ayarla** — Supabase → Authentication → URL Configuration:

- Site URL: `https://derszeka.com`
- Redirect URLs: `https://derszeka.com/auth/callback`,
  `https://*.vercel.app/auth/callback` (preview deploy'lar için),
  `http://localhost:3000/auth/callback`

**c) E-posta doğrulaması** — Authentication → Providers → Email. "Confirm email"
açıksa kullanıcılar kayıt sonrası doğrulama bekler. Kapatırsan kayıt anında giriş
yapılır. Açık bırakacaksan Supabase'in SMTP ayarını da yapılandır
(Project Settings → Auth → SMTP Settings), yoksa doğrulama e-postaları rate limitli
Supabase adresinden gider.

### 6. Cron'ları doğrula

`vercel.json` deploy ile birlikte iki cron kurar. Vercel → Project → Cron Jobs
altında ikisinin de listelendiğini gör. Hobby planda cron **günde bir kez**
çalışır — sürekli işleyen bir kuyruk istiyorsan Pro plana geç veya
[cron-job.org](https://cron-job.org) gibi harici bir servisten şu adresi çağır:

```
POST https://derszeka.com/api/worker/tick
Authorization: Bearer <WORKER_SECRET>
```

### 7. İlk admin

Siteye kayıt ol, sonra Supabase SQL Editor'de:

```sql
update public.profiles set role = 'admin' where email = 'burakerkdev@gmail.com';
```

### 8. Paneli doldur

`https://derszeka.com/admin` adresinden:

1. **AI Modelleri** → Anthropic ve OpenAI anahtarlarını gir.
2. **Sistem Ayarları** → banka adı, hesap sahibi, IBAN, USD/TRY kuru.
3. **E-posta** → sağlayıcıyı seç, anahtarı gir, test e-postası gönder, aç.
4. **Plan Limitleri** → ücretsiz/premium kotalarını gözden geçir.
5. **Sistem Ayarları** → KVKK, gizlilik, kullanım koşulları metinlerini yaz.

### 9. Deploy sonrası kontrol listesi

- [ ] `https://derszeka.com` açılıyor, SSL yeşil
- [ ] Kayıt → onboarding → dashboard akışı çalışıyor
- [ ] Bir PDF yükle; durum çubuğu ilerliyor ve "hazır" oluyor
- [ ] Özet, flashcard, quiz üretilmiş
- [ ] AI Öğretmen kaynak göstererek cevap veriyor
- [ ] Bildirim zili "materyal hazır" bildirimini gösteriyor
- [ ] `/achievements` ilk rozeti veriyor
- [ ] `/admin` → AI Kullanımı tablosunda token ve maliyet görünüyor
- [ ] Test e-postası ulaşıyor
- [ ] `https://derszeka.com/robots.txt` ve `/sitemap.xml` doğru

### E-posta alan adı doğrulaması

Resend kullanacaksan `derszeka.com` alan adını Resend panelinde doğrulaman gerekir
(SPF + DKIM TXT kayıtları). Doğrulamadan gönderim reddedilir. SMTP kullanacaksan
sağlayıcının verdiği host/port/kullanıcı bilgilerini `/admin/email` sayfasına gir.

### 5. AI anahtarlarını gir

`/admin/ai-models` sayfasından Anthropic ve OpenAI anahtarlarını gir.
Anahtarlar AES-256-GCM ile şifrelenip veritabanında saklanır, panelde
yalnızca son 4 karakteri gösterilir.

Embedding için OpenAI anahtarı gereklidir (`text-embedding-3-small`).

---

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run lint` | ESLint |
| `npm run worker` | Arka plan iş kuyruğunu yoklar |
| `npm run db:push` | Migration'ları Supabase'e uygular |

## Güvenlik notları

- Servis anahtarı ve AI anahtarları yalnızca sunucu tarafında kullanılır.
- Tüm kullanıcı tabloları RLS ile korunur; `documents` ve `receipts` bucket'ları özeldir.
- Quiz cevapları istemciye gönderilmez; değerlendirme sunucuda yapılır.
- Rate limit, brute-force koruması ve dosya imza doğrulaması aktiftir.
- Güvenlik başlıkları `next.config.ts` içinde tanımlıdır.
- Hesap silme KVKK uyumludur: kişisel veriler silinir, analitik satırlar anonimleştirilir.
