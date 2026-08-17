-- =====================================================================
-- Ders Zeka — Gemini model kataloğu düzeltmesi
--
-- 0007'de seed edilen gemini-2.5-flash ve gemini-2.5-flash-lite artık
-- yeni hesaplara kapalı: API "no longer available to new users" döndürüyor.
-- Canlı API'ye karşı ölçülen çalışan modellerle değiştiriliyor.
--
-- Ölçüm (aynı istek, şema zorlamalı JSON):
--   gemini-3.7-flash        1.8 sn  ✓
--   gemini-3.1-flash-lite   1.2 sn  ✓
--   gemini-3.5-flash       20.6 sn  ✓ (yavaş)
--   gemini-2.5-flash          —     ✗ kapalı
-- =====================================================================

-- Kullanılamayan modelleri pasifleştir.
update public.ai_models
set is_active = false, is_default = false
where provider = 'google'
  and model_key in ('gemini-2.5-flash', 'gemini-2.5-flash-lite');

-- Çalışan güncel modeller.
insert into public.ai_models (
  provider, model_key, display_name, purpose, is_active, is_default, requires_premium,
  input_price_per_1m, output_price_per_1m, max_input_tokens, max_output_tokens,
  supports_vision, supports_pdf, supports_effort, supports_json_schema, priority
) values
  ('google', 'gemini-3.7-flash', 'Gemini 3.7 Flash (ücretsiz katman)', 'chat',
     true, false, false, 0, 0, 1000000, 32000, true, true, false, true, 5),
  ('google', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite (ücretsiz, hızlı)', 'chat',
     true, false, false, 0, 0, 1000000, 32000, true, true, false, true, 6)
on conflict (provider, model_key) do update
set is_active            = excluded.is_active,
    display_name         = excluded.display_name,
    max_output_tokens    = excluded.max_output_tokens,
    supports_vision      = excluded.supports_vision,
    supports_pdf         = excluded.supports_pdf,
    supports_effort      = excluded.supports_effort,
    supports_json_schema = excluded.supports_json_schema;

-- Embedding: Gemini 1536 boyutlu çıktı verebiliyor, mevcut şemaya uyuyor.
update public.ai_models
set is_active = true, is_default = true, supports_json_schema = false
where provider = 'google' and model_key = 'gemini-embedding-001';

-- Sağlayıcısı kapalı olan OpenAI embedding'i varsayılan olmaktan çıkar.
update public.ai_models
set is_default = false
where provider = 'openai' and model_key = 'text-embedding-3-small';

-- Sohbet varsayılanı: yalnızca bir tane olmalı.
update public.ai_models set is_default = false where purpose = 'chat';
update public.ai_models
set is_default = true
where provider = 'google' and model_key = 'gemini-3.7-flash';

-- İşlem yönlendirmelerini çalışan modele taşı.
update public.ai_operation_models
set model_id = (
  select id from public.ai_models
  where provider = 'google' and model_key = 'gemini-3.7-flash'
),
    updated_at = now()
where model_id in (
  select id from public.ai_models
  where provider = 'google'
    and model_key in ('gemini-2.5-flash', 'gemini-2.5-flash-lite')
);
