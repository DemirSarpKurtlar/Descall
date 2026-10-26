// Selftest: report → block offer step (A2 §4.6).
import assert from "node:assert/strict";
import { reportDoneStep } from "./reportBlockOffer.js";

assert.equal(reportDoneStep(), "offer");
assert.equal(reportDoneStep({ offerBlock: true, alreadyBlocked: false }), "offer");
assert.equal(reportDoneStep({ alreadyBlocked: true }), "thanks", "no offer when already blocked");
assert.equal(reportDoneStep({ offerBlock: false }), "thanks");
console.log("reportBlockOffer selftest OK");
