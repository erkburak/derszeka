-- =====================================================================
-- Ders Zeka — ücretsiz/açık model kataloğu (2/2)
-- 0006 çalıştırıldıktan SONRA çalıştır.
--
-- Buradaki modeller PASİF gelir. Admin panelinden anahtarı girip
-- aktifleştirdiğinde devreye girerler. Fiyatlar 0 çünkü ya ücretsiz
-- katmandalar ya da kendi sunucunda çalışıyorlar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Sağlayıcılar
-- ---------------------------------------------------------------------
insert into public.ai_providers (provider, display_name, is_enabled, base_url, requests_per_minute)
values ('compatible', 'OpenAI-uyumlu (Ollama / Groq / OpenRouter)', false, null, 0)
on conflict (provider) do nothing;

-- Gemini ücretsiz katmanı: sunucu gerektirmeyen tek gerçek sıfır maliyet yolu.
update public.ai_providers
set display_name = 'Google Gemini (ücretsiz katman mevcut)',
    requests_per_minute = 15
where provider = 'google';

-- ---------------------------------------------------------------------
-- Modeller — hepsi pasif, fiyat 0
-- ---------------------------------------------------------------------
insert into public.ai_models (
  provider, model_key, display_name, purpose, is_active, is_default, requires_premium,
  input_price_per_1m, output_price_per_1m, max_input_tokens, max_output_tokens,
  supports_vision, supports_pdf, supports_effort, supports_json_schema, priority
) values
  -- Google Gemini ücretsiz katman ------------------------------------
  ('google', 'gemini-2.5-flash', 'Gemini 2.5 Flash (ücretsiz katman)', 'chat',
     false, false, false, 0, 0, 1000000, 8192, true, true, false, true, 5),
  ('google', 'gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite (ücretsiz)', 'chat',
     false, false, false, 0, 0, 1000000, 8192, true, true, false, true, 6),
  ('google', 'gemini-embedding-001', 'Gemini Embedding (ücretsiz, 1536d)', 'embedding',
     false, false, false, 0, 0, 2048, 0, false, false, false, false, 5),

  -- Groq ücretsiz katman (OpenAI-uyumlu) ------------------------------
  ('compatible', 'llama-3.3-70b-versatile', 'Llama 3.3 70B — Groq (ücretsiz)', 'chat',
     false, false, false, 0, 0, 128000, 8192, false, false, false, true, 40),
  ('compatible', 'llama-3.1-8b-instant', 'Llama 3.1 8B — Groq (ücretsiz, hızlı)', 'chat',
     false, false, false, 0, 0, 128000, 8192, false, false, false, true, 41),

  -- Kendi sunucunda Ollama / vLLM -------------------------------------
  ('compatible', 'qwen2.5:14b-instruct', 'Qwen 2.5 14B — Ollama (yerel)', 'chat',
     false, false, false, 0, 0, 32000, 8192, false, false, false, false, 50),
  ('compatible', 'llama3.1:8b', 'Llama 3.1 8B — Ollama (yerel)', 'chat',
     false, false, false, 0, 0, 32000, 8192, false, false, false, false, 51),
  ('compatible', 'nomic-embed-text', 'Nomic Embed — Ollama (yerel)', 'embedding',
     false, false, false, 0, 0, 8192, 0, false, false, false, false, 50)
on conflict (provider, model_key) do nothing;

-- ---------------------------------------------------------------------
-- Ücretsiz modda limitler anlamsızlaşır: maliyet zaten sıfır.
-- Admin "ücretsiz moda" geçtiğinde bu değerleri yükseltebilir.
-- ---------------------------------------------------------------------
insert into public.system_settings (key, value, category, is_public) values
  ('cost_free_mode', 'false'::jsonb, 'ai', false)
on conflict (key) do nothing;

comment on table public.ai_models is
  'AI model kataloğu. Fiyatı 0 olan modeller ücretsiz katman veya kendi '
  'sunucunda çalışan modellerdir; maliyet tavanlarını tetiklemezler.';
