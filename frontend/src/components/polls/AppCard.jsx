import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Ban, Calendar, ChevronRight, Copy, Crown, Download, Eye, IdCard, Image as ImageIcon, Info, Link, Maximize2,
  MessageCircle, Minus, Pencil, Plus, Search, Share2, Shield, Sparkles, Timer, Undo2, UserCheck, UserPlus, UserX, X,
  Eraser, Clock,
} from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { copyText } from "../../lib/copyText";
import { removeServerMemberTimeout, unbanServerMember } from "../../api/servers";
import { sendFriendRequest } from "../../api/friends";
import { casinoHiddenOnThisDevice } from "../../lib/casinoCommands";
import { SLASH_GROUP_BY_ID, findSlashCommand } from "../../lib/slashCommands";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticSuccess } from "../../lib/fluid/haptics";
import { SLASH_ICONS } from "./slashIconsMap";
import { DescallMark, Portal, PRESENCE_LABEL, trDate, trTime } from "./dsxShared";
import "./dsx.css";

const CAT = SLASH_GROUP_BY_ID;
const HI = {
  general: CAT.general.gradient,
  warn: "linear-gradient(160deg,#ffb35c,#e0782f)",
  danger: "linear-gradient(160deg,#ff7a6b,#e0455f)",
  ban: "linear-gradient(160deg,#ff5a6b,#b8233f)",
  ok: "linear-gradient(160deg,#39c99b,#2a8f6e)",
};

const nameOf = (u) => u?.nickname || u?.displayName || u?.display_name || u?.username || "Kullanıcı";

function Pres({ status, small = false }) {
  if (!status) return null;
  return <i className={`dsx-pres ${small ? "sm" : ""} ${status}`} aria-label={PRESENCE_LABEL[status] || ""} />;
}

function UserAvatar({ user, size = 36, presence }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", flex: "none" }}>
      <Avatar size={size} name={nameOf(user)} user={user} imageUrl={user?.avatarUrl || undefined} animate="never" />
      {presence ? <Pres status={presence} small /> : null}
    </span>
  );
}

function Head({ icon: Icon, bg, title, sub, right }) {
  return (
    <div className="h">
      <span className="hi" style={{ background: bg }}>
        <Icon className="dsx-ico" />
      </span>
      <div style={{ minWidth: 0 }}>
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {right}
    </div>
  );
}

