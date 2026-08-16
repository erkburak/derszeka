-- =====================================================================
-- Ders Zeka — model yetenek bayrakları
--
-- Model API'leri sürümden sürüme farklılaşıyor: bazı modeller `effort`
-- parametresini kabul etmiyor ve istek 400 ile reddediliyor. Bu yeteneği
-- kod içinde model adına göre tahmin etmek kırılgan; katalogda tutup
-- admin panelinden yönetilebilir hale getiriyoruz.
-- =====================================================================

alter table public.ai_models
  add column if not exists supports_effort boolean not null default true;

-- Ölçülen durum: Haiku 4.5 effort parametresini desteklemiyor.
update public.ai_models
set supports_effort = false
where model_key in ('claude-haiku-4-5');

comment on column public.ai_models.supports_effort is
  'Model output_config.effort parametresini kabul ediyor mu. npm run probe:models ile ölçülür.';
