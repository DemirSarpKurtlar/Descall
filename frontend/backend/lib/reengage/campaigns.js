"use strict";

/**
 * Growth 3B admin console "Yeniden kazanma": campaign list + the selected campaign's
 * workspace, waves, the post-send live window and recall.
 *
 *  - Campaigns: built-in (rules.DEFAULT_CAMPAIGNS) with the DB row on top (status, texts
 *    per language with an "approved" mark, hold-out share, a short log).
 *  - A wave = one sending round. The engine sends at each person's best hour; "Sıradaki
 *    dalgayı şimdi gönder" sends to everyone reachable now after a 30 s undo window.
 *  - Every message is claimed in lifecycle_messages first (unique per person and episode),
 *    so a restart or a second server never sends twice. Win-back messages: at most 1 a day
 *    and 2 a week per person, never in quiet hours, nothing after day 20.
 *  - A hold-out (control) group gets nothing but is measured the same way.
 *  - Recall: unopened pushes are removed (a silent "withdrawn" push), e-mails still in the
 *    queue are not sent; opened ones cannot be undone and the console says so.
 * Mode Kapalı / Kuru çalıştırma / Canlı and "Hepsini duraklat" come from ./mode.
 */

const R = require("./rules");
const store = require("./store");
const audienceLib = require("./audience");
const copy = require("./copy");
const P = require("../reengagePolicy");

const DAY = R.DAY_MS;
const audienceCache = new Map(); // campaignId -> { at, value }
const AUDIENCE_TTL = 2 * 60 * 1000;
const cancelled = new Set(); // wave ids recalled / undone (in this process)
const running = new Set(); // wave ids being dispatched here

function err(code, status = 400, extra = {}) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  Object.assign(e, extra);
  return e;
}

function deps(over = {}) {
  return {
    now: over.now || (() => Date.now()),
    mode: over.mode || (() => require("./mode").sendingMode()),
    push: over.push || (() => require("../webPush")),
    sendEmail: over.sendEmail || ((m) => require("../mailer").sendEmail(m)),
    env: over.env || process.env,
    log: over.log || console,
    emitAdmin:
      over.emitAdmin ||
      ((event, payload) => {
        try {
          require("./io").getIo()?.to?.("admin")?.emit?.(event, payload);
        } catch {
          /* live view only */
        }
      }),
  };
}

/* ---- campaigns ----------------------------------------------------------- */

function mergeCampaign(def, row) {
  const templates = {};
  for (const lang of R.LANGS) {
    const base = copy.defaultTemplate(def.id, lang);
    const over = row?.templates?.[lang] || null;
    const edited = Boolean(over && ["pushTitle", "pushBody", "emailSubject", "emailBody"].some((k) => over[k] != null && over[k] !== base[k]));
    templates[lang] = {
      ...base,
      ...(over || {}),
      edited,
      // Built-in texts are reviewed; an edited text needs its own approval.
      approved: edited ? Boolean(over?.approved) : over?.approved === false ? false : true,
    };
  }
  return {
    id: def.id,
    kind: def.kind,
    order: def.order,
    icon: def.icon,
    channels: row?.config?.channels || def.channels,
    status: R.CAMPAIGN_STATUSES.includes(row?.status) ? row.status : def.status,
    holdoutPct: Number.isFinite(Number(row?.holdout_pct)) ? Number(row.holdout_pct) : 10,
    templates,
    log: Array.isArray(row?.config?.log) ? row.config.log.slice(-50).reverse() : [],
    updatedAt: row?.updated_at || null,
  };
}

async function campaigns() {
  const { ready, rows } = await store.listCampaignRows();
  const by = new Map(rows.map((r) => [r.id, r]));
  return { ready, list: R.DEFAULT_CAMPAIGNS.map((d) => mergeCampaign(d, by.get(d.id))) };
}

async function campaign(id) {
  const def = R.DEFAULT_CAMPAIGNS.find((d) => d.id === id);
  if (!def) throw err("not_found", 404);
  const { rows } = await store.listCampaignRows();
  return mergeCampaign(def, rows.find((r) => r.id === id));
}

