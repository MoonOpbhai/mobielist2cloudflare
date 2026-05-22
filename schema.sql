-- ── Extensions ──────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── SECTIONS table ───────────────────────────────────────────
create table if not exists public.sections (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.sections (name, sort_order) values
  ('Movies',            1),
  ('Series',            2),
  ('Anime',             3),
  ('Korean',            4),
  ('Bengali',           5),
  ('Comedy',            6),
  ('Hollywood Comedy',  7),
  ('Dark Comedy',       8),
  ('Best Webseries',    9),
  ('Extra Mentions',   10)
on conflict (name) do nothing;

-- ── MOVIES table ─────────────────────────────────────────────
create table if not exists public.movies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(trim(name)) > 0),
  url        text,
  section    text not null default 'Movies',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_movies_updated_at on public.movies;
create trigger trg_movies_updated_at
before update on public.movies
for each row execute function public.set_updated_at();

-- ── MOVIE_LINKS table ────────────────────────────────────────
create table if not exists public.movie_links (
  id         uuid primary key default gen_random_uuid(),
  movie_id   uuid not null references public.movies(id) on delete cascade,
  label      text not null default 'Download',
  url        text not null check (char_length(trim(url)) > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists movie_links_movie_id_idx on public.movie_links(movie_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.sections enable row level security;
drop policy if exists "public read sections" on public.sections;
create policy "public read sections" on public.sections for select to anon using (true);

alter table public.movies enable row level security;
drop policy if exists "public can read movies"   on public.movies;
drop policy if exists "public can add movies"    on public.movies;
drop policy if exists "public can edit movies"   on public.movies;
drop policy if exists "public can delete movies" on public.movies;
create policy "public can read movies" on public.movies for select to anon using (true);
create policy "public can add movies"  on public.movies for insert to anon with check (true);

alter table public.movie_links enable row level security;
drop policy if exists "public read links" on public.movie_links;
create policy "public read links" on public.movie_links for select to anon using (true);

-- ── ADMIN CHECK ──────────────────────────────────────────────
create or replace function public.check_admin(p_password text)
returns boolean language plpgsql security definer as $$
begin return p_password = 'Amonchand111'; end; $$;

-- ── ADMIN RPCs ───────────────────────────────────────────────
create or replace function public.admin_update_movie(
  p_id uuid, p_name text, p_url text, p_section text, p_password text
) returns boolean language plpgsql security definer as $$
begin
  if not public.check_admin(p_password) then return false; end if;
  update public.movies set name=p_name, url=nullif(trim(p_url),''), section=p_section where id=p_id;
  return found;
end; $$;

create or replace function public.admin_delete_movie(
  p_id uuid, p_password text
) returns boolean language plpgsql security definer as $$
begin
  if not public.check_admin(p_password) then return false; end if;
  delete from public.movies where id=p_id;
  return found;
end; $$;

create or replace function public.admin_add_section(
  p_name text, p_password text
) returns boolean language plpgsql security definer as $$
begin
  if not public.check_admin(p_password) then return false; end if;
  insert into public.sections(name, sort_order)
  values(trim(p_name), (select coalesce(max(sort_order),0)+1 from public.sections))
  on conflict (name) do nothing;
  return true;
end; $$;

create or replace function public.admin_delete_section(
  p_name text, p_password text
) returns boolean language plpgsql security definer as $$
begin
  if not public.check_admin(p_password) then return false; end if;
  if p_name = 'Movies' then return false; end if;
  update public.movies set section='Movies' where section=p_name;
  delete from public.sections where name=p_name;
  return true;
end; $$;

create or replace function public.admin_add_link(
  p_movie_id uuid, p_label text, p_url text, p_password text
) returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if not public.check_admin(p_password) then return null; end if;
  insert into public.movie_links(movie_id, label, url, sort_order)
  values(p_movie_id, coalesce(nullif(trim(p_label),''),'Download'), trim(p_url),
    (select coalesce(max(sort_order),0)+1 from public.movie_links where movie_id=p_movie_id))
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.admin_delete_link(
  p_link_id uuid, p_password text
) returns boolean language plpgsql security definer as $$
begin
  if not public.check_admin(p_password) then return false; end if;
  delete from public.movie_links where id=p_link_id;
  return found;
end; $$;

-- ── INDEXES ──────────────────────────────────────────────────
create index if not exists movies_created_at_idx on public.movies(created_at);
create index if not exists movies_section_idx    on public.movies(section);
create index if not exists movies_name_idx       on public.movies using gin (to_tsvector('simple', name));
