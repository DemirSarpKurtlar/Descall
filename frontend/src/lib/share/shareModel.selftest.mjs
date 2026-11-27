// "Paylaş > Descall" share sheet: pure rules (shareModel.js) and the JS send engine
// (shareEngine.js) with a fake API. Run: node src/lib/share/shareModel.selftest.mjs
import assert from "node:assert/strict";
import * as M from "./shareModel.js";
import { createShareEngine, clientIdFor } from "./shareEngine.js";

const NOW = Date.UTC(2026, 10, 24, 12, 0, 0);

// ---- formatting --------------------------------------------------------------------------
assert.equal(M.formatBytes(14.8 * 1024 * 1024, "tr-TR"), "14,8 MB");
assert.equal(M.formatBytes(5.2 * 1024 * 1024, "en-GB"), "5.2 MB");
assert.equal(M.formatBytes(2400, "tr-TR"), "2 KB");
assert.equal(M.formatBytes(150 * 1024 * 1024, "tr-TR"), "150 MB");
assert.equal(M.formatDuration(14000), "0:14");
assert.equal(M.formatDuration(3723000), "1:02:03");
assert.equal(M.relativeDay(new Date(NOW - 86400000).toISOString(), NOW).key, "yesterday");
assert.equal(M.relativeDay(new Date(NOW - 3 * 86400000).toISOString(), NOW).n, 3);
assert.equal(M.relativeDay(new Date(NOW - 60000).toISOString(), NOW).key, "today");
assert.equal(M.relativeDay("x", NOW), null);
assert.equal(M.firstName("Ece Yılmaz"), "Ece");

// ---- items, quality, text ----------------------------------------------------------------
const MB = 1024 * 1024;
const items = [
  { id: "a", mime: "image/heic", name: "IMG_1.HEIC", size: 4 * MB, estimates: { original: 4 * MB, high: 1.2 * MB, saver: 0.4 * MB } },
  { id: "b", mime: "image/jpeg", name: "IMG_2.JPG", size: 3 * MB, estimates: { original: 3 * MB, high: 1 * MB, saver: 0.3 * MB } },
  { id: "c", mime: "video/quicktime", name: "clip.mov", size: 5.4 * MB, durationMs: 14000, estimates: { original: 5.4 * MB, high: 2.5 * MB, saver: 0.8 * MB } },
  { id: "d", kind: "link", url: "https://www.rotarehberi.com.tr/balon?utm_source=x", title: "Kapadokya" },
  { id: "e", mime: "application/pdf", name: "Proje.pdf", size: 2.4 * MB },
];
assert.deepEqual(items.map(M.kindOf), ["image", "image", "video", "link", "file"]);
const tot = M.totals(items, "high");
assert.equal(Math.round(tot.original / MB * 10) / 10, 14.8);
assert.equal(Math.round(tot.chosen / MB * 10) / 10, 7.1, "files keep their size, link is no upload");
assert.equal(tot.savedPercent, 52);
assert.equal(M.totals(items, "original").savedPercent, 0);
assert.equal(M.itemBytes({ mime: "image/png", size: 100, estimates: { high: 500 } }, "high"), 100, "a preset is never bigger than the original");
assert.equal(M.itemProblem({ mime: "application/x-apple-pages", size: 10 }, { allowedMimes: ["application/pdf"] }), "type");
assert.equal(M.itemProblem({ mime: "image/heic", size: 10 }, { allowedMimes: ["image/jpeg"] }), null, "HEIC is converted on the phone");
assert.equal(M.itemProblem({ mime: "video/mp4", size: 200 * MB }), "too_large");
assert.equal(M.hasMedia(items), true);
assert.equal(M.hasMedia([items[4]]), false);
assert.deepEqual(M.countKinds(items), { image: 2, video: 1, file: 1, link: 1, text: 0 });
assert.equal(M.composeText("  Bak  ", items), "Bak\nhttps://www.rotarehberi.com.tr/balon?utm_source=x");
assert.equal(M.composeText("https://a.com", [{ kind: "link", url: "https://a.com" }]), "https://a.com", "a link already in the text is not repeated");

