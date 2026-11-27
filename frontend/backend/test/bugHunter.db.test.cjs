"use strict";

/**
 * Bug Avcısı migration (20261125d_bug_hunter.sql) against a real Postgres, on top of the
 * special-badge harness: re-runnable, the DesCoin reason CHECK only ever widens (from the
 * ARRAY form, the '{...}' literal form and the ANY (NULL) form a quoted-word rebuild leaves
 * behind), one bonus per confirmation round (unique ledger key), one confirmation per feedback,
 * no new badge row (the existing #11 is used), today's holders seeded as history, cascades. Skips without SPECIAL_BADGES_TEST_PG_URL / PROMO_TEST_PG_URL.
 */

const fs = require("fs");
const path = require("path");
const pg = require("./specialBadgesPg.cjs");

if (!pg.available()) {
  console.log("bugHunter.db.test.cjs: skipped (set SPECIAL_BADGES_TEST_PG_URL to a throwaway Postgres)");
  process.exit(0);
}

const MIGRATION = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261125d_bug_hunter.sql"), "utf8");
const FEEDBACK = `CREATE TABLE IF NOT EXISTS public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  username text, category text, status text DEFAULT 'new', message text, admin_replies jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());`;

function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${msg}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
}
function fails(fn, re, msg) {
  try {
    fn();
  } catch (err) {
    if (re.test(String(err.message))) return;
    throw new Error(`FAIL: ${msg} (wrong error: ${err.message})`);
  }
  throw new Error(`FAIL: ${msg} (no error)`);
}
const reasons = (url) => pg.q(url, "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'descoin_ledger_reason_check'");