async function appendLog(id, entry) {
  const { rows } = await store.listCampaignRows();
  const row = rows.find((r) => r.id === id);
  const config = { ...(row?.config || {}) };
  config.log = [...(Array.isArray(config.log) ? config.log : []), { at: new Date().toISOString(), ...entry }].slice(-50);
  await store.saveCampaignRow(id, { name: id, kind: id, config }, entry.byId || null);
}

/** Change status / hold-out / texts of one language. Returns the merged campaign. */
async function saveCampaign(id, patch = {}, actor = {}) {
  const c = await campaign(id);
  const { rows } = await store.listCampaignRows();
  const row = rows.find((r) => r.id === id) || {};
  const next = { name: id, kind: c.kind, status: row.status || c.status, templates: { ...(row.templates || {}) }, holdout_pct: row.holdout_pct ?? c.holdoutPct, config: { ...(row.config || {}) } };
  const changes = [];
  if (patch.status !== undefined) {
    if (!R.CAMPAIGN_STATUSES.includes(patch.status)) throw err("bad_status");
    if (id === "friend_call" && patch.status === "live") throw err("bad_status");
    next.status = patch.status;
    changes.push({ action: "status", detail: patch.status });
  }
  if (patch.holdoutPct !== undefined) {
    const n = Number(patch.holdoutPct);
    if (!Number.isInteger(n) || n < 0 || n > 50) throw err("bad_holdout");
    next.holdout_pct = n;
    changes.push({ action: "holdout", detail: String(n) });
  }
  if (patch.lang !== undefined) {
    if (!R.LANGS.includes(patch.lang)) throw err("bad_lang");
    const v = R.validateTemplate(patch.template || {});
    if (!v.ok) throw err(v.error, 400, { placeholders: v.placeholders });
    next.templates[patch.lang] = { ...(next.templates[patch.lang] || {}), ...v.template };
    // Editing the text withdraws an earlier approval unless this call approves it.
    if (patch.template && Object.keys(v.template).some((k) => k !== "approved") && v.template.approved === undefined) next.templates[patch.lang].approved = false;
    changes.push({ action: v.template.approved === true && Object.keys(v.template).length === 1 ? "approve" : "template", detail: patch.lang });
  }
  if (patch.channels !== undefined) {
    const ch = (Array.isArray(patch.channels) ? patch.channels : []).filter((x) => x === "push" || x === "email");
    if (!ch.length) throw err("bad_channels");
    next.config.channels = ch;
    changes.push({ action: "channels", detail: ch.join(",") });
  }
  const log = [...(Array.isArray(next.config.log) ? next.config.log : [])];
  for (const ch of changes) log.push({ at: new Date().toISOString(), byId: actor.id || null, by: actor.username || null, reason: patch.reason || null, ...ch });
  next.config.log = log.slice(-50);
  await store.saveCampaignRow(id, next, actor.id || null);
  audienceCache.delete(id);
  return campaign(id);
}

/* ---- audiences ----------------------------------------------------------- */

async function cachedAudience(id, now, channels) {
  const hit = audienceCache.get(id);
  if (hit && now - hit.at < AUDIENCE_TTL) return hit.value;
  const value = await audienceLib.audience(id, { now, channels });
  audienceCache.set(id, { at: now, value });
  return value;
}

/* ---- rendering ----------------------------------------------------------- */

const factsCache = new Map();
async function facts(userId, now) {
  const hit = factsCache.get(userId);
  if (hit && now - hit.at < 10 * 60 * 1000) return hit.value;
  const value = await audienceLib.factsFor(userId, { now, days: 7 }).catch(() => ({ vars: { arkadas_1: "", arkadas_2: "", sunucu: "", sayi: 0, bahsetme: 0 }, faces: [], serverId: null }));
  factsCache.set(userId, { at: now, value });
  if (factsCache.size > 5000) factsCache.clear();
  return value;
}

/** Template of `lang` for sending: edited-but-unapproved texts fall back to the built-in one. */
function textFor(c, lang) {
  const l = R.LANGS.includes(lang) ? lang : copy.langOf(lang);
  const t = c.templates[l] || c.templates.tr;
  if (t.edited && !t.approved) return { ...copy.defaultTemplate(c.id, l), lang: l, fallback: true };
  return { ...t, lang: l, fallback: false };
}

