# Valorant Companion — Adım 4 friends + presence

## Ownership

- **API / Electron / hooks:** Dimaru (`feat/valorant-companion-adim4-friends-api`)
- **Companion friends/presence UI panel:** `CompanionFriendsPanel` mounted in `CompanionAuthPanel` (this ship)

## Data path

| Concern | Source |
|--------|--------|
| Friend list + presence + requests | Electron IPC → Riot Client local ` /chat/v4/*` (lockfile) |
| Shape / merge helpers | `frontend/backend/lib/valorantFriends.js` |
| Online invite to party | `POST /api/valorant/friends/party-invite` (GLZ, same tokens as Adım 3) |
| Store / loadout / daily market | Adım 6 stub: `GET /api/valorant/store/status` |

Render **cannot** read the user's `127.0.0.1` lockfile. Web RSO alone cannot list Riot friends.

## Backend (ready for Dima's panel)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/valorant/friends/status` | Capabilities + endpoint map |
| POST | `/api/valorant/friends/party-invite` | `{ riotId }` or name+tag → GLZ invite |
| POST | `/api/valorant/friends/shape` | Optional: shape raw friends/presences/requests |
| GET | `/api/valorant/store/status` | Adım 6 stub only |

Passwords never accepted. Live party invite needs `X-Riot-Access-Token` + `X-Riot-Entitlement` (Electron safeStorage).

## Client wire hooks

```js
import useValorantFriends from "../hooks/useValorantFriends";
import {
  getValorantFriendsStatus,
  inviteValorantFriendToParty,
  localFriends,
} from "../api/valorantFriends";

const {
  friends, counts, inbound, outbound,
  refresh, inviteToParty, sendRequest, acceptRequest, removeRequest,
  desktopReady, loading, error,
} = useValorantFriends({ enabled: linked, region, puuid });
```

Mount: `CompanionFriendsPanel` next to `CompanionPartyPanel` inside `CompanionAuthPanel`. Keep LFG tab untouched.

## Electron IPC

- `valorant:local-friends`
- `valorant:local-friend-request-send`
- `valorant:local-friend-request-remove`
- `valorant:local-friend-request-accept`

## i18n

Shared `valorantHub.friends*` / `valorantHub.presence*` / `valorantHub.store*` keys are in `en.js` / `tr.js` for the panel.

## Ship note

UI SHA lands on `feat/valorant-adim4-friends-ui`. Dimaru merges API+UI → bump **2.9.33** Setup together.