function run() {
  for (const form of ["array", "literal", "nulled"]) {
    const db = pg.freshDb(`bh${form}`);
    try {
      const url = db.url;
      pg.q(url, FEEDBACK);
      pg.q(url, "INSERT INTO users (id, username) VALUES ('00000000-0000-4000-8000-000000000010', 'ayse'), ('00000000-0000-4000-8000-000000000011', 'mert')");
      pg.q(url, "INSERT INTO descoin_ledger (user_id, amount, reason) VALUES ('00000000-0000-4000-8000-000000000010', 40, 'daily_claim')");
      if (form === "literal") {
        pg.q(url, "ALTER TABLE descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check; ALTER TABLE descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY ('{voice_activity,daily_claim,admin_grant,admin_revoke,custom_reason}'::text[]))");
      }
      if (form === "nulled") {
        pg.q(url, "ALTER TABLE descoin_ledger DROP CONSTRAINT descoin_ledger_reason_check; ALTER TABLE descoin_ledger ADD CONSTRAINT descoin_ledger_reason_check CHECK (reason = ANY (NULL::text[]))");
      }
      // A holder of #11 before the feature (the 2 production holders): starting history.
      pg.q(url, "SELECT public.special_badge_grant('00000000-0000-4000-8000-000000000010', 'bughunter', 'admin', NULL, 'eski', NULL)");
      pg.q(url, MIGRATION);
      pg.q(url, MIGRATION); // re-runnable
      eq(pg.q(url, "SELECT user_id || ':' || level || ':' || legacy_count || ':' || first_count || ':' || (legacy_since IS NOT NULL) FROM bug_hunter_levels"), "00000000-0000-4000-8000-000000000010:1:1:0:true", `${form}: today's holder seeded once as history`);
      eq(pg.q(url, "SELECT count(*) FROM descoin_ledger WHERE reason LIKE 'bug_bounty%'"), "0", `${form}: no retroactive DesCoin`);
      const def = reasons(url);
      for (const r of ["bug_bounty", "bug_bounty_revoke", "daily_claim", "admin_grant", "voice_activity"]) {
        if (!def.includes(r)) throw new Error(`FAIL: ${form}: ${r} kept/added in ${def}`);
      }
      if (form === "literal" && !def.includes("custom_reason")) throw new Error(`FAIL: literal form keeps its own reasons: ${def}`);
      if (/NULL::text\[\]/.test(def)) throw new Error(`FAIL: ${form}: constraint left open: ${def}`);
      fails(() => pg.q(url, "INSERT INTO descoin_ledger (user_id, amount, reason) VALUES ('00000000-0000-4000-8000-000000000010', 1, 'not_a_reason')"), /descoin_ledger_reason_check/, `${form}: unknown reasons still refused`);

      if (form === "array") {
        // One bonus per round, one take-back per round.
        const ins = (amount, reason, key) => pg.q(url, `INSERT INTO descoin_ledger (user_id, amount, reason, meta) VALUES ('00000000-0000-4000-8000-000000000010', ${amount}, '${reason}', jsonb_build_object('idempotency_key', '${key}'))`);
        ins(100, "bug_bounty", "bug_bounty:f1:1");
        fails(() => ins(100, "bug_bounty", "bug_bounty:f1:1"), /descoin_ledger_bug_bounty_key/, "second bonus of a round refused");
        ins(-100, "bug_bounty_revoke", "bug_bounty:f1:1:revoke");
        ins(100, "bug_bounty", "bug_bounty:f1:2");

        // One confirmation per feedback; severity / credit checked; cascade with the feedback.
        const fid = pg.q(url, "INSERT INTO user_feedback (user_id, message) VALUES ('00000000-0000-4000-8000-000000000010', 'ses') RETURNING id").split("\n")[0];
        const dup = pg.q(url, "INSERT INTO user_feedback (user_id, message) VALUES ('00000000-0000-4000-8000-000000000011', 'ses 2') RETURNING id").split("\n")[0];
        pg.q(url, `INSERT INTO feedback_bug_reports (feedback_id, user_id, severity, credit) VALUES ('${fid}', '00000000-0000-4000-8000-000000000010', 'high', 'first')`);
        fails(() => pg.q(url, `INSERT INTO feedback_bug_reports (feedback_id, user_id, severity, credit) VALUES ('${fid}', '00000000-0000-4000-8000-000000000010', 'low', 'first')`), /feedback_bug_reports_pkey/, "one confirmation per feedback");
        fails(() => pg.q(url, `INSERT INTO feedback_bug_reports (feedback_id, user_id, severity, credit) VALUES ('${dup}', '00000000-0000-4000-8000-000000000011', 'urgent', 'also')`), /severity_check/, "severity checked");
        pg.q(url, `INSERT INTO feedback_bug_reports (feedback_id, user_id, severity, credit, duplicate_of) VALUES ('${dup}', '00000000-0000-4000-8000-000000000011', 'high', 'also', '${fid}')`);
        fails(() => pg.q(url, `UPDATE feedback_bug_reports SET duplicate_of = feedback_id WHERE feedback_id = '${dup}'`), /feedback_bug_reports_not_self/, "a report cannot duplicate itself");
        pg.q(url, `DELETE FROM user_feedback WHERE id = '${fid}'`);
        eq(pg.q(url, "SELECT count(*) || ':' || coalesce(max(duplicate_of::text), 'null') || ':' || max(credit) FROM feedback_bug_reports"), "1:null:also", "root gone with its feedback; the duplicate keeps its credit");
                fails(() => pg.q(url, "UPDATE bug_hunter_levels SET level = 4"), /level_check/, "level 0..3");

        // Badges: nothing added or changed; promo codes keep #11; admins can still grant it.
        eq(pg.q(url, "SELECT count(*) FROM special_badges WHERE id = 'kritikbug'"), "0", "no new badge row");
        eq(pg.q(url, "SELECT name || ':' || tier || ':' || grant_mode FROM special_badges WHERE id = 'bughunter'"), "Bug Hunter:epik:promo", "#11 untouched");
        eq(pg.q(url, "SELECT name || ':' || grant_mode FROM special_badges WHERE id = 'glitch'"), "Glitch:promo", "#32 untouched");
        const ok = pg.json(url, "SELECT public.special_badge_grant('00000000-0000-4000-8000-000000000011', 'glitch', 'admin', NULL, 'bughunt:x', NULL)");
        eq(ok.granted, true, "the admin grant path works for a promo badge");
        eq(pg.q(url, "SELECT relrowsecurity FROM pg_class WHERE relname = 'feedback_bug_reports'"), "t", "RLS on");
      }
    } finally {
      db.drop();
    }
  }
  console.log("bugHunter.db.test.cjs: ok");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
