-- 가온길 에듀-가온길 입시 전략 연구소 GitHub Pages + Supabase Auth/Edge Function용 스키마
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행하세요.

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  login_id text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'consultant')),
  permissions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff_profiles
  add column if not exists permissions jsonb not null default '[]'::jsonb;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  program_id text,
  program_title text,
  program_path text,
  status text not null default '접수',
  applicant_type text,
  consultant_id text not null,
  consultant_name text,
  place text,
  date text not null,
  time text not null,
  residence text,
  student_name text,
  parent_phone text,
  student_phone text,
  school text,
  grade text,
  password text,
  content text,
  memo text default '',
  view_count integer not null default 0,
  sort_order integer
);

alter table public.applications
  add column if not exists program_id text;

alter table public.applications
  add column if not exists sort_order integer;

create unique index if not exists applications_unique_active_slot
  on public.applications (consultant_id, date, time)
  where status <> '취소';

alter table public.app_state enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.applications enable row level security;

drop policy if exists gijang_app_state_select on public.app_state;
drop policy if exists gijang_app_state_insert on public.app_state;
drop policy if exists gijang_app_state_update on public.app_state;
drop policy if exists gijang_app_state_delete on public.app_state;

grant usage on schema public to anon, authenticated, service_role;
revoke all on public.app_state from anon, authenticated;
revoke all on public.staff_profiles from anon, authenticated;
revoke all on public.applications from anon, authenticated;
grant select, insert, update, delete on public.app_state to service_role;
grant select, insert, update, delete on public.staff_profiles to service_role;
grant select, insert, update, delete on public.applications to service_role;



-- 기존 Supabase app_state에 저장된 사이트명이 있으면 새 이름으로 업데이트합니다.
update public.app_state
set value = jsonb_set(value, '{siteName}', to_jsonb('가온길 에듀-가온길 입시 전략 연구소'::text), true),
    updated_at = now()
where key = 'site';

-- 중요:
-- 1. Supabase Dashboard > Authentication > Users에서 admin@gijang.local 사용자를 만들고 비밀번호를 0000으로 설정하세요.
-- 2. 만든 사용자의 UUID를 복사한 뒤 아래 INSERT의 '관리자_AUTH_USER_UUID'를 교체하고 실행하세요.
--
-- insert into public.staff_profiles (auth_user_id, login_id, name, role, permissions)
-- values ('관리자_AUTH_USER_UUID', 'admin', '관리자', 'admin', '["manage_programs"]'::jsonb)
-- on conflict (auth_user_id) do update
-- set login_id = excluded.login_id, name = excluded.name, role = excluded.role, permissions = excluded.permissions, active = true, updated_at = now();
