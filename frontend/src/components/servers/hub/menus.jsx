/* 14 voice member menu, 23 folder long-press menu, 24 server long-press menu. */
import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Av, Dim, I, Layer, MenuBox, MenuItems, PRESENCE_DOT, Sheet, Sq } from "./kit";
import { useSvh } from "./useSvh";
import { useReducedMotionPref } from "./useHubMode";
import { framerSpring, SPRINGS, REDUCED_MOTION_FADE } from "../../../lib/fluid/springs";
import { FOLDER_COLORS, getFolderColor } from "./folderColors";
import { levelLabel } from "./pagesHub";
import { muteOptions } from "./pagesGeneral";
import { getServerMute } from "./serverMute";

const popT = (reduced) => (reduced ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize));

/** Volume slider (0–200 %) on the kit track; pointer drag + keyboard. */
export function VolumeSlider({ value, onChange, label }) {
  const ref = useRef(null);
  const v = Math.max(0, Math.min(200, Number(value) || 0));
  const setFrom = (clientX) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onChange?.(Math.round(pct * 200));
  };
  return (
    <div ref={ref} className="svh-slider" style={{ "--v": `${v / 2}%`, touchAction: "none", cursor: "pointer" }} role="slider" tabIndex={0}
      aria-label={label} aria-valuemin={0} aria-valuemax={200} aria-valuenow={v}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setFrom(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons || e.pointerType === "touch") { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) setFrom(e.clientX); } }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange?.(Math.min(200, v + 5)); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange?.(Math.max(0, v - 5)); }
      }}>
      <b style={{ width: `${v / 2}%` }} />
    </div>
  );
}

/* ───────────────────────── 14 Ses üyesi ───────────────────────── */
export function VoiceMemberMenu({ mode, menu, presence, channels, canMute, canDeafen, canMove, volume, onVolume, onToggleLocalMute,
  screen, onProfile, onMessage, onServerMute, onDeafen, onMove, onDisconnect, onStage, onClose }) {
  const { s, f, locale } = useSvh();
  const reduced = useReducedMotionPref();
  const [moving, setMoving] = useState(false);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);
  const user = menu?.user;
  const isSelf = Boolean(menu?.isSelf);
  const current = channels.find((c) => String(c.id) === String(menu?.channelId));
  const others = channels.filter((c) => String(c.id) !== String(menu?.channelId));
  const micOff = Boolean(user?.muted || user?.serverMuted || user?.selfMuted);
  const name = user?.displayName || user?.username || "";
  const tablet = mode === "tablet";
  const pctLabel = locale === "tr" ? `%${volume}` : `${volume}%`;

  useLayoutEffect(() => {
    if (!tablet) return;
    const el = menuRef.current;
    if (!el) return;
    const W = window.innerWidth, H = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(12, Math.min((menu?.x || 12) + 4, W - w - 12));
    let top = (menu?.y || 12) + 10;
    // #14: when it doesn't fit below, keep the menu beside the pressed member (iOS-style shift) instead of flipping to the top edge.
    if (top + h > H - 12) top = Math.max(12, Math.min((menu?.y || H) - Math.round(h * 0.35), H - h - 12));
    setPos({ left, top });
  }, [tablet, menu?.x, menu?.y, moving]);

  const items = moving
    ? [{ t: s.vMoveTo, i: "chevl", onClick: () => setMoving(false), key: "back" }, ...others.map((c) => ({ key: c.id, t: c.name, i: "volume", onClick: () => { onMove?.(c); onClose(); } }))]
    : [
      !isSelf && onToggleLocalMute ? { t: volume <= 0 ? s.vUnmuteForMe : s.vMuteForMe, i: "micoff", onClick: onToggleLocalMute } : null,
      onProfile ? { t: s.vProfile, i: "user", onClick: () => { onProfile(); onClose(); } } : null,
      !isSelf && onMessage ? { t: s.vMessage, i: "msg", onClick: () => { onMessage(); onClose(); } } : null,
      canMute || canDeafen || canMove ? "-" : null,
      canMute ? { t: user?.serverMuted ? s.vServerUnmute : s.vServerMute, i: "micoff", onClick: () => { onServerMute?.(); onClose(); } } : null,
      canDeafen ? { t: user?.serverDeafened ? s.vUndeafen : s.vDeafen, i: "headoff", onClick: () => { onDeafen?.(); onClose(); } } : null,
      canMove && current?.type === "stage" ? { t: user?.stageRole === "speaker" ? s.vAudience : s.vSpeak, i: "mega", onClick: () => { onStage?.(); onClose(); } } : null,
      canMove && others.length ? { t: s.vMove, i: "move", sub: others.map((c) => c.name).join(" · "), onClick: () => setMoving(true) } : null,
      canMove ? "-" : null,
      canMove ? { t: s.vDisconnect, i: "unplug", red: true, onClick: () => { onDisconnect?.(); onClose(); } } : null,
    ].filter(Boolean).filter((it, i, arr) => it !== "-" || (i > 0 && i < arr.length - 1 && arr[i - 1] !== "-"));

  const head = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 12px" }}>
        <Av user={user} s={46} dot={PRESENCE_DOT[presence] || null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 13, color: "rgba(235,238,255,.55)" }}>{f(micOff ? "vInChannelMuted" : "vInChannel", { channel: current?.name || "" })}</div>
        </div>
      </div>
      {!isSelf && onVolume ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 18px 16px", color: "rgba(235,238,255,.7)" }}>
          <I n="volume" s={18} />
          <VolumeSlider value={volume} onChange={onVolume} label={s.vVolume} />
          <span style={{ fontSize: 14, width: 44, textAlign: "right" }}>{pctLabel}</span>
        </div>
      ) : null}
      {!isSelf && screen?.show ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 18px 16px", color: "rgba(235,238,255,.7)" }}>
          <I n="win" s={18} />
          <VolumeSlider value={screen.value} onChange={screen.onChange} label={s.vScreen} />
          <span style={{ fontSize: 14, width: 44, textAlign: "right" }}>{locale === "tr" ? `%${screen.value}` : `${screen.value}%`}</span>
        </div>
      ) : null}
    </>
  );

  if (!tablet) {
    return (
      <Sheet onClose={onClose} medium h={600} label={name}>
        {head}
        <div className="svh-menu" role="menu" style={{ position: "relative", width: "auto", margin: "0 12px", background: "rgba(255,255,255,.06)", boxShadow: "none", borderRadius: 16 }}>
          <MenuItems items={items} />
        </div>
      </Sheet>
    );
  }
  return (
    <Layer onClose={onClose} z={10060} label={name}>
      <Dim onClick={onClose} style={{ background: "rgba(6,7,12,.25)" }} />
      <motion.div ref={menuRef} className="svh-menu svh-heavy" role="dialog" aria-label={name}
        style={{ width: 300, padding: 0, left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.94 }} transition={popT(reduced)}>
        {head}
        <div style={{ height: 0.5, background: "rgba(255,255,255,.1)" }} />
        <div role="menu" style={{ padding: "5px 0" }}><MenuItems items={items} /></div>
      </motion.div>
    </Layer>
  );
}

