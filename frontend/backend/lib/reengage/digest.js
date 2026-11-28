"use strict";

/**
 * Growth 3B weekly digest "Haftanın insanları": people, not numbers. For each recipient:
 * up to four important people (accounts without any get "people who share your servers"
 * in their first weeks), what each did this week (time in voice and where, a server they
 * started, how often they mentioned you, else messages), what is waiting (friend requests,
 * the latest mention) and the best shared streak. Sent on the account's digest day / hour
 * (default Sunday 11:00 local), e-mail only, with the one-click unsubscribe.
 */

const R = require("./rules");
const store = require("./store");
const copy = require("./copy");

const DAY = R.DAY_MS;

function escLike(s) {
  return String(s || "").replace(/[%_\\]/g, (c) => `\\${c}`);
}

function rangeLabel(lang, now) {
  const tag = lang === "pt-BR" ? "pt-BR" : lang;
  const fmt = (ms, opts) => new Intl.DateTimeFormat(tag, { timeZone: "Europe/Istanbul", ...opts }).format(new Date(ms));
  const start = now - 6 * DAY;
  const sameMonth = fmt(start, { month: "long" }) === fmt(now, { month: "long" });
  return sameMonth ? `${fmt(start, { day: "numeric" })}-${fmt(now, { day: "numeric", month: "long" })}` : `${fmt(start, { day: "numeric", month: "short" })} - ${fmt(now, { day: "numeric", month: "short" })}`;
}