function render(c, lang, f) {
  const t = textFor(c, lang);
  return {
    lang: t.lang,
    pushTitle: R.renderTemplate(t.pushTitle, f.vars),
    pushBody: R.renderTemplate(t.pushBody, f.vars),
    emailSubject: R.renderTemplate(t.emailSubject, f.vars),
    emailBody: R.renderTemplate(t.emailBody, f.vars),
    fallback: t.fallback,
  };
}

function trackUrls(userId, kind, env) {
  const token = R.signTrack(userId, kind, env);
  const api = String(env.PUBLIC_API_URL || env.API_PUBLIC_URL || "").replace(/\/+$/, "");
  const base = api || P.publicOrigin(env);
  return {
    token,
    ackUrl: token ? `${base}/api/reengage/t/d/${encodeURIComponent(token)}` : null,
    click: (path) => (token ? `${base}/api/reengage/t/c/${encodeURIComponent(token)}?to=${encodeURIComponent(path)}` : `${P.publicOrigin(env)}${path}`),
  };
}

/* ---- sending ------------------------------------------------------------- */

async function claimRow(row) {
  const db = store.db();
  let { error } = await db.from("lifecycle_messages").insert(row);
  if (error && String(error.code) === "23505") return "exists";
  if (error) return store.isMissing(error) ? "not_ready" : "error";
  return "claimed";
}

async function markRow(userId, kind, patch) {
  await store.db().from("lifecycle_messages").update(patch).eq("user_id", userId).eq("kind", kind);
}

async function rowRecalled(userId, kind) {
  const { data } = await store.db().from("lifecycle_messages").select("recalled_at").eq("user_id", userId).eq("kind", kind).maybeSingle();
  return Boolean(data?.recalled_at);
}

/**
 * One person in one wave. Returns "sent" | "holdout" | "exists" | "dry_run" | "failed" | "skipped".
 */
async function sendOne(c, entry, wave, d, { test = false } = {}) {
  const now = d.now();
  const u = entry.user;
  const lang = copy.langOf(u.language);
  const kind = test ? `test:${c.id}` : `${c.id}:${entry.episode}`.slice(0, 64);
  const mode = test ? "live" : d.mode();
  if (mode === "off") return "skipped";
  if (!test && R.inHoldout(u.id, c.id, c.holdoutPct)) {
    if (mode === "dry_run") return "holdout";
    await claimRow({ user_id: u.id, kind, channel: entry.push ? "push" : "email", status: "sent", meta: { holdout: true }, campaign: c.id, wave_id: wave?.id || null, lang, holdout: true, sent_at: new Date(now).toISOString() });
    return "holdout";
  }
  if (mode === "dry_run") return "dry_run";
  if (!test) {
    const claimed = await claimRow({ user_id: u.id, kind, channel: entry.push ? "push" : "email", status: "claimed", meta: { channels: [entry.push && "push", entry.email && "email"].filter(Boolean) }, campaign: c.id, wave_id: wave?.id || null, lang, sent_at: new Date(now).toISOString() });
    if (claimed !== "claimed") return claimed === "exists" ? "exists" : "failed";
  }
  const f = c.id === "streak_reminder" ? await streakFacts(entry) : await facts(u.id, now);
  const text = render(c, lang, f);
  const prefix = test ? copy.rt(lang, "push.test") : "";
  const urls = trackUrls(u.id, kind, d.env);
  let ok = false;
  try {
    if (entry.push && text.pushTitle) {
      await d.push().sendGrowthPush([u.id], {
        type: "rg-campaign",
        fromId: f.faces?.[0]?.id || null,
        fromName: f.faces?.[0]?.name || null,
        avatar: f.faces?.[0]?.avatar || null,
        tag: `rg-${c.id}`,
        deepLink: f.serverId ? `/servers/${encodeURIComponent(f.serverId)}` : c.id === "streak_reminder" && entry.peer ? `/?dm=${encodeURIComponent(entry.peer)}` : "/",
        rgKind: kind,
        rgToken: urls.token,
        ackUrl: urls.ackUrl,
        texts: () => ({ title: `${prefix}${text.pushTitle}`, body: text.pushBody }),
        actions: (l) => (f.serverId ? [{ action: "rg_join", title: copy.rt(l, "push.join") }] : []),
        extra: { serverId: f.serverId || null, campaign: c.id },
      });
      ok = true;
    }
    if (entry.email && (await wantsEmail(c, entry))) {
      if (!test && wave && (cancelled.has(wave.id) || (await rowRecalled(u.id, kind)))) return "skipped";
      const mail = await buildEmail(c, entry, text, f, urls, d, { test, lang });
      if (mail) {
        const res = await d.sendEmail({ to: u.email, subject: `${prefix}${mail.subject}`, text: mail.text, html: mail.html, headers: mail.headers });
        ok = ok || Boolean(res?.sent);
        if (res?.sent && !test) await markRow(u.id, kind, { delivered_at: new Date(d.now()).toISOString() });
      }
    }
  } catch (e) {
    d.log.warn("[reengage] campaign send failed:", e?.message || e);
  }
  if (!test) await markRow(u.id, kind, { status: ok ? "sent" : "failed" });
  return ok ? "sent" : "failed";
}

