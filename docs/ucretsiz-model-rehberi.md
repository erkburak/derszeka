# Sıfır maliyetli yapay zekâ kurulumu

Bu rehber, Ders Zeka'yı **API maliyeti olmadan** çalıştırmanın yollarını
anlatır. Hiçbiri kod değişikliği gerektirmez; hepsi `/admin/ai-models`
sayfasından yapılandırılır.

---

## Önce netleştirelim: neden kendi modelimizi eğitmiyoruz?

Claude veya GPT seviyesinde bir dil modeli eğitmek şunları gerektirir:

| Gereksinim | Gerçek büyüklük |
| --- | --- |
| Donanım | Binlerce H100 GPU, aylarca kesintisiz |
| Doğrudan maliyet | On milyonlarca dolar |
| Veri | Trilyonlarca token, temizlenmiş ve lisanslanmış |
| Ekip | Onlarca araştırmacı ve altyapı mühendisi |

Küçük bir model (1-3 milyar parametre) eğitmek bile on binlerce dolar ve
haftalar demek; sonuç Türkçe ders materyalini doğru özetleyemez.

**Doğru yaklaşım:** modeli eğitmek yerine, başkalarının eğittiği açık
ağırlıklı modelleri ücretsiz katmanlardan veya kendi sunucundan kullanmak.
Aşağıdaki üç yol da gerçek ve bugün uygulanabilir.

---

## Yol 1 — Google Gemini ücretsiz katmanı (en kolay)

Sunucu kurmadan, kartsız, gerçekten 0 ₺. Kota sınırları var ama küçük ve
orta ölçekli bir kullanıcı tabanı için yeterli.

**Kurulum**

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → API anahtarı oluştur
2. `/admin/ai-models` → **Google Gemini** kartı → anahtarı yapıştır → **Sağlayıcı aktif** → Kaydet
3. Aynı sayfada `gemini-2.5-flash` ve `gemini-embedding-001` modellerini **Aktif** yap
4. **İşlem bazlı model seçimi** bölümünde tüm işlemleri Gemini modellerine yönlendir
5. Anthropic ve OpenAI sağlayıcılarını **pasif** yap

**Artıları**
- Gerçekten sıfır maliyet, sunucu yok
- Türkçesi iyi, 1M token bağlam
- Görsel ve PDF okuyabiliyor (taranmış materyaller çalışır)
- Şema zorlamalı JSON destekliyor — çıktı kalitesi kararlı

**Eksileri**
- Dakikalık ve günlük istek kotası var; kullanıcı sayın büyüyünce yetmez
- Ücretsiz katmanda verilerin model iyileştirmesinde kullanılabilir
  (KVKK metninde bunu belirtmen gerekir)

---

## Yol 2 — Groq ücretsiz katmanı (en hızlı)

Llama 3.3 70B gibi açık modelleri çok yüksek hızda sunar. Ücretsiz katmanı var.

**Kurulum**

