# Deuce — plan

> Working name — the moment a game passes 20-all and the two point margin takes
> over. Renaming touches `package.json`, `app.json` and this file, nothing else.

Tournament software for small badminton organisers — the ones running a 120-entry
local open on a WhatsApp group, an Excel sheet and a whiteboard, who will never
pay for or be granted access to BWF Tournament Software.

The competitor is not TournamentSoftware. It is the whiteboard. That means UX
beats feature count, and it means the bar for "works when the wifi dies in a
metal-roofed hall" is absolute.

## Decisions taken

| Question | Decision |
|---|---|
| Primary user | Small tournament organisers. The friends' club night is the v0 test bed, not the market. |
| Capture | Point by point. Only a referee can write; everyone else watches live. |
| Draw formats | Group stage → knockout. |
| Entries | Spreadsheet import first, public registration link second. Payments deferred. |
| Scheduling | Assisted — "what can run now?", organiser decides. |
| Spectators | Both. Public web link is the front door; app for organisers, referees, players. |
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
service court, game number, match state: all folded from the rally log. A stored
score is a second source of truth that will eventually disagree with the first.

**Offline is the normal case, not the failure case.** Sports halls have terrible
connectivity and a tournament cannot pause for it. Every write is queued locally
with a client-generated id and replayed when the network returns.

**Write authority is a lease, not a role.** Exactly one device owns a match's
score at a time, with explicit handoff. Without it, two people score the same
match, the states diverge, and there is no principled way to reconcile — which
in a tournament means a disputed result and a furious parent.

**Volunteers do not create accounts.** A court gets a PIN. The organiser is the
only real account that matters.

## Domain model

```
player            GLOBAL, not per-tournament
                  name, gender, dob, club, phone, claimed_user_id?

tournament        organiser, venue, dates, court_count, public_slug, status
category          discipline (MS/WS/MD/WD/XD), draw_type, format_config, status
entry             category, seed?, state (pending|confirmed|withdrawn)
entry_player      entry, player, slot (0|1), state (declared|confirmed)

group             category, label
group_slot        group, entry, position          <- editable, organiser overrides
bracket_slot      category, round, position, entry?, source_ref
                  created up front as structure, filled as results land

match             category, stage, group?/round?, entry_a?, entry_b?, court?,
                  state, winner, outcome (normal|walkover|retired|disqualified)
game              match, game_no, winner          <- derived, cached for queries only
rally             client_uuid, match, seq, winner_side, voided_by, device_id

court             tournament, number, status, current_match
score_lease       match, device, holder, expires_at
tournament_role   organiser | referee, scoped to court
import_batch      tournament, source_file, committed_at, row_results
```

Three choices that are cheap now and expensive later:

**`player` is global.** Costs nothing today. It is the only reason the app can
ever show "Arun — 47 matches across 3 tournaments, 62%", which is the retention
layer sitting above a tool organisers otherwise open four times a year.

**`outcome` is first class.** Small tournaments are full of no-shows, injuries
and pairs who never turn up for the plate event. A model that only knows
"someone won 21-18" needs walkovers hacked into it within the first real event.

**`rally` carries no game number.** The fold knows when a game ended. Storing it
invites disagreement between the stored value and the derived one, and it makes
undo across a game boundary a special case instead of just dropping a row.

## Getting entries in

Two paths, and the spreadsheet one ships first because every organiser already
has the list in Excel before they have heard of this app.

### Spreadsheet import

Ship a downloadable `.xlsx` template. The template is the feature — a
free-form spreadsheet cannot be validated, and "tidy" is the whole point.

| Column | Notes |
|---|---|
| Category | Must match a category already created in the tournament |
| Player 1 name | Required |
| Player 1 phone | The dedupe key against the global player table |
| Player 1 gender / DOB / club | Optional; DOB only needed for age categories |
| Player 2 … | Blank for singles |
| Seed | Optional; organiser can seed in-app instead |

