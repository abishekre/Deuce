# Deuce — plan

> Working name — the moment a game passes 20-all and the two point margin takes
> over. Renaming touches `package.json`, `app.json` and this file, nothing else.

Tournament software for small badminton organisers — the ones running a 120-entry
local open on a WhatsApp group, an Excel sheet and a whiteboard — and the player
network that grows out of it: every player signed in, with a profile, stats and
a rating that follows them from event to event.

The competitor is not TournamentSoftware. It is the whiteboard. That means UX
beats feature count, and it means the bar for "works when the wifi dies in a
metal-roofed hall" is absolute.

## How it makes money

Players are the network; organisers are the customers. The ranking connects
them:

> players want a rating that means something → they ask organisers "is this a
> Deuce event?" → organisers need Deuce to fill their draws → organisers pay.

That makes the ranking load-bearing rather than decorative, and it is why only
refereed matches in organised events count towards it.

## Decisions taken

| Question | Decision |
|---|---|
| Customers | Small tournament organisers pay. Players are the network. The friends' club night is the test bed, not the market. |
| Accounts | **Everyone who plays, organises or referees signs in.** Google sign-in. Spectators never need an account. |
| Capture | Point by point. Only the assigned referee can write; everyone else watches live. |
| Ranking | Glicko-2, separate for singles, doubles and mixed. **Only refereed matches in organised events count.** |
| Monetisation | **Keys now, entry-fee cut later.** The paywall is built from day one and switched off until the app is popular. |
| Draw formats | Group stage → knockout, automatic or arranged by hand. |
| Entries | Public join link, plus the organiser's spreadsheet turned into personal invite links. Every entrant signs in to accept. |
| Scheduling | Assisted — "what can run now?", organiser decides. |
| Spectators | Public web link, no account, no install. It is the growth loop. |
| Codebase | Standalone. Shares no code with ByTwo or the session-rotation tracker. |

Group → knockout is the superset format: a round robin is one group with no
knockout, a pure knockout is the group phase skipped. One pipeline covers
essentially every small tournament. Only team ties (Thomas Cup style) are
genuinely separate, and they are out of scope.

## Principles

**The organiser always wins an argument with the algorithm.** Pool assignment,
seeding, bye placement and court suggestions are all buttons that produce a
*draft*. Every one of them is editable. Store the assignment, never the
algorithm's output — so an override is a normal write, not a special case.

**Derive, never store, anything that can be computed.** Score, serving side,
service court, game number, match state: all folded from the rally log.
Standings and ratings are derivations too; where they are stored, it is as a
cache that can be thrown away and rebuilt from history — which is exactly what
happens when a disputed result is corrected.

**Offline is the normal case, not the failure case.** Sports halls have terrible
connectivity and a tournament cannot pause for it. Every write is queued locally
with a client-generated id and replayed when the network returns.

**Write authority is a lease, not a role.** Exactly one device owns a match's
score at a time, with explicit handoff. Without it, two people score the same
match, the states diverge, and there is no principled way to reconcile — which
in a tournament means a disputed result and a furious parent.

**Every result has a name behind it.** Anything that can move a result or a
rating is written by a signed-in account the organiser appointed. A rating
change must always be traceable to the person who scored the match.

**A ranking is worth exactly as much as people trust it.** Only refereed matches
in organised events count. Walkovers never move a rating. When in doubt, a
match counts for personal stats and not for the ranking.

**Build the gate before the price.** Every paid feature is checked in one place
from the first line of event code, with the paywall switched off. Turning on
monetisation must be a setting, never a rebuild.

## Identity and roles

- **Google sign-in** through Supabase Auth. Google supplies a verified email,
  not a phone number — so the phone is an optional profile field for WhatsApp,
  never an identity key.
- **One profile per person**: display name, gender and date of birth (for
  category eligibility), club, city, optional phone.
- **Roles belong to an event, not to a person.** The same account is an
  organiser of one event, a referee at another and a player in a third.
  Organisers invite co-organisers and referees by link.
- **Juniors cannot sign in themselves** — under-13s have no Google account of
  their own. A guardian's account creates and manages their child's profile,
  and gives the parental consent India's DPDP Act requires for a minor's data.
  Junior profiles are private by default: no public profile and no public
  ranking until a guardian opts in. (Design intent, not legal advice.)
- **Contact details stay private.** An organiser sees who entered their event;
  never anyone else's phone or email.
- **iOS**: the App Store requires Sign in with Apple (or an equivalent) beside
  Google login (guideline 4.8). Needed before an iOS release, not before.

## Events and entries

An event has categories (MS, WS, MD, WD, XD, with optional age and level
limits). Players get in two ways, and both end in the same `entry` rows, so the
draw never knows or cares where an entry came from.