// ---- targets ------------------------------------------------------------------------------
const T = {
  recents: ["dm:ece", "group:og", "channel:foto"],
  friends: [
    { conv: "dm:ece", kind: "dm", id: "ece", name: "Ece Yılmaz", username: "ece", presence: "online", canSend: true, canAttach: true, lastShared: { at: new Date(NOW - 86400000).toISOString(), mediaCount: 3 } },
    { conv: "dm:kaan", kind: "dm", id: "kaan", name: "Kaan Demir", username: "kaan", presence: "idle", canSend: true, canAttach: true },
    { conv: "dm:zeynep", kind: "dm", id: "zeynep", name: "Zeynep Arslan", username: "zeynep", presence: "online", canSend: true, canAttach: true },
  ],
  groups: [{ conv: "group:og", kind: "group", id: "og", name: "Oyun Gecesi", memberCount: 6, onlineCount: 3, canSend: true, canAttach: true }],
  servers: [{
    id: "pk", name: "Pixel Kulübü", sendableCount: 3, channels: [
      { conv: "channel:genel", kind: "channel", id: "genel", name: "genel", serverId: "pk", serverName: "Pixel Kulübü", canSend: true, canAttach: true, slowModeSec: 0 },
      { conv: "channel:foto", kind: "channel", id: "foto", name: "fotoğraflar", serverId: "pk", serverName: "Pixel Kulübü", canSend: true, canAttach: true, slowModeSec: 0, lastShared: { at: new Date(NOW - 86400000).toISOString(), mediaCount: 1 } },
      { conv: "channel:duyuru", kind: "channel", id: "duyuru", name: "duyurular", serverId: "pk", serverName: "Pixel Kulübü", canSend: false, canAttach: false, reason: "announcement" },
      { conv: "channel:oylama", kind: "channel", id: "oylama", name: "oylama", serverId: "pk", serverName: "Pixel Kulübü", canSend: true, canAttach: false, reason: "no_attach", slowModeSec: 30 },
    ],
  }],
};
{
  const all = M.buildSections(T, { tab: "all" });
  assert.deepEqual(all.map((s) => s.key), ["friends", "groups", "channels"]);
  assert.deepEqual(all[2].rows.map((r) => r.id), ["foto"], "all tab lists recent / used channels only");
  const and = M.buildSections(T, { tab: "all", variant: "android", selected: ["dm:ece"] });
  assert.deepEqual(and.map((s) => s.key), ["suggested", "friends"], "android: suggested first, no repeats");
  assert.deepEqual(and[0].rows.map((r) => r.conv), ["dm:ece", "group:og", "channel:foto"]);
  assert.deepEqual(and[1].rows.map((r) => r.id), ["kaan", "zeynep"]);
  const srv = M.buildSections(T, { tab: "servers" });
  assert.equal(srv.length, 1);
  assert.equal(srv[0].rows.length, 4, "the server tree lists locked channels too");
  const q = M.buildSections(T, { tab: "all", query: "FOTO" });
  assert.deepEqual(q.map((s) => s.key), ["channels"]);
  assert.deepEqual(M.buildSections(T, { query: "pixel" })[0].rows.map((r) => r.id), ["genel", "foto", "duyuru", "oylama"], "server name matches its channels");
  assert.deepEqual(M.buildSections(T, { query: "yilmaz" })[0].rows.map((r) => r.id), ["ece"], "accent-folded search");
  assert.deepEqual(M.recentEntries(T).map((e) => e.conv), ["dm:ece", "group:og", "channel:foto"]);

  const idx = M.indexTargets(T);
  assert.deepEqual(M.targetVerdict(idx.get("channel:oylama"), { hasFiles: true }), { ok: false, reason: "no_attach" });
  assert.deepEqual(M.targetVerdict(idx.get("channel:oylama"), { hasFiles: false }), { ok: true, reason: null }, "a link can still go there");
  assert.equal(M.targetVerdict(idx.get("channel:duyuru")).reason, "announcement");
  assert.deepEqual(M.rowSubtitle(idx.get("channel:duyuru")), { key: "reason.announcement" });
  assert.deepEqual(M.rowSubtitle(idx.get("channel:oylama")), { key: "row.slowMode", vars: { seconds: 30 } });
  assert.deepEqual(M.rowSubtitle(idx.get("channel:foto"), { now: NOW }), { key: "row.lastShared.yesterday", vars: { count: 1 } });
  assert.deepEqual(M.rowSubtitle(idx.get("dm:ece"), { now: NOW }), { key: "row.dmShared.yesterday", vars: { presence: "online", count: 3, days: 1 } });
  assert.deepEqual(M.rowSubtitle(idx.get("dm:kaan")), { key: "presence.idle" });
  assert.deepEqual(M.rowSubtitle(idx.get("group:og")), { key: "row.membersOnline", vars: { members: 6, online: 3 } });

  let sel = [];
  for (let i = 0; i < 14; i++) sel = M.toggleTarget(sel, `dm:u${i}`).selected;
  assert.equal(sel.length, M.MAX_TARGETS);
  assert.equal(M.toggleTarget(sel, "dm:x").limited, true);
  assert.equal(M.toggleTarget(["dm:a"], "dm:a").selected.length, 0);

  assert.equal(M.deepLinkFor(idx.get("dm:ece")), "descall://dm/ece");
  assert.equal(M.deepLinkFor(idx.get("channel:foto")), "descall://server/pk/foto");
  assert.equal(M.deepLinkFor(idx.get("group:og")), "descall://group/og");
}

