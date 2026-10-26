/* 15 Davet et · davet ayrıntısı · 18 Moderasyon (yasaklar + denetim kaydı). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Av, Btn, Chip, Field, Foot, Group, I, Row, Sec, Seg, Spinner } from "./kit";
import { DoneBtn, PageFrame, useHub, useRouteDraft, useRun } from "./hubCore";
import { usePerms } from "./pagesHub";
import { useToast } from "../../../context/ToastContext";
import { copyText } from "../../../lib/copyText";
import { toPublicShareUrl } from "../../../lib/referral";
import { hapticSelection } from "../../../lib/fluid/haptics";
import { createServerInvite, revokeServerInvite, unbanServerMember } from "../../../api/servers";
import {
  INVITE_AGE_OPTIONS, INVITE_USE_OPTIONS, auditCategory, auditRow, groupByDay, inviteActive, inviteAgeLabel, inviteSub, inviteUsesLabel,
  memberName, shortDate,
} from "./hubData";

const prettyUrl = (url) => String(toPublicShareUrl(url) || "").replace(/^https?:\/\//i, "");
const shareUrl = (url) => toPublicShareUrl(url);
const lower = (v) => String(v || "").toLocaleLowerCase("tr");

function creatorName(hub, inv) {
  if (hub.deps.me?.id && String(inv.creatorId) === String(hub.deps.me.id)) return hub.deps.me.displayName || hub.deps.me.username;
  const m = (hub.data.members || []).find((x) => String(x.userId) === String(inv.creatorId));
  return m ? memberName(m) : null;
}
const sameSettings = (inv, st, meId) => (
  String(inv.creatorId) === String(meId) && !inv.channelId && (Number(inv.maxUses) || 0) === (Number(st.maxUses) || 0)
  && (Number(inv.maxAgeSeconds) || 0) === (Number(st.maxAgeSeconds) || 0) && Boolean(inv.temporary) === Boolean(st.temporary)
);

/** "iv" (15): the link card, friends, link settings, active invites. */
export function InvitePage({ route }) {
  const hub = useHub();
  const { s, f, server, data, deps } = hub;
  const p = usePerms(server);
  const { toast } = useToast();
  const [st, setSt] = useRouteDraft(route, { maxAgeSeconds: 604800, maxUses: 0, temporary: false });
  const [link, setLink] = useState(null);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(() => new Set());
  const creating = useRef(null);
  useEffect(() => { if (p.invites) hub.load("invites"); hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const settingsKey = `${st.maxAgeSeconds}|${st.maxUses}|${st.temporary}`;
  // Reuse my live link with these settings; otherwise make one (once per settings combo).
  useEffect(() => {
    if (!p.invites || !Array.isArray(data.invites)) return;
    const hit = data.invites.find((inv) => inviteActive(inv) && sameSettings(inv, st, deps.me?.id));
    if (hit) { setLink(hit); return; }
    if (creating.current === settingsKey) return;
    creating.current = settingsKey;
    setErr("");
    createServerInvite(server.id, { maxAgeSeconds: Number(st.maxAgeSeconds) || 0, maxUses: Number(st.maxUses) || 0, temporary: Boolean(st.temporary) })
      .then((r) => {
        const inv = r?.invite;
        if (!inv) return;
        hub.setData((d) => ({ ...d, invites: [inv, ...(d.invites || []).filter((x) => x.code !== inv.code)] }));
        setLink(inv);
      })
      .catch((e) => { setErr(e?.message || s.inviteNoPerm); creating.current = null; });
  }, [settingsKey, data.invites, p.invites]); // eslint-disable-line react-hooks/exhaustive-deps

  const url = link ? shareUrl(link.url) : "";
  const msg = url ? f("inviteMsg", { server: server?.name, url }) : "";
  const copy = async () => { if (!url) return; await copyText(url); toast(s.copied, "success"); };
  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: server?.name, text: msg, url }); } catch { /* dismissed */ }
      return;
    }
    copy();
  };
  const memberIds = new Set((data.members || []).map((m) => String(m.userId)));
  const friends = (deps.friends || []).filter((fr) => fr?.id && !memberIds.has(String(fr.id))).slice(0, 30);
  const invite = (fr) => {
    if (!url || !deps.onSendDm) return;
    hapticSelection();
    deps.onSendDm(fr.id, msg);
    setSent((x) => new Set(x).add(String(fr.id)));
    toast(s.invited, "success");
  };
  const active = (data.invites || []).filter((inv) => inviteActive(inv));
  const pickAge = () => hub.push({
    id: "pick", title: s.expiry, value: st.maxAgeSeconds,
    options: INVITE_AGE_OPTIONS.map((v) => ({ id: v, t: inviteAgeLabel(v, s) })),
    onPick: (v) => setSt((x) => ({ ...x, maxAgeSeconds: Number(v) })),
  });
  const pickUses = () => hub.push({
    id: "pick", title: s.useLimit, value: st.maxUses,
    options: INVITE_USE_OPTIONS.map((v) => ({ id: v, t: inviteUsesLabel(v, s) })),
    onPick: (v) => setSt((x) => ({ ...x, maxUses: Number(v) })),
  });

  return (
    <PageFrame route={route} title={s.inviteTitle} right={<DoneBtn label={s.done} onClick={hub.close} />}>
      {!p.invites ? <div className="svh-empty">{s.inviteNoPerm}</div> : (
        <>
          <div className="svh-group" style={{ padding: "20px 18px", textAlign: "center", marginTop: 4 }}>
            <div style={{ fontSize: 13, color: "rgba(235,238,255,.5)" }}>{s.yourLink}</div>
            <div style={{ fontSize: 21, fontWeight: 650, margin: "6px 0 14px", letterSpacing: "-.02em", overflowWrap: "anywhere", minHeight: 26 }}>
              {link ? prettyUrl(link.url) : err ? <span className="svh-err" style={{ margin: 0 }}>{err}</span> : <Spinner />}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn style={{ flex: 1, height: 44, fontSize: 16 }} onClick={share} disabled={!link}><I n="share" s={18} /> {s.share}</Btn>
              <Btn variant="gray" style={{ flex: 1, height: 44, fontSize: 16 }} onClick={copy} disabled={!link}><I n="copy" s={18} /> {s.copy}</Btn>
            </div>
          </div>
          {deps.onSendDm ? (
            <>
              <Sec>{s.inviteFriends}</Sec>
              {friends.length ? (
                <Group>
                  {friends.map((fr) => {
                    const done = sent.has(String(fr.id));
                    return (
                      <Row key={fr.id} av={<Av user={fr} s={32} />} t={fr.displayName || fr.username} inset={58}
                        tail={<Btn variant="gray" sm style={{ height: 30, fontSize: 14, padding: "0 14px", color: done ? "rgba(235,238,255,.5)" : "#8FA6FF" }} disabled={done || !link} onClick={() => invite(fr)}>{done ? s.invited : s.inviteBtn}</Btn>} />
                    );
                  })}
                </Group>
              ) : <div className="svh-empty" style={{ padding: "14px 12px" }}>{s.noFriends}</div>}
            </>
          ) : null}
          <Sec>{s.linkSettings}</Sec>
          <Group>
            <Row ico="clock" t={s.expiry} val={inviteAgeLabel(st.maxAgeSeconds, s)} chev onClick={pickAge} />
            <Row ico="users" t={s.useLimit} val={inviteUsesLabel(st.maxUses, s)} chev onClick={pickUses} />
            <Row ico="user" t={s.temporary} tg={Boolean(st.temporary)} onClick={() => { hapticSelection(); setSt((x) => ({ ...x, temporary: !x.temporary })); }} />
          </Group>
          <Sec>{s.activeInvites}</Sec>
          {!Array.isArray(data.invites) ? <Spinner /> : active.length ? (
            <Group>
              {active.map((inv) => (
                <Row key={inv.code} t={inv.code} sub={inviteSub(inv, creatorName(hub, inv), s)} chev onClick={() => hub.push({ id: "inviteDetail", code: inv.code })} />
              ))}
            </Group>
          ) : <div className="svh-empty" style={{ padding: "14px 12px" }}>{s.noInvites}</div>}
        </>
      )}
    </PageFrame>
  );
}

