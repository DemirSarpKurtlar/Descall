# Oyun odası: table games protocol

Status: engines, table manager and tests are done (`frontend/backend/lib/world3d/games/`).
Nothing is wired into sockets or the UI yet; this document is the contract for that phase.

Owner rules that apply everywhere:

- Points only ("eğlence modu, puanla"). No money, chips, stakes, prizes or DesCoin. Blackjack "bets" are a number of session points on a slider and nothing else.
- Original code only. No emojis in code, UI strings or commits.
- The server is authoritative. Clients send intentions, the server decides and sends back redacted views.

## 1. Architecture

```
lib/world3d/games/
  common.js        RNG (seeded sfc32, crypto), plain-JSON clone, result shape, private events, seats, presence
  okeyRules.js     tiles, okey tile, win check, meld partition search, rack helper
  okey.js          Okey engine            okeyBot.js   Okey bot
  blackjack.js     Blackjack engine (dealer and basic-strategy autopilot inside)
  tavla.js         Tavla engine and bot
  chessRules.js    board, move generation, FEN, SAN, UCI, perft
  chess.js         chess table engine     chessBot.js  search + eval    chessWorker.js  worker entry
  tables.js        TableManager: registry per room, seats, timers, bots, reconnect, nonces
  index.js         exports
  *.selftest.cjs   tests (picked up by scripts/run-tests.mjs); testkit.cjs holds the fake clock
```

### Engine contract

Every engine is a pure, deterministic state machine. State is plain JSON (persistable, comparable). Functions never mutate their input.

| Function | Purpose |
| --- | --- |
| `create(options)` | New table state; options are clamped to safe ranges. |
| `join(state, {id, name})` | Register a member (spectator until seated). `bot:*` ids are reserved. |
| `seat(state, playerId, index \| null, ctx)` | Sit down, or stand up with `null`. |
| `leave(state, playerId, ctx)` | Leave the table (see per game for mid-game leaving). |
| `start(state, playerId, ctx)` | Start a match (blackjack starts by itself when someone sits). |
| `apply(state, playerId, action, ctx)` | Every action, fully validated (turn order, legality, hidden information). `playerId === null` is the server (timers). |
| `viewFor(state, playerId)` | Redacted view for one player. |
| `publicView(state)` | Spectator view. |
| `timers(state)` | Timers the manager must run (see 4). Pure function of the state. |
| `botAction(state, playerId, ctx)` | Bot decision for a bot seat or an autopiloted human. Chess returns a Promise unless `ctx.syncBot`. |
| `setPresence(state, playerId, {connected, autopilot})` | Reconnect bookkeeping. |
| `scores(state)` | Standings for result reporting. |
| `FREE_ACTIONS` | Action types that are not turn-bound (no seq check), e.g. okey `arrange`. |

Result of every mutating call: `{ state, events, error }`. On error the state is the input state and `events` is empty.

`ctx = { rng, now }`. The server passes `cryptoRng` (`crypto.randomInt`) and `Date.now()`; tests pass a seeded RNG and a fake clock and replay games exactly. The RNG is never stored in the state, so the deck order cannot be derived from anything a client sees.

Events are broadcast-safe: anything only one player may see sits in `event.private = { playerId, ...data }` and `eventsFor(events, viewerId)` strips it for everyone else (for example the tile drawn from the okey pile).

## 2. Socket events (wiring phase)

All on the existing `/world` namespace (same JWT, admin/desktop gate and call membership as movement). A table belongs to the world room of one live call (`world:voice:<id>` or `world:group:<id>`); only members of that room may see or use its tables. Every client to server event takes an ack callback and answers `{ ok, error?, ... }`.

### Client to server

