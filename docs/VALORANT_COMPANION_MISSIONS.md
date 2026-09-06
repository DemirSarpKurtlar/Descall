# Valorant Companion — Adım 5 missions / contracts / BP

## Ownership

- **API / hooks / stub card:** Dimaru (`feat/valorant-adim5-missions`)
- **Full Companion missions UI:** Dima (replace `CompanionMissionsPanel`; keep `useValorantMissions`)

## Data path

| Concern | Source |
|--------|--------|
| Weekly missions + agent contracts + battle pass | Render thin proxy → `pd.{shard}.a.pvp.net/contracts/v1/contracts/{puuid}` |
| Contract display names | Public `valorant-api.com/v1/contracts` (cached) |
| Live session tokens | Electron lockfile → headers `X-Riot-Access-Token` / `X-Riot-Entitlement` |
| Ops gate | `RIOT_API_KEY` on Render (no secrets in code) |

When `RIOT_API_KEY` is missing, endpoints return a clear payload and **do not crash**:

```json
{ "configured": false, "envNeeded": ["RIOT_API_KEY"], "missions": [], "contracts": [], "battlePass": null }
```

`RIOT_API_KEY` is the Render readiness gate (same env Demir sets for account-v1). Live PD calls still use player access + entitlement tokens — never passwords.

## Backend

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/valorant/missions/status` | Capabilities + configured flag |
| GET | `/api/valorant/missions` | Full shaped bundle |
| GET | `/api/valorant/contracts` | Same bundle (alias) |
| GET | `/api/valorant/battlepass` | BP slice |
| POST | `/api/valorant/contracts/activate` | `{ contractId }` → activate special contract |

Passwords never accepted. Tokens are request-scoped headers (same as Adım 3 party).

## Client wire hooks

```js
import useValorantMissions from "../hooks/useValorantMissions";
import {
  getValorantMissionsStatus,
  getValorantMissions,
  activateValorantContract,
} from "../api/valorantMissions";

const {
  missions, missionCounts, battlePass, contracts,
  configured, envNeeded, refresh, activate,
  loading, error,
} = useValorantMissions({ enabled: linked, region, puuid });
```

Mount: `CompanionMissionsPanel` next to friends/party inside `CompanionAuthPanel`. Keep LFG tab untouched.

## Env (Render)

```text
RIOT_API_KEY=   # required for Adım 5 configured:true
```

Also needs desktop Riot Client tokens for live progress (same as party/friends).

## Selftest

```bash
node frontend/backend/lib/valorantMissions.selftest.cjs
```

Covers missing-key path (`configured:false`, `envNeeded:["RIOT_API_KEY"]`) without network.

## Ship note

No Setup version bump / tag in this PR. Dimaru merges → Dima UI polish → Setup bump later.