Rules that make import safe rather than terrifying:

- **Preview before commit, always.** Show a diff: "42 new players, 3 matched to
  existing, 2 rows need attention." Never blind-insert.
- **Row-level errors are non-blocking.** Import the good rows, list the bad ones
  for correction, allow re-import of just those.
- **Re-import is idempotent.** Matching on phone means running the same file
  twice does not duplicate a draw. Organisers *will* re-import after edits.
- Accept `.xlsx` directly, not CSV-only. Telling an organiser to "save as CSV"
  is friction at exactly the wrong moment.

### Public registration link

Two players must be able to register independently and end up recognised as one
pair. The states that actually occur:

| Situation | Handling |
|---|---|
| A registers, names B who has no account | Entry created, B is a ghost player, slot state `declared` |
| B registers independently, names A | Mutual declaration → auto-confirm both slots |
| B registers, names C instead | Conflict. Flag for the organiser; never silently repair |
| A registers "need a partner" | Entry with one slot open; organiser or a later player fills it |
| B never shows up | Entry stays `pending`; organiser confirms, reassigns or withdraws |

An entry is `confirmed` only when every slot is `confirmed`. The draw generator
refuses to run on a category with pending entries unless the organiser
explicitly forces it — that prompt is the whole feature, because the failure
mode it prevents is a bracket built around a pair who were never really entered.

Both paths converge on the same `entry` + `entry_player` rows, so the draw
generator never knows or cares where an entry came from.

## The four hard problems

1. **Group tie-breaking.** BWF order: matches won → games ratio → points ratio →
   head-to-head. Three-way ties are fiddly and *will* be disputed by a parent
   holding a phone. The UI must explain itself: "advanced on points ratio 1.08
   vs 1.02". That sentence prevents arguments.
2. **Seeding and bye placement.** Byes are not random — they go to top seeds at
   fixed bracket positions. Deterministic, easy to test, embarrassing in public.
3. **The conflict engine behind "what can run now".** A match is playable only
   if neither side is on court, both have rested at least N minutes, no player
   is in another live match in another category, and prerequisites are done.
   Build the full constraint model now, expose it as suggestions. A future
   auto-scheduler needs exactly this set, so none of the work is thrown away.
4. **Realtime fan-out.** 300 spectators on per-row `postgres_changes`
   subscriptions is a cost and scale problem. The referee device writes
   authoritatively; spectators read via a broadcast channel or a cached
   endpoint.

## Milestones

| | Milestone | Proves | Tested with |
|---|---|---|---|
| **M0** | Rules engine — pure TS, no UI, property tested | Scoring correctness, every format | `npm test` |
| **M1** | Referee scorer + public live view, ad-hoc match | Tap ergonomics, offline, undo, realtime | the friends' club night |
| **M2** | Tournament shell: categories, spreadsheet import, group→KO generation, bracket render | Draw and tie-break correctness | paper data, by hand |
| **M3** | Courts, "what can run now", court-call notifications | The moat | one real organiser |
| **M4** | Public registration link and pairing resolution | Removes the last of the data entry | second real event |
| **M5** | Hall big-screen display, results export, cross-tournament profiles | Legitimacy, retention | |
| later | Payments | Monetisation | once M3 has earned it |

M2's correctness needs no tournament — feed it 12 entries and check bye
placement and tie-breaks by hand.

M3 is the one the friends' night cannot test, and it is the reason an organiser
would abandon the whiteboard. Worth shadowing one real event before building it.

## Open questions

- **Spectator page stack.** A React Native Web bundle is a heavy download for a
  parent on bad 3G, and that page is both the highest-volume read and the entire
  growth loop. A separate featherweight server-rendered page is probably right.
  Decide before M1 ships publicly.
- **Format presets per category** — which short formats organisers actually cut
  to when running late. Ask one.
- **Payments.** Deferred deliberately. Revisit once M3 is proven.