1. [console.groq.com/keys](https://console.groq.com/keys) → anahtar al
2. `/admin/ai-models` → **OpenAI-uyumlu** kartı:
   - Base URL: `https://api.groq.com/openai/v1`
   - API anahtarı: `gsk_...`
   - Sağlayıcı aktif → Kaydet
3. `llama-3.3-70b-versatile` modelini **Aktif** yap
4. İşlemleri bu modele yönlendir

**Artıları**
- Sıfır maliyet, kurulum 2 dakika
- Olağanüstü hızlı (saniyede yüzlerce token)

**Eksileri**
- Görsel/PDF okuyamaz → **taranmış PDF ve fotoğraf yükleme çalışmaz**
- Türkçe kalitesi Gemini ve Claude'un altında
- Şema zorlaması sınırlı; uygulama JSON onarım katmanını devreye sokar

> Taranmış belgeler için OCR işlemini Gemini'de bırakıp diğer işlemleri
> Groq'a vermek iyi bir orta yol. İşlem bazlı yönlendirme tam olarak bunun için var.

---

## Yol 3 — Kendi sunucunda Ollama (kotasız)

Modeli kendi donanımında çalıştırırsın. Kota yok, veri dışarı çıkmaz.

**Yerel geliştirme için**

1. [ollama.com](https://ollama.com) → indir ve kur
2. Model indir:

   ```bash
   ollama pull qwen2.5:14b-instruct
   ```

3. `/admin/ai-models` → **OpenAI-uyumlu** kartı:
   - Base URL: `http://localhost:11434/v1`
   - API anahtarı: **boş bırak**
4. `qwen2.5:14b-instruct` modelini aktif et

**Üretim için**

Vercel'deki uygulama senin bilgisayarına erişemez. Üretimde Ollama'yı
internete açık bir sunucuda çalıştırman gerekir:

| Sunucu | Aylık maliyet | Çalıştırabileceği model |
| --- | --- | --- |
| CPU VPS (8 GB RAM) | ~200-400 ₺ | 7B modeller, yavaş (dakikalar) |
| GPU sunucu (RTX 4090 / A10) | ~4.000-8.000 ₺ | 14B-32B, akıcı |
| GPU sunucu (A100) | ~20.000 ₺+ | 70B, hızlı |

**Artıları**
- Kota yok, sınırsız kullanım
- Veriler sunucunu terk etmez (KVKK açısından en temiz seçenek)
- Kullanıcı sayın arttıkça birim maliyet düşer

**Eksileri**
- Sabit sunucu gideri — az kullanıcıda API'den pahalı
- Görsel/PDF okuma çoğu yerel modelde yok
- Kalite Claude'un belirgin altında; özetler daha yüzeysel olur

---

## Karar tablosu

| Durum | Öneri |
| --- | --- |
| Yeni başlıyorsun, kullanıcı az | **Gemini ücretsiz katman** |
| Hız önemli, taranmış belge yok | **Groq ücretsiz katman** |
| Ücretsiz kotalar yetmiyor, kullanıcı çok | **Kendi GPU sunucun** |
| En yüksek kalite, maliyet ikincil | **Claude Opus 5** (mevcut kurulum) |
| Dengeli | OCR ve analiz Gemini'de, kart/quiz Groq'ta |

---

## Kalite farkı — dürüst değerlendirme

Aynı 8 sayfalık matematik materyalinde beklenen sonuç:

| Model | Özet | Kaynak gösterimi | Türkçe | Maliyet |
| --- | --- | --- | --- | --- |
| Claude Opus 5 | Çok iyi | Güvenilir | Kusursuz | ~10 ₺ |
| Gemini 2.5 Flash | İyi | İyi | Çok iyi | **0 ₺** |
| Llama 3.3 70B (Groq) | Orta | Zayıf | İyi | **0 ₺** |
| Qwen 2.5 14B (yerel) | Orta | Zayıf | Orta | Sunucu gideri |

Küçük modeller özellikle iki konuda zorlanır: **sayfa numarası atfı**
(kaynak göstermede uydurma eğilimi) ve **uzun JSON şemasını eksiksiz
doldurma**. Uygulama bunu JSON onarım katmanıyla telafi eder ama
çıktı zenginliği yine de düşer.

**Önerim:** Gemini ücretsiz katmanıyla başla. Maliyetin sıfır olur,
kalite kabul edilebilir kalır. Kullanıcı sayın büyüyüp kota yetmemeye
başladığında ya ücretli katmana geçersin ya da GPU sunucuya taşınırsın —
o noktada zaten gelirin olur.

---

## Geçiş sonrası kontrol listesi

- [ ] `/admin/ai-models` → yeni sağlayıcı aktif, anahtar girildi
- [ ] Yeni modeller **Aktif**, eski modeller **Pasif**
- [ ] **İşlem bazlı model seçimi** güncellendi (11 işlemin hepsi)
- [ ] `npm run probe:models` çalıştırıldı (yetenek bayrakları ölçüldü)
- [ ] Bir test materyali yüklendi ve baştan sona işlendi
- [ ] Üretilen özet, flashcard ve quiz gözle kontrol edildi
- [ ] `/admin/ai-usage` → maliyet 0 ₺ görünüyor
- [ ] Taranmış bir PDF denendi (görsel destekli model gerekiyorsa)
- [ ] KVKK metni güncellendi (veri hangi sağlayıcıya gidiyor)