export function InviteDetailPage({ route }) {
  const hub = useHub();
  const { s, server, data } = hub;
  const { toast } = useToast();
  const [run, busy] = useRun();
  const inv = (data.invites || []).find((x) => x.code === route.code);
  if (!inv) return <PageFrame route={route} title={route.code}><div className="svh-empty">{s.noInvites}</div></PageFrame>;
  const revoke = async () => {
    const ok = await run(() => revokeServerInvite(server.id, inv.code), { ok: s.revoked });
    if (!ok) return;
    hub.setData((d) => ({ ...d, invites: (d.invites || []).filter((x) => x.code !== inv.code) }));
    hub.pop();
  };
  return (
    <PageFrame route={route} title={inv.code}>
      <Sec first>{""}</Sec>
      <Group>
        <Row t={s.inviteLink} val={prettyUrl(inv.url)} />
        <Row t={s.expiry} val={inviteAgeLabel(inv.maxAgeSeconds, s)} />
        <Row t={s.useLimit} val={inviteUsesLabel(inv.maxUses, s)} />
        <Row t={s.temporary} val={inv.temporary ? s.on : s.off} />
      </Group>
      <Foot>{inviteSub(inv, creatorName(hub, inv), s)}</Foot>
      <Sec>{""}</Sec>
      <Group>
        <Row t={s.copy} blue center onClick={async () => { await copyText(shareUrl(inv.url)); toast(s.copied, "success"); }} />
        <Row t={s.revoke} red center onClick={revoke} disabled={busy} />
      </Group>
    </PageFrame>
  );
}

