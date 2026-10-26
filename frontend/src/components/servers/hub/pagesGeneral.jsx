/* 04 Genel bakış, 16 Topluluk ve Keşif, Kurallar, 19 Bildirimler, Klasör. */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ActionSheet, Chip, Field, Foot, Group, I, Row, Sec, Sq, Toggle, NavText } from "./kit";
import { DoneBtn, PageFrame, useHub, useRouteDraft, useRun } from "./hubCore";
import Cropper from "./Cropper";
import { usePerms, levelLabel } from "./pagesHub";
import { useToast } from "../../../context/ToastContext";
import { uploadFile } from "../../../api/media";
import { readFileAsDataUrl } from "../../../lib/cropImage";
import { updateServer, updateServerNotificationLevel, createServerFolder } from "../../../api/servers";
import { isChannelMuted, setChannelMutedAsync } from "../../../lib/serverChannelMutes";
import { getServerMute, setServerMute, clearServerMute, MUTE_DURATIONS, subscribeServerMutes } from "./serverMute";
import { AFK_TIMEOUT_OPTIONS, VERIFICATION_LEVELS, channelIcon, channelLabel, durationLabel, isTextLike, isVoiceLike, longDate, memberName, rulesList, vanityValid } from "./hubData";
import { hapticSelection } from "../../../lib/fluid/haptics";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VANITY_PREFIX = "descall.com/s/";
export const V_KEYS = { none: "vNone", low: "vLow", medium: "vMedium", high: "vHigh", highest: "vHighest" };

/** Shared "Kaydet" for draft pages; resolves the merged server back into the app. */
function useSaveServer() {
  const hub = useHub();
  const [run, busy] = useRun();
  const save = (patch, opts) => run(async () => {
    const res = await updateServer(hub.server.id, patch);
    hub.deps.onServerUpdated?.(res?.server ? { ...hub.server, ...res.server } : { ...hub.server, ...patch });
    return true;
  }, { ok: hub.s.saved, ...opts });
  return [save, busy];
}