/** Everything one digest needs, in `lang`. */
async function digestFor(userId, { now = Date.now(), lang = "tr" } = {}) {
  const db = store.db();
  const since = new Date(now - 7 * DAY).toISOString();
  const { data: me } = await db.from("users").select("id, username, display_name").eq("id", userId).maybeSingle();
  if (!me) return null;
  const persons = await store.listPersons(userId);
  let peopleIds = (persons.rows || []).filter((r) => r.important).map((r) => String(r.peer_id)).slice(0, 4);
  let sameServers = false;
  if (!peopleIds.length) {
    // New accounts: the people most active in the servers they share.
    sameServers = true;
    const { data: mem } = await db.from("server_members").select("server_id").eq("user_id", userId).limit(50);
    const sids = (mem || []).map((m) => String(m.server_id));
    if (sids.length) {
      const { data: msgs } = await db.from("server_messages").select("sender_id").in("server_id", sids).gte("created_at", since).limit(3000);
      const score = new Map();
      for (const m of msgs || []) if (String(m.sender_id) !== String(userId)) score.set(String(m.sender_id), (score.get(String(m.sender_id)) || 0) + 1);
      peopleIds = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
    }
  }
  const people = [];
  let mentionsTotal = 0;
  if (peopleIds.length) {
    const { data: us } = await db.from("users").select("id, username, display_name, avatar_url").in("id", peopleIds);
    const byId = new Map((us || []).map((u) => [String(u.id), u]));
    const { data: voice } = await db.from("descoin_ledger").select("user_id, meta").in("user_id", peopleIds).eq("reason", "voice_activity").gte("created_at", since).limit(20000);
    const minutes = new Map();
    const topServer = new Map();
    for (const r of voice || []) {
      const id = String(r.user_id);
      minutes.set(id, (minutes.get(id) || 0) + 2);
      const sid = r.meta?.serverId;
      if (sid) {
        const m = topServer.get(id) || new Map();
        m.set(sid, (m.get(sid) || 0) + 1);
        topServer.set(id, m);
      }
    }
    const { data: created } = await db.from("servers").select("id, name, owner_id, created_at").in("owner_id", peopleIds).gte("created_at", since).limit(20);
    const serverIds = new Set();
    for (const m of topServer.values()) for (const sid of m.keys()) serverIds.add(sid);
    const names = new Map();
    if (serverIds.size) {
      const { data: srv } = await db.from("servers").select("id, name").in("id", [...serverIds]);
      for (const s of srv || []) names.set(String(s.id), s.name);
    }
    const { data: ments } = await db
      .from("server_messages")
      .select("sender_id, server_id")
      .in("sender_id", peopleIds)
      .ilike("content", `%@${escLike(me.username)}%`)
      .gte("created_at", since)
      .limit(200);
    const mentionBy = new Map();
    for (const m of ments || []) {
      const v = mentionBy.get(String(m.sender_id)) || { count: 0, server: m.server_id };
      v.count += 1;
      mentionBy.set(String(m.sender_id), v);
    }
    for (const id of peopleIds) {
      const u = byId.get(id);
      if (!u) continue;
      const name = u.display_name || u.username;
      const mins = minutes.get(id) || 0;
      const top = [...(topServer.get(id) || new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const made = (created || []).find((s) => String(s.owner_id) === id);
      const mention = mentionBy.get(id);
      let line;
      let short;
      if (made) {
        const { count } = await db.from("server_members").select("user_id", { count: "exact", head: true }).eq("server_id", made.id);
        line = copy.rt(lang, "mail.lineServer", { server: made.name, members: count || 1 });
        short = line;
      } else if (mins >= 30) {
        const hours = Math.max(1, Math.round(mins / 60));
        short = copy.rt(lang, "mail.lineVoice", { hours });
        line = top && names.get(String(top)) ? `${short} · ${copy.rt(lang, "mail.lineVoiceTop", { server: names.get(String(top)) })}` : short;
      } else if (mention) {
        mentionsTotal += mention.count;
        const { data: srv } = await db.from("servers").select("name").eq("id", mention.server).maybeSingle();
        line = copy.rt(lang, "mail.lineMention", { server: srv?.name || "Descall", count: mention.count });
        short = line;
      } else if (mins > 0) {
        line = copy.rt(lang, "mail.lineVoiceMin", { minutes: mins });
        short = line;
      } else {
        line = copy.rt(lang, "mail.lineQuiet");
        short = line;
      }
      if (mention && !line.includes(String(mention.count))) mentionsTotal += mention.count;
      people.push({ id, name, avatar: u.avatar_url || null, line, short });
    }
  }
  // Waiting: friend requests and the latest mention.
  const waiting = [];
  const { data: reqs } = await db.from("friendships").select("user_id, created_at").eq("friend_id", userId).eq("status", "pending").limit(3);
  if (reqs?.length) {
    const { data: rs } = await db.from("users").select("id, username, display_name, avatar_url").in("id", reqs.map((r) => r.user_id));
    for (const r of rs || []) {
      waiting.push({
        person: { id: String(r.id), name: r.display_name || r.username, avatar: r.avatar_url || null },
        title: copy.rt(lang, "mail.waitingRequest", { name: r.display_name || r.username }),
        sub: "",
        cta: copy.rt(lang, "mail.accept"),
        href: "/friends",
      });
    }
  }
  const { data: lastMention } = await db
    .from("server_messages")
    .select("sender_id, server_id, channel_id, content, created_at")
    .ilike("content", `%@${escLike(me.username)}%`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const lm = lastMention?.[0];
  if (lm && String(lm.sender_id) !== String(userId)) {
    const [{ data: who }, { data: srv }, { data: ch }] = await Promise.all([
      db.from("users").select("id, username, display_name, avatar_url").eq("id", lm.sender_id).maybeSingle(),
      db.from("servers").select("name").eq("id", lm.server_id).maybeSingle(),
      db.from("server_channels").select("name").eq("id", lm.channel_id).maybeSingle(),
    ]);
    if (who) {
      waiting.push({
        person: { id: String(who.id), name: who.display_name || who.username, avatar: who.avatar_url || null },
        title: `${who.display_name || who.username} · ${srv?.name || "Descall"}${ch?.name ? ` #${ch.name}` : ""}`,
        sub: String(lm.content || "").replace(/\s+/g, " ").slice(0, 90),
        cta: copy.rt(lang, "mail.reply"),
        href: `/servers/${encodeURIComponent(lm.server_id)}/${encodeURIComponent(lm.channel_id)}`,
      });
    }
  }
  // Best shared streak.
  let streak = null;
  const { rows: streaks } = await store.streaksOf(userId).catch(() => ({ rows: [] }));
  const today = require("../reengagePolicy").istDay(now);
  const best = streaks.map((s) => ({ s, v: R.streakView(s, today) })).filter((x) => x.v.count > 0).sort((a, b) => b.v.count - a.v.count)[0];
  if (best) {
    const peerId = String(best.s.user_a) === String(userId) ? String(best.s.user_b) : String(best.s.user_a);
    const { data: pu } = await db.from("users").select("id, username, display_name").eq("id", peerId).maybeSingle();
    if (pu) streak = { peer: { id: peerId, name: pu.display_name || pu.username }, count: best.v.count, both: best.v.doneToday };
  }
  return {
    people,
    waiting,
    streak,
    sameServers,
    range: rangeLabel(lang, now),
    counts: { people: people.length, mentions: mentionsTotal, waiting: waiting.length },
    subjectVars: { arkadas_1: people[0]?.name || "", arkadas_2: people[1]?.name || "" },
  };
}

module.exports = { digestFor, rangeLabel };
