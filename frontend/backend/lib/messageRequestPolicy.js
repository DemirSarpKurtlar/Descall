"use strict";

/**
 * Delivery decisions for direct messages and DM calls.
 * Friends are delivered. Everyone else gets a message request (text) or a
 * refusal (calls), unless the server already has an active call to renegotiate.
 */

function planDmSend({ friends = false, blocked = false, self = false } = {}) {
  if (self || blocked) return "deny";
  if (friends) return "deliver";
  return "request";
}

function planCallOffer({ friends = false, blocked = false, activeRenegotiation = false } = {}) {
  if (blocked) return "deny";
  if (friends || activeRenegotiation) return "ring";
  return "deny";
}

module.exports = { planDmSend, planCallOffer };