/* ───────────────────────── 04 Genel bakış ───────────────────────── */
export function OverviewPage({ route }) {
  const hub = useHub();
  const { s, server, data, locale, tablet } = hub;
  const { toast } = useToast();
  const base = useMemo(() => ({
    name: server?.name || "", description: server?.description || "", iconUrl: server?.iconUrl || null, bannerUrl: server?.bannerUrl || null,
    systemChannelId: server?.systemChannelId || null, afkChannelId: server?.afkChannelId || null, afkTimeoutSeconds: Number(server?.afkTimeoutSeconds) || 300,
  }), [server]);
  const [d, setD] = useRouteDraft(route, base);
  const [save, busy] = useSaveServer();
  const [crop, setCrop] = useState(null); // { src, kind }
  const [uploading, setUploading] = useState(null);
  const [ask, setAsk] = useState(null); // "icon" | "banner" (choose / remove)
  const iconRef = useRef(null);
  const bannerRef = useRef(null);
  useEffect(() => { hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Object.keys(base).some((k) => String(base[k] ?? "") !== String(d[k] ?? ""));
  const channels = server?.channels || [];
  const chName = (id) => { const c = channels.find((x) => String(x.id) === String(id)); return c ? (isTextLike(c) ? `#${c.name}` : c.name) : s.none; };
  const owner = (data.members || []).find((m) => String(m.userId) === String(server?.ownerId));

  const onSave = async () => {
    if (!dirty || busy || uploading) return;
    const name = d.name.trim();
    if (name.length < 2) { toast(s.nameTooShort, "error"); return; }
    const patch = {};
    for (const k of Object.keys(base)) if (String(base[k] ?? "") !== String(d[k] ?? "")) patch[k] = k === "name" ? name : k === "description" ? (d.description.trim() || null) : d[k];
    const ok = await save(patch);
    if (ok && !tablet) hub.drafts.delete(route.key);
  };

  const pickFile = (kind) => (kind === "icon" ? iconRef : bannerRef).current?.click();
  const onFile = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { toast(s.imageType, "error"); return; }
    if (file.size > 8 * 1024 * 1024) { toast(s.imageSize, "error"); return; }
    if (kind === "icon" && file.type === "image/gif") { upload(file, kind); return; }
    try { setCrop({ src: await readFileAsDataUrl(file), kind }); } catch { toast(s.failed, "error"); }
  };
  const upload = async (file, kind) => {
    setCrop(null);
    setUploading(kind);
    try {
      const up = await uploadFile(file);
      const url = up?.url || up?.mediaUrl;
      if (!url) throw new Error(s.failed);
      setD((x) => ({ ...x, [kind === "icon" ? "iconUrl" : "bannerUrl"]: url }));
    } catch (err) {
      toast(err?.message || s.failed, "error");
    } finally {
      setUploading(null);
    }
  };
  const tapImage = (kind) => {
    const has = kind === "icon" ? d.iconUrl : d.bannerUrl;
    if (!has) pickFile(kind); else setAsk(kind);
  };

  const preview = { ...server, iconUrl: d.iconUrl, name: d.name || server?.name };
  return (
    <PageFrame route={route} title={s.rOverview} right={<DoneBtn label={s.save} onClick={onSave} disabled={!dirty || busy || Boolean(uploading)} />}>
      <input ref={iconRef} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(e) => onFile(e, "icon")} />
      <input ref={bannerRef} type="file" accept={IMAGE_TYPES.join(",")} hidden onChange={(e) => onFile(e, "banner")} />
      <div className="svh-group" style={{ overflow: "hidden" }}>
        <div style={{ height: tablet ? 150 : 118, position: "relative", background: d.bannerUrl ? `url("${d.bannerUrl}") center/cover` : "linear-gradient(120deg,#26315f,#4b3a8c 55%,#1e5a74)" }}>
          <Chip style={{ position: "absolute", right: 10, top: 10, background: "rgba(0,0,0,.35)" }} onClick={() => tapImage("banner")}>
            <I n="img" s={14} /> {uploading === "banner" ? s.uploading : s.changeBanner}
          </Chip>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "0 14px 14px", marginTop: -30 }}>
          <button type="button" className="svh-tap" data-press-scale="1" onClick={() => tapImage("icon")} aria-label={s.changeIcon} style={{ borderRadius: 22, position: "relative" }}>
            <Sq server={preview} s={72} />
          </button>
          <button type="button" className="svh-tap" data-press-scale="1" onClick={() => tapImage("icon")} style={{ paddingBottom: 4, color: "#8FA6FF", fontSize: 15, fontWeight: 500 }}>
            {uploading === "icon" ? s.uploading : s.changeIcon}
          </button>
        </div>
      </div>
      <Sec>{s.secIdentity}</Sec>
      <Group>
        <Row t={s.name} val={d.name} onClick={() => hub.push({ id: "text", title: s.name, value: d.name, required: true, minLength: 2, maxLength: 100, onDone: (v) => setD((x) => ({ ...x, name: v })) })} />
        <Row t={s.description} sub={d.description || s.descPh} chev onClick={() => hub.push({ id: "text", title: s.description, value: d.description, placeholder: s.descPh, multiline: true, rows: 4, maxLength: 500, onDone: (v) => setD((x) => ({ ...x, description: v })) })} />
      </Group>
      <Sec>{s.secSystem}</Sec>
      <Group>
        <Row ico="hash" c="brand" t={s.systemMsgs} val={chName(d.systemChannelId)} chev onClick={() => hub.push({
          id: "pick", title: s.systemMsgs, value: d.systemChannelId || "", sec: s.textChannels,
          options: [{ id: "", t: s.none }, ...channels.filter(isTextLike).map((c) => ({ id: c.id, t: channelLabel(c), ico: channelIcon(c).n, c: channelIcon(c).c }))],
          onPick: (id) => setD((x) => ({ ...x, systemChannelId: id || null })),
        })} />
        <Row ico="volume" c="gray" t={s.afkChannel} val={chName(d.afkChannelId)} chev onClick={() => hub.push({
          id: "pick", title: s.afkChannel, value: d.afkChannelId || "", sec: s.voiceChannels,
          options: [{ id: "", t: s.none }, ...channels.filter((c) => c.type === "voice").map((c) => ({ id: c.id, t: c.name, ico: "volume", c: "green" }))],
          onPick: (id) => setD((x) => ({ ...x, afkChannelId: id || null })),
        })} />
        <Row ico="clock" c="gray" t={s.afkTimeout} val={durationLabel(d.afkTimeoutSeconds, s)} chev onClick={() => hub.push({
          id: "pick", title: s.afkTimeout, value: d.afkTimeoutSeconds,
          options: AFK_TIMEOUT_OPTIONS.map((n) => ({ id: n, t: durationLabel(n, s) })),
          onPick: (id) => setD((x) => ({ ...x, afkTimeoutSeconds: Number(id) })),
        })} />
      </Group>
      <Foot>{s.systemFoot}</Foot>
      <Sec>{s.secQuick}</Sec>
      <Group>
        <Row t={s.createdAt} val={longDate(server?.createdAt, locale)} />
        <Row t={s.owner} val={owner ? memberName(owner) : "…"} />
      </Group>
      <AnimatePresence>
        {crop ? <Cropper key="crop" src={crop.src} kind={crop.kind} onCancel={() => setCrop(null)} onConfirm={(file) => upload(file, crop.kind)} /> : null}
        {ask ? (
          <ActionSheet key="ask" title={ask === "icon" ? s.changeIcon : s.changeBanner} cancel={s.giveUp} onCancel={() => setAsk(null)} actions={[
            { t: s.pickImage, onClick: () => { const k = ask; setAsk(null); pickFile(k); } },
            { t: ask === "icon" ? s.removeIcon : s.removeBanner, color: "#FF6961", onClick: () => { setD((x) => ({ ...x, [ask === "icon" ? "iconUrl" : "bannerUrl"]: null })); setAsk(null); } },
          ]} />
        ) : null}
      </AnimatePresence>
    </PageFrame>
  );
}