// ---- scheduling, duplicates --------------------------------------------------------------
{
  const morning = new Date(2026, 10, 24, 10, 0, 0).getTime();
  assert.deepEqual(M.schedulePresets(morning).map((p) => p.key), ["inHour", "tonight", "tomorrow"]);
  assert.deepEqual(M.schedulePresets(new Date(2026, 10, 24, 21, 0).getTime()).map((p) => p.key), ["inHour", "tomorrow"]);
  assert.equal(new Date(M.schedulePresets(morning)[2].at).getHours(), 9);
  assert.equal(M.validScheduleTime(NOW + 30000, NOW), false);
  assert.equal(M.validScheduleTime(NOW + 3600000, NOW), true);

  assert.equal(M.normalizeLink("https://www.a.com/x/?b=1&utm_medium=y&a=2#f"), "a.com/x?a=2&b=1");
  assert.equal(M.fingerprint(items[3]), "link:rotarehberi.com.tr/balon");
  assert.equal(M.fingerprint({ kind: "text", text: "x" }), null);
  const hist = M.recordHistory([], { convs: ["dm:ece"], items: [items[3], items[4]], at: NOW - 86400000 });
  assert.equal(hist.length, 2);
  const d = M.duplicates({ history: hist, items: [items[3]], convs: ["dm:ece", "group:og"], now: NOW });
  assert.deepEqual(d, [{ conv: "dm:ece", kind: "link", at: NOW - 86400000 }]);
  const old = M.recordHistory(hist, { convs: ["dm:kaan"], items: [items[4]], at: NOW + 8 * 86400000 });
  assert.equal(old.length, 1, "history forgets after a week");
  const fromServer = M.duplicates({ items: [items[4]], convs: ["group:og"], precheck: { "group:og": { duplicate: { kind: "file", at: new Date(NOW - 3600000).toISOString() } } }, now: NOW });
  assert.equal(fromServer[0].kind, "file");
}