| Event | Payload | Ack |
| --- | --- | --- |
| `world:tables:list` | `{}` | `{ ok, tables: [{ id, game, phase, seats, members }] }` |
| `world:table:create` | `{ game: "okey" \| "blackjack" \| "tavla" \| "chess", options }` | `{ ok, tableId }` |
| `world:table:join` | `{ tableId }` (watch / spectate) | `{ ok, view }` |
| `world:table:sit` | `{ tableId, seat }` | `{ ok, seq }` |
| `world:table:stand` | `{ tableId }` | `{ ok, seq }` |
| `world:table:leave` | `{ tableId }` | `{ ok }` |
| `world:table:start` | `{ tableId }` | `{ ok, seq }` |
| `world:table:act` | `{ tableId, seq, nonce, action }` | `{ ok, seq, error?, duplicate? }` |
| `world:table:suggest` | `{ tableId, mode: "runs" \| "pairs" \| "sorted" }` (okey) | `{ ok, slots, melds, rest }` |
| `world:table:resync` | `{ tableId }` | `{ ok, view, seq }` |

`nonce` is a client-unique string (max 64 chars). A repeated nonce gets the first answer back with `duplicate: true` and is never applied twice, so a client can safely retry after a reconnect. `seq` is the state sequence the client acted on; a turn action against an older `seq` is refused with `stale` (free actions skip the check).

Actions per game (`action` field):

| Game | Actions |
| --- | --- |
| okey | `draw {from: "pile" \| "discard"}`, `discard {tile}`, `finish {tile}` (the tile thrown face down; the rest must win), `showIndicator`, `arrange {slots}` (28 slots, 2 x 14, tile id or null), `start` |
| blackjack | `bet {amount}`, `clearBet`, `insurance {take}`, `hit`, `stand`, `double`, `split`, `surrender`, `refill` (only when below the minimum bet) |
| tavla | `roll`, `move {from, to, die?}` or `move {steps: [{from, to, die?}]}` (`from` 0..23 or `"bar"`, `to` 0..23 or `"off"`), `undo`, `resign`, `start` |
| chess | `move {from, to, promotion?}` or `{san}` or `{uci}`, `resign`, `offerDraw`, `acceptDraw`, `declineDraw`, `rematch`, `flag`, `start` |

### Server to client

| Event | Payload |
| --- | --- |
| `world:table:update` | `{ tableId, seq, events, view }`, built per recipient with `TableManager.payloadFor(tableId, userId, events)`: own private events only, own redacted view (spectators get `publicView`). |
| `world:tables` | `{ tables }` when a table is created, removed, or its phase or seats change. |
| `world:table:result` | `{ tableId, game, event, standings }` on okey/tavla `matchOver`, chess `gameOver`, blackjack `settle`. |
| `world:table:closed` | `{ tableId, reason }` (call ended, table removed). |

Views carry `timers: [{ kind, playerId, deadline }]` and `serverTime`; the client shows "Sıra sende · 0:18" from `deadline - serverTime` corrected by its clock offset. Animation hints: blackjack `card` events carry `at` (ms offsets, about 380 ms apart) for the deal and dealer draws; okey and tavla events are one step each.

The server sends every update to all recipients in the same tick, so nobody learns hidden information from timing.

## 3. Games, rules and scoring

### 3.1 Okey (standard Turkish Okey, not 101)

