import type { SupabaseClient } from '@supabase/supabase-js';

import { parseMyProfile, parseOutcome, type MyProfile, type Outcome } from './model';

export async function fetchMyProfile(client: SupabaseClient): Promise<MyProfile | null> {
  const { data, error } = await client.rpc('my_profile');
  if (error) throw error;
  return parseMyProfile(data);
}

export interface ProfileInput {
  displayName: string;
  /** Already normalised to E.164. */
  phone: string;
  club: string;
  city: string;
}

export async function createMyProfile(client: SupabaseClient, input: ProfileInput): Promise<Outcome> {
  const { data, error } = await client.rpc('create_my_profile', {
    p_display_name: input.displayName,
    p_phone: input.phone,
    p_club: input.club,
    p_city: input.city,
  });
  if (error) return { ok: false, reason: 'unknown' };
  return parseOutcome(data);
}

export async function updateMyProfile(
  client: SupabaseClient,
  input: Omit<ProfileInput, 'phone'>,
): Promise<Outcome> {
  const { data, error } = await client.rpc('update_my_profile', {
    p_display_name: input.displayName,
    p_club: input.club,
    p_city: input.city,
  });
  if (error) return { ok: false, reason: 'unknown' };
  return parseOutcome(data);
}
