-- Player profiles and the accounts that claim them (M2).
--
-- A profile is a person, not an account. Organisers will create profiles for
-- the players they add (M3), and players claim them later through an invite
-- link. This migration is the account side: a signed-in player creating and
-- editing their own profile, and the phone number that ties a person together
-- across every organiser who ever enters them.
--
-- As with live scoring, no client touches a table. The phone number is never
-- selectable at all: it lives in its own table, readable only through
-- my_profile(), and only by the account that owns it.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  club         text check (club is null or length(club) <= 80),
  city         text check (city is null or length(city) <= 80),
  -- Null until claimed. Unique: one account owns at most one player.
  claimed_by   uuid unique references auth.users (id) on delete set null,
  claimed_via  text check (claimed_via is null or claimed_via in ('self', 'link')),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.profile_phones (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- E.164 — the one canonical spelling of a number — so "098765 43210" and
  -- "+91 98765-43210" are recognised as the same person.
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

-- Rate limit for create_my_profile. Without one, a signed-in account could
-- test phone numbers one after another to learn who is on Deuce.
create table public.profile_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index profile_attempts_recent on public.profile_attempts (user_id, at);

alter table public.profiles enable row level security;
alter table public.profile_phones enable row level security;
alter table public.profile_attempts enable row level security;

-- No policies, and no table privileges: every read and write goes through the
-- functions below, which check who is asking.
revoke all on public.profiles, public.profile_phones, public.profile_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_profile — the signed-in account's own profile, phone included
-- ---------------------------------------------------------------------------

create or replace function public.my_profile()
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'displayName', p.display_name,
    'club', p.club,
    'city', p.city,
    'phone', ph.phone_e164,
    'claimedVia', p.claimed_via
  )
  from public.profiles p
  left join public.profile_phones ph on ph.profile_id = p.id
  where p.claimed_by = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- create_my_profile — a player who was never entered by an organiser
-- ---------------------------------------------------------------------------

-- Outcomes are returned, not raised. A raise would roll back the attempt row
-- along with everything else, and the rate limit would count nothing — least
-- of all the probing it exists to slow down.
create or replace function public.create_my_profile(
  p_display_name text,
  p_phone        text,
  p_club         text default null,
  p_city         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_owner uuid;
  v_found boolean := false;
  v_id    uuid;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  delete from public.profile_attempts where user_id = v_user and at < now() - interval '1 day';
  insert into public.profile_attempts (user_id) values (v_user);
  if (select count(*) from public.profile_attempts
      where user_id = v_user and at > now() - interval '1 hour') > 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if exists (select 1 from public.profiles where claimed_by = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'has_profile');
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_invalid');
  end if;
  if length(coalesce(p_club, '')) > 80 or length(coalesce(p_city, '')) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'details_invalid');
  end if;
  if p_phone is null or p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'phone_invalid');
  end if;

  select p.claimed_by, true
    into v_owner, v_found
  from public.profile_phones ph
  join public.profiles p on p.id = ph.profile_id
  where ph.phone_e164 = p_phone;

  -- Someone with this number already exists. Typing a number in is not proof
  -- of owning it, so it never claims anything: an unclaimed profile is claimed
  -- through the organiser's invite link, never from here.
  if v_found then
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_owner is null then 'phone_unclaimed' else 'phone_taken' end
    );
  end if;

  insert into public.profiles (display_name, club, city, claimed_by, claimed_via, created_by)
  values (btrim(p_display_name), nullif(btrim(p_club), ''), nullif(btrim(p_city), ''), v_user, 'self', v_user)
  returning id into v_id;

  insert into public.profile_phones (profile_id, phone_e164) values (v_id, p_phone);

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- update_my_profile — name, club and city. The phone is not editable here:
-- changing the key that matches a person across organisers needs a proof of
-- ownership this app does not have yet.
-- ---------------------------------------------------------------------------

create or replace function public.update_my_profile(
  p_display_name text,
  p_club         text default null,
  p_city         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_invalid');
  end if;
  if length(coalesce(p_club, '')) > 80 or length(coalesce(p_city, '')) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'details_invalid');
  end if;

  update public.profiles
     set display_name = btrim(p_display_name),
         club = nullif(btrim(p_club), ''),
         city = nullif(btrim(p_city), '')
   where claimed_by = auth.uid();

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants — signed-in accounts only. A spectator has no profile to read.
-- ---------------------------------------------------------------------------

revoke all on function public.my_profile() from public;
revoke all on function public.create_my_profile(text, text, text, text) from public;
revoke all on function public.update_my_profile(text, text, text) from public;

-- Supabase's default privileges grant new functions to anon as well; take
-- that back explicitly so these three are for signed-in accounts only.
revoke all on function public.my_profile() from anon;
revoke all on function public.create_my_profile(text, text, text, text) from anon;
revoke all on function public.update_my_profile(text, text, text) from anon;

grant execute on function public.my_profile() to authenticated;
grant execute on function public.create_my_profile(text, text, text, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