// ---- job reducer and summary -------------------------------------------------------------
{
  const targets = M.buildSections(T, { tab: "all" }).flatMap((s) => s.rows).filter((r) => ["dm:ece", "group:og", "channel:foto"].includes(r.conv));
  let job = M.createJob({ id: "sh-test-1", items, targets, text: "Bak", quality: "high", now: NOW });
  assert.equal(job.items.length, 4, "the link is no upload");
  assert.equal(job.text, "Bak\nhttps://www.rotarehberi.com.tr/balon?utm_source=x");
  job = M.reduceJob(job, { type: "start", at: NOW });
  job = M.reduceJob(job, { type: "upload", index: 0, sentBytes: 0.6 * MB });
  let s = M.summarizeJob(job, { now: NOW + 1000 });
  assert.equal(s.phase, "sending");
  assert.ok(s.percent > 0 && s.percent < 20);
  assert.ok(s.speed > 0 && s.eta > 0);
  for (let i = 0; i < 4; i++) job = M.reduceJob(job, { type: "uploaded", index: i, url: `u${i}`, upload: { mediaType: "image" } });
  assert.equal(M.targetProgress(job, "dm:ece"), 80);
  job = M.reduceJob(job, { type: "targetResult", conv: "dm:ece", results: [0, 1, 2, 3].map((index) => ({ index, status: "sent", messageId: `m${index}` })), textSent: true });
  job = M.reduceJob(job, { type: "targetResult", conv: "group:og", results: [0, 1, 2, 3].map((index) => ({ index, status: "sent", messageId: `g${index}` })) });
  job = M.reduceJob(job, { type: "targetResult", conv: "channel:foto", results: [{ index: 0, status: "sent" }, { index: 1, status: "sent" }, { index: 2, status: "failed", reason: "upload_failed" }, { index: 3, status: "sent" }] });
  assert.equal(M.itemBadge(job, 2), "fail");
  assert.equal(M.itemBadge(job, 0), "ok");
  job = M.reduceJob(job, { type: "finish", at: NOW + 4000 });
  s = M.summarizeJob(job, { now: NOW + 4000 });
  assert.equal(s.phase, "partial");
  assert.equal(s.done, 2);
  assert.equal(s.partialTargets, 1);
  assert.equal(s.itemsOk, 3);
  assert.deepEqual(s.failedItems, [2]);
  assert.equal(job.undoUntil, null, "no undo timer on a partial result");
  assert.deepEqual(M.pendingItemsFor(job, "channel:foto"), [2]);
  assert.deepEqual(M.pendingItemsFor(job, "dm:ece"), []);
  // "Videoyu çıkar, kalanı tamam say"
  const dropped = M.reduceJob(job, { type: "dropFailed", at: NOW + 5000 });
  assert.equal(M.summarizeJob(dropped, { now: NOW + 5000 }).phase, "sent");
  assert.equal(dropped.undoUntil, NOW + 5000 + M.UNDO_SECONDS * 1000);
  assert.equal(M.summarizeJob(dropped, { now: NOW + 7000 }).undoLeft, 8);
  // "Başarısızı tekrar dene": only the failed target goes back to the queue.
  const again = M.reduceJob(job, { type: "retry" });
  assert.deepEqual(again.targets.map((t) => t.status), ["sent", "sent", "queued"]);
  assert.equal(M.summarizeJob(again).phase, "sending");
  const off = M.reduceJob(again, { type: "offline" });
  assert.equal(M.summarizeJob(off).phase, "waiting");
  assert.equal(M.summarizeJob(M.reduceJob(off, { type: "online" })).phase, "sending");
  const undone = M.reduceJob(dropped, { type: "undone" });
  assert.equal(M.summarizeJob(undone).phase, "undone");
}

