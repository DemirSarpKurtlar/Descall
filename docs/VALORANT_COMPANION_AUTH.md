# Valorant Companion — Adım 2 auth notes

## Primary path: Riot Sign-On (website login)

Users connect via the **official Riot Sign-On** page (`https://auth.riotgames.com/authorize`).

| Surface | How login opens | Callback |
|--------|-----------------|----------|
| **Web** | Full-page redirect to auth.riotgames.com | `GET /api/riot/oauth/callback` → redirect `/?riot_link=success&play=valorant&tab=companion` |
| **Electron** | In-app `BrowserWindow` (fallback: `shell.openExternal`) | Same server callback; window intercepts `riot_link=` then refreshes Companion |

**Riot passwords are never accepted or stored.**

Authorization-code flow:

1. `GET /api/riot/oauth/start` (Descall JWT) → `{ url }` authorize URL  
2. User signs in on Riot’s site  
3. Riot redirects to `RIOT_REDIRECT_URI` with `code` + `state`  
4. Server exchanges code at `https://auth.riotgames.com/token`  
5. Server loads Name#Tag (`accounts/me` / userinfo), enriches rank (Henrik when configured), upserts `user_riot_accounts` with `link_method=rso`  
6. Companion card shows **Name#Tag**, **region**, **rank**, Disconnect  

Session **persists across app restart** via `user_riot_accounts` (RSO). Optional Electron safeStorage holds a public identity marker / lockfile tokens only.

## Secondary path: Riot Client lockfile (Electron only)

Optional desktop shortcut when Riot Client is running locally. Tokens stay in Electron **safeStorage**. Not the primary Adım 2 path.

## Thin proxy (CORS)

Riot platform hosts (`pd.*`, `glz.*`, `shared.*`) are not browser-CORS friendly for `descall.com`.

Descall uses:

- `GET /api/valorant/status`
- `GET /api/valorant/me`
- `POST /api/valorant/session/link` (public identity only)
- `DELETE /api/valorant/session`
- `GET /api/riot/oauth/start` + `GET /api/riot/oauth/callback`

## Env secrets Demir must set on Render

Create an RSO client at [developer.riotgames.com](https://developer.riotgames.com/) (production / RSO access as Riot requires). **Do not invent or commit secrets.**

```text
RIOT_CLIENT_ID=
RIOT_CLIENT_SECRET=
RIOT_REDIRECT_URI=https://des-call.onrender.com/api/riot/oauth/callback
```

Optional:

```text
RIOT_API_KEY=          # Riot account-v1 lookups
HENRIK_API_KEY=        # competitive rank for Companion card + LFG
PUBLIC_APP_URL=https://descall.com
```

Until `RIOT_CLIENT_ID` + `RIOT_CLIENT_SECRET` + `RIOT_REDIRECT_URI` are set, Companion shows **Configure Riot Sign-On** and still offers the Electron lockfile shortcut.

Redirect URI in the Riot developer portal must **exactly** match `RIOT_REDIRECT_URI`.

## How Demir tests

1. Set the three Render env vars above; redeploy `des-call`.  
2. Install latest Descall Setup (or use web).  
3. Play → Companion → **Connect with Riot (website login)**.  
4. Complete login on `auth.riotgames.com`.  
5. Card shows **Name#Tag**, region, rank; restart app — still linked.  
6. Disconnect clears the link.  
7. LFG tab: create/join lobby, party code, Name#TAG rank unchanged.

## LFG

LFG (`LfgWorkspace`) is unchanged and stays mounted while switching Companion ↔ LFG tabs.

## Adım 3 — Party + queue

See `docs/VALORANT_COMPANION_PARTY.md`. Live party/queue uses the same Riot session tokens (Electron lockfile headers preferred). LFG tab remains mounted and unchanged.