async function wantsEmail(c, entry) {
  if (!entry.email) return false;
  if (c.id === "weekly_digest" || c.id === "inactive14") return true;
  if (c.id === "inactive7" || c.id === "new_quiet") return true;
  return false;
}

async function streakFacts(entry) {
  const { data } = await store.db().from("users").select("id, username, display_name, avatar_url").eq("id", entry.peer).maybeSingle();
  const name = data ? data.display_name || data.username : "";
  return { vars: { arkadas_1: name, arkadas_2: "", sunucu: "", sayi: entry.count || 0, bahsetme: 0 }, faces: data ? [{ id: String(data.id), name, avatar: data.avatar_url || null }] : [], serverId: null };
}

async function buildEmail(c, entry, text, f, urls, d, { test, lang }) {
  const { buildPeopleEmail } = require("../reengageEmail");
  const unsubUrl = P.unsubscribeUrl(entry.user.id, c.id === "weekly_digest" ? "activity" : "lifecycle", d.env);
  const common = { lang, origin: P.publicOrigin(d.env), unsubUrl, trackHref: urls.click };
  if (c.id === "weekly_digest") {
    const data = await require("./digest").digestFor(entry.user.id, { now: d.now(), lang });
    if (!data || (!data.people.length && !data.waiting.length)) return null;
    const subject = text.emailSubject && data.subjectVars.arkadas_1 && data.subjectVars.arkadas_2 && !textFor(c, lang).fallback && textFor(c, lang).edited ? R.renderTemplate(textFor(c, lang).emailSubject, { ...f.vars, ...data.subjectVars }) : null;
    return buildPeopleEmail({ ...common, kind: "digest", ...data, subject });
  }
  if (c.id === "inactive14") {
    const cfg = await store.getConsole();
    const gift = cfg.gift14Amount;
    if (!test && gift > 0) await require("./winback").offerGift(entry.user.id, `inactive14:${entry.episode}`, gift, { now: d.now() });
    const peer = f.faces?.[0] || null;
    return buildPeopleEmail({
      ...common,
      kind: "day14",
      name: entry.user.display_name || entry.user.username,
      faces: f.faces,
      server: f.vars.sunucu,
      count: f.vars.sayi,
      gift,
      peer,
      subject: text.emailSubject || null,
      body: text.emailBody || null,
    });
  }
  return buildPeopleEmail({ ...common, kind: "campaign", subject: text.emailSubject, body: text.emailBody, faces: f.faces });
}

