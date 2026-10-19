"use strict";
const assert = require("assert");
const m = require("./maintenance");

const H = 3600_000;
const now = Date.parse("2026-10-20T12:00:00Z");
const row = (o = {}) => ({ id: "w", title: "T", message: "M", kind: "planned", platforms: ["web"], starts_at: new Date(now + H).toISOString(), ends_at: new Date(now + 3 * H).toISOString(), announce_minutes: 60, admins_bypass: true, ...o });

assert.equal(m.statusOf(row(), now), "scheduled");
assert.equal(m.statusOf(row(), now + 1.5 * H), "active");
assert.equal(m.statusOf(row(), now + 4 * H), "completed");
assert.equal(m.statusOf(row({ ended_at: new Date(now + 2 * H).toISOString() }), now + 2.1 * H), "completed");
assert.equal(m.statusOf(row({ cancelled_at: new Date(now).toISOString() }), now + 1.5 * H), "cancelled");

// validation
assert.equal(m.validateInput({ startsAt: now + H, endsAt: now, message: "x" }, { now }).code, "end_before_start");
assert.equal(m.validateInput({ startsAt: now - 2 * H, endsAt: now + H, message: "x" }, { now }).code, "start_in_past");
assert.equal(m.validateInput({ startsAt: now + H, endsAt: now + 2 * H, message: " " }, { now }).code, "message_required");
assert.equal(m.validateInput({ startsAt: now + H, endsAt: now + 2 * H, message: "x", platforms: [] }, { now }).code, "no_platforms");
assert.equal(m.validateInput({ startsAt: now + H, endsAt: now + 2 * H, message: "x", announceMinutes: 7 }, { now }).code, "invalid_announce");
const ok = m.validateInput({ startsAt: now + H, endsAt: now + 2 * H, message: "x", platforms: ["ios", "bogus", "web"], kind: "emergency" }, { now });
assert(ok.ok && ok.value.platforms.join() === "web,ios" && ok.value.title === "Acil bakım" && ok.value.announce_minutes === 60);

// public view hides the window until the announcement time, never leaks admin fields
const r = row({ created_by_username: "demir", cancel_reason: "x" });
assert.equal(m.publicView(r, now - H).announced, false);
assert.equal(m.publicView(r, now - H).message, undefined);
const pv = m.publicView(r, now + 1);
assert(pv.announced && pv.message === "M" && !("created_by_username" in pv) && !("createdByUsername" in pv));
assert.equal(m.publicView(row({ announce_minutes: null }), now).announced, false);
assert.equal(m.publicView(row({ announce_minutes: null }), now + 1.5 * H).status, "active");
assert.equal(m.publicView(row(), now + 4 * H), null);

// summary: cards only from data
const empty = m.buildSummary([], { now });
assert.deepEqual(empty, { systemStatus: "operational" });
const past = row({ id: "p", starts_at: new Date(now - 5 * H).toISOString(), ends_at: new Date(now - 4 * H).toISOString(), ended_at: new Date(now - 4.5 * H).toISOString() });
const s = m.buildSummary([row(), past], { now, recentlyActiveUsers: 0 });
assert.equal(s.nextStartsAt, row().starts_at);
assert.equal(s.monthDowntimeMs, 0.5 * H);
assert.equal(s.recentlyActiveUsers, undefined);
assert.equal(m.buildSummary([row()], { now: now + 2 * H }).systemStatus, "maintenance");

// overlap
assert(m.findOverlap([row()], { starts_at: new Date(now + 2 * H).toISOString(), ends_at: new Date(now + 5 * H).toISOString() }, { now }));
assert(!m.findOverlap([row({ cancelled_at: "x" })], { starts_at: new Date(now + 2 * H).toISOString(), ends_at: new Date(now + 5 * H).toISOString() }, { now }));
console.log("maintenance.selftest.cjs: ok");
