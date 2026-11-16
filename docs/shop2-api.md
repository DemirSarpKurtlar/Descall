# Market 2.0 API (Vitrin ve Setler)

Backend: `frontend/backend/lib/shop2/*`, `routes/shop2.js` (user, `/api/shop2`), `routes/adminShop2.js`
(admin, `/api/admin/shop2`). Migration `supabase/migrations/20261115_shop2.sql` (additive). Before the
migration is applied every endpoint still works: the `shop2_*` state lives in process memory per instance
(wallet, ledger and inventory are always the real tables). Admin dashboard says `migrated: false` then.

## Conventions

- JSON in and out, `Authorization: Bearer <app JWT>`. Every response is `Cache-Control: no-store`.
- Errors: `{ error, code, errorKey?, errorVars?, price? }` (lib/apiError.js). Translate `errorKey` with
  `errorVars` when present, else `error`, through the api phrase catalog. `code` is stable (list below).
  Admin errors: `{ error, code }`, localize `adminShop2.err.<code>`.
- Money: integers in DesCoin. Every buy endpoint accepts `expectedPrice` (409 `price_changed` with the
  new `price` when it went up) and an idempotency key (`Idempotency-Key` header or `idempotencyKey`
  body field, 8-100 chars `[A-Za-z0-9._:-]`). A repeated key returns the first result with
  `duplicate: true` and never charges again. Set purchases use `holdToken` (the hold-to-confirm
  gesture id) as their key and require it.
- Days are Europe/Istanbul days (`YYYY-MM-DD`), reset at 00:00 Istanbul (21:00 UTC).
- Item payload (`item` everywhere): `{ id, sku, category, rarity, price_descoin, set_key, effect_key,
  theme_key, badge_icon, asset_url, preview_url, name, description, i18n: { name: {tr,en,de,es,fr,
  "pt-BR",ru}, description: {...} }, tags, legacy }`. Inline SVG art comes as a short public URL
  `/api/shop2/assets/:id?v=<hash>` (immutable when `v` matches; `&kind=preview` for previews).
- Rate limits per user (429 `rate_limited`): writes 60/min, buys 20/min, gifts 20/10 min, flips 30/min.

## Socket events

