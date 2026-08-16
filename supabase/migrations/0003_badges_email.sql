-- =====================================================================
-- Ders Zeka — rozetler, leaderboard ve e-posta altyapısı
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Leaderboard katılımı (gizlilik: kullanıcı kapatabilir)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists leaderboard_opt_in boolean not null default true;

create index if not exists profiles_xp_idx on public.profiles(xp desc);

-- ---------------------------------------------------------------------
-- 2. Rozetler
-- ---------------------------------------------------------------------
do $$ begin
  create type badge_tier as enum ('bronze', 'silver', 'gold', 'platinum');
exception when duplicate_object then null; end $$;

create table if not exists public.badges (
  key         text primary key,
  name        text not null,
  description text not null,
  icon        text not null default 'award',
  tier        badge_tier not null default 'bronze',
  /* Hangi metriğe bakılacağı — rozet motoru bu alanı okur. */
  metric      text not null,
  threshold   bigint not null,
  xp_reward   integer not null default 0,
  order_index integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  badge_key  text not null references public.badges(key) on delete cascade,
  earned_at  timestamptz not null default now(),
  unique (user_id, badge_key)
);
create index if not exists user_badges_user_idx on public.user_badges(user_id, earned_at desc);

alter table public.badges      enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select using (is_active = true);

drop policy if exists user_badges_read_own on public.user_badges;
create policy user_badges_read_own on public.user_badges
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 3. Leaderboard RPC'leri
--    İsimler maskelenir ("Burak E."), yalnızca katılmayı seçenler listelenir.
-- ---------------------------------------------------------------------
create or replace function public.mask_display_name(full_name text)
returns text language sql immutable as $$
  select case
    when full_name is null or btrim(full_name) = '' then 'Öğrenci'
    when position(' ' in btrim(full_name)) = 0 then btrim(full_name)
    else split_part(btrim(full_name), ' ', 1) || ' ' ||
         upper(left(split_part(btrim(full_name), ' ', 2), 1)) || '.'
  end;
$$;

/* Tüm zamanlar — XP sıralaması */
create or replace function public.leaderboard_xp(p_limit integer default 20)
returns table (
  rank integer,
  user_id uuid,
  display_name text,
  xp integer,
  streak integer,
  badge_count bigint
) language sql stable security definer set search_path = public as $$
  select
    row_number() over (order by p.xp desc, p.streak_count desc, p.created_at asc)::integer,
    p.id,
    public.mask_display_name(p.full_name),
    p.xp,
    p.streak_count,
    coalesce(b.count, 0)
  from public.profiles p
  left join (
    select user_id, count(*) as count from public.user_badges group by user_id
  ) b on b.user_id = p.id
  where p.leaderboard_opt_in
    and p.is_active
    and p.anonymized_at is null
    and p.xp > 0
  order by p.xp desc, p.streak_count desc, p.created_at asc
  limit greatest(p_limit, 1);
$$;

/* Son 7 gün — çalışma süresi sıralaması */
create or replace function public.leaderboard_weekly(p_limit integer default 20)
returns table (
  rank integer,
  user_id uuid,
  display_name text,
  minutes integer,
  streak integer
) language sql stable security definer set search_path = public as $$
  with totals as (
    select s.user_id, sum(s.duration_seconds) as seconds
    from public.study_sessions s
    where s.started_at >= now() - interval '7 days'
    group by s.user_id
  )
  select
    row_number() over (order by t.seconds desc)::integer,
    p.id,
    public.mask_display_name(p.full_name),
    (t.seconds / 60)::integer,
    p.streak_count
  from totals t
  join public.profiles p on p.id = t.user_id
  where p.leaderboard_opt_in
    and p.is_active
    and p.anonymized_at is null
    and t.seconds > 0
  order by t.seconds desc
  limit greatest(p_limit, 1);
$$;

