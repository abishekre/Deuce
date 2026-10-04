-- Checks for 0002_profiles.sql. Paste into the SQL editor after the migration.
--
-- Everything runs inside one block that ends by raising, which rolls the whole
-- thing back: the test accounts and profiles it creates never survive, pass or
-- fail. So the result arrives as an error message either way —
--
--   "ALL PROFILE CHECKS PASSED (rolled back)"   means every check held;
--   anything else names the check that failed.
--
-- It plays two signed-in players (A and B), an unsigned spectator, and an
-- organiser-added profile nobody has claimed yet.

do $$
declare
  a        uuid := gen_random_uuid();
  b        uuid := gen_random_uuid();
  unowned  uuid := gen_random_uuid();
  r        jsonb;
  denied   boolean;
  limited  boolean := false;
begin
  insert into auth.users (id, email)
  values (a, 'deuce-check-a@example.invalid'), (b, 'deuce-check-b@example.invalid');

  -- An organiser-added profile, as M3 will create them: no account, has a phone.
  insert into public.profiles (id, display_name) values (unowned, 'Chitra');
  insert into public.profile_phones (profile_id, phone_e164) values (unowned, '+919000000001');

  -- --- Player A ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';

  assert public.my_profile() is null, 'a new account should have no profile';

  r := public.create_my_profile('Asha', '+919876543210', 'Smash Club', 'Chennai');
  assert (r->>'ok')::boolean, 'A should be able to create a profile: ' || r::text;

  r := public.my_profile();
  assert r->>'displayName' = 'Asha' and r->>'phone' = '+919876543210' and r->>'claimedVia' = 'self',
    'A should read back their own profile and phone: ' || r::text;

  r := public.create_my_profile('Asha again', '+919876543211');
  assert r->>'reason' = 'has_profile', 'one account must not own two profiles: ' || r::text;

  r := public.update_my_profile('Asha K', 'Smash Club', '');
  assert (r->>'ok')::boolean and public.my_profile()->>'displayName' = 'Asha K'
    and public.my_profile()->>'city' is null, 'A should be able to edit their profile: ' || r::text;

  begin
    perform 1 from public.profile_phones;
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'phone numbers must not be readable directly';

  begin
    perform 1 from public.profiles;
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'profiles must not be readable directly';

  begin
    insert into public.profiles (display_name, claimed_by) values ('Forged', b);
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'profiles must not be writable directly';

  -- --- Player B ------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);

  assert public.my_profile() is null, 'B must not see A''s profile';

  r := public.update_my_profile('Hijack');
  assert r->>'reason' = 'no_profile', 'B must not be able to edit anyone''s profile: ' || r::text;

  r := public.create_my_profile('Impostor', '+919876543210');
  assert r->>'reason' = 'phone_taken', 'B must not take A''s number: ' || r::text;

  r := public.create_my_profile('Chitra', '+919000000001');
  assert r->>'reason' = 'phone_unclaimed', 'typing an organiser-added number must not claim it: ' || r::text;

  r := public.create_my_profile('Bala', '98765');
  assert r->>'reason' = 'phone_invalid', 'a malformed number must be refused: ' || r::text;

  r := public.create_my_profile('', '+919876500000');
  assert r->>'reason' = 'name_invalid', 'a blank name must be refused: ' || r::text;

  r := public.create_my_profile('Bala', '+919876500000');
  assert (r->>'ok')::boolean, 'B should be able to create their own profile: ' || r::text;

  -- B has made 5 attempts this hour; the loop's sixth call is the 11th, and
  -- the 11th is refused.
  for i in 1..6 loop
    r := public.create_my_profile('Probe', '+91900000' || lpad(i::text, 4, '0'));
    if r->>'reason' = 'rate_limited' then limited := true; end if;
  end loop;
  assert limited, 'repeated attempts must hit the rate limit';

  -- --- Spectator (anon) ----------------------------------------------------
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';

  begin
    perform public.my_profile();
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'a spectator must not be able to call my_profile';

  begin
    perform public.create_my_profile('Anon', '+919111111111');
    denied := false;
  exception when insufficient_privilege then denied := true;
  end;
  assert denied, 'a spectator must not be able to create a profile';

  execute 'reset role';

  -- The unclaimed profile is untouched by everything above.
  assert (select claimed_by from public.profiles where id = unowned) is null,
    'the organiser-added profile must still be unclaimed';

  raise exception 'ALL PROFILE CHECKS PASSED (rolled back)';
end;
$$;