| event | to | payload |
|---|---|---|
| `shop2:storefront` | `user:<id>` or everyone | `{ reason, day?, setKey?, nightId?, version?, at }`; reasons: `refresh`, `purchase`, `refund`, `gift`, `regenerated` (own), `daily` (00:00), `rules`, `night_open`, `night_closed`, `set_published`, `set_recalled`, `set_restored` (everyone). Refetch `GET /storefront`. |
| `shop2:gift` | recipient / sender | `{ kind: "received", gift }` to the recipient on delivery; `{ kind: "opened" \| "equipped" \| "thanked", giftId }` to the sender; `{ kind: "recalled", giftId }` to the recipient. |
| `shop2:night_reminder` | `user:<id>` | `{ nightId, startsAt, minutes, title, body, at }` 10 minutes before a night opens, only to users who turned the reminder on (title / body already in the user's language; an in-app notification `type: "shop2_night"` and a web push go out too). |
| `shop2:admin:sale` | `admin` room | `{ sale: { id, kind, userId, setKey, itemIds, amount, listAmount, ownedDeducted, source, gift, at } }` (refund: `kind: "refund"`, negative amount); `{ flag: { kind: "gift_ring", giftId, users } }` on a ring. |

## User API (`/api/shop2`)

### Storefront
- `GET /storefront` ->
  `{ day, serverTime, resetsAt, slots: [{ slot 1-4, item, price, owned, available, locked, wishlisted,
  badges: ["wishlist"|"set_progress"|"new_item"|"epic_floor"|"locked"], setProgress: { setKey, owned,
  total }|null }], lock: { itemId, slot }|null, refresh: { available, price, free: null|"premium"|
  "grant"|"streak", used, perDay, usedAt, freeGrants }, streak: { days, rewardEvery }, nightMarket:
  { open, id?, startsAt?, endsAt?, cards?, flipsLeft?, keepMax?, nextStartsAt }, featuredSets:
  [setCard], yesterday: [{ slot, item, owned, available, wishlisted }], wishlistHits: [itemId],
  balance, viewers, legacyPool }`. A bought card stays in its slot with `owned: true`.
- `POST /storefront/refresh { keepLockedItemId?, expectedPrice? }` -> `{ ok, paid, free, duplicate,
  storefront }`. Omit `keepLockedItemId` to keep the stored lock, `null` to drop it. 409
  `refresh_used`, `lock_not_in_storefront`, 402 `insufficient_balance`. The refreshed cards never
  repeat today's earlier cards. Granted (admin / 7-day streak) refreshes are used first and are free.
- `POST /storefront/lock { itemId|null }` -> `{ ok, lock }` (one lock; only a card of today).
- `GET /catalog?category=` (addition) -> `{ items: [item + owned], legacyPool }` live s2 catalog.

### Sets
- setCard: `{ key, name {7 locales}, palette [hex], state: "live"|"last24h"|"soldout"|"scheduled"|
  "ended"|"recalled"|"draft"|"archived", onSale, startsAt, endsAt, stockLimit, stockLeft, pieceCount,
  topRarity, cover: item, sum, setPrice, discountPct, yourPrice, owned, total, complete,
  partialPriceUntil }`.
- `GET /sets` -> `{ sets: [setCard + completedTitle] }`.
- `GET /sets/:key` -> setCard + `{ pieces: [{ category, item, price, owned, priceNow, mode:
  "pieces"|"partial"|"set", wishlisted }] (8, in order avatar_frame, banner, profile_color,
  profile_badge, avatar_effect, chat_bubble, voice_tile, join_sound), groups: [{ key: "look"|"name"|
  "motion"|"voice", categories }], sum, setPrice, yourPrice, ownedDeducted, savings, missingIds,
  partialPriceUntil, partialLockDays, priceHistory30d: [{ day, price }], lowest30d, isLowest30d,
  lookingNow, ownersCount, friendOwners, title: { id, setKey, name, palette }, titleUnlocked,
  wishlisted, refundMinutes }`.
  Pricing: `setPrice` = sum minus the set discount (20-30 %, rounded to 10). `yourPrice` = missing
  pieces at the set rate (owned pieces deducted). A piece bought alone costs its full price and opens
  a 7-day window (`partialPriceUntil`): meanwhile every missing piece costs the set rate (`priceNow`,
  `mode: "partial"`), even after the set leaves the shop. `yourPrice: null` = the set rate is closed.
- `POST /sets/:key/buy { all?: true | pieceIds?: [id], holdToken, expectedPrice?, equip?: "all"|[id] }`
  -> `{ ok, duplicate, purchaseId, paid, itemIds, mode, balance, refundableUntil, partialPriceUntil,
  equipped: { applied, previousOutfitId }|null, completed: [{ setKey, title }] }`. `equip` saves the
  previous look as an automatic outfit and logs an undoable `equip` action. 410 `not_available`,
  409 `sold_out` / `already_owned`, 403 `new_account_set`.

### Purchases
- `POST /items/:id/buy { expectedPrice?, source?, equip?: true }` -> `{ ok, duplicate, purchaseId,
  paid, itemId, balance, refundableUntil, partialPriceUntil }`. Set pieces follow the set rules.
- `GET /purchases` (addition) -> `{ purchases: [{ id, kind, setKey, itemIds, amount, listAmount,
  status, source, createdAt, refundableUntil }] }`.
- `POST /purchases/:id/refund` -> `{ ok, purchaseId, refunded, balance }`. 10 minutes, nothing from it
  equipped, not a gift. 409 `refund_window_closed`, `refund_equipped`, `already_refunded`.

### Night market
- `GET /night-market` -> closed: `{ open: false, next: { id, startsAt, endsAt }|null, notify }`;
  open: `{ open: true, eligible, night: { id, startsAt, endsAt }, flips: { total, used, left,
  coOpenBonus }, keepMax, cards: [{ index, flipped: false, hint: category } | { index, flipped: true,
  hint, item, rarity, discountPct, listPrice, price, kept, bought, owned, flippedAt }], savings, log:
  [{ at, cardIndex, kind: "flip"|"buy"|"keep" }], notify, next }`. Decks are personal and
  deterministic per night; +1 flip when a friend has flipped the same night.
- `POST /night-market/flip { cardIndex }` -> `{ ok, nightMarket }`; 409 `no_flips_left`,
  `card_flipped`, `night_closed`.
- `POST /night-market/keep { cardIndex, keep?: false }` (addition) -> `{ ok, kept }` (max 2,
  409 `keep_limit`).
- `POST /night-market/buy { cardIndex, expectedPrice? }` -> `{ ok, duplicate, purchaseId, paid, itemId,
  balance, refundableUntil }`.
- `POST /night-market/notify { on }` -> `{ notify, minutesBefore: 10 }`: the reminder is stored server
  side (`shop2_user_state.notify_night`); the scheduler sends it 10 minutes before every night (once per
  night, in-app notification + web push + `shop2:night_reminder`). `GET /night-market` returns `notify`.

### Gifts
- `POST /gifts { toUserId, itemId | setKey | nightCardIndex, message?, sendAt?, anonymous?, hidden? }`
  -> `{ ok, duplicate, giftId, status: "scheduled"|"delivered", sendAt, paid, itemIds, balance,
  flagged }`. The sender pays now. A set gift skips the pieces the recipient owns (price = their
  `yourPrice`). Recipient must be an accepted friend, not blocked, with gifts allowed. Errors (403):
  `recipient_not_friend`, `recipient_no_gifts`, `recipient_unavailable`, `gift_daily_cap`,
  `gift_recipient_cap`, `gift_receive_cap`, `gift_new_account`, `gift_new_account_set`,
  `gifts_paused`; 409 `recipient_owns`; 400 `gift_message_long`, `gift_too_far`.
- `POST /gifts/quote` (addition, same body) -> `{ ok, kind, price, listPrice, itemIds, ownedDeducted }`
  or `{ ok: false, code, vars }`.
- `GET /gifts/recipients?itemId=|setKey=` (addition) -> `{ recipients: [{ user, owned, total, ownsAll,
  wishlisted, canReceive, wishlistCount }] }` (wishlist matches first).
- `GET /gifts` -> `{ sent: [gift], received: [gift], limits: { perDay, sentToday, left, maxMessage,
  maxScheduleDays, paused } }`; gift: `{ id, direction, status: "scheduled"|"delivered"|"opened"|
  "equipped"|"thanked"|"recalled", from (null when anonymous, for the recipient), anonymous, to, kind,
  setKey, items (empty while hidden and unopened), itemCount, hidden, message, amount (sender only),
  sendAt, createdAt, deliveredAt, openedAt, equippedAt, thankedAt, recalledAt, canRecall, canOpen }`.
  Scheduled gifts are invisible to the recipient until delivered.
- `POST /gifts/:id/recall` (sender, until opened, full refund) · `POST /gifts/:id/open { equip?: true }`
  -> `{ granted, alreadyOwned, equipped, items }` · `POST /gifts/:id/thank` · `POST /gifts/:id/equipped`
  (additions: tracking "kuşandı" / "teşekkür") · `PUT /gifts/privacy { giftPrivacy: "friends"|"nobody" }`.

### History, outfits, wishlist, feed
- `GET /history?limit=&before=` -> `{ entries: [{ id, kind, at, payload, undoable, undoUntil, undoneAt }] }`.
  kinds: `refresh`, `lock`, `unlock`, `purchase`, `refund`, `equip`, `gift_send`, `gift_recall`,
  `wishlist_add`, `wishlist_remove`, `outfit_save`, `outfit_apply`.
- `POST /history/:id/undo` -> `{ ok, actionId, type, result }` (purchase -> refund, equip / outfit apply
  -> previous look, lock -> previous lock, wishlist -> reverse, outfit save -> delete, gift -> recall).
  409 `undo_expired`.
- `GET /outfits` -> `{ outfits: [{ id, name, kind: "saved"|"previous", look: { category: itemId },
  createdAt }] }` · `POST /outfits { name, look? }` (current look when omitted) · `POST /outfits/:id/apply`
  · `DELETE /outfits/:id` (additions: apply, delete).
- `GET /wishlist` -> `{ items: [{ item, addedAt, owned, available, inStorefrontToday }], sets: [{ setKey,
  addedAt }] }` · `POST /wishlist { itemId | setKey, remove?: true }` · `DELETE /wishlist/:itemId`.
- `POST /share { itemId | setKey, toUserIds: [id] (1-10), message? }` ("Arkadaşlarına göster") ->
  `{ ok, kind: "item"|"set", ref, link, results: [{ userId, ok, code?, messageId? }], sent }`. Only an
  owned item or a fully owned set; friends only (others get `code: "recipient_not_friend"`). Sent through
  the existing DM send path (lib/notifyActions.js `reply`: blocks, bans, timeouts, platform policy, DM
  rate limit, unread, push, `dm:message`). The DM text is the note plus a look link on its own line:
  `https://<app>/shop/look/set/<setKey>` or `https://<app>/shop/look/item/<itemId>`; render a look card
  for messages matching `/\/shop\/look\/(set|item)\/([A-Za-z0-9._-]+)/` (server helper
  `lib/shop2/share.js` `parseShareText`). Limit 10 shares per hour (429 `rate_limited`). Errors:
  `share_no_recipients`, `share_too_many`, `share_not_owned`, `not_found`.
- `GET /feed` (addition) -> `{ entries: [{ kind: "set_completed", at, user, setKey, setName, palette }] }`.

## Admin API (`/api/admin/shop2`)

Section `shop` (ring wallet freeze also `casino`). Every POST / PUT / PATCH / DELETE needs the step-up
header (`X-Admin-Step-Up`) except `/rules/simulate`, `/limits/impact`, `/night-markets/preview`.
Destructive actions require `reason` (>= 3 chars, 400 `reason_required`). Audited as `shop2_*`.

- `GET /dashboard` -> `{ tiles: { revenueToday, revenueYesterday, salesToday, salesYesterday,
  setSalesToday, pieceSalesToday, itemSalesToday, nightSalesToday, refundsToday, buyersToday,
  ownedDeductedToday, storefrontsToday, storefrontConversionPct, storefrontToSetPct, refreshesToday,
  refreshRevenueToday, giftsToday, blockedGiftsToday, openGiftFlags, liveViewers }, series: { today,
  yesterday: { revenue[24], count[24] } }, recentSales: [sale], sets: [adminSetRow], rules: { active,
  changesVsPrevious, scheduled }, limits: { refresh, gifts, nightMarket, usage }, nightMarket: { open,
  next }, pool: { items, legacyPool }, migrated }`.
  sale: `{ id, at, kind, status, user, recipient, setKey, items: [{ id, sku, name, i18n, category }],
  amount, listAmount, ownedDeducted, source, abArm }`.
  adminSetRow: `{ key, name, palette, state, status, source: "default"|"db", startsAt, endsAt,
  discountPct, sum, setPrice, pieceCount, missingCategories, stockLimit, stockSold, stockLeft, sold7d,
  setSales7d, pieceSales7d, revenue7d, velocity: { days[7], counts[7] }, perHourLast24h, recall, version,
  updatedAt }`.
- `GET /sales/live?since=<iso>` -> `{ sales, series, totals, liveViewers }` (poll, or use the socket).
- Sets: `GET /sets` -> `{ sets: [adminSetRow] }` · `GET /sets/:key` -> adminSetRow + `{ pieces: [{
  category, item, price, owners, paletteScore }], ladder: { singleMax, bands, pieceMin, pieceMax, sum,
  setPrice, discountPct, farAboveSingles }, suggestion: { pct, basis }, payers: [{ key:
  "none"|"few"|"half"|"most", users, ownedCount, pays, deducted }], forecast: { salesPerDay,
  setSalesPerDay, stockOutAt, revenue7dProjected }, checklist: [{ key: "pieces"|"palette"|"price_band"|
  "above_singles"|"schedule"|"clash"|"phone_crop"|"translations"|"sellable"|"catalog", ok, vars }],
  suggestions: [{ item, score }], salesSeries30d, priceHistory30d, abTests, versions: [{ version, at,
  by, reason, row }], note }` · `GET /sets/:key/suggestions?category=` (palette match) ·
  `POST /sets { key, name?, palette?, discountPct?, startsAt?, endsAt?, stockLimit?, pieceIds?, note? }`
  (draft) · `PATCH /sets/:key { ...same, status?: "draft"|"archived", reason? }` ·
  `POST /sets/:key/publish { at? }` -> `{ set, undoUntil }` (10 s) · `POST /sets/:key/publish/undo` ·
  `POST /sets/:key/shift { days }` · `POST /sets/:key/restore { version }` · `DELETE /sets/:key` (drafts).
- Recall: `GET /sets/:key/recall-preview?option=keep|refund|replace` -> `{ buyers, purchases,
  refundTotal, giftsPending, giftsPendingAmount, inWishlists, notify, undoMinutes, state }` ·
  `POST /sets/:key/recall { reason, option, replace?: { fromItemId, toItemId } }` -> `{ set, preview,
  undoUntil }` (sales stop now; refunds / replacement / pending-gift recall run when the 30-minute undo
  window closes, buyers get `shop2:storefront set_recalled`) · `POST /sets/:key/recall/undo`.
- Rules: `GET /rules` -> `{ active, activeRules, tomorrow, versions: [{ version, status, note, applyAt,
  appliedAt, createdAt, createdBy, basedOn, builtIn, changeCount }] }` (version 0 = built-in) ·
  `GET /rules/:version` -> `{ version, rules: { weights, bands[4], toggles }, changes: [{ path, from,
  to }], previous }` · `POST /rules { rules (partial), note?, basedOn? }` (draft) ·
  `POST /rules/simulate { version } | { rules, sample? }` -> `{ version, comparedTo, day, changes, sample,
  emptyStorefronts, epicFloorForcedPct, withEpicPct, avgStorefrontValue, avgSlotPrice[4], rarityShare,
  categoryShare, neverShown, neverShownCount, top, bottom, heatmap: [{ id, category, rarity, pct }],
  baseline, delta }` (10 000 users by default, nothing saved) · `POST /rules/:version/schedule { at? }`
  (next 00:00 by default) · `POST /rules/:version/activate { reason }` (rollback = an older version,
  0 = built-in) · `POST /rules/:version/cancel`.
- User drawer: `GET /users?q=` · `GET /users/:id/storefront?day=today|tomorrow` -> `{ user, which, day,
  stored, seed, ruleVersion, refreshCount, slots: [{ slot, item, price, locked, owned, reasons: [{ code,
  ... }], why }], excluded: { owned, retired, repeat, category, set_piece, rarity_off, category_off,
  new_account }, relaxed, epicFloorApplied, newAccount, ownedCount, wishlistCount, sets: [{ key, name,
  setPrice, yourPrice, owned, total, ownedDeducted, partialPriceUntil, abArm }], refresh, gifts:
  { sentToday, receivedToday, blockedToday, limitPerDay }, nightMarket, last7: [{ day, ruleVersion,
  refreshes, slots: [{ slot, itemId, item, purchased }] }], last7Summary }`. reason codes: `locked`,
  `band`, `band_relaxed`, `epic_floor`, `rarity`, `never_shown`, `unseen` (days), `new_item`,
  `wishlist`, `set_progress`, `set_piece`, `repeat_relaxed`, `chance` (pct).
  `POST /users/:id/storefront/free-refresh { reason }` · `POST /users/:id/storefront/regenerate { reason }`.
- Night markets: `GET /night-markets?from=&days=` -> `{ defaults, open, upcoming: [{ id, auto, status,
  mode, startsAt, endsAt, cards, flips, discountMin, discountMax, skew, eligibility, note }], past: [{ id,
  startsAt, endsAt, auto, report }], distribution: [{ pct, share }], eligibleUsers, forecast }` ·
  `POST /night-markets { startsAt, endsAt|durationHours, mode?: "scheduled"|"random" (windowStart,
  windowEnd)|"manual", cards?, flips?, discountMin?, discountMax?, skew?, eligibility?: { minAccountDays,
  premiumOnly }, note? }` · `PATCH /night-markets/:id` (an `auto-YYYY-MM-DD` id creates an override) ·
  `POST /night-markets/:id/skip { reason }` · `DELETE /night-markets/:id` · `POST /night-markets/open-now
  { reason, durationHours?, ... }` -> `{ night, undoUntil }` (5 min) · `POST /night-markets/:id/undo` ·
  `POST /night-markets/preview { userId?, cards?, discountMin?, discountMax?, skew?, eligibility? }` ->
  `{ seed, cards: [{ index, itemId, item, hint, rarity, discountPct, listPrice, price }], distribution,
  eligibleUsers }` · `GET /night-markets/:id/report` -> `{ participants, flips, purchases, revenue,
  discountGiven, conversionPct, avgDiscountPct, byHour }`.
- Limits: `GET /limits` -> `{ limits: { refresh: { price, perDay, premiumFree, streakDays }, gifts: {
  enabled, frozen, perDay, perRecipientDay, receivePerDay, minAccountDaysSend, minAccountDaysSetBuy,
  maxMessage, maxScheduleDays, ringDetection, ringWindowDays }, purchases: { refundMinutes,
  partialLockDays, setDiscountMin, setDiscountMax, actionUndoMinutes }, nightMarket: { enabled, weekdays,
  startHour, durationHours, cards, flips, keepMax, discountMin, discountMax, skew, coOpenBonus } },
  version, updatedAt, updatedBy, prev, changes, undo: { until }|null, usage, openFlags, blockedMessages:
  [{ code, vars }] }` · `PUT /limits { limits (partial) | refresh/gifts/..., reason }` -> `{ limits,
  version, prev, changes, undoUntil }` · `POST /limits/undo` (10 min) · `POST /limits/impact { gifts }`
  -> `{ day, gifts, current, proposed: { total, blocked, blockedAmount, byCode }, delta }` ("what if
  yesterday") · `POST /gifts/freeze { frozen, reason }` · `GET /gifts/flags` -> `{ flags: [{ id, giftId,
  kind: "ring"|"ping_pong", status, amount, createdAt, users, edges: [{ from, to, amount, at }],
  resolution }] }` · `POST /gifts/flags/:id/resolve { action: "dismiss"|"freeze", reason }`.
- Timeline: `GET /timeline?from=&days=14` -> `{ from, days, lanes: { rules, sets, nights, events,
  revenue: [{ day, revenue, sales }] }, clashes: [{ code: "two_sets_same_day"|"legendary_density"|
  "too_many_live_sets"|"rule_switch_during_night"|"night_on_launch_day"|"launch_during_event", severity:
  "warn"|"info", day, refs: ["set:<key>"|"rule:<v>"|"night:<id>"|"event:<id>"], vars }], queue,
  slotConversion: [{ slot, shown, bought, pct }], storefrontToSetPct, liveViewers }` · `GET /queue` ->
  `{ queue: [{ id, kind: "rule_apply"|"set_publish"|"recall_finalize", ref, payload, runAt, inSec }] }` ·
  `POST /queue/:id/cancel` · `POST /timeline/events { title, startsAt, endsAt?, kind?, note? }` ·
  `DELETE /timeline/events/:id`.
- A/B: `GET /ab-tests` -> `{ tests: [{ id, setKey, discountA, discountB, split, status, startsAt, endsAt,
  winner, results: { A, B: { exposures, buyers, purchases, revenue, conversionPct, revenuePerExposure },
  lead, enoughData } }] }` · `POST /ab-tests { setKey, discountA, discountB, split?, startsAt?, endsAt? }`
  (users in arm B see discountB on the set page, stable per user) · `POST /ab-tests/:id/stop { winner?:
  "A"|"B" }` (winner becomes the set discount).
- `GET /audit?limit=&before=` -> `{ entries: [{ id, at, actorId, actorUsername, action: "shop2_*",
  target, meta }] }`.

## Error codes (user)

`not_found`, `not_available`, `sold_out`, `already_owned`, `price_changed`, `insufficient_balance`,
`wallet_frozen`, `refresh_used`, `lock_not_in_storefront`, `lock_disabled`, `hold_token_required`,
`new_account_set`, `already_refunded`, `refund_gift`, `refund_window_closed`, `refund_equipped`,
`refund_not_purchase`, `outfit_limit`, `outfit_name_required`, `item_required`, `wishlist_full`,
`night_closed`, `night_not_eligible`, `card_not_found`, `card_flipped`, `no_flips_left`,
`card_not_flipped`, `keep_limit`, `card_bought`, `recipient_owns`, `gifts_paused`, `gift_self`,
`gift_new_account`, `gift_new_account_set`, `gift_daily_cap`, `gift_recipient_cap`, `gift_receive_cap`,
`gift_message_long`, `gift_bad_time`, `gift_too_far`, `recipient_not_found`, `recipient_unavailable`,
`recipient_not_friend`, `recipient_no_gifts`, `gift_not_recallable`, `gift_opened`, `gift_not_ready`,
`gift_not_opened`, `undo_expired`, `undo_unsupported`, `share_no_recipients`, `share_too_many`,
`share_not_owned`, `rate_limited`. English texts:
`lib/shop2/messages.js` (MESSAGES).

## Server copy

Set theme names (7 languages) and the night reminder text live in `backend/i18n/shop2.js`; set cards
carry `name: { tr, en, de, es, fr, "pt-BR", ru }`. The admin checklist `phone_crop` item carries
`vars: { rule: "banner_focal_right", ratioMin: 3, ratioMax: 3.6 }` (the UI words it).

## Catalog columns (seed)

`shop_items.set_key`, `retired_at`, `i18n` (`{ name: {7}, description: {7} }`), `tags` (text[]). The s2
catalog is every row whose sku starts with `s2-`; retired = `retired_at` set (owners keep it). Until the
s2 rows exist the pool falls back to the active legacy items (`legacyPool: true`).
