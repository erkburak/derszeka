-- =====================================================================
-- Ders Zeka — Seed data (idempotent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- AI providers (API keys are set from the admin panel, encrypted at rest)
-- ---------------------------------------------------------------------
insert into public.ai_providers (provider, display_name, is_enabled)
values
  ('anthropic', 'Anthropic (Claude)', true),
  ('openai',    'OpenAI',             true),
  ('google',    'Google Gemini',      false)
on conflict (provider) do nothing;

-- ---------------------------------------------------------------------
-- AI models — prices are USD per 1M tokens, editable from the admin panel
-- ---------------------------------------------------------------------
insert into public.ai_models (
  provider, model_key, display_name, purpose, is_active, is_default, requires_premium,
  input_price_per_1m, output_price_per_1m, max_input_tokens, max_output_tokens,
  supports_vision, supports_pdf, priority
) values
  ('anthropic', 'claude-opus-5',   'Claude Opus 5',   'chat', true,  true,  false,
     5.00, 25.00, 1000000, 32000, true,  true,  10),
  ('anthropic', 'claude-sonnet-5', 'Claude Sonnet 5', 'chat', true,  false, false,
     3.00, 15.00, 1000000, 32000, true,  true,  20),
  ('anthropic', 'claude-haiku-4-5','Claude Haiku 4.5','chat', true,  false, false,
     1.00,  5.00,  200000, 16000, true,  true,  30),
  ('openai',    'text-embedding-3-small', 'OpenAI Embedding (1536d)', 'embedding',
     true, true, false, 0.02, 0.00, 8191, 0, false, false, 10)
on conflict (provider, model_key) do nothing;

-- ---------------------------------------------------------------------
-- Plan limits — every number the product enforces lives here, not in code
-- ---------------------------------------------------------------------
insert into public.plan_limits (plan, limit_key, limit_value, description) values
  ('free',    'daily_ai_requests',      30,        'Günlük toplam AI isteği'),
  ('free',    'daily_tokens',           60000,     'Günlük toplam token'),
  ('free',    'monthly_tokens',         600000,    'Aylık toplam token'),
  ('free',    'monthly_uploads',        10,        'Aylık dosya yükleme'),
  ('free',    'max_documents',          20,        'Toplam saklanabilir materyal'),
  ('free',    'max_file_size_mb',       10,        'Tek dosya boyutu (MB)'),
  ('free',    'max_pages_per_document', 25,        'Materyal başına işlenecek sayfa'),
  ('free',    'monthly_flashcards',     200,       'Aylık üretilebilir flashcard'),
  ('free',    'monthly_quizzes',        10,        'Aylık üretilebilir quiz'),
  ('free',    'daily_tutor_messages',   15,        'Günlük AI Öğretmen mesajı'),
  ('free',    'max_output_tokens',      4000,      'Tek istekte maksimum çıktı tokeni'),
  ('free',    'feature_study_plan',     0,         'Kişisel çalışma planı (0/1)'),
  ('free',    'feature_guided_mode',    1,         'Beni Çalıştır modu (0/1)'),
  ('free',    'feature_spaced_repetition', 1,      'Akıllı tekrar (0/1)'),
  ('free',    'feature_advanced_models', 0,        'Gelişmiş AI modelleri (0/1)'),

  ('premium', 'daily_ai_requests',      500,       'Günlük toplam AI isteği'),
  ('premium', 'daily_tokens',           1500000,   'Günlük toplam token'),
  ('premium', 'monthly_tokens',         20000000,  'Aylık toplam token'),
  ('premium', 'monthly_uploads',        300,       'Aylık dosya yükleme'),
  ('premium', 'max_documents',          2000,      'Toplam saklanabilir materyal'),
  ('premium', 'max_file_size_mb',       50,        'Tek dosya boyutu (MB)'),
  ('premium', 'max_pages_per_document', 400,       'Materyal başına işlenecek sayfa'),
  ('premium', 'monthly_flashcards',     10000,     'Aylık üretilebilir flashcard'),
  ('premium', 'monthly_quizzes',        500,       'Aylık üretilebilir quiz'),
  ('premium', 'daily_tutor_messages',   400,       'Günlük AI Öğretmen mesajı'),
  ('premium', 'max_output_tokens',      16000,     'Tek istekte maksimum çıktı tokeni'),
  ('premium', 'feature_study_plan',     1,         'Kişisel çalışma planı (0/1)'),
  ('premium', 'feature_guided_mode',    1,         'Beni Çalıştır modu (0/1)'),
  ('premium', 'feature_spaced_repetition', 1,      'Akıllı tekrar (0/1)'),
  ('premium', 'feature_advanced_models', 1,        'Gelişmiş AI modelleri (0/1)')
on conflict (plan, limit_key) do nothing;

-- ---------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------
insert into public.system_settings (key, value, category, is_public) values
  ('site_name',           '"Ders Zeka"'::jsonb,                          'general', true),
  ('site_description',    '"Notlarını yapay zekâ ile çalışma sistemine dönüştür."'::jsonb, 'general', true),
  ('site_logo_url',       '""'::jsonb,                                'general', true),
  ('site_favicon_url',    '""'::jsonb,                                'general', true),
  ('support_email',       '"destek@derszeka.com"'::jsonb,               'general', true),

  ('premium_price',       '299'::jsonb,                               'billing', true),
  ('premium_currency',    '"TRY"'::jsonb,                             'billing', true),
  ('premium_period_days', '30'::jsonb,                                'billing', false),
  ('bank_name',           '""'::jsonb,                                'billing', true),
  ('bank_account_holder', '""'::jsonb,                                'billing', true),
  ('bank_iban',           '""'::jsonb,                                'billing', true),
  ('bank_transfer_note',  '"Premium üyelik - {kullanici}"'::jsonb,    'billing', true),

  ('usd_try_rate',        '41.5'::jsonb,                              'ai',      false),
  ('rag_chunk_size',      '1200'::jsonb,                              'ai',      false),
  ('rag_chunk_overlap',   '180'::jsonb,                               'ai',      false),
  ('rag_top_k',           '8'::jsonb,                                 'ai',      false),
  ('ai_effort',           '"medium"'::jsonb,                          'ai',      false),
  ('max_upload_files',    '10'::jsonb,                                'uploads', true),
  ('allowed_mime_types',
    '["application/pdf","image/jpeg","image/png","image/webp","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]'::jsonb,
    'uploads', true),

  ('rate_limit_ai_per_minute',    '10'::jsonb,                        'security', false),
  ('rate_limit_upload_per_hour',  '30'::jsonb,                        'security', false),
  ('login_max_attempts',          '8'::jsonb,                         'security', false),
  ('login_lockout_minutes',       '15'::jsonb,                        'security', false),
  ('maintenance_mode',            'false'::jsonb,                     'general',  true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Legal documents (KVKK / GDPR)
-- ---------------------------------------------------------------------
insert into public.legal_documents (slug, title, content) values
  ('kvkk',     'KVKK Aydınlatma Metni',  'Bu metin admin panelinden düzenlenebilir.'),
  ('privacy',  'Gizlilik Politikası',    'Bu metin admin panelinden düzenlenebilir.'),
  ('terms',    'Kullanım Koşulları',     'Bu metin admin panelinden düzenlenebilir.'),
  ('cookies',  'Çerez Politikası',       'Bu metin admin panelinden düzenlenebilir.')
on conflict (slug) do nothing;
