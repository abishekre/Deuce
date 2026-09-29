-- Live scoring for ad-hoc matches (M1).
--
-- No client touches a table. Two functions are the entire public surface:
--
--   sync_match(match, token, rallies)   referee device → server
--   live_match(slug)                    anyone holding the link → read-only
--
-- Volunteers never create accounts, so write authority cannot hang off
-- auth.uid(). It hangs off possession of a per-match referee token instead —
-- the lease from PLAN.md in its simplest form. Only a SHA-256 of the token is
-- stored, in a table no client role can read, so a leak of everything a
-- spectator can see still grants no write access.
--
-- Both functions are SECURITY DEFINER, so they run with RLS bypassed. That is
-- deliberate — they are the API — which is exactly why each one validates its
-- own inputs and authorisation, pins an empty search_path, and is granted
-- explicitly to the roles that call it.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.matches (
  id           uuid primary key,
  -- The public handle. 10 symbols from a 32-symbol alphabet with no I, O, 0
  -- or 1, so it survives being read aloud across a sports hall. 50 bits: not
  -- enumerable, and collision-free for any realistic number of matches.
  slug         text not null unique check (slug ~ '^[A-HJ-NP-Z2-9]{10}$'),
  format       jsonb not null check (jsonb_typeof(format) = 'object'),
  lineup       jsonb not null check (jsonb_typeof(lineup) = 'object'),
  first_server text not null check (first_server in ('A', 'B')),
  started_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create table public.match_secrets (
  match_id   uuid primary key references public.matches (id) on delete cascade,
  token_hash bytea not null
);

-- Append-only. The only mutation ever allowed is a tombstone: voided_by goes
-- from null to a value and never back. The score is folded from these rows by
-- the same engine the referee runs, so nothing here stores a derived value.
create table public.rallies (
  id          uuid primary key,
  match_id    uuid not null references public.matches (id) on delete cascade,
  seq         integer not null check (seq between 0 and 99999),
  winner      text not null check (winner in ('A', 'B')),
  voided_by   text check (voided_by is null or length(voided_by) between 1 and 64),
  recorded_at timestamptz not null default now(),
  -- The engine orders by seq. Two rallies sharing one would fold in whatever
  -- order the database returned them, which could differ between viewers.
  unique (match_id, seq)
);

alter table public.matches enable row level security;
alter table public.match_secrets enable row level security;
alter table public.rallies enable row level security;

-- RLS with no policies already denies every row. Revoking table privileges as
-- well means the tables stay closed even if the project's Data API exposure
-- defaults change underneath us.
revoke all on public.matches, public.match_secrets, public.rallies from anon, authenticated;

-- ---------------------------------------------------------------------------
-- sync_match — the referee device pushes its state
-- ---------------------------------------------------------------------------

-- One idempotent call does everything: creates the match on first contact,
-- verifies the token on every later one, and upserts a batch of rallies. The
-- device can therefore retry blindly after any network failure — a replay
-- changes nothing — which is what makes offline scoring safe.
create or replace function public.sync_match(
  p_match   jsonb,
  p_token   text,
  p_rallies jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_hash  bytea;
  v_held  bytea;
  v_count integer;
begin
  if p_token is null or length(p_token) not between 32 and 128 then
    raise exception 'Invalid referee token' using errcode = '22023';
  end if;
  if jsonb_typeof(p_match) is distinct from 'object' then
    raise exception 'Match must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rallies) is distinct from 'array' or jsonb_array_length(p_rallies) > 500 then
    raise exception 'Rallies must be an array of at most 500' using errcode = '22023';
  end if;
  -- Spectators render these, so bound them before anything is stored.
  if pg_column_size(p_match->'format') > 1024 or pg_column_size(p_match->'lineup') > 1024 then
    raise exception 'Match details are too large' using errcode = '22023';
  end if;

  v_id := (p_match->>'id')::uuid;
  v_hash := extensions.digest(p_token, 'sha256');

  -- First contact creates the match and binds the token to it. A replay, or a
  -- stranger reusing an existing id, inserts nothing here and is then judged
  -- by the token comparison below.
  insert into public.matches (id, slug, format, lineup, first_server, started_at)
  values (
    v_id,
    p_match->>'slug',
    p_match->'format',
    p_match->'lineup',
    p_match->>'firstServer',
    to_timestamp((p_match->>'startedAt')::double precision / 1000)
  )
  on conflict (id) do nothing;

  insert into public.match_secrets (match_id, token_hash)
  values (v_id, v_hash)
  on conflict (match_id) do nothing;

  select token_hash into v_held from public.match_secrets where match_id = v_id;
  if v_held is distinct from v_hash then
    raise exception 'This device does not hold the referee token for this match'
      using errcode = '42501';
  end if;

  -- Rallies are immutable apart from the tombstone. A conflicting id may only
  -- ever set voided_by, never clear it, never rewrite seq or winner — and only
  -- on a rally that belongs to this match. Without that last condition, the
  -- holder of one match's token could void the rallies of any other match
  -- whose rally ids they had seen on its public page.
  insert into public.rallies as existing (id, match_id, seq, winner, voided_by)
  select
    (r->>'id')::uuid,
    v_id,
    (r->>'seq')::integer,
    r->>'winner',
    nullif(r->>'voidedBy', '')
  from jsonb_array_elements(p_rallies) as r
  on conflict (id) do update
    set voided_by = coalesce(existing.voided_by, excluded.voided_by)
    where existing.match_id = excluded.match_id;

  -- The longest real match is under 200 rallies, even allowing for undos.
  select count(*) into v_count from public.rallies where match_id = v_id;
  if v_count > 2000 then
    raise exception 'Rally limit reached for this match' using errcode = '54000';
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- live_match — what a spectator's link resolves to
-- ---------------------------------------------------------------------------

-- Looked up by slug only, so there is no way to list matches: you see a match
-- because someone gave you its link. Never returns the internal id or anything
-- from match_secrets.
create or replace function public.live_match(p_slug text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', m.slug,
    'format', m.format,
    'lineup', m.lineup,
    'firstServer', m.first_server,
    'startedAt', (extract(epoch from m.started_at) * 1000)::bigint,
    'rallies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', r.id, 'seq', r.seq, 'winner', r.winner, 'voidedBy', r.voided_by)
          order by r.seq
        )
        from public.rallies r
        where r.match_id = m.id
      ),
      '[]'::jsonb
    )
  )
  from public.matches m
  where m.slug = upper(trim(p_slug));
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges add anon and authenticated on top. Take PUBLIC back and
-- grant the two endpoints by name, so their exposure is a decision written
-- here rather than something inherited from project defaults.
revoke all on function public.sync_match(jsonb, text, jsonb) from public;
revoke all on function public.live_match(text) from public;

grant execute on function public.sync_match(jsonb, text, jsonb) to anon, authenticated;
grant execute on function public.live_match(text) to anon, authenticated;