/** Dispatch one wave (after its undo window). */
async function dispatch(c, wave, entries, d) {
  running.add(wave.id);
  const counts = { sent: 0, holdout: 0, dry_run: 0, failed: 0, exists: 0, skipped: 0 };
  try {
    if (wave.undo_until) {
      const wait = Date.parse(wave.undo_until) - d.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const fresh = await store.getWave(wave.id);
      if (!fresh || fresh.status !== "running" || cancelled.has(wave.id)) return counts;
    }
    let i = 0;
    for (const e of entries) {
      if (cancelled.has(wave.id)) break;
      if (d.mode() === "off") break;
      if (i > 0 && i % 20 === 0) {
        const fresh = await store.getWave(wave.id);
        if (!fresh || fresh.status !== "running") break;
        await store.updateWave(wave.id, { sent: counts.sent }).catch(() => null);
        d.emitAdmin("rg:wave", { waveId: wave.id, sent: counts.sent });
      }
      const r = await sendOne(c, e, wave, d);
      counts[r] = (counts[r] || 0) + 1;
      i += 1;
    }
  } finally {
    running.delete(wave.id);
    const sent = wave.dry_run ? counts.dry_run : counts.sent;
    const fresh = await store.getWave(wave.id);
    const done = fresh?.status === "running" ? "done" : fresh?.status || "done";
    await store.updateWave(wave.id, { sent, status: done, finished_at: new Date(d.now()).toISOString() }).catch(() => null);
    d.emitAdmin("rg:wave", { waveId: wave.id, sent, status: done, counts });
  }
  return counts;
}

/** Who is due now (best hour / digest hour / evening), for the engine tick. */
async function dueEntries(c, aud, now) {
  if (c.id === "weekly_digest") {
    return aud.reachable.filter((e) => {
      const clock = R.localClock(e.user.timezone, now);
      return clock.weekday === e.settings.digestDay && clock.hour === e.settings.digestHour;
    });
  }
  if (c.id === "streak_reminder") return aud.reachable.filter((e) => R.localClock(e.user.timezone, now).hour === 20);
  const hist = await store.hourHistograms(aud.reachable.map((e) => e.id), { now });
  return aud.reachable.filter((e) => R.atBestHour(R.bestHour(hist.get(e.id), e.settings), e.user.timezone, now));
}

/**
 * Start a wave. `force` = "Sıradaki dalgayı şimdi gönder" (everyone reachable now, 30 s
 * to undo); otherwise only the people at their hour. Returns the wave (or null).
 */
async function startWave(id, { force = false, actor = null, ...opts } = {}) {
  // opts.undoMs (tests), opts.wait (resolve after the wave is dispatched).
  const d = deps(opts);
  const now = d.now();
  const c = await campaign(id);
  const mode = d.mode();
  if (mode === "off") throw err("mode_off", 409);
  if (id === "friend_call") throw err("auto_only", 409);
  if (!force && !(c.status === "live" || c.status === "auto")) return null;
  const aud = await audienceLib.audience(id, { now, channels: c.channels });
  audienceCache.set(id, { at: now, value: aud });
  const entries = force ? aud.reachable : await dueEntries(c, aud, now);
  if (!entries.length) {
    if (force) throw err("nobody_now", 409, { excluded: aud.excluded });
    return null;
  }
  const label = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(now));
  const wave = await store.createWave({
    campaign_id: id,
    label,
    status: "running",
    audience: entries.length,
    sent: 0,
    started_at: new Date(now).toISOString(),
    undo_until: force ? new Date(now + (Number.isFinite(opts.undoMs) ? opts.undoMs : R.UNDO_MS)).toISOString() : null,
    created_by: actor?.id || null,
    dry_run: mode === "dry_run",
  });
  d.emitAdmin("rg:wave", { waveId: wave.id, campaignId: id, audience: entries.length, status: "running" });
  const run = dispatch(c, wave, entries, d).catch((e) => d.log.warn("[reengage] wave failed:", e?.message || e));
  if (opts.wait) await run;
  return wave;
}

/** Undo within 30 s of "send now". */
async function undoWave(waveId, actor = {}, opts = {}) {
  const d = deps(opts);
  const w = await store.getWave(waveId);
  if (!w) throw err("not_found", 404);
  if (w.status !== "running" || !w.undo_until || Date.parse(w.undo_until) < d.now()) throw err("too_late", 409);
  cancelled.add(waveId);
  await store.updateWave(waveId, { status: "cancelled", finished_at: new Date(d.now()).toISOString(), recalled_by: actor.id || null, recall_reason: "undo" }, { status: "running" });
  d.emitAdmin("rg:wave", { waveId, status: "cancelled" });
  return { ok: true };
}