### Public join link

A player opens the link, signs in, picks categories and names their partner.
The partner gets an invite and accepts after signing in. The states that
actually occur:

| Situation | Handling |
|---|---|
| A enters, names B who has not signed up | Entry created, B invited, B's slot `invited` |
| B accepts | Both slots `confirmed` |
| B enters independently, names A | Mutual declaration → auto-confirm both slots |
| B enters, names C instead | Conflict. Flag for the organiser; never silently repair |
| A enters "need a partner" | Entry with one slot open; organiser or a later player fills it |
| B never accepts | Entry stays `pending`; organiser confirms, reassigns or withdraws |

### The organiser's spreadsheet

Every organiser already has the list in Excel. Ship a downloadable `.xlsx`
template — the template is the feature, because a free-form sheet cannot be
validated.

| Column | Notes |
|---|---|
| Category | Must match a category already created in the event |
| Player 1 name, phone | Phone is where the invite link goes |
| Player 1 gender / DOB / club | Optional; DOB only for age categories |
| Player 2 … | Blank for singles |
| Seed | Optional; the organiser can seed in the app instead |

Because every entrant signs in, **each row becomes a personal invite link**, not
a player. The organiser sends them over WhatsApp in one tap each; the player
signs in and accepts. The import rules still hold:

- **Preview before commit, always.** "42 invites ready, 2 rows need attention."
- **Row-level errors never block the good rows.**
- **Re-import is idempotent.** Organisers *will* re-import after edits; a row
  already invited is recognised, not invited twice.
- Accept `.xlsx` directly. "Save as CSV" is friction at the worst moment.

An entry is `confirmed` only when every player in it has signed in and
accepted. The draw generator refuses to run on unconfirmed entries unless the
organiser removes them — that prompt is the whole feature, because the failure
it prevents is a bracket built around a pair who were never really entered.

**The known cost of mandatory sign-in** is entrants who will not or cannot sign
up in time. Mitigations: personal invite links, a dashboard showing exactly who
has not accepted with a one-tap WhatsApp nudge, and signing in at the desk on
the day, which is thirty seconds with Google. Measure it at the first real
event.

### Casual matches

The M1 scorer stays free. The person scoring is signed in; each player is either
a linked profile, whose stats count, or a typed guest, who gets none. Casual
matches never count towards the ranking.

## Draws — built (M2a)

Pure and property-tested in `src/draw`: group standings exactly per BWF General
Competition Regulations 16.2 (including 16.2.5, which deletes every result of a
player who does not complete the group), snake-seeded group allocation with a
replayable draw, round-robin order, standard seeding order, byes to the top
seeds, and group qualifiers placed so each group's top two meet again only in
the final. Every output is a draft; the organiser can arrange any of it by
hand, or build pools entirely by hand.

## Ranking

- **Glicko-2**, not plain Elo. It tracks how certain each rating is, so a new
  player's rating moves quickly and an established one's slowly, and a player
  back from six months away is uncertain again.
- **Separate ratings** for singles, doubles and mixed. In doubles a pair's
  rating is the mean of the partners', and each partner's update is scaled by
  their own uncertainty.
- **The leaderboard shows a cautious rating** — rating minus twice the
  uncertainty — so three lucky wins cannot top it. Players are provisional
  until they have played enough rated matches.
- **One event is one rating period**, which is how Glicko-2 is meant to be fed.
- **What counts:** completed matches in organised events, scored by an
  appointed referee account. Walkovers never count. A retirement counts only if
  at least one game was completed (provisional — revisit with real data).
- **Built from history.** Every rating is recomputable from the rally logs, so
  ranking can ship after events do and backfill every match ever played. The
  only thing needed now is that event matches link to real profiles.
- **Honest scope.** Ratings are only comparable between players who are
  connected by matches. Leaderboards start per city and go wider as the pools
  connect.

## Monetisation

**Now:** everything is free. The paywall exists and is switched off.

**From day one:** every event has a tier, and every paid feature asks one
function whether the event may use it.

**Keys (first):** the organiser pays you by UPI, outside the app; you generate a
single-use key; they redeem it on an event. Keys are stored only as a hash,
exactly like referee tokens, and redemption is rate-limited against guessing.
A free trial — the first full event free for each organiser — is a setting.

**Free forever:** casual matches, live scoring, spectator links, player
profiles and stats, and small events (limit to be set — one category, or a
modest number of entries).

**Paid, once switched on:** larger events, several categories, the join link
and invites, the scheduling helper, the hall big-screen display, results
exports, sponsor logos on spectator pages.

**Entry-fee cut (later):** entrants pay the entry fee in the app, the payment
gateway settles it to the organiser, and Deuce keeps a percentage. It removes
the organiser's up-front cost entirely, but needs a gateway with split
settlement and KYC for every organiser. After M4.

