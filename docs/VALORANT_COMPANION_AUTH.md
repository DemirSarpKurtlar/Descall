# Valorant Companion — Adım 2 auth notes

## CORS decision

Riot platform hosts (`pd.*`, `glz.*`, `shared.*`) are **not** browser-CORS friendly for a SPA on `descall.com`.

Descall therefore uses a **thin Render proxy** at:

- `GET /api/valorant/status`
- `GET /api/valorant/me`
- `POST /api/valorant/session/link` (public identity only)
- `DELETE /api/valorant/session`

The browser never calls Riot platform origins directly.

## Token storage

| Surface | How session is obtained | Where tokens live |
|--------|-------------------------|-------------------|
| Electron (Windows) | Local Riot Client **lockfile** → local entitlements API | Electron **safeStorage** (on-device). Not written to Descall DB. |
| Web | Official **Riot Sign-On** when configured | RSO code exchange on server (existing `/api/riot/oauth/*`). Companion prefers not to persist long-lived companion tokens for lockfile-style flows. |
| Any | Public **Name#TAG** (Henrik) | No Riot session tokens — profile/LFG rank only (existing `/api/riot/link`). |

**Riot passwords are never accepted or stored.**

`GET /api/valorant/me` may accept request-scoped headers:

- `X-Riot-Access-Token`
- `X-Riot-Entitlement` (or `X-Riot-Entitlements-JWT`)

These headers are used only for that request (identity + optional rank enrich) and are **not** upserted into `user_riot_accounts`.

## Env secrets Demir must add (for web RSO)

If official Riot OAuth client credentials are approved, set on Render (and keep out of git):

```text
RIOT_CLIENT_ID=
RIOT_CLIENT_SECRET=
RIOT_REDIRECT_URI=https://des-call.onrender.com/api/riot/oauth/callback
```

Optional:

```text
RIOT_API_KEY=          # Riot account-v1 lookups
HENRIK_API_KEY=        # already used for public rank (LFG / profile)
PUBLIC_APP_URL=https://descall.com
```

Until `RIOT_CLIENT_ID` + `RIOT_CLIENT_SECRET` + redirect URI are set, **web RSO stays disabled**. Desktop lockfile linking still works.

Do **not** invent or commit client secrets.

## Desktop test prerequisites

1. Install Descall Windows Setup for this release.
2. Start **Riot Client** and sign in; preferably launch Valorant once.
3. Open Descall → Play / Valorant hub → **Companion** → **Connect via Riot Client**.
4. Connected card shows **Name#Tag**, **region**, Disconnect.
5. Restart Descall — session should reload from safeStorage (until Riot Client tokens expire).
6. LFG tab: create/join lobby, party code, Name#TAG rank still work.

## Web limitation (clear)

Browsers cannot read the Riot Client lockfile. Without RSO env secrets, web Companion shows the limitation + which env vars to add. Public Name#TAG linking in Settings remains available.