/* Kullanıcının kendi sırası — listede görünmese bile gösterilir. */
create or replace function public.leaderboard_rank_of(p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select rank from (
    select p.id, row_number() over (order by p.xp desc, p.streak_count desc, p.created_at asc) as rank
    from public.profiles p
    where p.leaderboard_opt_in and p.is_active and p.anonymized_at is null and p.xp > 0
  ) ranked
  where ranked.id = p_user_id;
$$;

-- ---------------------------------------------------------------------
-- 4. E-posta altyapısı
-- ---------------------------------------------------------------------
do $$ begin
  create type email_provider as enum ('resend', 'smtp', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type email_status as enum ('queued', 'sent', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

create table if not exists public.email_settings (
  id                     boolean primary key default true check (id),
  provider               email_provider not null default 'disabled',
  from_name              text not null default 'Ders Zeka',
  from_email             text not null default 'bildirim@derszeka.com',
  reply_to               text,
  /* Resend */
  api_key_encrypted      text,
  api_key_hint           text,
  /* SMTP */
  smtp_host              text,
  smtp_port              integer default 587,
  smtp_secure            boolean not null default false,
  smtp_user              text,
  smtp_password_encrypted text,
  updated_at             timestamptz not null default now()
);
insert into public.email_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.email_templates (
  key         text primary key,
  name        text not null,
  description text,
  subject     text not null,
  body        text not null,
  is_enabled  boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.email_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  to_email      text not null,
  template_key  text,
  subject       text not null,
  status        email_status not null default 'queued',
  provider      email_provider,
  error_message text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log(created_at desc);
create index if not exists email_log_user_idx on public.email_log(user_id, created_at desc);

/* Kullanıcı e-posta tercihleri */
alter table public.profiles
  add column if not exists email_notifications boolean not null default true,
  add column if not exists study_reminders boolean not null default true,
  add column if not exists last_reminder_sent_at timestamptz;

alter table public.email_settings  enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_log       enable row level security;
-- Politika tanımlanmadı: yalnızca servis anahtarı erişebilir.

-- ---------------------------------------------------------------------
-- 5. Seed — rozetler
-- ---------------------------------------------------------------------
insert into public.badges (key, name, description, icon, tier, metric, threshold, xp_reward, order_index) values
  ('first_upload',    'İlk Adım',           'İlk ders materyalini yükledin.',                  'upload',     'bronze',   'documents_completed', 1,     50,  10),
  ('material_5',      'Arşivci',            '5 materyali çalışmaya hazır hale getirdin.',      'library',    'silver',   'documents_completed', 5,     150, 11),
  ('material_20',     'Kütüphane',          '20 materyal işledin.',                            'library-big','gold',     'documents_completed', 20,    400, 12),

  ('streak_3',        'Isınıyor',           '3 gün üst üste çalıştın.',                        'flame',      'bronze',   'streak',              3,     50,  20),
  ('streak_7',        'Haftalık Seri',      '7 gün üst üste çalıştın.',                        'flame',      'silver',   'streak',              7,     150, 21),
  ('streak_30',       'Bir Ay Boyunca',     '30 gün üst üste çalıştın.',                       'flame',      'gold',     'streak',              30,    600, 22),
  ('streak_100',      'Demir İrade',        '100 gün üst üste çalıştın.',                      'flame',      'platinum', 'streak',              100,   2000, 23),

  ('quiz_1',          'İlk Sınav',          'İlk quizini tamamladın.',                         'list-check', 'bronze',   'quizzes_completed',   1,     50,  30),
  ('quiz_10',         'Quiz Avcısı',        '10 quiz tamamladın.',                             'list-check', 'silver',   'quizzes_completed',   10,    200, 31),
  ('quiz_50',         'Sınav Ustası',       '50 quiz tamamladın.',                             'list-check', 'gold',     'quizzes_completed',   50,    700, 32),
  ('perfect_quiz_1',  'Kusursuz',           'Bir quizden tam puan aldın.',                     'target',     'silver',   'perfect_quizzes',     1,     200, 33),
  ('perfect_quiz_10', 'Hatasız Seri',       '10 quizden tam puan aldın.',                      'target',     'gold',     'perfect_quizzes',     10,    800, 34),

  ('cards_50',        'Kart Destesi',       '50 flashcard tekrar ettin.',                      'layers',     'bronze',   'flashcards_reviewed', 50,    80,  40),
  ('cards_500',       'Tekrar Şampiyonu',   '500 flashcard tekrar ettin.',                     'layers',     'gold',     'flashcards_reviewed', 500,    600, 41),

  ('minutes_60',      'İlk Saat',           'Toplam 1 saat çalıştın.',                         'clock',      'bronze',   'study_minutes',       60,    60,  50),
  ('minutes_600',     'On Saat',            'Toplam 10 saat çalıştın.',                        'clock',      'silver',   'study_minutes',       600,   250, 51),
  ('minutes_3000',    'Maratoncu',          'Toplam 50 saat çalıştın.',                        'clock',      'platinum', 'study_minutes',       3000,  1500, 52),

  ('tutor_10',        'Meraklı',            'AI Öğretmen''e 10 soru sordun.',                  'message',    'bronze',   'tutor_messages',      10,    80,  60),
  ('tutor_100',       'Sorgulayan Zihin',   'AI Öğretmen''e 100 soru sordun.',                 'message',    'gold',     'tutor_messages',      100,   500, 61)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 6. Seed — e-posta şablonları
--    {{degisken}} yer tutucuları gönderim sırasında doldurulur.
-- ---------------------------------------------------------------------
insert into public.email_templates (key, name, description, subject, body) values
  ('welcome', 'Hoş geldin', 'Kayıt sonrası gönderilir.',
   '{{site_name}}''ya hoş geldin, {{ad}}!',
   E'Merhaba {{ad}},\n\n{{site_name}}''ya hoş geldin. Artık ders notlarını yükleyip yapay zekâ ile çalışmaya başlayabilirsin.\n\n**Nasıl başlarsın?**\n\n1. Materyalini yükle — PDF, fotoğraf, Word veya kopyaladığın metin.\n2. Yapay zekâ senin için özet, flashcard ve quiz hazırlasın.\n3. AI Öğretmen ile çalış, "Beni Çalıştır" moduyla kendini test et.\n\n[İlk materyalini yükle]({{site_url}}/materials)\n\nBaşarılar!\n{{site_name}} ekibi'),

  ('premium_activated', 'Premium aktif', 'Ödeme onaylandığında gönderilir.',
   'Premium üyeliğin aktif!',
   E'Merhaba {{ad}},\n\nPremium üyeliğin aktifleştirildi. **{{bitis_tarihi}}** tarihine kadar tüm özelliklere erişebilirsin:\n\n- Çok daha yüksek AI kullanım hakkı\n- Daha fazla ve daha büyük dosya yükleme\n- Kişisel çalışma planı\n- Gelişmiş analiz ve modeller\n\n[Panele git]({{site_url}}/dashboard)\n\nİyi çalışmalar!\n{{site_name}}'),

  ('premium_expiring', 'Premium bitiyor', 'Bitiş tarihinden 3 gün önce gönderilir.',
   'Premium üyeliğin {{kalan_gun}} gün sonra bitiyor',
   E'Merhaba {{ad}},\n\nPremium üyeliğin **{{bitis_tarihi}}** tarihinde sona eriyor ({{kalan_gun}} gün kaldı).\n\nKesintisiz devam etmek için ödemeni yapıp bildirim formunu doldurman yeterli.\n\n[Premium''u uzat]({{site_url}}/premium)\n\n{{site_name}}'),

  ('payment_approved', 'Ödeme onaylandı', 'Admin ödemeyi onayladığında gönderilir.',
   'Ödemen onaylandı',
   E'Merhaba {{ad}},\n\n**{{tutar}}** tutarındaki ödemen onaylandı. Premium üyeliğin {{bitis_tarihi}} tarihine kadar geçerli.\n\n[Panele git]({{site_url}}/dashboard)\n\n{{site_name}}'),

  ('payment_rejected', 'Ödeme reddedildi', 'Admin ödemeyi reddettiğinde gönderilir.',
   'Ödeme bildirimin hakkında',
   E'Merhaba {{ad}},\n\nÖdeme bildirimini onaylayamadık.\n\n**Sebep:** {{sebep}}\n\nBilgileri kontrol edip tekrar bildirebilirsin. Sorun devam ederse bize yazmaktan çekinme.\n\n[Premium sayfası]({{site_url}}/premium)\n\n{{site_name}}'),

  ('document_ready', 'Materyal hazır', 'Materyal işlenip hazır olduğunda gönderilir.',
   '"{{materyal}}" çalışmaya hazır',
   E'Merhaba {{ad}},\n\n**{{materyal}}** materyalin analiz edildi. Özet, flashcard ve quizlerin hazır.\n\n[Materyali aç]({{site_url}}/materials/{{materyal_id}})\n\n{{site_name}}'),

  ('study_reminder', 'Çalışma hatırlatması', 'Bir süredir çalışmayan kullanıcılara gönderilir.',
   'Bugün {{dakika}} dakika çalışmaya ne dersin?',
   E'Merhaba {{ad}},\n\nSon çalışmanın üzerinden birkaç gün geçti. Günlük hedefin **{{dakika}} dakika** — kısa bir tekrar seansı bile seriyi diri tutar.\n\n{{tekrar_bilgisi}}\n\n[Çalışmaya başla]({{site_url}}/study)\n\n{{site_name}}'),

  ('badge_earned', 'Yeni rozet', 'Kullanıcı rozet kazandığında gönderilir.',
   'Yeni rozet kazandın: {{rozet}}',
   E'Merhaba {{ad}},\n\n**{{rozet}}** rozetini kazandın!\n\n{{rozet_aciklama}}\n\n[Rozetlerini gör]({{site_url}}/achievements)\n\n{{site_name}}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 7. Marka güncellemesi
-- ---------------------------------------------------------------------
update public.system_settings
set value = '"Ders Zeka"'::jsonb
where key = 'site_name' and value = '"DersAI"'::jsonb;

update public.system_settings
set value = '"destek@derszeka.com"'::jsonb
where key = 'support_email' and value = '"destek@dersai.app"'::jsonb;

-- ---------------------------------------------------------------------
-- 8. E-posta ile ilgili sistem ayarları
-- ---------------------------------------------------------------------
insert into public.system_settings (key, value, category, is_public) values
  ('email_enabled',              'false'::jsonb, 'email', false),
  ('email_welcome_enabled',      'true'::jsonb,  'email', false),
  ('email_document_ready_enabled','true'::jsonb, 'email', false),
  ('email_reminder_enabled',     'true'::jsonb,  'email', false),
  ('email_reminder_idle_days',   '3'::jsonb,     'email', false),
  ('email_premium_expiry_days',  '3'::jsonb,     'email', false),
  ('leaderboard_enabled',        'true'::jsonb,  'general', true)
on conflict (key) do nothing;
