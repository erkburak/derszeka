-- =====================================================================
-- Ders Zeka — AI maliyet kontrolü
--
-- Üç değişiklik:
--  1. İşlem bazlı model yönlendirme (her işlem kendi modeliyle çalışsın)
--  2. Plan bazlı sert maliyet tavanı (token değil, gerçek para)
--  3. Ekonomik olarak sürdürülebilir varsayılan limitler
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. İşlem → model yönlendirmesi
--    Analiz kaliteli modelde, kart üretimi ucuz modelde çalışsın.
-- ---------------------------------------------------------------------
create table if not exists public.ai_operation_models (
  operation  ai_operation primary key,
  model_id   uuid references public.ai_models(id) on delete set null,
  note       text,
  updated_at timestamptz not null default now()
);

alter table public.ai_operation_models enable row level security;
-- Politika yok: yalnızca servis anahtarı erişir.

insert into public.ai_operation_models (operation, model_id, note)
select v.operation::ai_operation, m.id, v.note
from (values
  ('DOCUMENT_ANALYSIS',    'claude-opus-5',    'Kalite en çok burada önemli'),
  ('OCR',                  'claude-sonnet-5',  'Görsel okuma; Opus gereksiz'),
  ('SUMMARY',              'claude-sonnet-5',  null),
  ('TOPIC_EXTRACTION',     'claude-sonnet-5',  null),
  ('FLASHCARD_GENERATION', 'claude-haiku-4-5', 'Kısa kartlar için ucuz model yeterli'),
  ('QUIZ_GENERATION',      'claude-sonnet-5',  'Çeldirici kalitesi için orta seviye'),
  ('QUESTION_GENERATION',  'claude-sonnet-5',  null),
  ('ANSWER_EVALUATION',    'claude-haiku-4-5', 'Kısa değerlendirme'),
  ('AI_TUTOR',             'claude-sonnet-5',  'Sohbet; hız ve maliyet dengesi'),
  ('GUIDED_STUDY',         'claude-sonnet-5',  null),
  ('STUDY_PLAN',           'claude-sonnet-5',  null)
) as v(operation, model_key, note)
join public.ai_models m on m.model_key = v.model_key and m.purpose = 'chat'
on conflict (operation) do nothing;

-- ---------------------------------------------------------------------
-- 2. Opus yalnızca Premium'a
--    Ücretsiz kullanıcılar otomatik olarak Sonnet'e düşer.
-- ---------------------------------------------------------------------
update public.ai_models
set requires_premium = true
where model_key = 'claude-opus-5';

-- ---------------------------------------------------------------------
-- 3. Maliyet tavanı + yeniden ayarlanmış limitler
--
--    monthly_cost_cents: bir kullanıcının aylık AI maliyeti bu değeri
--    (ABD senti) aşamaz. Token limitinden bağımsız ve daha güvenilirdir;
--    model değişse bile harcama sabit kalır.
--
--    Referans (30 sayfalık PDF, tam işleme):
--      Premium ~42 sent  ·  Ücretsiz ~21 sent (daha ucuz modele düşer)
--
--    Premium 299 TL ≈ 720 sent. Tavan 400 sent, yani EN KÖTÜ durumda
--    gelirin %55'i. Ortalama kullanıcı bunun çok altında kalacağı için
--    blended marj yüksek; tavan yalnızca aşırı kullanımı kesmek içindir.
-- ---------------------------------------------------------------------
insert into public.plan_limits (plan, limit_key, limit_value, description) values
  ('free',    'monthly_cost_cents', 45,  'Aylık AI harcama tavanı (ABD senti)'),
  ('free',    'daily_cost_cents',   20,  'Günlük AI harcama tavanı (ABD senti)'),
  ('premium', 'monthly_cost_cents', 400, 'Aylık AI harcama tavanı (ABD senti)'),
  ('premium', 'daily_cost_cents',   100, 'Günlük AI harcama tavanı (ABD senti)')
on conflict (plan, limit_key) do nothing;

-- Ücretsiz plan: sistemi denemeye yetecek kadar, zarar ettirmeyecek kadar.
update public.plan_limits set limit_value = 20      where plan = 'free' and limit_key = 'daily_ai_requests';
update public.plan_limits set limit_value = 120000  where plan = 'free' and limit_key = 'daily_tokens';
update public.plan_limits set limit_value = 400000  where plan = 'free' and limit_key = 'monthly_tokens';
update public.plan_limits set limit_value = 5       where plan = 'free' and limit_key = 'monthly_uploads';
update public.plan_limits set limit_value = 15      where plan = 'free' and limit_key = 'max_documents';
update public.plan_limits set limit_value = 20      where plan = 'free' and limit_key = 'max_pages_per_document';
update public.plan_limits set limit_value = 100     where plan = 'free' and limit_key = 'monthly_flashcards';
update public.plan_limits set limit_value = 5       where plan = 'free' and limit_key = 'monthly_quizzes';
update public.plan_limits set limit_value = 20      where plan = 'free' and limit_key = 'daily_tutor_messages';

-- Premium: gerçek bir öğrencinin bir dönemde ihtiyaç duyacağından fazlası,
-- ama sınırsız değil. 60 yükleme ≈ 27 dolar ham maliyet; tavan bunu keser.
update public.plan_limits set limit_value = 200      where plan = 'premium' and limit_key = 'daily_ai_requests';
update public.plan_limits set limit_value = 900000   where plan = 'premium' and limit_key = 'daily_tokens';
update public.plan_limits set limit_value = 6000000  where plan = 'premium' and limit_key = 'monthly_tokens';
update public.plan_limits set limit_value = 60       where plan = 'premium' and limit_key = 'monthly_uploads';
update public.plan_limits set limit_value = 500      where plan = 'premium' and limit_key = 'max_documents';
update public.plan_limits set limit_value = 150      where plan = 'premium' and limit_key = 'max_pages_per_document';
update public.plan_limits set limit_value = 3000     where plan = 'premium' and limit_key = 'monthly_flashcards';
update public.plan_limits set limit_value = 120      where plan = 'premium' and limit_key = 'monthly_quizzes';
update public.plan_limits set limit_value = 200      where plan = 'premium' and limit_key = 'daily_tutor_messages';

-- ---------------------------------------------------------------------
-- 4. Üretim bütçeleri — admin panelinden ayarlanabilir
-- ---------------------------------------------------------------------
insert into public.system_settings (key, value, category, is_public) values
  ('generation_from_study_set', 'true'::jsonb, 'ai', false),
  ('flashcards_per_document_free',    '12'::jsonb, 'ai', false),
  ('flashcards_per_document_premium', '25'::jsonb, 'ai', false),
  ('quiz_questions_per_document_free',    '6'::jsonb,  'ai', false),
  ('quiz_questions_per_document_premium', '12'::jsonb, 'ai', false)
on conflict (key) do nothing;
