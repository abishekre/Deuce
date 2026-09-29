# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Deuce

Tournament software for small badminton organisers. Read `PLAN.md` first — it
holds the decisions already taken, the domain model, and the milestone order.

## Rules that are not negotiable

- **`src/rules` stays pure.** No React, no Supabase, no I/O, no imports from
  anywhere else in the app. It runs under bare Node in the tests. The score is
  the one thing a tournament cannot get wrong.
- **`src/draw` stays pure too**, and may import only from `src/rules`. Group
  standings follow BWF General Competition Regulations 16.2 to the letter —
  including 16.2.5, which deletes every result of a player who does not
  complete the group. Lots are drawn by a person and passed in; the code never
  invents an order for a genuine tie.
- **Never store a derived value.** Score, serving side, service court and game
  number are all folded from the rally log. A stored score is a second source
  of truth that will eventually disagree with the first. Where a derivation is
  too costly to recompute on every read — standings, ratings — store it only
  as a cache that can be dropped and rebuilt from history.
- **Only refereed matches in organised events move a rating.** Casual matches
  and walkovers never do. Every rally records who scored it.
- **Every paid feature asks one function.** The paywall is built from day one
  and switched off; turning monetisation on must be a setting, never a rebuild.
- **Undo tombstones, never deletes.** A disputed result needs the audit trail
  more than the table needs to be tidy.
- **Every generated draw, pool and schedule is an editable draft.** The
  organiser always wins an argument with the algorithm.