- 106 tiles: 4 colours (sarı, mavi, siyah, kırmızı) x 1..13 x 2, plus 2 false okeys (sahte okey).
- The indicator (gösterge) is the first numbered tile of the shuffled set (a false okey is never the indicator); it stays face up, out of play. The okey is the same colour with the next number; 13 wraps to 1. Both okey tiles are wild. False okeys are not wild: they stand for the okey's face.
- Deal: the starter gets 15, the others 14; 48 tiles stay in the centre pile. The starter discards first without drawing.
- Turns go counter-clockwise: draw from the centre pile or take the previous player's last discard, then discard to the right (onto your own stack, which the next player may take).
- Melds: groups (same number, different colours, 3 or 4 tiles) and runs (same colour, consecutive, 3+ tiles; 12-13-1 is valid, 13-1-2 is not). Okeys are wild in both.
- Winning: discard one tile face down and show the other 14 split completely into melds, or as 7 pairs (çift; identical faces, a wild completes any pair). The server finds the split itself; when a hand is both, pairs is used (it scores more).
- Empty pile: a non-winning discard with the centre pile empty ends the hand as a draw (nobody loses points).
- Indicator bonus (on by default, `indicatorBonus`): the player holding the second copy of the indicator may show it on their first turn, before their first discard. Every other seat loses 1 point. Once per hand.
- Seats: 4. One to four humans; empty seats get bots. A human who leaves mid-hand is replaced by a bot that keeps the rack and the seat score. A human may take over a bot seat between hands and keeps that seat's score.
- Rack helper: `suggestArrangement(tiles, okeyFace, mode)` for the 2 x 14 rack: `runs` (best meld split, melds kept on one row and separated by a gap, leftovers by colour), `pairs`, `sorted`. The player's own layout (`arrange`) is kept on the server and survives reconnects.

Scoring table (countdown, the common "puanlı" table):

| Event | Every other seat loses |
| --- | --- |
| Normal finish | 2 |
| Finish by discarding an okey (double) | 4 |
| Pairs (çift) finish | 4 |
| Pairs finish discarding an okey | 8 |
| Indicator shown | 1 |
| Pile exhausted (draw) | 0 |

Every seat starts with `startPoints` (20). The match ends after the hand in which a seat reaches 0 or less (or after `maxHands` hands when set); the highest score wins, ties share the win. The starter rotates one seat each hand. A thrown false okey is not an okey discard.

### 3.2 Blackjack against a robot dealer

- 5 seats (counted in `approved-ui-2.png` and `scene-2.jpg`: five players around the table with the robot dealer).
- 6-deck shoe, one burn card after each shuffle, cut card at 75 % +/- 5 % penetration; once it comes out the round finishes and the shoe is reshuffled before the next round. Cards in play go to a tray and come back at the reshuffle.
- Dealer stands on all 17s (S17). The dealer peeks for blackjack with an Ace or a 10-value up card (US hole card); a dealer blackjack ends the round before anyone acts and players lose only their original bets.
- Natural blackjack pays 3:2. 21 after a split is not a blackjack.
- Double on any first two cards, also after a split.
- Split two cards of the same value (K-Q splits), up to `maxHands` hands per seat (default 3, so two re-split steps); split aces get exactly one card each and cannot be re-split.
- Insurance (optional, on by default): offered when the dealer shows an Ace; costs half the bet and pays 2:1 if the dealer has blackjack. Taking insurance on your own blackjack is the same as even money.
- Surrender (optional, on by default): late surrender, only as the first decision on an unsplit hand, after the peek; half the bet comes back.
- Points: every player gets a session balance of `startPoints` (1000 puan). A bet is a slider amount between `minBet` (10) and `maxBet` (500) in steps of `betStep` (10, always even so 3:2 and the halves stay whole). `refill` resets to the start balance when below the minimum bet; refills are counted and taken out of the leaderboard's net.
- Leaderboard per session (table lifetime): points, net (= points - start x (1 + refills)), hands, wins, losses, pushes, blackjacks, best round. Players who left stay on it.
- Phases: `idle` (nobody seated) -> `betting` (the first bet starts a 15 s window; when every connected seated human has bet the deal starts at once) -> `insurance` (Ace up) -> `playing` (seats in order, each hand in order) -> `settled` (6 s) -> `betting`.
- Leaving mid-round: the seat is handed to the basic-strategy autopilot, which finishes the hands and books the result to the leaver's balance; the seat frees at the next round.

| Result | Points back on a bet of B |
| --- | --- |
| Blackjack (natural) | B + 1.5 B |
| Win | 2 B |
| Push | B |
| Surrender | B / 2 |
| Lose, bust | 0 |
| Insurance (cost B / 2) when the dealer has blackjack | 1.5 B |