// ---- engine: upload once, offline wait, idempotent ids, partial, undo -------------------
await (async () => {
  const targets = [
    { conv: "dm:ece", kind: "dm", name: "Ece" },
    { conv: "group:og", kind: "group", name: "Oyun Gecesi" },
    { conv: "channel:foto", kind: "channel", name: "fotoğraflar" },
  ];
  const job0 = M.createJob({ id: "sh-eng-1", items: items.slice(0, 3), targets, text: "Bak", now: NOW });
  const uploads = [];
  const sends = [];
  let online = false;
  let wakeUp;
  let videoFails = 2;
  const api = {
    async upload(it, { onProgress }) {
      if (it.kind === "video" && videoFails-- > 0) { const e = new Error("net"); e.status = 503; throw e; }
      onProgress(it.bytes / 2, it.bytes);
      uploads.push(it.index);
      return { url: `https://f/${it.index}`, mediaType: it.kind, size: it.bytes, originalName: it.name };
    },
    async send(body) {
      sends.push(body);
      if (body.conv === "channel:foto") {
        return { results: body.items.map((_, i) => (i === 2 ? { index: i, status: "failed", reason: "attachment_unavailable" } : { index: i, status: "sent", messageId: `c${i}` })) };
      }
      return { results: body.items.map((_, i) => ({ index: i, status: "sent", messageId: `${body.conv}-${i}` })) };
    },
    async undo(body) { return { ok: true, removed: body.messageIds.length, failed: 0 }; },
  };
  const phases = [];
  const engine = createShareEngine({
    api,
    isOnline: () => online,
    waitOnline: () => new Promise((r) => { wakeUp = r; }),
    sleep: async () => {},
    now: () => NOW,
  });
  const p = engine.run(job0, { emit: (j) => phases.push(M.summarizeJob(j, { now: NOW }).phase) });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(phases.at(-1), "waiting", "offline: the job waits in the queue");
  online = true;
  wakeUp();
  const done = await p;
  assert.deepEqual(uploads, [0, 1, 2], "every attachment uploaded once, the video after two retries");
  assert.equal(sends.length, 3, "one send per conversation");
  assert.equal(sends[0].text, "Bak");
  assert.equal(sends[0].clientId, clientIdFor(job0, 0, [0, 1, 2]));
  assert.ok(/^[A-Za-z0-9_-]{8,80}$/.test(sends[0].clientId));
  assert.deepEqual(sends[0].items.map((x) => x.url), ["https://f/0", "https://f/1", "https://f/2"]);
  const sum = M.summarizeJob(done, { now: NOW });
  assert.equal(sum.phase, "partial");
  assert.deepEqual(done.targets.find((t) => t.conv === "channel:foto").failedItems, [2]);

  // Retry: only the missing video goes to the channel, without the caption again.
  sends.length = 0;
  api.send = async (body) => { sends.push(body); return { results: body.items.map((_, i) => ({ index: i, status: "sent", messageId: "late" })) }; };
  const retried = await engine.run(M.reduceJob(done, { type: "retry" }), {});
  assert.equal(sends.length, 1);
  assert.equal(sends[0].conv, "channel:foto");
  assert.deepEqual(sends[0].items.map((x) => x.url), ["https://f/2"]);
  assert.equal(sends[0].text, "", "the caption went with the first send");
  assert.equal(M.summarizeJob(retried, { now: NOW }).phase, "sent");
  assert.ok(retried.undoUntil > NOW);

  const { job: undone, failed } = await engine.undo(retried);
  assert.equal(failed, 0);
  assert.equal(M.summarizeJob(undone).phase, "undone");

  // Cancel mid-way: what did not go is marked cancelled.
  const ctl = new AbortController();
  const slowApi = { ...api, upload: async (it) => { if (it.index === 1) ctl.abort(); return { url: "x", mediaType: "image" }; } };
  const engine2 = createShareEngine({ api: slowApi, sleep: async () => {}, now: () => NOW });
  const cancelled = await engine2.run(M.createJob({ id: "sh-eng-2", items: items.slice(0, 3), targets, now: NOW }), { signal: ctl.signal });
  assert.ok(cancelled.targets.every((t) => t.reason === "cancelled"));
  assert.equal(M.summarizeJob(cancelled).phase, "failed");
})();

assert.equal(M.errorReason({ offline: true }), "offline");
assert.equal(M.errorReason({ status: 401 }), "signed_out");
assert.equal(M.errorReason({ status: 413 }), "too_large");

console.log("shareModel selftest: ok");