/** Recall unopened messages of a wave (reason required). */
async function recallWave(waveId, { reason, note = "", actor = {} } = {}, opts = {}) {
  const d = deps(opts);
  if (!R.RECALL_REASONS.includes(reason)) throw err("reason_required");
  const w = await store.getWave(waveId);
  if (!w) throw err("not_found", 404);
  if (w.status === "recalled" || w.status === "cancelled") throw err("already", 409);
  cancelled.add(waveId);
  const now = d.now();
  const { rows } = await store.messageRows({ waveId });
  const real = rows.filter((r) => !r.holdout);
  const opened = real.filter((r) => r.opened_at).length;
  const targets = real.filter((r) => !r.opened_at && !r.recalled_at);
  for (const part of store.chunks(targets.map((r) => r.id))) {
    await store.db().from("lifecycle_messages").update({ recalled_at: new Date(now).toISOString() }).in("id", part).is("opened_at", null);
  }
  const pushIds = targets.filter((r) => r.channel === "push" && r.status === "sent").map((r) => String(r.user_id));
  if (pushIds.length) {
    await d
      .push()
      .sendGrowthPush(pushIds, {
        type: "rg-recall",
        tag: `rg-${w.campaign_id}`,
        silent: true,
        texts: (l) => ({ title: copy.rt(l, "push.recalledTitle"), body: copy.rt(l, "push.recalledBody") }),
      })
      .catch((e) => d.log.warn("[reengage] recall push failed:", e?.message || e));
  }
  await store.updateWave(waveId, {
    status: "recalled",
    recalled_at: new Date(now).toISOString(),
    recall_reason: reason,
    recall_note: String(note || "").slice(0, 300) || null,
    recalled_by: actor.id || null,
  });
  await appendLog(w.campaign_id, { byId: actor.id || null, by: actor.username || null, action: "recall", detail: `${targets.length}`, reason, note: String(note || "").slice(0, 300) || null }).catch(() => null);
  d.emitAdmin("rg:wave", { waveId, status: "recalled", recalled: targets.length });
  return { ok: true, recalled: targets.length, opened, emailQueued: running.has(waveId) };
}

/** "Bana test": the campaign's message to the admin's own devices and inbox. */
async function testSend(id, actor, opts = {}) {
  const d = deps(opts);
  const c = await campaign(id);
  const users = await audienceLib.usersById([actor.id]);
  const u = users.get(String(actor.id));
  if (!u) throw err("not_found", 404);
  const targets = await audienceLib.pushTargets([String(actor.id)]);
  const entry = { id: String(u.id), user: u, episode: "test", push: targets.has(String(u.id)), email: P.hasUsableEmail(u) && c.channels.includes("email"), peer: null, count: 3 };
  const r = await sendOne(c, entry, null, d, { test: true });
  return { ok: r === "sent", push: entry.push, email: entry.email };
}

/* ---- console reads ------------------------------------------------------- */

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** List + headline numbers. */
async function overview(opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const [{ ready, list }, cfg] = await Promise.all([campaigns(), store.getConsole()]);
  const since = new Date(now - 7 * DAY).toISOString();
  const { rows } = await store.messageRows({ since, limit: 50000 });
  const todayStart = now - DAY;
  const today = rows.filter((r) => P.toMs(r.sent_at) >= todayStart && !r.holdout);
  const out = [];
  for (const c of list) {
    const mine = rows.filter((r) => r.campaign === c.id);
    let aud = null;
    try {
      aud = await cachedAudience(c.id, now, c.channels);
    } catch {
      aud = null;
    }
    const real = mine.filter((r) => !r.holdout);
    const lift = R.liftVsHoldout(mine);
    out.push({
      ...c,
      templates: undefined,
      audience: aud ? aud.total : null,
      reachable: aud ? aud.reachable.length + aud.later.length : null,
      sentWeek: real.length,
      sentToday: real.filter((r) => P.toMs(r.sent_at) >= todayStart).length,
      returnRate: lift.rate,
      openRate: pct(real.filter((r) => r.opened_at).length, real.length),
      languagesPending: Object.values(c.templates).filter((t) => !t.approved).length,
    });
  }
  const liftAll = R.liftVsHoldout(rows.filter((r) => r.campaign && r.campaign !== "friend_voice"));
  return {
    ready,
    mode: require("./mode").snapshot(d.env),
    console: cfg,
    today: { sent: today.length, returned: today.filter((r) => r.returned_at).length, net: liftAll.net },
    campaigns: out,
  };
}