### 3.3 Tavla (Turkish rules)

- Standard backgammon movement and start position; checkers on the bar enter first; blots are hit; bearing off only with all 15 home, a higher die bears off from the furthest point only.
- Doubles move four times. A player must use as many dice as possible; when only one die can be used it must be the higher one if that one is playable. Both rules are checked against a brute-force reference in the tests.
- Opening roll: each player rolls one die (ties roll again); the higher starts and then rolls both dice for the first move (Turkish custom). `useOpeningDice: true` plays the opening dice instead.
- Scoring: a game is 1 point, mars (the loser bore off nothing) is 2. No doubling cube, no triple game. Matches to `matchTo` (default 5).
- Resign gives the opponent what the position gives right now (2 if the resigner bore off nothing, else 1). Leaving a running match loses the match.
- `undo` takes back the steps of the current turn; the turn ends by itself when the dice are used.

### 3.4 Satranç (chess)

- Full FIDE rules: castling rights, en passant, promotion with a choice, check, checkmate, stalemate.
- Draws end the game automatically, no claim needed (like most online servers): threefold repetition (en passant counts only when a legal en passant capture exists), fifty-move rule (100 half-moves; a mate on that move still counts), dead positions (K v K, K + minor v K, bishops all on one colour), agreement.
- Clocks (optional): `"5+0"`, `"10+5"`, any `"M+S"`. Each side's first move is not on the clock; it has `firstMoveMs` (30 s) and the game is aborted (no result) if it does not come. From then on the side to move's clock runs and gains the increment after each move. A flag fall loses, unless the opponent cannot mate with any series of legal moves (draw).
- Resign; draw offers (one pending, lapses when the other side moves or declines, 3 per player per game; offering back an offer is an agreement); rematch (both ask, a bot always agrees, colours swap, a running tally of 1 / 0.5 / 0).
- Untimed games: an idle human's move is played by the bot after `idleMs` (15 min); a disconnected human gets the bot after the grace period.
- SAN and FEN in and out, UCI, PGN export (`toPgn`).

## 4. Timers (tick-free)

`timers(state)` returns the timers that must run right now:

```
{ key, kind: "turn" | "bot" | "system", playerId, ms, action? }
```

- `turn`: a human is on the clock; on expiry the manager applies `action` as that player.
- `bot`: a bot seat, an autopiloted human, or an idle chess player moves after `ms` (human-like delay); the manager asks `botAction` at fire time.
- `system`: a phase change (`nextHand`, `deal`, `closeInsurance`, `nextRound`, `nextGame`, `flag`, `abort`) applied as the server.

The manager keeps exactly the returned set alive: one `setTimeout` per key, a timer whose key did not change keeps its deadline, missing keys are cleared. There is no interval. Bot delays are derived from the timer key, so `timers(state)` stays a pure function and does not depend on hidden information.

| Game | Timer | Default | On expiry |
| --- | --- | --- | --- |
| okey | turn | 30 s | draw from the pile; discard the drawn tile (the starter's first discard: the easy bot's pick) |
| okey | between hands | 8 s | next hand |
| okey | bot | 0.6 to 2.5 s | bot move |
| blackjack | betting window (after the first bet) | 15 s | deal (seats without a bet sit out) |
| blackjack | insurance | 10 s | decline for those who did not answer |
| blackjack | decision | 20 s (+ deal animation) | stand |
| blackjack | settled | 6 s | next round |
| tavla | roll | 10 s | roll |
| tavla | move | 60 s | the medium bot's move (or finish the started turn) |
| tavla | between games | 6 s | next game |
| chess | first move | 30 s | abort |
| chess | clock | remaining time | flag (checked against the real elapsed time) |
| chess | untimed idle | 15 min | the bot moves for the idle player |