/** "mod" (18): Yasaklar · N | Denetim kaydı. */
export function ModerationPage({ route }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const p = usePerms(server);
  const tabs = [p.bans && "bans", p.audit && "audit"].filter(Boolean);
  const tab = tabs.includes(route.tab) ? route.tab : tabs[0];
  useEffect(() => {
    if (tab === "bans") hub.load("bans");
    if (tab === "audit") { hub.load("logs"); hub.load("members"); }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const bans = Array.isArray(data.bans) ? data.bans.length : null;
  return (
    <PageFrame route={route} title={s.moderation}>
      {tabs.length > 1 ? (
        <Seg style={{ margin: "4px 0 4px" }} value={tab} onChange={(v) => { hapticSelection(); hub.updateRoute(route.key, { tab: v }); }}
          options={[{ id: "bans", label: bans == null ? s.bansTab : f("bansN", { n: bans }) }, { id: "audit", label: s.rAudit }]} />
      ) : null}
      {tab === "bans" ? <BansTab /> : tab === "audit" ? <AuditTab route={route} /> : null}
    </PageFrame>
  );
}

function BansTab() {
  const hub = useHub();
  const { s, f, server, data, locale } = hub;
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);
  const needle = lower(q.trim());
  const list = (data.bans || []).filter((b) => !needle || [b.username, b.displayName, b.reason].some((x) => x && lower(x).includes(needle)));
  const unban = async (b) => {
    setBusyId(b.userId);
    try {
      await unbanServerMember(server.id, b.userId);
      hub.setData((d) => ({ ...d, bans: (d.bans || []).filter((x) => String(x.userId) !== String(b.userId)) }));
      toast(s.unbanned, "success");
    } catch (e) {
      toast(e?.message || "Error", "error");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <>
      <Field value={q} onChange={setQ} icon="search" placeholder={s.searchBans} style={{ marginTop: 10 }} />
      {!Array.isArray(data.bans) ? (data.bansError ? <div className="svh-err">{data.bansError}</div> : <Spinner />) : (
        <>
          <Sec>{f("nBanned", { n: data.bans.length })}</Sec>
          {list.length ? (
            <Group>
              {list.map((b) => {
                const name = b.displayName || b.username || "?";
                const sub = [b.reason, b.moderatorDisplayName || b.moderatorUsername, b.createdAt ? shortDate(b.createdAt, locale) : null].filter(Boolean).join(" · ");
                return (
                  <Row key={b.userId} av={<Av user={{ ...b, id: b.userId }} name={name} s={36} />} t={name} sub={sub} inset={62}
                    tail={<Btn variant="gray" sm style={{ height: 30, fontSize: 14, padding: "0 12px", color: "#8FA6FF" }} disabled={busyId === b.userId} onClick={() => unban(b)}>{s.unban}</Btn>} />
                );
              })}
            </Group>
          ) : <div className="svh-empty">{needle ? s.noResults : s.noBans}</div>}
          <Foot>{s.bansFoot}</Foot>
        </>
      )}
    </>
  );
}

const FILTERS = [["all", "fAll"], ["members", "fMembers"], ["roles", "fRoles"], ["channels", "fChannels"], ["server", "fServer"]];

function AuditTab({ route }) {
  const hub = useHub();
  const { s, server, data, locale, dat, gen, acc } = hub;
  const filter = route.filter || "all";
  const names = useMemo(() => {
    const m = new Map();
    for (const x of data.members || []) m.set(String(x.userId), memberName(x));
    for (const b of data.bans || []) m.set(String(b.userId), b.displayName || b.username);
    return m;
  }, [data.members, data.bans]);
  const roleName = (id) => (data.roles || []).find((r) => String(r.id) === String(id))?.name;
  const channelName = (id) => (server?.channels || []).find((c) => String(c.id) === String(id))?.name;
  const logs = (data.logs || []).filter((l) => filter === "all" || auditCategory(l.action) === filter);
  const groups = groupByDay(logs, s, locale);
  return (
    <>
      <div style={{ display: "flex", gap: 8, margin: "12px 0 0", overflowX: "auto", scrollbarWidth: "none" }}>
        {FILTERS.map(([id, k]) => (
          <Chip key={id} on={filter === id} onClick={() => { hapticSelection(); hub.updateRoute(route.key, { filter: id }); }} style={{ flex: "none" }}>{s[k]}</Chip>
        ))}
      </div>
      {!Array.isArray(data.logs) ? (data.logsError ? <div className="svh-err">{data.logsError}</div> : <Spinner />) : groups.length ? groups.map((g) => (
        <div key={g.title}>
          <Sec>{g.title}</Sec>
          <Group>
            {g.items.map((l) => {
              const r = auditRow(l, { s, cases: { dat, gen, acc }, names, roleName, channelName });
              return <Row key={l.id} ico={r.ico} c={r.c} t={r.t} sub={r.sub} val={r.val} />;
            })}
          </Group>
        </div>
      )) : <div className="svh-empty">{s.noLogs}</div>}
    </>
  );
}
