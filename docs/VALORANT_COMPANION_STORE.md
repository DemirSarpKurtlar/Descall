# Valorant Companion — Adım 6 wallet / loadout / store

## Ownership

- **API / hooks / stub panels:** Dimaru (`feat/valorant-adim6-loadout-store`)
- **Full Companion store + loadout UI:** Dima (replace stub panels; keep `useValorantStore` / `useValorantLoadout`)

## Data path

| Concern | Source |
|--------|--------|
| Wallet (VP / Radianite / Kingdom) | Render thin proxy → `pd.{shard}.a.pvp.net/store/v1/wallet/{puuid}` |
| Owned skins | `pd…/store/v1/entitlements/{puuid}/{skinsItemType}` |
| Equipped loadout (get + equip) | `pd…/personalization/v2/players/{puuid}/playerloadout` (GET + PUT) |
| Daily market + featured bundles | `pd…/store/v2/storefront/{puuid}` |
| Display names / icons / level+chroma videos | Public `valorant-api.com` catalogs (cached ~6h); `streamedVideo` from Riot CDN when present |
| Live session tokens | Electron lockfile → headers `X-Riot-Access-Token` / `X-Riot-Entitlement` |
| Ops gate | `RIOT_API_KEY` on Render (no secrets in code) |

When `RIOT_API_KEY` is missing, endpoints return a clear payload and **do not crash**:

```json
{ "configured": false, "envNeeded": ["RIOT_API_KEY"], "wallet": null, "skins": [], "loadout": null, "offers": [], "bundles": [] }
```

`RIOT_API_KEY` is the Render readiness gate (same env as Adım 5). Live PD calls still use player access + entitlement tokens — never passwords.

## Backend

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/valorant/store/status` | Capabilities + configured flag |
| GET | `/api/valorant/wallet` | VP / Radianite / Kingdom |
| GET | `/api/valorant/store/wallet` | Alias |
| GET | `/api/valorant/inventory/skins` | Owned skin entitlements (+ `levels` / `chromas` with real `streamedVideo`) |
| GET | `/api/valorant/skins/:uuid` | Catalog skin detail (levels/chromas + icons/videos). Catalog-only — works without `RIOT_API_KEY` |
| GET | `/api/valorant/loadout` | Equipped guns / sprays / identity (+ `levelVideo` / `chromaVideo` for equipped ids) |
| PUT / PATCH | `/api/valorant/loadout` | Equip patch → reflects in-game |
| GET | `/api/valorant/store/offers` | Daily offers + featured bundles (offers/items include `levels` / `chromas`) |
| GET | `/api/valorant/store/storefront` | Alias of offers |

### Equip body (PUT/PATCH `/loadout`)

```json
{
  "guns": [{ "weaponId": "…", "skinId": "…", "skinLevelId": "…", "chromaId": "…", "buddyId": "…" }],
  "sprays": [{ "slotId": "…", "sprayId": "…" }],
  "identity": { "cardId": "…", "titleId": "…" },
  "incognito": false
}
```

Passwords never accepted. Tokens are request-scoped headers (same as Adım 3–5).

## Skin media shape (Adım 6 enrichment)

Catalog skins (from `valorant-api.com/v1/weapons/skins`) now keep:

```json
{
  "levels": [{ "uuid": "…", "displayName": "…", "displayIcon": "…", "streamedVideo": "https://valorant.dyn.riotcdn.net/…" }],
  "chromas": [{ "uuid": "…", "displayName": "…", "displayIcon": "…", "swatch": "…", "streamedVideo": null }]
}
```

- `streamedVideo` is **only** the real URL from valorant-api (or `null`) — never a placeholder.
- Owned skins / store offers / bundle items attach the same `levels` + `chromas` arrays when the catalog resolves the item.
- Loadout guns add `levelVideo`, `chromaVideo`, and nested `level` / `chroma` for the equipped `skinLevelId` / `chromaId`.
- `GET /api/valorant/skins/:uuid` returns full catalog media without needing live Riot tokens or `RIOT_API_KEY`.

## Client wire hooks

```js
import useValorantStore from "../hooks/useValorantStore";
import useValorantLoadout from "../hooks/useValorantLoadout";
import {
  getValorantWallet,
  getValorantOwnedSkins,
  getValorantSkinDetail,
  getValorantLoadout,
  putValorantLoadout,
  getValorantStoreOffers,
} from "../api/valorantStore";

const {
  wallet, offers, bundles, skins, skinCount,
  configured, envNeeded, refresh,
} = useValorantStore({ enabled: linked, region, puuid });

const {
  loadout, equip, refresh: refreshLoadout,
  configured: loadoutConfigured, busy,
} = useValorantLoadout({ enabled: linked, region, puuid });

// Equip example — reflects in-game after PUT
await equip({
  guns: [{ weaponId, skinId, skinLevelId, chromaId }],
  identity: { cardId, titleId },
});
```

Mount: `CompanionStorePanel` + `CompanionLoadoutPanel` next to missions inside `CompanionAuthPanel`. Keep LFG tab untouched.

## Env (Render)

```text
RIOT_API_KEY=   # required for Adım 5 + Adım 6 configured:true
```

Also needs desktop Riot Client tokens for live balances / store / loadout (same as party/missions).

## Selftest

```bash
node frontend/backend/lib/valorantStore.selftest.cjs
```

Covers missing-key path (`configured:false`, `envNeeded:["RIOT_API_KEY"]`), loadout `levelVideo`/`chromaVideo` shaping, and live catalog `getSkinDetail` (network to valorant-api).

## Ship note

No Setup version bump / tag in this PR. Dimaru merges → Dima UI polish → Setup bump later.
