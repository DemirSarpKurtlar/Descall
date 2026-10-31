"use strict";

// node backend/lib/reportWorkflow.selftest.cjs
// Rapor iş akışı (3.4.0): note cleaning, assign only to admins with Raporlar,
// assignment covers every open report of the account, timeline lines, and the
// "migration not applied" path.
const assert = require("assert");
const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const perms = require("./adminPermissions");
const wf = require("./reportWorkflow");

const T = "22222222-2222-4222-8222-222222222222";
const ALICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let n = 0;
const ok = (name) => console.log(`ok ${++n} - ${name}`);

async function main() {
  // cleanNoteBody
  assert.strictEqual(wf.cleanNoteBody("   "), null);
  assert.strictEqual(wf.cleanNoteBody(null), null);
  assert.strictEqual(wf.cleanNoteBody(" a\r\n\n\n\nb \u0007"), "a\n\nb");
  assert.strictEqual(wf.cleanNoteBody("x".repeat(2500)).length, wf.NOTE_MAX);
  ok("note text is trimmed, control characters dropped, capped");

  const db = createFakeSupabase({
    users: [
      { id: OWNER, username: "admin", is_admin: true, is_super_admin: false, admin_permissions: null },
      { id: ALICE, username: "alice", is_admin: true, is_super_admin: false, admin_permissions: ["reports"] },
      { id: BOB, username: "bob", is_admin: true, is_super_admin: false, admin_permissions: ["shop"] },
      { id: USER, username: "user", is_admin: false, is_super_admin: false, admin_permissions: null },
    ],
    user_reports: [
      { id: "r1", target_id: T, status: "open", assignee_id: null, assigned_at: null },
      { id: "r2", target_id: T, status: "open", assignee_id: null, assigned_at: null },
      { id: "r3", target_id: T, status: "dismissed", assignee_id: null, assigned_at: null },
    ],
    user_report_notes: [],
  });
  wf.__setDbForTests(db);
  perms.__setDbForTests(db);
  const rows = async (t) => (await db.from(t).select("*")).data;

  const list = await wf.listAssignees();
  assert.deepStrictEqual(list.map((a) => a.username), ["admin", "alice"], "only admins who can open Raporlar");
  ok("assignees = admins with the Raporlar section (owner included)");

  await assert.rejects(wf.assignTarget({ targetId: T, assigneeId: BOB, actor: { id: OWNER, username: "admin" } }), (e) => e.code === "NOT_ASSIGNABLE");
  await assert.rejects(wf.assignTarget({ targetId: T, assigneeId: USER, actor: { id: OWNER, username: "admin" } }), (e) => e.code === "NOT_ASSIGNABLE");
  await assert.rejects(wf.assignTarget({ targetId: T, assigneeId: "nope", actor: { id: OWNER, username: "admin" } }), (e) => e.status === 400);
  ok("cannot assign to an admin without Raporlar, a normal user, or a bad id");

  const r = await wf.assignTarget({ targetId: T, assigneeId: ALICE, actor: { id: OWNER, username: "admin" } });
  assert.strictEqual(r.changed, true);
  assert.strictEqual(r.count, 2);
  const after = await rows("user_reports");
  assert.deepStrictEqual(after.filter((x) => x.status === "open").map((x) => x.assignee_id), [ALICE, ALICE]);
  assert.strictEqual(after.find((x) => x.id === "r3").assignee_id, null, "closed reports untouched");
  let notes = await rows("user_report_notes");
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(notes[0].kind, "assign");
  assert.match(notes[0].body, /admin assigned the reports to alice\./);
  const listedAssign = await wf.listNotes(T);
  assert.deepEqual(listedAssign.notes[0].i18n, { body: { key: "bot.report.assignedTo", vars: { actor: "admin", assignee: "alice" } } });
  ok("assign covers every open report of the account and writes a timeline line");

  const again = await wf.assignTarget({ targetId: T, assigneeId: ALICE, actor: { id: OWNER, username: "admin" } });
  assert.strictEqual(again.changed, false);
  assert.strictEqual((await rows("user_report_notes")).length, 1, "no duplicate line");
  ok("re-assigning the same admin is a no-op");

  await wf.assignTarget({ targetId: T, assigneeId: null, actor: { id: ALICE, username: "alice" } });
  assert.ok((await rows("user_reports")).filter((x) => x.status === "open").every((x) => x.assignee_id === null));
  notes = await rows("user_report_notes");
  assert.strictEqual(notes[notes.length - 1].kind, "unassign");
  ok("unassign clears the case owner");

  const note = await wf.insertNote({ targetId: T, reportId: "r1", actor: { id: ALICE, username: "alice" }, body: "  Ekran görüntüsü istendi.  " });
  assert.strictEqual(note.body, "Ekran görüntüsü istendi.");
  assert.strictEqual(note.authorUsername, "alice");
  await assert.rejects(wf.insertNote({ targetId: T, actor: { id: ALICE }, body: "   " }), (e) => e.status === 400);
  const listed = await wf.listNotes(T);
  assert.strictEqual(listed.available, true);
  assert.strictEqual(listed.notes.length, 3);
  ok("notes are saved with the author and listed for the account");

  await wf.noteResolution({ targetId: T, reportId: "r1", actor: { id: ALICE, username: "alice" }, resolution: "ban" });
  assert.match((await rows("user_report_notes")).pop().body, /alice banned the account\./);
  ok("closing a case adds a decision line");

  const none = createFakeSupabase({ user_reports: [{ id: "r9", target_id: T, status: "open" }] }, { missingTables: ["user_report_notes"] });
  wf.__setDbForTests(none);
  const empty = await wf.listNotes(T);
  assert.deepStrictEqual(empty, { notes: [], available: false });
  await assert.rejects(wf.insertNote({ targetId: T, actor: { id: ALICE }, body: "x" }), (e) => e.code === "WORKFLOW_UNAVAILABLE" && e.status === 503);
  ok("without the migration: notes list is empty, writes answer 503");

  console.log(`\n${n} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
