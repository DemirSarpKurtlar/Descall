/* Kanallar list, 06 Kanal oluştur, 07 Kategori oluştur, 08 Kanal ayarları, 09 silme uyarısı, 10 Kanal erişimi. */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { AlertBox, Av, Field, Foot, Group, I, Nav, Row, Scroll, Sec, Tri, NavText } from "./kit";
import { DoneBtn, PageFrame, useHub, useRouteDraft, useRun } from "./hubCore";
import { usePerms } from "./pagesHub";
import { useToast } from "../../../context/ToastContext";
import { getChannelOverrides, putChannelOverride, deleteChannelOverride, getChannelMessageCount } from "../../../api/servers";
import { isChannelMuted, setChannelMutedAsync } from "../../../lib/serverChannelMutes";
import { hapticSelection, hapticWarning } from "../../../lib/fluid/haptics";
import {
  CHANNEL_PERM_ORDER, SLOWMODE_OPTIONS, channelIcon, channelLabel, draftToOverride, isTextLike, memberName,
  normalizeChannelName, orderKeys, overrideChangedCount, roleHex, slowmodeLabel, triState,
} from "./hubData";

const TYPES = [
  { id: "text", ico: "hash", c: "brand", t: "tText", sub: "tTextSub" },
  { id: "announcement", ico: "mega", c: "orange", t: "tAnn", sub: "tAnnSub" },
  { id: "voice", ico: "volume", c: "green", t: "tVoice", sub: "tVoiceSub" },
  { id: "stage", ico: "stage", c: "purple", t: "tStage", sub: "tStageSub" },
];
const byPos = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0);

export function findChannel(server, id) {
  return (server?.channels || []).find((c) => String(c.id) === String(id)) || null;
}
export function everyoneRole(roles) {
  return (roles || []).find((r) => r.isEveryone) || null;
}
export function sortedRoles(roles) {
  return (roles || []).filter((r) => !r.isEveryone).sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0));
}