/* ───────────────────────── 23 / 24 Basılı tutma ───────────────────────── */
/** Blurred dim + the pressed row lifted at its own rect + the menu under (or above) it. */
function LiftMenu({ rect, lift, items, children, onClose, label }) {
  const reduced = useReducedMotionPref();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !rect) return;
    const W = window.innerWidth, H = window.innerHeight, h = el.offsetHeight;
    const left = Math.max(12, Math.min(rect.x + 4, W - 270));
    let top = rect.y + rect.height + 10;
    let origin = "top left";
    if (top + h > H - 12) { top = Math.max(12, rect.y - h - 10); origin = "bottom left"; }
    setPos({ left, top, origin });
  }, [rect, items]);
  return (
    <Layer onClose={onClose} z={10060} label={label}>
      <Dim blur onClick={onClose} style={{ background: "rgba(6,7,12,.38)" }} />
      <motion.div className="svh-lift svh-heavy" aria-hidden="true"
        style={{ left: rect.x - 6, top: rect.y - 6, width: rect.width + 12, height: rect.height + 12, display: "flex", alignItems: "center", padding: "0 14px" }}
        initial={reduced ? { opacity: 0 } : { scale: 1 }} animate={reduced ? { opacity: 1 } : { scale: 1.03 }} exit={reduced ? { opacity: 0 } : { scale: 1, opacity: 0 }} transition={popT(reduced)}>
        {lift}
      </motion.div>
      <motion.div style={{ position: "absolute", left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden", transformOrigin: pos?.origin || "top left" }}
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.85 }} transition={popT(reduced)}>
        <MenuBox menuRef={ref} items={items} style={{ position: "relative" }}>{children}</MenuBox>
      </motion.div>
    </Layer>
  );
}

