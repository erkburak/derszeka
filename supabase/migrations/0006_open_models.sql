-- =====================================================================
-- Ders Zeka — açık/ücretsiz model desteği (1/2: tipler ve kolonlar)
--
-- NOT: Postgres, yeni bir enum değerini eklendiği işlemin içinde
-- kullanmaya izin vermez. Bu yüzden enum ve kolonlar burada, o değeri
-- kullanan kayıtlar 0007'de eklenir. İkisini AYRI çalıştır.
-- =====================================================================

-- OpenAI-uyumlu API konuşan her servis: Ollama, Groq, OpenRouter,
-- Together, vLLM, LM Studio, LocalAI...
alter type ai_provider add value if not exists 'compatible';

-- Açık modellerin çoğu "structured outputs" (şema zorlama) desteklemez;
-- onlarda şema prompt'a gömülür ve çıktı onarılarak ayrıştırılır.
alter table public.ai_models
  add column if not exists supports_json_schema boolean not null default true;

comment on column public.ai_models.supports_json_schema is
  'Model, şema zorlamalı JSON çıktısını API seviyesinde destekliyor mu. '
  'Desteklemiyorsa şema prompt''a gömülür ve yanıt onarılarak ayrıştırılır.';

-- Ücretsiz katmanlarda istek/dakika sınırı vardır; sağlayıcı bazında tutulur.
alter table public.ai_providers
  add column if not exists requests_per_minute integer not null default 0;

comment on column public.ai_providers.requests_per_minute is
  '0 = sınırsız. Ücretsiz katmanlarda sağlayıcının dakikalık istek sınırı.';