/* ───────────────────────── 16 Topluluk ve Keşif ───────────────────────── */
export function CommunityPage({ route }) {
  const hub = useHub();
  const { s, f, server } = hub;
  const p = usePerms(server);
  const { toast } = useToast();
  const base = useMemo(() => ({
    communityEnabled: Boolean(server?.communityEnabled), isPublic: Boolean(server?.isPublic),
    verificationLevel: server?.verificationLevel || "none", vanitySlug: server?.vanitySlug || "",
  }), [server]);
  const [d, setD] = useRouteDraft(route, base);
  const [save, busy] = useSaveServer();
  const rules = rulesList(server?.rulesText).length;
  const members = Number(server?.memberCount) || 1;
  const onSave = async () => {
    const patch = {};
    for (const k of Object.keys(base)) if (base[k] !== d[k]) patch[k] = k === "vanitySlug" ? (d.vanitySlug || null) : d[k];
    if (!Object.keys(patch).length) { if (!hub.tablet) hub.pop(); return; }
    const ok = await save(patch);
    if (ok && !hub.tablet) hub.pop();
  };
  const setPublic = (on) => {
    if (on && (members < 25 || !rules)) { toast(s.discoverNeeds, "error"); return; }
    setD((x) => ({ ...x, isPublic: on }));
  };
  return (
    <PageFrame route={route} title={s.rCommunity} right={<DoneBtn label={s.save} onClick={onSave} disabled={busy} />}>
      <Sec first>{s.secCommunity}</Sec>
      <Group>
        <Row ico="globe" c="green" t={s.communityFeatures} sub={s.communityFeaturesSub} tg={d.communityEnabled} onClick={() => { hapticSelection(); setD((x) => ({ ...x, communityEnabled: !x.communityEnabled })); }} />
        <Row ico="search" c="blue" t={s.discoverable} sub={s.discoverableSub} tg={d.isPublic} disabled={!p.admin && !p.owner} onClick={() => { hapticSelection(); setPublic(!d.isPublic); }} />
      </Group>
      <Foot>{f("communityFoot", { members, rules })}</Foot>
      <Sec>{s.secEntry}</Sec>
      <Group>
        <Row ico="shield" c="yellow" t={s.verification} val={s[V_KEYS[d.verificationLevel] || "vNone"]} chev disabled={!p.admin && !p.owner} onClick={() => hub.push({
          id: "pick", title: s.verification, value: d.verificationLevel,
          options: VERIFICATION_LEVELS.map((v) => ({ id: v, t: s[V_KEYS[v]], sub: s[`${V_KEYS[v]}Sub`] })),
          onPick: (id) => setD((x) => ({ ...x, verificationLevel: id })),
        })} />
        <Row ico="book" c="teal" t={s.rRules} val={rules ? f("rRulesVal", { n: rules }) : s.none} chev onClick={() => hub.push({ id: "ru" })} />
        <Row ico="link" c="brand" t={s.vanity} val={d.vanitySlug ? `${VANITY_PREFIX}${d.vanitySlug}` : s.none} chev onClick={() => hub.push({
          id: "text", title: s.vanity, value: d.vanitySlug, pre: VANITY_PREFIX, placeholder: s.vanityPh, maxLength: 32, foot: s.vanityFoot,
          onDone: (v) => {
            const slug = v.toLowerCase();
            if (slug && !vanityValid(slug)) throw new Error(s.vanityFoot);
            setD((x) => ({ ...x, vanitySlug: slug }));
          },
        })} />
      </Group>
      <Sec>{s.secPreview}</Sec>
      <div className="svh-group" style={{ padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <Sq server={server} s={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>{server?.name}</div>
          <div style={{ fontSize: 13, color: "rgba(235,238,255,.55)" }}>{server?.description ? f("previewMeta", { desc: server.description, n: members }) : f("previewMetaNoDesc", { n: members })}</div>
        </div>
      </div>
    </PageFrame>
  );
}

/* ───────────────────────── Kurallar ───────────────────────── */
export function RulesPage({ route }) {
  const hub = useHub();
  const { s, server } = hub;
  const [v, setV] = useRouteDraft(route, server?.rulesText || "");
  const [save, busy] = useSaveServer();
  const onSave = async () => {
    const text = String(v || "").trim();
    if (text === String(server?.rulesText || "").trim()) { if (!hub.tablet || hub.stack.length > 1) hub.pop(); return; }
    const ok = await save({ rulesText: text || null });
    if (ok && (!hub.tablet || hub.stack.length > 1)) hub.pop();
  };
  return (
    <PageFrame route={route} title={s.rulesTitle} right={<DoneBtn label={s.save} onClick={onSave} disabled={busy} />}>
      <Sec first>{s.rulesSec}</Sec>
      <Field value={v} onChange={setV} placeholder={s.rulesPh} multiline rows={9} maxLength={4000} label={s.rulesTitle} />
      <Foot>{s.rulesFoot}</Foot>
    </PageFrame>
  );
}

/* ───────────────────────── 19 Bildirimler ───────────────────────── */
export function useServerMute(serverId) {
  const [, tick] = useState(0);
  useEffect(() => subscribeServerMutes(() => tick((n) => n + 1)), []);
  return getServerMute(serverId);
}
/** Mute for a duration (null = forever) or unmute; keeps the server level in sync. */
export async function applyServerMute(server, durationMs, { onServerUpdated, unmute } = {}) {
  const level = server?.notificationLevel || "all";
  if (unmute) {
    const m = clearServerMute(server.id);
    const back = m?.prevLevel || "all";
    if (back !== level) {
      await updateServerNotificationLevel(server.id, back);
      onServerUpdated?.({ ...server, notificationLevel: back });
    }
    return;
  }
  setServerMute(server.id, { durationMs, prevLevel: level });
  if (level !== "mentions" && level !== "muted") {
    try {
      await updateServerNotificationLevel(server.id, "mentions");
    } catch (err) {
      clearServerMute(server.id);
      throw err;
    }
    onServerUpdated?.({ ...server, notificationLevel: "mentions" });
  }
}
export function muteOptions(s) {
  return [{ id: "h1", t: s.mute1h }, { id: "h8", t: s.mute8h }, { id: "h24", t: s.mute24h }, { id: "forever", t: s.muteForever }];
}
function mutedLabel(m, s, locale) {
  if (!m) return s.off;
  if (m.until == null) return s.mutedForever;
  const d = new Date(m.until);
  const sameDay = d.toDateString() === new Date().toDateString();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return hub_fmt(s.mutedUntil, sameDay ? hm : `${d.getDate()}.${d.getMonth() + 1} ${hm}`);
}
const hub_fmt = (tpl, t) => tpl.replace("{t}", t);

export function NotificationsPage({ route }) {
  const hub = useHub();
  const { s, server, deps } = hub;
  const [run, busy] = useRun();
  const mute = useServerMute(server?.id);
  const [, setTick] = useState(0);
  const level = server?.notificationLevel || "all";
  const setLevel = (lv) => {
    if (lv === level || busy) return;
    hapticSelection();
    run(async () => {
      await updateServerNotificationLevel(server.id, lv);
      if (getServerMute(server.id)) clearServerMute(server.id);
      deps.onServerUpdated?.({ ...server, notificationLevel: lv });
    }, { ok: s.notifSaved });
  };
  const channels = (server?.channels || []).filter((c) => c.type !== "category");
  const muted = channels.filter((c) => isChannelMuted(c.id));
  const toggleChannel = (c, on) => run(async () => {
    await setChannelMutedAsync(c.id, server.id, on);
    deps.onChannelMuteChanged?.();
    setTick((n) => n + 1);
  });
  return (
    <PageFrame route={route} title={s.rNotif}>
      <Sec first>{s.notifyMe}</Sec>
      <Group>
        {["all", "mentions", "muted"].map((lv) => <Row key={lv} t={levelLabel(lv, s)} check={level === lv} onClick={() => setLevel(lv)} />)}
      </Group>
      <Sec>{""}</Sec>
      <Group>
        <Row ico="belloff" c="gray" t={s.muteServer} val={mutedLabel(mute, s, hub.locale)} chev onClick={() => hub.push({
          id: "pick", title: s.muteServer, value: mute ? (mute.until == null ? "forever" : "") : "off",
          options: [...muteOptions(s), { id: "off", t: s.off }],
          onPick: (id) => (id === "off"
            ? (mute ? applyServerMute(server, null, { onServerUpdated: deps.onServerUpdated, unmute: true }) : undefined)
            : applyServerMute(server, MUTE_DURATIONS[id], { onServerUpdated: deps.onServerUpdated })),
        })} />
      </Group>
      <Foot>{s.muteFoot}</Foot>
      <Sec>{s.channelExceptions}</Sec>
      <Group>
        {muted.map((c) => {
          const ic = channelIcon(c);
          return <Row key={c.id} ico={ic.n} c={ic.c} t={channelLabel(c)} val={s.lvlNone} chev onClick={() => hub.push({
            id: "pick", title: channelLabel(c), value: "muted",
            options: [{ id: "default", t: s.serverDefault }, { id: "muted", t: s.lvlNone }],
            onPick: (id) => (id === "default" ? toggleChannel(c, false) : undefined),
          })} />;
        })}
        <Row t={s.addException} blue onClick={() => hub.push({
          id: "pick", title: s.pickChannel, value: null,
          options: channels.filter((c) => !isChannelMuted(c.id)).map((c) => ({ id: c.id, t: channelLabel(c), ico: channelIcon(c).n, c: channelIcon(c).c })),
          onPick: (id) => { const c = channels.find((x) => String(x.id) === String(id)); return c ? toggleChannel(c, true) : undefined; },
        })} />
      </Group>
    </PageFrame>
  );
}

/* ───────────────────────── Klasör ───────────────────────── */
export function FolderPage({ route }) {
  const hub = useHub();
  const { s, server, deps } = hub;
  const [run, busy] = useRun();
  const current = deps.folderIdOf?.(server?.id) ?? server?.folderId ?? null;
  const folders = deps.serverFolders || [];
  const move = (fid) => {
    if (busy || String(fid ?? "") === String(current ?? "")) return;
    hapticSelection();
    run(() => deps.onMoveToFolder?.(fid), { ok: s.folderMoved });
  };
  return (
    <PageFrame route={route} title={s.folderTitle}>
      <Sec first>{""}</Sec>
      <Group>
        <Row ico="folder" c="gray" t={s.noFolder} check={!current} onClick={() => move(null)} />
        {folders.map((fo) => <Row key={fo.id} ico="folder" c="mint" t={fo.name} check={String(current) === String(fo.id)} onClick={() => move(fo.id)} />)}
        <Row t={s.newFolder} blue onClick={() => hub.push({
          id: "text", title: s.newFolder.replace(/…$/, ""), placeholder: s.folderNamePh, required: true, maxLength: 40, doneLabel: s.create,
          onDone: async (name) => {
            const { folder } = await createServerFolder(name);
            if (!folder) throw new Error(s.failed);
            deps.onFolderCreated?.(folder);
            await deps.onMoveToFolder?.(folder.id);
          },
        })} />
      </Group>
      <Foot>{s.folderFoot}</Foot>
    </PageFrame>
  );
}