**App-store billing:** Google Play and Apple generally require their own billing
— and a 15–30% cut — for digital features bought inside an app. Sell keys on the
web and only redeem them in the app; check the current policies before launch.

## Domain model

```
profile           one per person: name, gender, dob, club, city, phone?
guardianship      guardian profile → junior profile, consent_at

event             organiser, venue, dates, court_count, public_slug, status, tier
category          event, discipline (MS/WS/MD/WD/XD), age/level limits,
                  draw_type, format_config
event_role        event, profile, role (organiser | referee)
invite            event, category?, name, phone?, token_hash, accepted_by?
entry             category, seed?, state (pending | confirmed | withdrawn)
entry_player      entry, profile?, invite?, slot (0|1),
                  state (invited | confirmed)

group             category, label
group_slot        group, entry, position       <- editable, organiser overrides
bracket_slot      category, round, position, entry?, source_ref

match             category, stage, group?/round?, entry_a?, entry_b?, court?,
                  referee?, state, winner, outcome (normal | walkover |
                  retired | disqualified)
rally             client_uuid, match, seq, winner_side, voided_by, scored_by

court             event, number, status, current_match
score_lease       match, device, holder, expires_at

rating            profile, discipline, rating, deviation, volatility
                  <- a cache of a derivation; rebuildable from history
event_key         key_hash, grants, created_by, redeemed_by?, redeemed_event?
import_batch      event, source_file, committed_at, row_results
```

Choices that are cheap now and expensive later:

**`profile` is global.** It is the whole retention layer: "Arun — 47 matches
across 3 events, 62%, doubles rating 1640".

**`outcome` is first class.** Small tournaments are full of no-shows, injuries
and pairs who never turn up for the plate event, and 16.2.5 turns each of those
into deleted group results.

**`rally` carries no game number, and does carry `scored_by`.** The fold knows
when a game ended; storing it invites disagreement. Who scored it is what makes
every rating change traceable.

**`event.tier` exists before there is anything to pay for.**

## The hard problems

1. **Group tie-breaking** — done, per GCR 16.2, with the deciding rule recorded
   for every place so the UI can say "second on games difference, +2 against
   +1". That sentence prevents arguments.
2. **Seeding and bye placement** — done.
3. **The conflict engine behind "what can run now".** A match is playable only
   if neither side is on court, both have rested at least N minutes, no player
   is in another live match in another category, and prerequisites are done.
   Build the full constraint model, expose it as suggestions.
4. **Realtime fan-out** — done: spectators get a content-free poke and refetch
   through a read-only function, with polling underneath.
5. **Rating integrity.** Only refereed event matches count, results are
   attributable, and a corrected result triggers a recompute. Collusion
   detection comes later, once there is data to look at.
6. **People who cannot sign in themselves** — juniors, through guardians.

## Milestones

| | Milestone | Status |
|---|---|---|
| **M0** | Rules engine — pure, property-tested | Done `25c7ba8` |
| **M1** | Referee scorer, live sync, spectator link, deployed, offline shell | Done `ea7f2fb`–`9249351` |
| **M2a** | Draw engine — standings, groups, knockouts | Done `3896d15` |
| **M2** | Identity: Google sign-in, profiles, guardians, per-event roles; the scorer requires sign-in | Next |
| **M3** | Events: categories, join link, spreadsheet → invite links, pools and brackets on screen, referee assignment, entitlement checks with the paywall off | |
| **M4** | Courts, "what can run now", court calling | The moat |
| **M5** | Profiles, stats and Glicko-2 ranking, backfilled from every event match | |
| **M6** | Keys and redemption switched on; free trial | |
| later | Online entry fees with a cut; iOS with Sign in with Apple; big screen; exports | |

**Before M2 can start** — setup only you can do: a Google Cloud OAuth consent
screen and a web client ID, the Google provider enabled in Supabase with that
client, and `https://deuce-olive.vercel.app` added to the allowed redirect URLs.
A native Android client ID comes later, with the Android build.

M4 is the one the friends' night cannot test, and it is the reason an organiser
would abandon the whiteboard. Worth shadowing one real event before building it.

## Open questions

- **Casual matches** — assumed: the scorer signs in; players are linked
  profiles or typed guests. Confirm, or require all four to sign in.
- **Retirements in ratings** — the provisional rule above needs real data.
- **Free tier limits and key prices** — per event or as credits; set before M6.
- **Spectator page weight** — about 380 KB compressed today, the whole app. A
  featherweight spectator page may still be worth it once events are public.
- **Format presets** — which short formats organisers cut to when running late.
  Ask one.