export function ServerLongPressMenu({ rect, server, unread, online, folders, canInvite, onClose, onMarkRead, onMute, onUnmute, onNotifications,
  onInvite, onMoveToFolder, onNewFolder, onSettings, onLeave }) {
  const { s, f } = useSvh();
  const [sub, setSub] = useState(null); // "mute" | "folder"
  const muted = getServerMute(server?.id);
  const cur = server?.folderId ? String(server.folderId) : null;
  const folderNames = (folders || []).map((x) => x.name);
  const run = (fn) => () => { onClose(); fn?.(); };
  let items;
  if (sub === "mute") {
    items = [{ key: "back", t: s.mute, i: "chevl", onClick: () => setSub(null) }, ...muteOptions(s).filter((o) => o.id !== "h24").map((o) => ({ key: o.id, t: o.t, onClick: run(() => onMute?.(o.id)) }))];
  } else if (sub === "folder") {
    items = [
      { key: "back", t: s.moveToFolder, i: "chevl", onClick: () => setSub(null) },
      ...(folders || []).map((fo) => ({ key: fo.id, t: fo.name, check: cur === String(fo.id), onClick: run(() => onMoveToFolder?.(cur === String(fo.id) ? null : fo.id)) })),
      cur ? { key: "none", t: s.unfiled, onClick: run(() => onMoveToFolder?.(null)) } : null,
      { key: "new", t: s.newFolder, i: "plus", onClick: run(onNewFolder) },
    ].filter(Boolean);
  } else {
    items = [
      { t: s.markRead, i: "read", onClick: run(onMarkRead), disabled: !unread },
      muted ? { t: s.unmute, i: "bell", onClick: run(onUnmute) } : { t: s.mute, i: "belloff", sub: s.muteSub, onClick: () => setSub("mute") },
      { t: s.notifications, i: "bell", sub: levelLabel(server?.notificationLevel, s), onClick: run(onNotifications) },
      "-",
      canInvite ? { t: s.invitePeople, i: "user", onClick: run(onInvite) } : null,
      { t: s.moveToFolder, i: "folder", sub: [...folderNames, s.folderSubNone].join(", "), onClick: () => setSub("folder") },
      { t: s.serverSettings, i: "gear", onClick: run(onSettings) },
      "-",
      { t: s.leave, i: "out", red: true, onClick: run(onLeave) },
    ].filter(Boolean);
  }
  const lift = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minWidth: 0 }}>
      <Sq server={server} s={40} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{server?.name}</div>
        <div style={{ fontSize: 13, color: "rgba(235,238,255,.55)" }}>{online == null ? f("listMetaNoOnline", { members: server?.memberCount || 1 }) : f("listMeta", { members: server?.memberCount || 1, online })}</div>
      </div>
      {unread ? <span className="svh-badge" style={{ marginLeft: "auto", background: "#FF453A", color: "#fff" }}>{unread > 99 ? "99+" : unread}</span> : null}
    </div>
  );
  return <LiftMenu rect={rect} lift={lift} items={items} onClose={onClose} label={server?.name} />;
}

export function FolderLongPressMenu({ rect, folder, count, allMuted, anyUnread, onClose, onRename, onColor, onMarkAllRead, onMuteAll, onUnmuteAll, onUngroup, onDelete }) {
  const { s, f } = useSvh();
  const [colors, setColors] = useState(false);
  const color = getFolderColor(folder?.id);
  const run = (fn) => () => { onClose(); fn?.(); };
  const items = [
    { t: s.rename, i: "pen", onClick: run(onRename) },
    { t: s.folderColor, i: "palette", onClick: () => setColors((v) => !v) },
    { t: s.markAllRead, i: "read", onClick: run(onMarkAllRead), disabled: !anyUnread },
    allMuted ? { t: s.unmuteAll, i: "bell", onClick: run(onUnmuteAll) } : { t: s.muteAll, i: "belloff", onClick: run(onMuteAll) },
    "-",
    { t: s.ungroup, i: "ungroup", sub: s.ungroupSub, onClick: run(onUngroup) },
    { t: s.deleteFolder, i: "trash", red: true, onClick: run(onDelete) },
  ];
  const palette = colors ? (
    <div style={{ display: "flex", gap: 8, padding: "8px 16px 10px", flexWrap: "wrap" }} role="radiogroup" aria-label={s.folderColor}>
      {FOLDER_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={color === c} className="svh-tap" data-press-scale="0.9" onClick={() => { onColor?.(c); onClose(); }}
          style={{ width: 26, height: 26, borderRadius: 13, background: c, boxShadow: color === c ? "0 0 0 2px rgba(20,21,32,1), 0 0 0 4px #fff" : "none" }} aria-label={c} />
      ))}
    </div>
  ) : null;
  const lift = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", fontWeight: 650, fontSize: 15 }}>
      <span style={{ color: color || undefined, display: "flex" }}><I n="folder" s={18} /></span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder?.name}</span>
      <span className="svh-badge" style={{ marginLeft: "auto" }}>{f("nServers", { n: count })}</span>
    </div>
  );
  const shown = [...items.slice(0, 2), palette ? { key: "palette", node: palette } : null, ...items.slice(2)].filter(Boolean);
  return <LiftMenu rect={rect} lift={lift} onClose={onClose} label={folder?.name} items={shown} />;
}