/** The selected campaign's workspace. */
async function workspace(id, opts = {}) {
  const d = deps(opts);
  const now = d.now();
  const c = await campaign(id);
  const aud = await cachedAudience(id, now, c.channels).catch(() => ({ total: 0, reachable: [], later: [], excluded: { noDevice: 0, weekly: 0, unsubscribed: 0, quiet: 0 } }));
  const since30 = new Date(now - 30 * DAY).toISOString();
  const { rows } = await store.messageRows({ campaign: id, since: since30, limit: 20000 });
  const week = rows.filter((r) => P.toMs(r.sent_at) >= now - 7 * DAY && !r.holdout);
  const lift = R.liftVsHoldout(rows);
  // Source of day-7 returns: friend call vs system message.
  let sourceCall = null;
  if (id === "inactive7" || id === "friend_call") {
    const [{ rows: calls }, { rows: sys }] = await Promise.all([store.messageRows({ campaign: "friend_call", since: since30 }), store.messageRows({ campaign: "inactive7", since: since30 })]);
    const back = (list) => list.filter((r) => !r.holdout && r.returned_at).length;
    const total = back(calls) + back(sys);
    sourceCall = total ? Math.round((back(calls) / total) * 1000) / 10 : null;
  }
  // Languages: share of the audience and open rate of the last 30 days.
  const audUsers = [...aud.reachable, ...aud.later];
  const langOf = (u) => copy.langOf(u?.language);
  const languages = R.LANGS.map((lang) => {
    const share = audUsers.length ? Math.round((audUsers.filter((e) => langOf(e.user) === lang).length / audUsers.length) * 100) : 0;
    const sent = rows.filter((r) => !r.holdout && copy.langOf(r.lang) === lang);
    return { lang, approved: c.templates[lang].approved, edited: c.templates[lang].edited, share, sent: sent.length, openRate: pct(sent.filter((r) => r.opened_at).length, sent.length) };
  });
  // Best hour of the audience (last 30 days).
  const hist = new Array(24).fill(0);
  const ids = audUsers.slice(0, 500).map((e) => e.id);
  if (ids.length) {
    const h = await store.hourHistograms(ids, { now });
    for (const v of h.values()) v.forEach((n, i) => (hist[i] += n));
  }
  const waves = await store.listWaves({ campaignId: id, limit: 12 });
  const res = R.funnel(rows);
  return {
    campaign: c,
    mode: require("./mode").snapshot(d.env),
    stats: {
      audience: aud.total,
      reachable: aud.reachable.length + aud.later.length,
      reachableNow: aud.reachable.length,
      sentWeek: week.length,
      return48: lift.rate,
      control: lift.control,
      net: lift.net,
      sourceCall,
    },
    excluded: aud.excluded,
    languages,
    bestHours: hist,
    quiet: { start: 23, end: 9 },
    results: { funnel: res, lift, outcomes: require("./tracking").outcomes(rows) },
    waves,
    log: c.log,
  };
}

