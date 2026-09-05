# Valorant Companion — Adım 3 party + queue

## What shipped

Companion tab (after Riot link) shows a **Party** card:

- Members (Riot ID when resolvable, competitive tier, ready, leader)
- Game mode / queue id, region/shard, party invite code
- Queue start / stop (party leader)
- Invite by Riot ID (`Name#TAG`)
- Leadership transfer (API-supported)
- Generate party code

LFG tab is unchanged and stays mounted while switching Companion ↔ LFG.

## Auth for live party

GLZ party endpoints need **access + entitlement** tokens:

1. **Primary (desktop):** Electron Riot Client lockfile → safeStorage → headers `X-Riot-Access-Token` / `X-Riot-Entitlement`
2. **Fallback:** stored RSO `access_token` + entitlements mint (`entitlements.auth.riotgames.com`) when Riot grants them

RSO website login alone often **cannot** mint game entitlements. If party shows the tokens hint, connect via **Optional: Riot Client on this PC** while Valorant is open.

## API (thin Render proxy)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/valorant/party` | Current party |
| POST | `/api/valorant/party/queue/start` | Matchmaking join |
| POST | `/api/valorant/party/queue/stop` | Matchmaking leave |
| POST | `/api/valorant/party/queue` | `{ queueId }` |
| POST | `/api/valorant/party/invite` | `{ riotId }` or name+tag |
| POST | `/api/valorant/party/transfer` | `{ puuid }` |
| POST | `/api/valorant/party/ready` | `{ ready }` |
| POST | `/api/valorant/party/code` | Generate invite code |
| POST | `/api/valorant/party/accessibility` | OPEN/CLOSED |

Passwords are never accepted. Tokens are request-scoped headers (or short-lived RSO row) and are not logged.

## How Demir tests

1. Install latest Setup (or web + desktop Client path).
2. Play → Companion → link Riot (RSO and/or Riot Client).
3. With **Valorant open** on the same PC, use Optional Riot Client connect so party tokens exist.
4. Party card should list members / mode / region; Generate code; invite `Name#TAG`.
5. Start queue → client shows queue; Stop queue → leaves.
6. If leader: transfer leadership to another member.
7. Switch to **LFG** tab — create/join lobby, party code, rank still work.

## Known Riot API limits

- No official public “full companion” API; uses VALPAW-class `glz.*` session endpoints.
- Client version header is refreshed from valorant-api.com (fallback if fetch fails).
- Region/shard mismatch → 401/404 from Riot; reconnect with correct region.
- Full Riot friends / presence list is **Adım 4** (invite-by-Riot-ID works now).
- Web-only RSO without entitlements cannot drive queue.

## LFG regression

`LfgWorkspace` still mounts 1:1 under ValorantHub LFG tab; hub does not pass `onClose` into LFG.
