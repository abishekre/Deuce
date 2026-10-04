/**
 * The pure half of identity: phone numbers, the profile shape, and what each
 * refusal from the server means in words. No Supabase, no React — tested
 * under bare Node like the engines.
 */

/**
 * The canonical E.164 spelling of a phone number, or null if it isn't one.
 *
 * India first, because the players are: a 10-digit mobile works however it is
 * written — "98765 43210", "098765-43210", "+91 98765 43210", "919876543210".
 * A number from anywhere else needs its + and country code. The server checks
 * the result again; this exists so the same person typed three ways is one
 * person, not three.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, '');

  const international = trimmed.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (international) {
    if (digits.startsWith('91')) return indianMobile(digits.slice(2));
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }

  if (digits.length === 11 && digits.startsWith('0')) return indianMobile(digits.slice(1));
  if (digits.length === 12 && digits.startsWith('91')) return indianMobile(digits.slice(2));
  return indianMobile(digits);
}

/** Indian mobiles are ten digits starting 6–9. Landlines are not players' numbers. */
function indianMobile(national: string): string | null {
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

/** "+919876543210" → "+91 98765 43210". Other countries are left as stored. */
export function formatPhone(e164: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return india ? `+91 ${india[1]} ${india[2]}` : e164;
}

/**
 * Where to go after signing in. Only a path inside Deuce is honoured; anything
 * else — another site, a protocol-relative "//evil.example" — becomes home, so
 * a crafted sign-in link can never bounce a player off to somewhere else. The
 * sign-in pages themselves also become home, so nobody lands back on a login.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value.startsWith('/sign-in') || value.startsWith('/auth/')) return '/';
  return value;
}

export interface MyProfile {
  id: string;
  displayName: string;
  club: string | null;
  city: string | null;
  phone: string | null;
  claimedVia: 'self' | 'link';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function parseMyProfile(value: unknown): MyProfile | null {
  if (!isRecord(value)) return null;
  const { id, displayName, claimedVia } = value;
  if (typeof id !== 'string' || typeof displayName !== 'string') return null;
  if (claimedVia !== 'self' && claimedVia !== 'link') return null;

  return {
    id,
    displayName,
    club: optionalText(value.club),
    city: optionalText(value.city),
    phone: optionalText(value.phone),
    claimedVia,
  };
}

export type Refusal =
  | 'rate_limited'
  | 'has_profile'
  | 'no_profile'
  | 'name_invalid'
  | 'details_invalid'
  | 'phone_invalid'
  | 'phone_unclaimed'
  | 'phone_taken';

export type Outcome = { ok: true } | { ok: false; reason: Refusal | 'unknown' };

const REFUSALS: readonly Refusal[] = [
  'rate_limited',
  'has_profile',
  'no_profile',
  'name_invalid',
  'details_invalid',
  'phone_invalid',
  'phone_unclaimed',
  'phone_taken',
];

export function parseOutcome(value: unknown): Outcome {
  if (isRecord(value) && value.ok === true) return { ok: true };
  const reason = isRecord(value) ? value.reason : undefined;
  return { ok: false, reason: REFUSALS.includes(reason as Refusal) ? (reason as Refusal) : 'unknown' };
}

/**
 * Every refusal, in words a player can act on. "phone_unclaimed" matters most:
 * it means an organiser already entered this person — their matches are
 * waiting — and the way in is the organiser's link, not a second profile.
 */
export function refusalMessage(reason: Refusal | 'unknown'): string {
  switch (reason) {
    case 'phone_unclaimed':
      return 'An organiser has already added this number to Deuce, with your matches on it. Ask them for your claim link and the profile becomes yours.';
    case 'phone_taken':
      return 'This number belongs to another Deuce account.';
    case 'phone_invalid':
      return "That doesn't look like a mobile number. Use your 10-digit number, or + and the country code.";
    case 'name_invalid':
      return 'Add your name — up to 60 characters.';
    case 'details_invalid':
      return 'Club and city can be up to 80 characters each.';
    case 'has_profile':
      return 'You already have a profile.';
    case 'no_profile':
      return 'Create your profile first.';
    case 'rate_limited':
      return 'Too many tries. Wait an hour and try again.';
    case 'unknown':
      return "Something went wrong and your profile wasn't saved. Try again.";
  }
}