AFK: after `afkLimit` (2) consecutive timeouts the bot plays for a connected player too; any own action hands the seat back.

## 5. Reconnection and presence

- On `disconnect` the manager marks the player's seats `connected: false` and starts a grace timer (`graceMs`, 45 s). Their turns keep the normal turn timer meanwhile.
- After the grace period the seat goes on autopilot: the bot plays for them (okey bot at the table level, blackjack basic strategy, tavla bot, chess bot). Blackjack does not place bets for an absent player; they sit out rounds.
- On reconnect the grace timer is cancelled, autopilot is cleared, and the client calls `world:table:resync` for a fresh view. Nonces make any retried action safe.
- A seat is only lost by leaving (`leave`, leaving the world room, or the call ending). In okey a bot then keeps the seat; in tavla and chess leaving a running game loses it; in blackjack the autopilot finishes the round.
- Tables live in server memory. A server restart drops running tables (games are short); finished results are persisted (6).

## 6. Persistence of points (Supabase, not applied)

Migration file: `supabase/migrations/20261105_world_game_scores.sql` (not applied).

- `world_game_sessions`: one finished okey match, tavla match, chess game, or a blackjack table session; scope (`group` + group id or `server` + server id), room key, game, table id, options and summary.
- `world_game_results`: per real user (bots are not stored): seat, points, outcome (`win` / `loss` / `draw` / `none`), details. Unique per (session, user).
- `world_game_leaderboard`: running totals per (scope, game, user): played, wins, draws, losses, points, best.
- `world_game_record_session(...)`: security definer function that writes all three atomically and idempotently (a retried call does not count twice).
- RLS on, no anon/authenticated grants; only the backend (service role) reads and writes. Leaderboards reach clients through the socket (`world:table:result`) or a small API.

What `points` means per game: okey final match score; tavla match points; chess 1 / 0.5 / 0; blackjack net session points (may be negative). `TableManager({ onResult })` is the hook: it fires on okey/tavla `matchOver`, chess `gameOver` and every blackjack `settle` (the wiring phase records blackjack once per session, when the player leaves the table or the table closes).

## 7. Rate limits and anti-cheat

Rate limits (token buckets, `createRateLimiter` from `worldCore.js`):

| What | Rate | Burst |
| --- | --- | --- |
| `world:table:act` (inside `TableManager.act`) | 6 / s | 12 |
| `create` | 0.2 / s | 3 |
| `join`, `sit`, `stand`, `leave`, `start` | 2 / s | 6 |
| `suggest`, `resync`, `list` | 2 / s | 6 |

Payloads are small and validated: action type up to 32 chars, nonce up to 64, okey slots exactly 28 entries, tavla up to 4 steps, chess moves resolved only against the generated legal moves.

Anti-cheat:

- Server authoritative: every action is validated against turn order and the full rules; clients never send outcomes, only intentions.
- Randomness from `crypto.randomInt` on the server only; the RNG is not part of the state.
- Redacted views built by whitelisting: other players' racks, the okey pile order, the shoe and the dealer's hole card are never in a view or an event. Tests check this two ways: every tile id in an okey view must be one the viewer may know, and metamorphic tests shuffle the hidden tiles or change the hole card and the shoe and require byte-identical views.
- Bots only read what a player at the table could see (own rack, discards, indicator, pile size); the tests feed them through `botKnowledge`.
- Nonces (idempotent retries) and `seq` (no acting on stale state).
- Clocks run on the server (`ctx.now`); a flag is checked against the real elapsed time.
- Spectators get `publicView` only.

## 8. Bots

