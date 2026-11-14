# Ban experience: API contract (owner-approved drafts, 2026-11-14)

Drafts: docs/design/ban-experience/*.png. Frontend (ban screens, admin ban dialog, appeals tab)
and backend (enforcement, appeals) are built against this contract.

## 1. Account ban response (login, 2FA verify, Google, Apple)

HTTP 403
```json
{
  "error": "Account is banned.",
  "code": "ACCOUNT_BANNED",
  "ban": {
    "categoryId": "harassment",          // MOD_CATEGORIES id ("other" when unknown)
    "category": "harassment",            // kept for old clients (same value as before)
    "reason": "Harassment / Bullying",   // kept for old clients; new client translates categoryId
    "message": "note the admin wrote for the user, or null",
    "bannedAt": "ISO",
    "expiresAt": "ISO or null (permanent)",
    "username": "kaanyilmaz",
    "byAdmin": true
  },
  "banTicket": "short-lived signed token (JWT, scope 'ban', 30 min)",
  "appeal": { "status": "none | pending | rejected", "submittedAt": "ISO or null", "canAppeal": true }
}
```
`banTicket` is only issued after the password (or OAuth identity, or 2FA code) was verified, so it
proves account ownership. It authorises only the ban-scoped endpoints in section 3.

## 2. Access ban response (IP / network / device; login, register, OAuth)

HTTP 403
```json
{
  "error": "Access to Descall from this device or network is blocked.",
  "code": "ACCESS_BANNED",
  "expiresAt": "ISO or null",
  "access": { "code": "ACC-7F2K", "kind": "ip | network | device", "createdAt": "ISO", "expiresAt": "ISO or null" }
}
```
`access.code` is a short public reference derived from the access_bans row id (never the IP).

## 3. Ban-scoped endpoints (Authorization: Bearer <banTicket>)

- `GET  /api/auth/ban/status` returns `{ ban, appeal }` (same shapes as section 1). Used to refresh the countdown and appeal state.
- `POST /api/auth/ban/appeal` with `{ text }` (20 to 2000 chars). One open appeal per ban. Returns `{ appeal }`.
- `GET  /api/auth/ban/export` returns the user's data export (same content as the normal KVKK export).
- `POST /api/auth/ban/delete` with `{ confirm: "DELETE" }` deletes the account (same flow as the normal account deletion).

## 4. Access-ban appeal (no account needed)

- `POST /api/auth/access-appeal` with `{ code, email, text }`. Rate limited per IP and per code. Returns `{ ok: true }`.

## 5. Live ban (socket)

`system:kick` payload gains `{ action: "ban" | "access_ban" | "kick", categoryId, message, bannedAt, expiresAt, username, banTicket }`.
For access bans: `{ action: "access_ban", access: { code, kind, createdAt, expiresAt } }`.
`reason` stays for old clients but is no longer the duplicated message.

## 6. Session restore

`GET /api/auth/me` and every `requireAuth` route return the section 1 body (with `banTicket`) for a banned
account and the section 2 body for an access-banned device or network, so the client can show the
ban screen instead of silently signing out.

## 7. Admin

- `POST /admin/users/:id/ban` body gains `revokeSessions` (default true), `notifyEmail` (default true),
  `alsoAccessBan` (default false: also bans the account's devices and network via accessBans).
  Owner accounts and other admins cannot be banned (403 `ADMIN_PROTECTED`), on every ban route
  (single, bulk, report, dossier).
- `GET  /admin/appeals?status=pending|accepted|rejected&type=account|access` returns a list.
- `POST /admin/appeals/:id/decide` with `{ decision: "accept" | "reject", note }`. Accept lifts the ban or access ban.
  The user is emailed the result when an email is known.
