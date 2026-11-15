"use strict";

/**
 * English API messages of Market 2.0 error codes. Routes answer
 * { error, errorKey?, errorVars?, code } (lib/apiError.js): the client translates `errorKey`
 * (or `error` when there are no values) through the api.<locale>.js phrase catalog.
 */

const { apiError } = require("../apiError");

const MESSAGES = {
  not_found: "Not found.",
  not_available: "This is not on sale right now.",
  sold_out: "This set is sold out.",
  already_owned: "You already own this.",
  price_changed: "The price changed. Check the new price and try again.",
  insufficient_balance: "Not enough DesCoin.",
  wallet_frozen: "This wallet is frozen.",
  refresh_used: "You already used today's refresh.",
  lock_not_in_storefront: "You can only lock a card from today's storefront.",
  lock_disabled: "Card locking is turned off right now.",
  hold_token_required: "Hold the button to confirm the purchase.",
  new_account_set: "New accounts can buy sets after {days, plural, one {# day} other {# days}}.",
  already_refunded: "This purchase was already refunded.",
  refund_gift: "Gifts cannot be refunded. Recall the gift instead.",
  refund_window_closed: "The refund window has closed.",
  refund_equipped: "Take the item off before refunding it.",
  refund_not_purchase: "Only items you bought can be refunded.",
  outfit_limit: "You can save up to {max} outfits.",
  outfit_name_required: "Give the outfit a name.",
  item_required: "Choose an item or a set.",
  wishlist_full: "Your wishlist is full ({max} items).",
  night_closed: "The night market is closed.",
  night_not_eligible: "You cannot join tonight's night market.",
  card_not_found: "Card not found.",
  card_flipped: "This card is already open.",
  no_flips_left: "No card flips left tonight.",
  card_not_flipped: "Open the card first.",
  keep_limit: "You can keep up to {max} cards.",
  card_bought: "You already bought this card.",
  recipient_owns: "They already own this.",
  gifts_paused: "Gifts are paused right now.",
  gift_self: "You cannot send a gift to yourself.",
  gift_new_account: "New accounts can send gifts after {days, plural, one {# day} other {# days}}.",
  gift_new_account_set: "New accounts can gift sets after {days, plural, one {# day} other {# days}}.",
  gift_daily_cap: "You can send {max, plural, one {# gift} other {# gifts}} a day.",
  gift_recipient_cap: "You can send this person {max, plural, one {# gift} other {# gifts}} a day.",
  gift_receive_cap: "This person cannot receive more gifts today.",
  gift_message_long: "The message can be up to {max} characters.",
  gift_bad_time: "Choose a valid delivery time.",
  gift_too_far: "Gifts can be scheduled up to {days, plural, one {# day} other {# days}} ahead.",
  recipient_not_found: "User not found.",
  recipient_unavailable: "You cannot send a gift to this person.",
  recipient_not_friend: "You can only send gifts to friends.",
  recipient_no_gifts: "This person does not accept gifts.",
  gift_not_recallable: "This gift can no longer be recalled.",
  gift_opened: "This gift was already opened.",
  gift_not_ready: "This gift has not arrived yet.",
  gift_not_opened: "Open the gift first.",
  undo_expired: "This can no longer be undone.",
  undo_unsupported: "This cannot be undone.",
  rate_limited: "Too many attempts. Please try again in a bit.",
  bad_request: "Invalid request.",
  server_error: "Something went wrong. Try again.",
};

/** { status, body } for a thrown shop error (unknown errors -> 500). */
function errorResponse(err) {
  if (err && err.code && MESSAGES[err.code] && err.status && err.status < 500) {
    const extra = { code: err.code };
    if (err.vars && err.vars.price != null) extra.price = err.vars.price;
    return { status: err.status, body: apiError(MESSAGES[err.code], err.vars || undefined, extra) };
  }
  return { status: 500, body: { error: MESSAGES.server_error, code: "server_error" } };
}

module.exports = { MESSAGES, errorResponse };