| Game | Bot |
| --- | --- |
| okey | Hand evaluation = tiles in melds from an exact partition search (okeys wild) plus partial-meld potential weighted by how many missing tiles are still live; a pairs plan from 4 pairs up. Always finishes when it can (preferring an okey discard and pairs). Takes the previous discard when it finishes or clearly improves the hand; never throws an okey unless it finishes. Levels: easy (no potential, 35 % sloppy discards, rarely takes discards), medium (full evaluation, 12 % second-choice discards), hard (full evaluation with live-tile counting). Over 80 all-bot matches with seats swapped: hard 147 vs easy 60 hand wins, hard 217 vs medium 209. Delay 0.6 to 2.5 s. |
| blackjack | The dealer follows the table rules; dropped players get a basic-strategy autopilot (S17, DAS, late surrender). |
| tavla | Scores every distinct final position: pip count, borne-off checkers, blots weighted by shot probability and loss, made points, primes, home board strength against checkers on the bar, anchors (hard). Easy picks among the top moves at random; medium sometimes takes the second best. |
| chess | Iterative deepening alpha-beta with a transposition table, quiescence, null move, check extension, MVV-LVA, killers, history; material + piece-square tables + pawn structure, bishop pair, open files. Easy: depth 2 with a random pick within 120 cp; medium: depth 4, 0.5 s; hard: 1.5 s. Thinking time is capped by the clock (remaining / 30). Runs in a `worker_threads` worker (`createRunner`), so the socket server's event loop does no search work. |

Main-thread cost: okey and tavla bot decisions are synchronous and measured at a few ms (okey medium about 0.5 ms average, tavla below about 5 ms worst case on doubles). Chess search never runs on the main thread.

## 9. Tests

`node scripts/run-tests.mjs` (from `frontend/`) picks up:

| File | Covers |
| --- | --- |
| `okeyRules.selftest.cjs` | okey tile, win tables (sets, pairs, wilds, false okeys, 12-13-1 vs 13-1-2), 1500 constructed winning hands, 4000 random hands checked against an independent meld checker, partition vs win, rack helper |
| `okey.selftest.cjs` | deal, turn order, validation, every finish kind and its penalty, indicator, empty pile, match end, seats and takeovers, arrange, leak checks, timers, determinism, bot matches at all levels, 1000 random-policy hands with tile conservation |
| `blackjack.selftest.cjs` | betting, naturals, peek, insurance, hit/stand/double/split/surrender, S17, shoe and cut card, views, timers, autopilot, leaving, refill, basic strategy, 8000 random rounds with card and point conservation |
| `tavla.selftest.cjs` | single-step rules, legal steps vs brute force on 1500 random positions, opening, undo, doubles, mars, matches, timers, bot matches (hard beats easy), random human-style games with checker conservation |
| `chessPerft.selftest.cjs` | perft: start d4 197281, Kiwipete d4 4085603, positions 3 (d5), 4, 4 mirrored, 5, 6; incremental hash and unmake |
| `chess.selftest.cjs` | FEN, SAN, castling, en passant (with pins), promotion, endings, clocks, draw offers, rematch, PGN, random games |
| `chessBot.selftest.cjs` | eval symmetry, tactics, budgets, determinism, worker runner (main-thread event loop utilisation during a search) |
| `tables.selftest.cjs` | fake-clock manager: registry, nonces, seq, rate limits, timeouts, AFK, grace and reconnect, payload redaction, retry, async bot with late answers dropped, full matches of all four games |

## 10. Wiring plan (next phase)

1. Create one `TableManager` per process next to `WorldRooms` in `socket/worldHandlers.js` (`engineCtx: { chessRunner: createRunner() }`), with `onUpdate` sending `payloadFor` to every member socket of the table and `onResult` calling `world_game_record_session`.
2. Map the socket events of section 2 to manager calls; reuse `authorizeWorldJoin` so only members of the live call reach a table; `leaveRoom` on `world:leave` and disconnect handling via `disconnect` / `reconnect`.
3. Call `closeRoom` when the live call ends (the existing 5 s recheck already notices).
4. UI: the okey rack as the docked 2D panel with "Taşı at", the blackjack panel with "Kart çek / Dur / İkiye katla" and the points slider, tavla and chess boards; spectate with "İzle".