/** Overrides cache per channel: data.overrides[channelId] = { editableKeys, overrides }. */
export function useOverrides(channelId) {
  const hub = useHub();
  const entry = hub.data.overrides?.[channelId];
  const [err, setErr] = useState(null);
  const reload = async () => {
    try {
      const r = await getChannelOverrides(hub.server.id, channelId);
      hub.setData((d) => ({ ...d, overrides: { ...(d.overrides || {}), [channelId]: { editableKeys: r?.editableKeys || [], overrides: r?.overrides || [] } } }));
      setErr(null);
    } catch (e) {
      setErr(e?.message || "error");
    }
  };
  useEffect(() => { if (channelId && !entry) reload(); }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { entry, reload, err };
}

/** Make a just-created channel private: @everyone can't see it, the creator still can. */
export async function makePrivate(server, channel, roles, me) {
  const everyone = everyoneRole(roles);
  if (!everyone) return;
  await putChannelOverride(server.id, channel.id, { targetType: "role", targetId: everyone.id, permissions: { VIEW_CHANNEL: "deny" } });
  const isOwner = String(server.ownerId) === String(me?.id);
  if (!isOwner && me?.id) {
    await putChannelOverride(server.id, channel.id, { targetType: "member", targetId: me.id, permissions: { VIEW_CHANNEL: "allow" } });
  }
}

/* ───────────────────────── Kanallar ───────────────────────── */
export function ChannelsPage({ route }) {
  const hub = useHub();
  const { s, server } = hub;
  const all = server?.channels || [];
  const cats = all.filter((c) => c.type === "category").sort(byPos);
  const loose = all.filter((c) => c.type !== "category" && !c.parentId).sort(byPos);
  const row = (c) => { const ic = channelIcon(c); return <Row key={c.id} ico={ic.n} c={ic.c} t={channelLabel(c)} chev onClick={() => hub.push({ id: "chEdit", channelId: c.id })} />; };
  return (
    <PageFrame route={route} title={s.rChannels}>
      <Sec first>{""}</Sec>
      <Group>
        <Row t={s.createChannel} blue onClick={() => hub.push({ id: "chCreate" })} />
        <Row t={s.createCategory} blue onClick={() => hub.push({ id: "catCreate" })} />
      </Group>
      {loose.length ? <><Sec>{cats.length ? s.noCategory : s.rChannels}</Sec><Group>{loose.map(row)}</Group></> : null}
      {cats.map((cat) => {
        const kids = all.filter((c) => String(c.parentId) === String(cat.id)).sort(byPos);
        return (
          <div key={cat.id}>
            <Sec>{cat.name}</Sec>
            <Group>
              <Row ico="folder" c="gray" t={cat.name} sub={s.category} chev onClick={() => hub.push({ id: "chEdit", channelId: cat.id })} />
              {kids.map(row)}
            </Group>
          </div>
        );
      })}
      <Foot>{s.channelsFoot}</Foot>
    </PageFrame>
  );
}

/* ───────────────────────── 06 Kanal oluştur ───────────────────────── */
export function ChannelCreatePage({ route }) {
  const hub = useHub();
  const { s, server, deps, data } = hub;
  const p = usePerms(server);
  const cats = (server?.channels || []).filter((c) => c.type === "category").sort(byPos);
  const [d, setD] = useRouteDraft(route, () => ({ type: route.defaultType && route.defaultType !== "category" ? route.defaultType : "text", name: "", parentId: route.parentId ?? null, priv: false }));
  const [run, busy] = useRun();
  const textLike = d.type === "text" || d.type === "announcement";
  const name = d.name.trim();
  const cat = cats.find((c) => String(c.id) === String(d.parentId));
  useEffect(() => { if (!data.roles) hub.load("roles"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    if (!name || busy) return;
    const ok = await run(async () => {
      await deps.onCreateChannel?.({
        name: normalizeChannelName(name, d.type).replace(/^-+|-+$/g, "") || name, type: d.type, parentId: d.parentId || null,
        beforeOpen: d.priv ? (ch) => makePrivate(server, ch, data.roles, deps.me) : undefined,
      });
    }, { ok: s.channelCreated });
    if (ok) hub.close();
  };
  return (
    <PageFrame route={route} title={s.createChannel} right={<DoneBtn label={s.create} onClick={create} disabled={!name || busy} />}>
      <Sec first>{s.channelType}</Sec>
      <Group>
        {TYPES.map((tp) => <Row key={tp.id} ico={tp.ico} c={tp.c} t={s[tp.t]} sub={s[tp.sub]} check={d.type === tp.id} onClick={() => { hapticSelection(); setD((x) => ({ ...x, type: tp.id, name: normalizeChannelName(x.name, tp.id) })); }} />)}
      </Group>
      <Sec>{s.channelName}</Sec>
      <Field value={d.name} onChange={(v) => setD((x) => ({ ...x, name: normalizeChannelName(v, x.type) }))} pre={textLike ? "#" : null} placeholder={s.channelNamePh} autoFocus={!hub.phone} maxLength={100} onEnter={create} label={s.channelName} />
      <Sec>{s.secSettings}</Sec>
      <Group>
        <Row ico="folder" c="gray" t={s.category} val={cat ? cat.name : s.noCategory} chev onClick={() => hub.push({
          id: "pick", title: s.category, value: d.parentId || "",
          options: [{ id: "", t: s.noCategory }, ...cats.map((c) => ({ id: c.id, t: c.name, ico: "folder", c: "gray" }))],
          onPick: (id) => setD((x) => ({ ...x, parentId: id || null })),
        })} />
        <Row ico="lock" c="gray" t={s.privateChannel} sub={s.privateChannelSub} tg={d.priv} disabled={!p.roles} onClick={() => { hapticSelection(); setD((x) => ({ ...x, priv: !x.priv })); }} />
      </Group>
      <Foot>{s.createChannelFoot}</Foot>
    </PageFrame>
  );
}

/* ───────────────────────── 07 Kategori oluştur ───────────────────────── */
export function CategoryCreatePage({ route }) {
  const hub = useHub();
  const { s, server, deps, data } = hub;
  const p = usePerms(server);
  const [d, setD] = useRouteDraft(route, { name: "", priv: false });
  const [run, busy] = useRun();
  const name = d.name.trim();
  useEffect(() => { if (!data.roles) hub.load("roles"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    if (!name || busy) return;
    const ok = await run(() => deps.onCreateChannel?.({
      name, type: "category", parentId: null,
      beforeOpen: d.priv ? (ch) => makePrivate(server, ch, data.roles, deps.me) : undefined,
    }), { ok: s.categoryCreated });
    if (ok) { if (hub.stack.length > 1) hub.pop(); else hub.close(); }
  };
  return (
    <PageFrame route={route} title={s.createCategory} right={<DoneBtn label={s.create} onClick={create} disabled={!name || busy} />}>
      <Sec first>{s.categoryName}</Sec>
      <Field value={d.name} onChange={(v) => setD((x) => ({ ...x, name: v.slice(0, 100) }))} placeholder={s.categoryNamePh} autoFocus={!hub.phone} onEnter={create} label={s.categoryName} />
      <Sec>{""}</Sec>
      <Group>
        <Row ico="lock" c="gray" t={s.privateCategory} sub={s.privateCategorySub} tg={d.priv} disabled={!p.roles} onClick={() => { hapticSelection(); setD((x) => ({ ...x, priv: !x.priv })); }} />
      </Group>
      <Foot>{s.createCategoryFoot}</Foot>
    </PageFrame>
  );
}

/* ───────────────────────── 09 Kanal silme ───────────────────────── */
export function DeleteChannelAlert({ server, channel, onCancel, onDeleted, onDelete, s, f }) {
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(null);
  const { toast } = useToast();
  const isCat = channel?.type === "category";
  const textLike = isTextLike(channel);
  useEffect(() => {
    let live = true;
    hapticWarning();
    if (textLike && server?.id && channel?.id) {
      getChannelMessageCount(server.id, channel.id).then((r) => { if (live) setCount(Number(r?.messageCount)); }).catch(() => {});
    }
    return () => { live = false; };
  }, [server?.id, channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = isCat ? f("delCatTitle", { name: channel?.name }) : textLike ? f("delChTitle", { name: channel?.name }) : f("delVoiceTitle", { name: channel?.name });
  const msg = isCat ? s.delCatMsg : textLike ? (Number.isFinite(count) && count > 0 ? f("delChMsgCount", { n: count.toLocaleString("tr-TR") }) : s.delChMsg) : s.delVoiceMsg;
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(channel.id);
      toast(s.channelDeleted, "success");
      onDeleted?.();
    } catch (err) {
      toast(err?.message || s.failed, "error");
      setBusy(false);
    }
  };
  return <AlertBox title={title} msg={msg} cancel={s.giveUp} confirm={isCat ? s.deleteCategory : s.deleteChannel} onCancel={onCancel} onConfirm={confirm} busy={busy} />;
}

/* ───────────────────────── 08 Kanal ayarları ───────────────────────── */
export function ChannelEditPage({ route }) {
  const hub = useHub();
  const { s, f, server, deps } = hub;
  const p = usePerms(server);
  const ch = findChannel(server, route.channelId);
  const base = useMemo(() => ({
    name: ch?.name || "", topic: ch?.topic || "", parentId: ch?.parentId || null, slowmodeSeconds: Number(ch?.slowmodeSeconds) || 0, nsfw: Boolean(ch?.nsfw),
  }), [ch]);
  const [d, setD] = useRouteDraft(route, base);
  const [run, busy] = useRun();
  const [del, setDel] = useState(false);
  const [, setTick] = useState(0);
  const { entry } = useOverridesMaybe(p.roles ? route.channelId : null);
  useEffect(() => { if (p.roles && !hub.data.roles) hub.load("roles"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ch) {
    return <PageFrame route={route} title={s.secChannel}><Foot>{s.failed}</Foot></PageFrame>;
  }
  const isCat = ch.type === "category";
  const textLike = isTextLike(ch);
  const cats = (server?.channels || []).filter((c) => c.type === "category" && String(c.id) !== String(ch.id)).sort(byPos);
  const cat = cats.find((c) => String(c.id) === String(d.parentId));
  const everyone = everyoneRole(hub.data.roles);
  const priv = entry && everyone ? Boolean(entry.overrides.find((o) => o.targetType === "role" && String(o.targetId) === String(everyone.id))?.deny?.VIEW_CHANNEL) : false;
  const muted = isChannelMuted(ch.id);
  const dirty = Object.keys(base).some((k) => String(base[k] ?? "") !== String(d[k] ?? ""));
  const done = async () => {
    if (busy) return;
    if (dirty) {
      const patch = {};
      for (const k of Object.keys(base)) if (String(base[k] ?? "") !== String(d[k] ?? "")) patch[k] = k === "topic" ? (d.topic.trim() || null) : d[k];
      const ok = await run(() => deps.onUpdateChannel?.(ch.id, patch), { ok: s.saved });
      if (!ok) return;
    }
    if (hub.stack.length > 1) hub.pop(); else hub.close();
  };
  const label = isCat ? ch.name : channelLabel({ ...ch, name: d.name });
  return (
    <PageFrame route={route} title={channelLabel(ch)} right={<DoneBtn label={s.done} onClick={done} disabled={busy} />}>
      <Sec first>{isCat ? s.category : s.secChannel}</Sec>
      <Group>
        <Row t={s.name} val={label} onClick={() => hub.push({
          id: "text", title: s.name, value: d.name, pre: textLike ? "#" : null, required: true, maxLength: 100,
          onDone: (v) => { const n = normalizeChannelName(v, ch.type).replace(/^-+|-+$/g, ""); if (!n) throw new Error(s.failed); setD((x) => ({ ...x, name: n })); },
        })} />
        {textLike ? <Row t={s.topic} sub={d.topic || s.topicPh} chev onClick={() => hub.push({ id: "text", title: s.topic, value: d.topic, placeholder: s.topicPh, multiline: true, rows: 4, maxLength: 1024, onDone: (v) => setD((x) => ({ ...x, topic: v })) })} /> : null}
        {!isCat ? <Row t={s.category} val={cat ? cat.name : s.noCategory} chev onClick={() => hub.push({
          id: "pick", title: s.category, value: d.parentId || "",
          options: [{ id: "", t: s.noCategory }, ...cats.map((c) => ({ id: c.id, t: c.name, ico: "folder", c: "gray" }))],
          onPick: (id) => setD((x) => ({ ...x, parentId: id || null })),
        })} /> : null}
      </Group>
      {textLike ? (
        <>
          <Sec>{s.secChat}</Sec>
          <Group>
            <Row ico="clock" c="orange" t={s.slowmode} val={slowmodeLabel(d.slowmodeSeconds, s)} chev onClick={() => hub.push({
              id: "pick", title: s.slowmode, value: d.slowmodeSeconds,
              options: SLOWMODE_OPTIONS.map((n) => ({ id: n, t: slowmodeLabel(n, s) })),
              onPick: (id) => setD((x) => ({ ...x, slowmodeSeconds: Number(id) })),
            })} />
            <Row ico="eye" c="red" t={s.nsfw} tg={d.nsfw} onClick={() => { hapticSelection(); setD((x) => ({ ...x, nsfw: !x.nsfw })); }} />
          </Group>
        </>
      ) : null}
      <Sec>{s.secAccess}</Sec>
      <Group>
        {p.roles ? <Row ico="shield" c="yellow" t={s.channelAccess} val={entry ? (priv ? s.accessLimited : s.accessEveryone) : null} chev onClick={() => hub.push({ id: "access", channelId: ch.id })} /> : null}
        {!isCat ? <Row ico="bell" c="pink" t={s.channelNotif} val={muted ? s.lvlNone : s.serverDefault} chev onClick={() => hub.push({
          id: "pick", title: s.channelNotif, value: muted ? "muted" : "default",
          options: [{ id: "default", t: s.serverDefault }, { id: "muted", t: s.lvlNone }],
          onPick: async (id) => { const next = id === "muted"; if (next !== isChannelMuted(ch.id)) { await setChannelMutedAsync(ch.id, server.id, next); deps.onChannelMuteChanged?.(); setTick((n) => n + 1); } },
        })} /> : null}
      </Group>
      <Sec>{""}</Sec>
      <Group><Row t={isCat ? s.deleteCategory : s.deleteChannel} red center onClick={() => setDel(true)} /></Group>
      <AnimatePresence>
        {del ? (
          <DeleteChannelAlert key="del" server={server} channel={ch} s={s} f={f} onCancel={() => setDel(false)} onDelete={(id) => deps.onDeleteChannel?.(id)}
            onDeleted={() => { setDel(false); if (hub.stack.length > 1) hub.pop(); else hub.close(); }} />
        ) : null}
      </AnimatePresence>
    </PageFrame>
  );
}
function useOverridesMaybe(channelId) {
  const r = useOverrides(channelId);
  return channelId ? r : { entry: null, reload: () => {} };
}

/* ───────────────────────── 10 Kanal erişimi ───────────────────────── */
function targetsFor(entry, roles, members, pending) {
  const ov = entry?.overrides || [];
  const find = (type, id) => ov.find((o) => o.targetType === type && String(o.targetId) === String(id)) || null;
  const everyone = everyoneRole(roles);
  const list = [];
  if (everyone) list.push({ type: "role", id: everyone.id, everyone: true, name: "@everyone", ov: find("role", everyone.id) });
  for (const r of sortedRoles(roles)) list.push({ type: "role", id: r.id, role: r, name: r.name, ov: find("role", r.id) });
  const byId = new Map((members || []).map((m) => [String(m.userId), m]));
  const mem = ov.filter((o) => o.targetType === "member").map((o) => ({ type: "member", id: o.targetId, member: byId.get(String(o.targetId)), ov: o }));
  if (pending && pending.type === "member" && !mem.some((x) => String(x.id) === String(pending.id))) mem.push({ type: "member", id: pending.id, member: byId.get(String(pending.id)), ov: null });
  for (const m of mem) m.name = m.member ? memberName(m.member) : "?";
  return [...list, ...mem];
}

function TargetRows({ targets, sel, onPick, s, f }) {
  return targets.map((x) => {
    const n = overrideChangedCount(x.ov);
    const sub = x.everyone ? s.everyoneSub : n ? f("nChanged", { n }) : s.noOverride;
    const isSel = sel && sel.type === x.type && String(sel.id) === String(x.id);
    if (x.everyone) return <Row key="everyone" ico="users" c="gray" t="@everyone" sub={sub} chev sel={isSel} onClick={() => onPick(x)} />;
    if (x.type === "role") {
      const c = roleHex(x.role);
      return <Row key={`r${x.id}`} lead={<span className="svh-ico" style={{ background: `${c}22`, color: c }}><I n="shield" s={17} w={2.2} /></span>} t={x.name} sub={sub} chev sel={isSel} onClick={() => onPick(x)} />;
    }
    return <Row key={`m${x.id}`} av={<Av user={x.member ? { ...x.member, id: x.member.userId } : null} name={x.name} s={30} />} t={x.name} sub={n ? f("nChanged", { n }) : s.noOverride} chev sel={isSel} onClick={() => onPick(x)} />;
  });
}

function useAccessData(channelId) {
  const hub = useHub();
  const o = useOverrides(channelId);
  useEffect(() => { if (!hub.data.roles) hub.load("roles"); if (!hub.data.members) hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return o;
}

/** iPhone: target list page. iPad: the split's left column (sel kept in the route). */
export function AccessPage({ route }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const ch = findChannel(server, route.channelId);
  const { entry, reload } = useAccessData(route.channelId);
  const targets = targetsFor(entry, data.roles, data.members, route.pending);
  if (hub.tablet) {
    const sel = route.sel || (targets.find((x) => overrideChangedCount(x.ov) > 0 && !x.everyone) || targets[0]);
    if (!sel) return <PageFrame route={route} title=""><div style={{ display: "grid", placeItems: "center", height: 200 }}><span className="svh-spin" /></div></PageFrame>;
    return <PermPanel route={route} channel={ch} target={targets.find((x) => x.type === sel.type && String(x.id) === String(sel.id)) || sel} entry={entry} reload={reload} />;
  }
  return (
    <PageFrame route={route} title={channelLabel(ch)}>
      <Sec first>{f("accessTitle", { channel: channelLabel(ch) })}</Sec>
      {entry ? <Group><TargetRows targets={targets} s={s} f={f} onPick={(x) => hub.push({ id: "perm", channelId: route.channelId, targetType: x.type, targetId: x.id })} /></Group> : <div style={{ display: "grid", placeItems: "center", height: 120 }}><span className="svh-spin" /></div>}
      <Row t={<><I n="plus" s={18} /> {s.addRoleOrMember}</>} blue style={{ marginTop: 12, padding: "0 6px" }} onClick={() => hub.push({ id: "addTarget", channelId: route.channelId })} />
    </PageFrame>
  );
}

export function AccessSide({ route }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const ch = findChannel(server, route.channelId);
  const { entry } = useOverrides(route.channelId);
  const targets = targetsFor(entry, data.roles, data.members, route.pending);
  const sel = route.sel || (targets.find((x) => overrideChangedCount(x.ov) > 0 && !x.everyone) || targets[0]);
  return (
    <>
      <Nav style={{ height: 18 }} />
      <Scroll style={{ padding: "0 14px" }}>
        <Sec first>{f("accessTitle", { channel: channelLabel(ch) })}</Sec>
        <Group><TargetRows targets={targets} sel={sel} s={s} f={f} onPick={(x) => { hapticSelection(); hub.updateRoute(route.key, { sel: { type: x.type, id: x.id } }); }} /></Group>
        <Row t={<><I n="plus" s={18} /> {s.addRoleOrMember}</>} blue style={{ marginTop: 12, padding: "0 6px" }} onClick={() => hub.push({ id: "addTarget", channelId: route.channelId, accessKey: route.key })} />
      </Scroll>
    </>
  );
}

/** iPhone perm page (pushed). */
export function PermPage({ route }) {
  const hub = useHub();
  const { server, data } = hub;
  const ch = findChannel(server, route.channelId);
  const { entry, reload } = useAccessData(route.channelId);
  const targets = targetsFor(entry, data.roles, data.members, { type: route.targetType, id: route.targetId });
  const target = targets.find((x) => x.type === route.targetType && String(x.id) === String(route.targetId)) || { type: route.targetType, id: route.targetId, name: "", ov: null };
  return <PermPanel route={route} channel={ch} target={target} entry={entry} reload={reload} />;
}

function PermPanel({ route, channel, target, entry, reload }) {
  const hub = useHub();
  const { s, f, server } = hub;
  const keys = orderKeys(entry?.editableKeys || [], CHANNEL_PERM_ORDER);
  const tkey = `${target.type}:${target.id}`;
  const init = () => Object.fromEntries(keys.map((k) => [k, triState(target.ov, k)]));
  const [all, setAll] = useRouteDraft(route, {});
  const draft = all[tkey] || init();
  const setDraft = (k, v) => { hapticSelection(); setAll((x) => ({ ...x, [tkey]: { ...(x[tkey] || init()), [k]: v } })); };
  const [run, busy] = useRun();
  const [rm, setRm] = useState(false);
  const chLabel = channelLabel(channel);
  const save = async () => {
    if (!entry || busy) return;
    const ok = await run(async () => {
      await putChannelOverride(server.id, channel.id, { targetType: target.type, targetId: target.id, permissions: draftToOverride(draft) });
      await reload();
    }, { ok: s.saved });
    if (ok) {
      setAll((x) => { const n = { ...x }; delete n[tkey]; return n; });
      if (hub.phone) hub.pop();
    }
  };
  const remove = async () => {
    const ok = await run(async () => {
      await deleteChannelOverride(server.id, channel.id, target.type, target.id);
      await reload();
    }, { ok: s.saved });
    setRm(false);
    if (ok) {
      setAll((x) => { const n = { ...x }; delete n[tkey]; return n; });
      if (hub.phone) hub.pop();
      else if (route.id === "access") hub.updateRoute(route.key, { sel: null, pending: null });
    }
  };
  const name = target.everyone ? "@everyone" : target.name;
  return (
    <PageFrame route={route} title={name} right={<DoneBtn label={s.save} onClick={save} disabled={!entry || busy} />}>
      <Sec first>{`${name} · ${chLabel.replace(/^# /, "#")}`}</Sec>
      <Foot style={{ margin: "-2px 16px 10px" }}>
        <span style={{ display: "inline-flex", transform: "scale(.8)", verticalAlign: "middle", pointerEvents: "none" }} aria-hidden="true"><Tri value="allow" onChange={() => {}} /></span> {s.triLegend}
      </Foot>
      {entry ? (
        <Group>
          {keys.map((k) => <Row key={k} t={s[`p_${k}`] || k} tail={<Tri value={draft[k] || "inherit"} onChange={(v) => setDraft(k, v)} disabled={busy} labels={[s.triAllow, s.triInherit, s.triDeny]} />} />)}
        </Group>
      ) : <div style={{ display: "grid", placeItems: "center", height: 120 }}><span className="svh-spin" /></div>}
      <Foot>{f("permFoot", { channel: chLabel.replace(/^# /, "#") })}</Foot>
      {target.ov && !target.everyone ? (
        <>
          <Sec>{""}</Sec>
          <Group><Row t={s.removeOverride} red center onClick={() => setRm(true)} /></Group>
        </>
      ) : null}
      <AnimatePresence>
        {rm ? <AlertBox key="rm" title={s.removeOverride} msg={f("removeOverrideMsg", { target: name, channel: chLabel.replace(/^# /, "#") })} cancel={s.giveUp} confirm={s.removeOverride} onCancel={() => setRm(false)} onConfirm={remove} busy={busy} /> : null}
      </AnimatePresence>
    </PageFrame>
  );
}

/** "Rol veya üye ekle": members without an override on this channel. */
export function AddTargetPage({ route }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const { entry } = useAccessData(route.channelId);
  const [q, setQ] = useState("");
  const have = new Set((entry?.overrides || []).filter((o) => o.targetType === "member").map((o) => String(o.targetId)));
  const needle = q.trim().toLocaleLowerCase("tr");
  const list = (data.members || []).filter((m) => !have.has(String(m.userId)))
    .filter((m) => !needle || [m.nickname, m.displayName, m.username].some((x) => x && String(x).toLocaleLowerCase("tr").includes(needle)))
    .slice(0, 80);
  const pick = (m) => {
    hapticSelection();
    if (route.accessKey) {
      hub.updateRoute(route.accessKey, { sel: { type: "member", id: m.userId }, pending: { type: "member", id: m.userId } });
      hub.pop();
    } else {
      hub.replaceTop({ id: "perm", channelId: route.channelId, targetType: "member", targetId: m.userId });
    }
  };
  return (
    <PageFrame route={route} title={s.addRoleOrMember}>
      <Field value={q} onChange={setQ} placeholder={f("searchInN", { n: server?.memberCount || data.members?.length || 1 })} icon="search" style={{ margin: "2px 0 6px" }} />
      <Sec>{s.membersSec}</Sec>
      {list.length ? (
        <Group>{list.map((m) => <Row key={m.userId} av={<Av user={{ ...m, id: m.userId }} s={34} />} inset={60} t={memberName(m)} sub={`@${m.username}`} chev onClick={() => pick(m)} />)}</Group>
      ) : <Foot>{data.members ? s.noResults : s.loading}</Foot>}
    </PageFrame>
  );
}