/** "Kullanıcının göreceği": a real person from the audience (or `userId`) with the rendered texts. */
async function preview(id, { lang = null, userId = null, ...opts } = {}) {
  const d = deps(opts);
  const now = d.now();
  const c = await campaign(id);
  let entry = null;
  if (userId) {
    const users = await audienceLib.usersById([userId]);
    const u = users.get(String(userId));
    if (u) entry = { id: String(u.id), user: u };
  } else {
    const aud = await cachedAudience(id, now, c.channels).catch(() => null);
    entry = aud?.reachable?.[0] || aud?.later?.[0] || null;
  }
  const l = lang && R.LANGS.includes(lang) ? lang : copy.langOf(entry?.user?.language || "tr");
  const f = entry ? await facts(entry.id, now) : { vars: { arkadas_1: "Ece", arkadas_2: "Kaan", sunucu: "Gece Kuşları", sayi: 9, bahsetme: 2 }, faces: [{ name: "Ece" }, { name: "Kaan" }, { name: "Zeynep" }], serverId: null };
  const t = render(c, l, f);
  let bestHour = null;
  let absentDays = null;
  if (entry) {
    const h = await store.hourHistograms([entry.id], { now });
    bestHour = R.bestHour(h.get(entry.id), R.normalizeSettings(null));
    absentDays = entry.absentDays ?? null;
  }
  return {
    lang: l,
    sample: entry
      ? {
          id: entry.id,
          name: entry.user.display_name || entry.user.username,
          avatarUrl: entry.user.avatar_url || null,
          absentDays,
          device: entry.user.signup_os || entry.user.signup_device || null,
          timezone: P.recipientTimeZone(entry.user.timezone),
          bestHour,
        }
      : null,
    push: { title: t.pushTitle, body: t.pushBody, faces: f.faces.slice(0, 3).map((x) => ({ name: x.name, avatarUrl: x.avatar || null })) },
    email: { subject: t.emailSubject, body: t.emailBody },
    fallback: t.fallback,
    vars: f.vars,
  };
}

/** Live tracking window of one wave. */
async function waveLive(waveId) {
  const w = await store.getWave(waveId);
  if (!w) throw err("not_found", 404);
  const { rows } = await store.messageRows({ waveId });
  const f = R.funnel(rows);
  const returners = rows
    .filter((r) => !r.holdout && r.returned_at)
    .sort((a, b) => P.toMs(b.returned_at) - P.toMs(a.returned_at))
    .slice(0, 12);
  const ids = returners.map((r) => String(r.user_id));
  const users = new Map();
  if (ids.length) {
    const { data } = await store.db().from("users").select("id, username, display_name, avatar_url").in("id", ids);
    for (const u of data || []) users.set(String(u.id), u);
  }
  const real = rows.filter((r) => !r.holdout);
  return {
    wave: w,
    counters: f,
    unopened: real.filter((r) => !r.opened_at && !r.recalled_at).length,
    opened: real.filter((r) => r.opened_at).length,
    holdout: rows.filter((r) => r.holdout).length,
    returners: returners.map((r) => {
      const u = users.get(String(r.user_id));
      return { userId: String(r.user_id), name: u ? u.display_name || u.username : null, avatarUrl: u?.avatar_url || null, kind: r.return_kind, at: r.returned_at };
    }),
    canUndo: w.status === "running" && Boolean(w.undo_until) && Date.parse(w.undo_until) > Date.now(),
  };
}

/* ---- engine tick --------------------------------------------------------- */

async function tick(opts = {}) {
  const d = deps(opts);
  const mode = d.mode();
  const summary = { mode, waves: [] };
  if (mode === "off") return summary;
  const { list } = await campaigns();
  for (const c of list) {
    if (c.id === "friend_call") continue;
    if (!(c.status === "live" || c.status === "auto")) continue;
    try {
      const w = await startWave(c.id, { ...opts, force: false });
      if (w) summary.waves.push({ campaign: c.id, wave: w.id, audience: w.audience });
    } catch (e) {
      if (e?.code !== "mode_off") d.log.warn(`[reengage] campaign ${c.id} tick failed:`, e?.message || e);
    }
  }
  // Waves stuck after a restart inside their undo window: close them.
  const stale = await store.listWaves({ limit: 30 });
  for (const w of stale) {
    if (w.status === "running" && !running.has(w.id) && !w.finished_at && d.now() - P.toMs(w.started_at) > 15 * 60 * 1000) {
      await store.updateWave(w.id, { status: "done", finished_at: new Date(d.now()).toISOString() }, { status: "running" }).catch(() => null);
    }
  }
  return summary;
}

function __reset() {
  audienceCache.clear();
  factsCache.clear();
  cancelled.clear();
  running.clear();
}

module.exports = {
  campaigns,
  campaign,
  saveCampaign,
  appendLog,
  startWave,
  undoWave,
  recallWave,
  testSend,
  overview,
  workspace,
  preview,
  waveLive,
  tick,
  sendOne,
  __reset,
};