/* ---------------- /user ---------------- */
function UserCard({ card, compact, actions }) {
  const u = card.user || {};
  const display = card.nickname || u.displayName || u.username || "Kullanıcı";
  const presence = u.presence || "offline";
  const [requested, setRequested] = useState(false);
  const badgeClass = { owner: "dsx-b-admin", admin: "dsx-b-admin", staff: "dsx-b-staff", early: "dsx-b-early" };
  const banner = u.bannerUrl || u.equippedBanner?.image_url || u.equippedBanner?.imageUrl || null;
  const addFriend = async () => {
    try {
      await sendFriendRequest(u.username);
      setRequested(true);
      hapticSuccess();
    } catch {
      setRequested(false);
    }
  };
  const third = card.isSelf ? (
    <button type="button" className="dsx-btn" onClick={() => actions.openSettings?.()}>
      <Pencil className="dsx-ico" /> Profili düzenle
    </button>
  ) : card.isFriend ? (
    <button type="button" className="dsx-btn" disabled>
      <UserCheck className="dsx-ico" /> Arkadaşsınız
    </button>
  ) : (
    <button type="button" className="dsx-btn" onClick={addFriend} disabled={requested || !u.username}>
      <UserPlus className="dsx-ico" /> {requested ? "İstek gönderildi" : "Arkadaş ekle"}
    </button>
  );
  return (
    <div className="dsx-card dsx-appcard dsx-ucard">
      <div className={`ban ${banner ? "" : "is-default"}`} style={banner ? { backgroundImage: `url("${banner}")` } : undefined} />
      <div className="top">
        <div className="dsx-ring">
          <Avatar size={94} name={display} user={u} imageUrl={u.avatarUrl || undefined} animate="hover" />
          <Pres status={presence} />
        </div>
        <div className="bdg">
          {(card.badges || []).slice(0, 3).map((b) => (
            <span key={b.id} className={`dsx-badge ${badgeClass[b.id] || "dsx-b-early"}`}>
              {b.id === "early" ? <Sparkles className="dsx-ico" /> : <Shield className="dsx-ico" />} {b.label}
            </span>
          ))}
        </div>
      </div>
      <div className="who">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="dsx-gname" style={card.roles?.[0]?.color ? { color: card.roles[0].color } : undefined}>{display}</span>
          {(card.badges || []).some((b) => b.id === "owner") ? <Crown className="dsx-ico" style={{ color: "#ffd27a" }} /> : null}
        </div>
        <div className="hn">
          {u.username ? `@${u.username}` : null}
          <span className="sep" />
          <span style={{ color: presence === "online" ? "#3BD16F" : presence === "idle" ? "#F5B73B" : presence === "dnd" ? "#F0524F" : "var(--dsx-t3)", fontWeight: 650 }}>
            {PRESENCE_LABEL[presence] || "Çevrimdışı"}
          </span>
        </div>
        {u.customStatus ? <div className="stat">{typeof u.customStatus === "string" ? u.customStatus : u.customStatus.text || ""}</div> : null}
        {u.bio ? <p className="bio">{u.bio}</p> : null}
        {card.timeoutUntil ? (
          <div className="dsx-line" style={{ color: "#ffb88a" }}>
            <Timer className="dsx-ico" /> {trDate(card.timeoutUntil)} {trTime(card.timeoutUntil)}'e kadar susturuldu
          </div>
        ) : null}
      </div>
      {card.roles?.length ? (
        <div className="blk">
          <div className="dsx-sect">Roller · {card.roles.length}</div>
          <div className="dsx-pills">
            {card.roles.slice(0, 12).map((r) => (
              <span key={r.id} className="dsx-rolepill" style={{ "--c": r.color || "#8a93a8" }}>
                <i />
                {r.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {card.serverJoinedAt || card.accountCreatedAt ? (
        <div className="blk">
          <div className="dsx-sect">Üyelik</div>
          <div className="dsx-dates">
            {card.serverJoinedAt ? (
              <div className="dsx-dt">
                <span className="di"><Calendar className="dsx-ico" /></span>
                <div>
                  <b>{trDate(card.serverJoinedAt)}</b>
                  <span>Sunucuya katıldı</span>
                </div>
              </div>
            ) : null}
            {card.accountCreatedAt ? (
              <div className="dsx-dt">
                <span className="di" style={{ background: "linear-gradient(160deg,#3d5bd8,#2a3a8a)" }}><DescallMark size={15} /></span>
                <div>
                  <b>{trDate(card.accountCreatedAt)}</b>
                  <span>Descall'a katıldı</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={`dsx-acts ${compact ? "two" : ""}`}>
        <button type="button" className={`dsx-btn pri ${compact ? "full" : ""}`} disabled={card.isSelf} onClick={() => actions.startDm?.(u)}>
          <MessageCircle className="dsx-ico" /> Mesaj gönder
        </button>
        <button type="button" className="dsx-btn" onClick={() => actions.openProfile?.(u)}>
          <IdCard className="dsx-ico" /> Profili aç
        </button>
        {third}
      </div>
    </div>
  );
}

/* ---------------- /avatar ---------------- */
async function downloadImage(url, size, filename) {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    let out = blob;
    if (size) {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(bmp, 0, 0, size, size);
      out = await new Promise((r) => canvas.toBlob(r, "image/png"));
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(out);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function FullscreenAvatar({ url, user, meta, onClose, onDownload }) {
  const reduce = useReducedMotion();
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
      <motion.div
        className="dsx-fullscreen"
        role="dialog"
        aria-modal="true"
        aria-label={`${nameOf(user)} avatarı`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduce ? REDUCED_MOTION_FADE : { duration: 0.2 }}
        onClick={onClose}
      >
        <div className="dsx-heavy tb" onClick={(e) => e.stopPropagation()}>
          <UserAvatar user={user} size={34} presence={user?.presence} />
          <div style={{ marginRight: 14 }}>
            <b style={{ fontSize: 14 }}>{nameOf(user)}</b>
            <div style={{ fontSize: 11.5, color: "var(--dsx-t3)" }}>
              {user?.username ? `@${user.username}` : ""}
              {meta ? ` · ${meta}` : ""}
            </div>
          </div>
          <button type="button" className="dsx-btn" onClick={onDownload}><Download className="dsx-ico" /> İndir</button>
          <button type="button" className="dsx-btn" onClick={() => copyText(url)}><Copy className="dsx-ico" /> Kopyala</button>
          <button type="button" className="dsx-btn" onClick={() => copyText(url)}><Link className="dsx-ico" /> Bağlantı</button>
          <button type="button" className="dsx-btn" style={{ width: 36, padding: 0, borderRadius: "50%" }} aria-label="Kapat" onClick={onClose}>
            <X className="dsx-ico" />
          </button>
        </div>
        <motion.div
          className="img"
          style={{ backgroundImage: `url("${url}")`, x: "-50%", y: "-50%", scale: zoom }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, scale: zoom }}
          transition={reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.default)}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="dsx-heavy zoom" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="dsx-btn ghost" aria-label="Uzaklaştır" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}><Minus className="dsx-ico" /></button>
          <button type="button" className="dsx-btn" aria-label="Yakınlaştırmayı sıfırla" onClick={() => setZoom(1)}>%{Math.round(zoom * 100)}</button>
          <button type="button" className="dsx-btn ghost" aria-label="Yakınlaştır" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}><Plus className="dsx-ico" /></button>
        </div>
      </motion.div>
    </Portal>
  );
}

function AvatarCard({ card }) {
  const url = card.avatarUrl || card.user?.avatarUrl || null;
  const user = card.user || {};
  const [dims, setDims] = useState(null);
  const [size, setSize] = useState(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!url) return undefined;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);
  const ext = (String(url || "").split("?")[0].split(".").pop() || "").toUpperCase();
  const meta = dims ? `${dims.w} × ${dims.h}${ext && ext.length <= 4 ? ` · ${ext === "JPEG" ? "JPG" : ext}` : ""}` : null;
  const sizes = [128, 256, 512, 1024].filter((s) => !dims || s <= Math.max(dims.w, 128));
  const chosen = size || (sizes.length ? sizes[sizes.length - 1] : null);
  const download = () => downloadImage(url, size && dims && size < dims.w ? size : null, `${user.username || "avatar"}-${chosen || "orijinal"}.png`);
  return (
    <div className="dsx-card dsx-avcard">
      <div className="hd">
        <UserAvatar user={user} size={34} presence={user.presence} />
        <div>
          <b>{card.displayName || nameOf(user)} avatarı</b>
          <span>{user.username ? `@${user.username} · ` : ""}Genel avatar</span>
        </div>
      </div>
      <div className="dsx-avimg" style={url ? { backgroundImage: `url("${url}")` } : undefined}>
        {url ? null : (nameOf(user)[0] || "?").toLocaleUpperCase("tr")}
        {url ? (
          <button type="button" className="fs" aria-label="Tam ekran" onClick={() => setFull(true)}>
            <Maximize2 className="dsx-ico" />
          </button>
        ) : null}
        {meta ? (
          <span className="meta">
            <ImageIcon className="dsx-ico" /> {meta}
          </span>
        ) : null}
      </div>
      {url ? (
        <>
          <div className="dsx-sizes" role="group" aria-label="Boyut seç">
            {sizes.map((s) => (
              <button key={s} type="button" className={`dsx-chip ${chosen === s ? "is-on" : ""}`} aria-pressed={chosen === s} onClick={() => setSize(s)}>
                {s}
              </button>
            ))}
            <span className="lab">Boyut seç</span>
          </div>
          <div className="dsx-avacts">
            <button type="button" className="dsx-btn pri" onClick={download}><Download className="dsx-ico" /> İndir</button>
            <button type="button" className="dsx-btn" onClick={() => setFull(true)}><Maximize2 className="dsx-ico" /> Tam ekran</button>
            <button type="button" className="dsx-btn" onClick={() => copyText(url)}><Link className="dsx-ico" /> Bağlantı</button>
          </div>
        </>
      ) : (
        <div className="dsx-line" style={{ color: "var(--dsx-t3)" }}>Avatar ayarlanmamış.</div>
      )}
      <AnimatePresence>
        {full ? <FullscreenAvatar url={url} user={user} meta={meta} onClose={() => setFull(false)} onDownload={download} /> : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- /server ---------------- */
function ServerCard({ card }) {
  const s = card.server || {};
  const c = card.counts || {};
  const fmt = (n) => (n == null ? "?" : Number(n).toLocaleString("tr-TR"));
  return (
    <div className="dsx-card dsx-appcard">
      <div
        style={{
          height: 96,
          background: s.bannerUrl
            ? `center / cover url("${s.bannerUrl}")`
            : "radial-gradient(70% 120% at 20% 0%,rgba(110,140,255,.9),transparent 60%),radial-gradient(60% 120% at 90% 100%,rgba(140,110,255,.6),transparent 60%),linear-gradient(120deg,#20285a,#2a3a8a)",
        }}
      />
      <div className="dsx-ac" style={{ paddingTop: 0 }}>
        <div className="h" style={{ marginTop: -28, alignItems: "flex-start" }}>
          <span
            style={{
              width: 64, height: 64, borderRadius: 20, display: "grid", placeItems: "center", flex: "none",
              background: s.iconUrl ? `center / cover url("${s.iconUrl}")` : "linear-gradient(150deg,#5b8cff,#6b4bd8)",
              fontWeight: 800, fontSize: 20, boxShadow: "0 0 0 4px #1b1d2a,0 10px 24px rgba(0,0,0,.4)",
            }}
          >
            {s.iconUrl ? null : String(s.name || "?").slice(0, 2).toLocaleUpperCase("tr")}
          </span>
          <div style={{ marginTop: 34, minWidth: 0 }}>
            <b style={{ fontSize: 18 }}>{s.name}</b>
            {s.description ? <span>{s.description}</span> : null}
          </div>
        </div>
        <div className="dsx-kv">
          <div><b>{fmt(c.members)}</b><span>Üye</span></div>
          <div><b><i />{fmt(c.online)}</b><span>Çevrimiçi</span></div>
          <div><b>{fmt(c.channels)}</b><span>Kanal</span></div>
          <div><b>{fmt(c.roles)}</b><span>Rol</span></div>
        </div>
        <div className="dsx-line">
          {card.owner ? <UserAvatar user={card.owner} size={22} /> : null}
          Sahibi <b>{nameOf(card.owner)}</b>
          {s.createdAt ? (
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Calendar className="dsx-ico" /> {trDate(s.createdAt)}
            </span>
          ) : null}
        </div>
        <div className="row2">
          <button type="button" className="dsx-btn pri" onClick={() => window.dispatchEvent(new CustomEvent("descall:server-open", { detail: { kind: "invite" } }))}>
            <Link className="dsx-ico" /> Davet bağlantısı
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- /help ---------------- */
function HelpCard({ card }) {
  const hideCasino = casinoHiddenOnThisDevice();
  const groups = (card.groups || [])
    .map((g) => ({ ...g, commands: (g.commands || []).filter((c) => !(hideCasino && c.casino)) }))
    .filter((g) => g.commands.length);
  const catId = (g) => {
    const first = findSlashCommand(g.commands[0]?.name);
    return first?.group || "general";
  };
  return (
    <div className="dsx-card dsx-appcard dsx-ac">
      <Head icon={SLASH_ICONS.help} bg={CAT.general.gradient} title={card.title || "Komutlar"} sub={card.subtitle} />
      {groups.map((g) => {
        const cat = CAT[catId(g)] || CAT.general;
        return (
          <div key={g.id || g.label}>
            <div className="dsx-sg" style={{ margin: "14px 2px 6px" }}>{g.label || cat.label}</div>
            {g.commands.map((c) => {
              const Icon = SLASH_ICONS[c.name] || SLASH_ICONS.help;
              return (
                <div key={c.name} className="dsx-help-row">
                  <span style={{ color: cat.color, display: "inline-flex" }}><Icon className="dsx-ico" size={18} /></span>
                  <b>/{c.name}</b>
                  <span>{findSlashCommand(c.name)?.description || c.description}</span>
                </div>
              );
            })}
          </div>
        );
      })}
      <div className="dsx-line" style={{ marginTop: 12, color: "var(--dsx-t3)" }}>
        <Sparkles className="dsx-ico" /> İpucu: <b>/</b> yazınca komut menüsü açılır
      </div>
    </div>
  );
}

/* ---------------- /nick ---------------- */
function NickCard({ card, actions }) {
  const after = card.after;
  return (
    <div className="dsx-card dsx-appcard dsx-ac">
      <Head icon={Pencil} bg={CAT.general.gradient} title={after ? "Takma adın güncellendi" : "Takma adın temizlendi"} sub={card.serverName ? `${card.serverName} sunucusunda` : null} />
      <div className="dsx-mrow">
        <span style={{ textDecoration: "line-through", color: "var(--dsx-t3)", fontWeight: 600 }}>{card.before || card.baseName || "—"}</span>
        <ChevronRight className="dsx-ico" style={{ color: "var(--dsx-t3)" }} />
        {card.user ? <UserAvatar user={card.user} size={26} /> : null}
        <b style={{ fontSize: 15 }}>{after || card.baseName}</b>
      </div>
      <div className="row2">
        <button type="button" className="dsx-btn" disabled={!actions.runCommand} onClick={() => actions.runCommand?.(`/nick ${card.before || ""}`.trim())}>
          <Undo2 className="dsx-ico" /> Geri al
        </button>
        {after ? (
          <button type="button" className="dsx-btn ghost" disabled={!actions.runCommand} onClick={() => actions.runCommand?.("/nick")}>
            Takma adı temizle
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- errors ---------------- */
function ErrorCard({ card }) {
  const warn = card.tone === "warn";
  return (
    <div className={`dsx-card dsx-appcard dsx-ac ${warn ? "dsx-tint-warn" : "dsx-tint-danger"}`}>
      <Head icon={card.suggestions ? Search : Info} bg={warn ? HI.warn : HI.danger} title={card.title} sub={card.description} />
      {card.suggestions?.length ? (
        <>
          <div className="dsx-sect" style={{ margin: "14px 2px 8px" }}>Bunu mu demek istedin?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {card.suggestions.slice(0, 4).map((s) => (
              <button
                key={s.id}
                type="button"
                className="dsx-chip"
                style={{ height: 34, padding: "0 12px 0 5px", fontSize: 13 }}
                onClick={() => {
                  const cmd = String(card.usage || "/user").split(/\s/)[0];
                  window.dispatchEvent(new CustomEvent("descall:composer-insert", { detail: { text: `${cmd} @${s.username} ` } }));
                }}
              >
                <UserAvatar user={s} size={24} />@{s.username}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {card.usage ? (
        <div className="dsx-line" style={{ color: "var(--dsx-t3)" }}>
          <Info className="dsx-ico" /> Kullanım:{" "}
          {String(card.usage)
            .split(/\s+/)
            .map((p, i) => (
              <span key={i} className={`dsx-ah ${p.startsWith("[") ? "opt" : ""}`}>{p}</span>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- moderation ---------------- */
function useCountdown(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);
  return now;
}

function fmtLeft(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d} g ${h} sa`;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function ModerationCard({ card }) {
  const t = card.target || {};
  const display = nameOf(t);
  const now = useCountdown(card.action === "timeout" ? card.until : null);
  const [undone, setUndone] = useState(false);
  const [err, setErr] = useState("");
  const M = {
    timeout: { icon: Timer, title: `${display} susturuldu`, bg: HI.warn, tint: "warn" },
    kick: { icon: UserX, title: `${display} sunucudan atıldı`, bg: HI.danger, tint: "danger" },
    ban: { icon: Ban, title: `${display} yasaklandı`, bg: HI.ban, tint: "danger" },
  }[card.action] || { icon: Shield, title: display, bg: HI.danger, tint: "danger" };
  const left = card.until ? new Date(card.until).getTime() - now : 0;
  const total = (Number(card.durationSeconds) || 0) * 1000;
  const pct = total ? Math.max(0, Math.min(100, (left / total) * 100)) : 0;
  const undo = async () => {
    setErr("");
    try {
      if (card.action === "timeout") await removeServerMemberTimeout(card.serverId, t.id);
      if (card.action === "ban") await unbanServerMember(card.serverId, t.id);
      setUndone(true);
      hapticSuccess();
    } catch (e) {
      setErr(e?.message || "İşlem başarısız oldu.");
    }
  };
  const actor = card.actor ? nameOf(card.actor) : null;
  return (
    <div className={`dsx-card dsx-appcard dsx-ac dsx-tint-${M.tint}`}>
      <Head icon={M.icon} bg={M.bg} title={M.title} sub={[actor ? `${actor} tarafından` : null, trTime(card.at)].filter(Boolean).join(" · ")} />
      <div className="dsx-mrow">
        <UserAvatar user={t} size={42} presence={card.action === "timeout" ? t.presence : null} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={t.topRole?.color ? { color: t.topRole.color } : undefined}>{display}</b>
          <div style={{ fontSize: 12, color: "var(--dsx-t3)" }}>
            {t.username ? `@${t.username}` : ""}
            {t.topRole?.name ? ` · ${t.topRole.name}` : ""}
          </div>
        </div>
        {card.action === "timeout" && !undone ? (
          <div style={{ textAlign: "right" }}>
            <b style={{ fontVariantNumeric: "tabular-nums", fontSize: 18 }}>{fmtLeft(left)}</b>
            <div style={{ fontSize: 11.5, color: "var(--dsx-t3)" }}>{trTime(card.until)}'e kadar</div>
          </div>
        ) : null}
      </div>
      {card.action === "timeout" && !undone ? (
        <div className="dsx-progress"><div style={{ width: `${pct}%` }} /></div>
      ) : null}
      {card.reason ? (
        <div className="dsx-line">
          <span style={{ color: "var(--dsx-t3)" }}>Sebep</span>
          <b>{card.reason}</b>
        </div>
      ) : null}
      {undone ? (
        <div className="dsx-line" style={{ color: "#7ee2a8" }}>
          <UserCheck className="dsx-ico" /> {card.action === "timeout" ? "Susturma kaldırıldı" : "Yasak kaldırıldı"}
        </div>
      ) : null}
      {err ? <div className="dsx-line" style={{ color: "#ff9a8a" }}>{err}</div> : null}
      <div className="row2">
        {card.action === "timeout" ? (
          <button type="button" className="dsx-btn" disabled={undone || left <= 0} onClick={undo}>
            <Undo2 className="dsx-ico" /> Susturmayı kaldır
          </button>
        ) : card.action === "ban" ? (
          <button type="button" className="dsx-btn" disabled={undone} onClick={undo}>
            <Undo2 className="dsx-ico" /> Yasağı kaldır
          </button>
        ) : (
          <button type="button" className="dsx-btn" onClick={() => window.dispatchEvent(new CustomEvent("descall:server-open", { detail: { kind: "invite" } }))}>
            <Link className="dsx-ico" /> Davet gönder
          </button>
        )}
        <button type="button" className="dsx-btn ghost" onClick={() => window.dispatchEvent(new CustomEvent("descall:server-open", { detail: { kind: "audit" } }))}>
          <Shield className="dsx-ico" /> Denetim kaydı
        </button>
      </div>
    </div>
  );
}

/* ---------------- /purge ---------------- */
function PurgeCard({ card }) {
  const rows = card.bySender || [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  const since = card.oldestAt ? Math.max(1, Math.round((Date.now() - new Date(card.oldestAt).getTime()) / 60000)) : null;
  const sinceLabel = since == null ? null : since < 60 ? `son ${since} dk` : since < 1440 ? `son ${Math.round(since / 60)} saat` : `son ${Math.round(since / 1440)} gün`;
  return (
    <div className="dsx-card dsx-appcard dsx-ac dsx-tint-ok">
      <Head
        icon={Eraser}
        bg={HI.ok}
        title={`${card.count} mesaj silindi`}
        sub={[card.channelName ? `# ${card.channelName}` : null, sinceLabel].filter(Boolean).join(" · ")}
        right={card.autoHide ? (
          <span style={{ marginLeft: "auto" }} className="dsx-chip"><Clock className="dsx-ico" size={14} /> {card.autoHide} sn sonra kaybolur</span>
        ) : null}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
        {rows.map((r) => (
          <div key={r.user?.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <UserAvatar user={r.user} size={22} />
            <span style={{ width: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(r.user)}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--dsx-chip)" }}>
              <div style={{ width: `${(r.count / max) * 100}%`, height: "100%", borderRadius: 4, background: "rgba(var(--dsx-ok),.8)" }} />
            </div>
            <b style={{ width: 24, textAlign: "right" }}>{r.count}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- shell ---------------- */
const SHAREABLE = new Set(["user", "avatar", "server", "help", "nick", "moderation", "purge"]);

/**
 * Descall Apps reply card. `message.ephemeral` = only you see it (server
 * replies are invoker-only); "Kanala paylaş" posts it for everyone.
 */
export default function AppCard({ message, embed, socket, serverId, channelId, compact = false, actions = {} }) {
  const card = embed?.card;
  const [sharing, setSharing] = useState(false);
  const [shareErr, setShareErr] = useState("");
  const [hidden, setHidden] = useState(false);
  const purgeAuto = card?.kind === "purge" && message?.ephemeral ? 10 : 0;

  const dismiss = useMemo(
    () => () => {
      setHidden(true);
      window.dispatchEvent(new CustomEvent("descall:app-message-dismiss", { detail: { messageId: message?.id } }));
    },
    [message?.id]
  );

  useEffect(() => {
    if (!purgeAuto) return undefined;
    const id = window.setTimeout(dismiss, purgeAuto * 1000);
    return () => window.clearTimeout(id);
  }, [purgeAuto, dismiss]);

  if (!card || hidden) return null;

  const share = () => {
    if (!socket || sharing) return;
    setSharing(true);
    setShareErr("");
    socket.emit("server:app:share", { serverId, channelId, messageId: message.id }, (res) => {
      setSharing(false);
      if (res?.ok) {
        hapticSuccess();
        dismiss();
      } else {
        setShareErr(res?.message || "Paylaşılamadı.");
      }
    });
  };

  let body = null;
  switch (card.kind) {
    case "user": body = <UserCard card={card} compact={compact} actions={actions} />; break;
    case "avatar": body = <AvatarCard card={card} />; break;
    case "server": body = <ServerCard card={card} />; break;
    case "help": body = <HelpCard card={card} />; break;
    case "nick": body = <NickCard card={card} actions={actions} />; break;
    case "error": body = <ErrorCard card={card} />; break;
    case "moderation": body = <ModerationCard card={card} />; break;
    case "purge": body = <PurgeCard card={{ ...card, autoHide: purgeAuto }} />; break;
    default: return null;
  }

  return (
    <div className="dsx-appwrap" style={{ maxWidth: "100%" }}>
      {body}
      {message?.ephemeral ? (
        <div className="dsx-ephem">
          <Eye className="dsx-ico" /> Bunu yalnızca sen görüyorsun ·{" "}
          <button type="button" onClick={dismiss}>Kapat</button>
          {message.shareable && SHAREABLE.has(card.kind) && card.kind !== "error" ? (
            <button type="button" className="share" onClick={share} disabled={sharing}>
              <Share2 className="dsx-ico" /> {sharing ? "Paylaşılıyor…" : "Kanala paylaş"}
            </button>
          ) : null}
          {shareErr ? <span style={{ color: "#ff9a8a" }}>{shareErr}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
