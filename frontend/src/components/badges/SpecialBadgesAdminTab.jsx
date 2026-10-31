// Yönetici Paneli → Özel Rozetler (mockup 04-admin): KPIs, catalog, detail with direct grant,
// holders with take-back, audit log. Never sold; promo codes and admins are the only sources.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, Search, History, Gift, UserMinus, Check, X, RefreshCw, Lock } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { SpecialBadgeIcon, TIER_ORDER, ART_BY_ID } from "./specialBadgeArt.jsx";
import { useBadgeCopy } from "./SpecialBadge.jsx";
import { showBadgeToast } from "./BadgeToast.jsx";
import {
  adminGrantSpecialBadge, adminRevokeSpecialBadge, adminSearchPeople, adminSpecialBadgeAudit,
  adminSpecialBadgeHolders, adminSpecialBadgesOverview,
} from "../../api/specialBadges";
import { formatSerial, invalidateUser, loadCatalog } from "../../lib/specialBadges";
import { refreshAdminBadgeOverview } from "./promoBridge.jsx";
import { formatDate, formatTime, lower } from "../../i18n/format";
import "../../styles/maintenance.css";
import "../../styles/promo.css";

const errKey = (err) => {
  const code = String(err?.message || "");
  return ["taken", "owned", "user_not_found", "badge_inactive", "badge_not_found", "not_owned"].includes(code) ? `badges.err_${code}` : "badges.err_generic";
};

export function trtWhen(iso, locale) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = formatDate(d, locale, { day: "2-digit", month: "short", timeZone: "Europe/Istanbul" });
  const time = formatTime(d, locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
  return `${day} ${time}`;
}
const trtDay = (iso, locale) => (iso ? formatDate(iso, locale, { day: "2-digit", month: "short", timeZone: "Europe/Istanbul" }) : "");
const who = (u) => u?.displayName || u?.username || "";

function useNarrow(px = 820) {
  const q = `(max-width: ${px}px)`;
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setN(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, [q]);
  return n;
}

function Catalog({ rows, sel, onSel, narrow }) {
  const { t, locale, name, tierLabel, num } = useBadgeCopy();
  const [tier, setTier] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = lower(q.trim(), locale);
    return rows.filter((b) => (tier === "all" || b.tier === tier) && (!needle || lower(name(b.id), locale).includes(needle) || b.id.includes(needle)));
  }, [rows, tier, q, name, locale]);
  const cols = narrow ? "auto" : sel ? 5 : 7;
  return (
    <div className="mt-card sb-cat">
      <h3><Award size={16} /> {t("badges.catalog")}<span className="sub">{t("badges.catalogSub")}</span></h3>
      <div className={`sb-cat-tools${sel || narrow ? " stack" : ""}`}>
        <div className="mt-seg" role="radiogroup" aria-label={t("badges.rarityFilter")}>
          <button type="button" role="radio" aria-checked={tier === "all"} className={tier === "all" ? "on" : ""} onClick={() => setTier("all")}>
            {t("badges.all")} {!sel && <span className="tnum sb-n">{rows.length}</span>}
          </button>
          {TIER_ORDER.map((x) => (
            <button type="button" role="radio" key={x} aria-checked={tier === x} className={tier === x ? "on" : ""} onClick={() => setTier(x)}>
              {tierLabel(x)} {!sel && <span className="tnum sb-n">{rows.filter((b) => b.tier === x).length}</span>}
            </button>
          ))}
        </div>
        <label className="mt-in sb-cat-search"><Search size={14} className="mt-i" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("badges.search")} aria-label={t("badges.search")} /></label>
      </div>
      {list.length === 0 ? <p className="mt-muted sb-none">{t("badges.noResults")}</p> : null}
      <div className={`sb-grid${cols === "auto" ? " is-auto" : ""}`} style={cols === "auto" ? undefined : { gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
        {list.map((b) => (
          <button type="button" key={b.id} className={`sb-cell${sel === b.id ? " on" : ""}`} aria-pressed={sel === b.id}
            aria-label={t("badges.cellAria", { name: name(b.id), tier: tierLabel(b.tier), n: num(b.holders) })}
            onClick={() => onSel(sel === b.id ? null : b.id)}>
            <SpecialBadgeIcon id={b.id} size={cols === 7 ? 60 : 52} />
            <b>{name(b.id)}</b>
            <span className="sb-cell-meta">
              <span className={`sb-tier-pill t-${b.tier}`}>{tierLabel(b.tier)}</span>
              <span className="tnum sb-cell-n">{b.maxHolders ? `${num(b.holders)}/${num(b.maxHolders)}` : num(b.holders)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonPicker({ value, onChange }) {
  const { t } = useBadgeCopy();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes([]); return undefined; }
    let live = true;
    const id = setTimeout(() => {
      adminSearchPeople(term).then((d) => { if (live) { setRes((d?.users || []).slice(0, 8)); setHi(0); } }).catch(() => { if (live) setRes([]); });
    }, 220);
    return () => { live = false; clearTimeout(id); };
  }, [q]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  const pick = (u) => { onChange(u); setQ(""); setRes([]); setOpen(false); };
  return (
    <div className="sb-field" ref={box}>
      <div className="mt-in sb-grant-in">
        <Search size={14} className="mt-i" />
        {value ? (
          <span className="sb-user-chip">
            <Avatar name={who(value)} size={20} user={value} animate="none" />{who(value)} <span className="mt-muted">@{value.username}</span>
            <button type="button" className="sb-chip-x" aria-label={t("badges.removeUser", { name: who(value) })} onClick={() => onChange(null)}><X size={12} /></button>
          </span>
        ) : (
          <input
            value={q}
            placeholder={t("badges.pickUser")}
            aria-label={t("badges.pickUser")}
            role="combobox"
            aria-expanded={open && res.length > 0}
            aria-controls="sb-people"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, res.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && res[hi]) { e.preventDefault(); pick(res[hi]); }
              else if (e.key === "Escape") setOpen(false);
            }}
          />
        )}
      </div>
      {open && !value && res.length ? (
        <ul className="sb-pop sb-people" id="sb-people" role="listbox">
          {res.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === hi}>
              <button type="button" className={`sb-pop-row${i === hi ? " on" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(u)}>
                <Avatar name={who(u)} size={26} user={u} animate="none" />
                <span className="sb-pop-copy"><b>{who(u)}</b><span>@{u.username}</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Detail({ row, onChanged, me }) {
  const { t, locale, name, desc, tierLabel, num } = useBadgeCopy();
  const [holders, setHolders] = useState(null);
  const [audit, setAudit] = useState(null);
  const [person, setPerson] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [reason, setReason] = useState("");
  const id = row.id;
  const load = useCallback(() => {
    adminSpecialBadgeHolders(id).then((d) => setHolders(d?.holders || [])).catch(() => setHolders([]));
    adminSpecialBadgeAudit({ limit: 8, badgeId: id }).then((d) => setAudit(d?.entries || [])).catch(() => setAudit([]));
  }, [id]);
  useEffect(() => { setHolders(null); setAudit(null); setPerson(null); setNote(""); setRevoking(null); load(); }, [load]);
  const full = row.maxHolders != null && row.holders >= row.maxHolders;

  const grant = async () => {
    if (!person || busy) return;
    setBusy(true);
    try {
      const r = await adminGrantSpecialBadge(id, { userId: person.id, note: note.trim() });
      showBadgeToast({ id, text: t("badges.grantedOk", { badge: name(id), user: who(person), serial: formatSerial(r?.serial) }) });
      invalidateUser(person.id);
      setPerson(null); setNote("");
      load(); onChanged();
    } catch (err) {
      showBadgeToast({ text: t(errKey(err)), tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (h) => {
    if (busy) return;
    setBusy(true);
    try {
      await adminRevokeSpecialBadge(id, { userId: h.userId, reason: reason.trim() });
      showBadgeToast({ id, text: t("badges.revokedOk", { badge: name(id), user: h.displayName || h.username }) });
      invalidateUser(h.userId);
      setRevoking(null); setReason("");
      load(); onChanged();
    } catch (err) {
      showBadgeToast({ text: t(errKey(err)), tone: "err" });
    } finally {
      setBusy(false);
    }
  };
  const shown = (holders || []).slice(0, 6);
  return (
    <div className="mt-col">
      <div className="mt-card sb-detail">
        <div className="sb-detail-head">
          <SpecialBadgeIcon id={id} size={84} />
          <div>
            <div className="sb-detail-name">{name(id)}</div>
            <div className="sb-detail-meta">
              <span className={`sb-tier-pill t-${row.tier}`}>{tierLabel(row.tier)}</span>
              <span className="mt-muted tnum">{t("badges.holdersShort", { n: num(row.holders) })}</span>
              {row.grantMode === "admin_only" ? <span className="sb-flag"><Lock size={11} /> {t("badges.adminOnly")}</span> : null}
            </div>
            <p className="mt-muted sb-detail-how">{desc(id)}</p>
          </div>
        </div>
        <div className="sb-grant">
          <div className="sb-grant-title"><Gift size={15} /> {t("badges.grantTitle")}</div>
          {full ? <p className="mt-muted sb-full">{t("badges.err_taken")}</p> : (
            <>
              <PersonPicker value={person} onChange={setPerson} />
              <label className="mt-in sb-grant-in"><input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("badges.notePh")} aria-label={t("badges.note")} /></label>
              <div className="sb-grant-foot">
                <span className="mt-muted">{t("badges.grantFoot")}</span>
                <button type="button" className="mt-btn primary sm" disabled={!person || busy} onClick={grant}><Check size={14} /> {t("badges.grantBtn")}</button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-card">
        <h3>{t("badges.holdersTitle")}<span className="sub tnum">{holders ? t("badges.holdersSub", { n: num(holders.length), k: shown.length }) : ""}</span></h3>
        {holders && holders.length === 0 ? <p className="mt-muted">{t("badges.noHolders")}</p> : null}
        <ul className="pc-uses sb-holders">
          {shown.map((h) => (
            <li key={h.userId} className={revoking === h.userId ? "is-revoking" : ""}>
              <Avatar name={h.displayName || h.username} size={28} user={{ id: h.userId, username: h.username, avatarUrl: h.avatarUrl }} animate="none" />
              <div className="pc-uses-who">
                <b>{h.displayName || h.username}</b>
                <span><span className="bp-mono">{formatSerial(h.serial)}</span> · {h.via === "promo" ? t("badges.viaCode") : t("badges.viaAdmin")} · {trtDay(h.grantedAt, locale)}</span>
              </div>
              {h.equipped ? <span className="sb-eq">{t("badges.wearing")}</span> : null}
              {revoking === h.userId ? (
                <div className="sb-revoke-confirm" role="group" aria-label={t("badges.revokeConfirm", { badge: name(id), user: h.displayName || h.username })}>
                  <p>{t("badges.revokeConfirm", { badge: name(id), user: h.displayName || h.username })}</p>
                  <label className="mt-in"><input autoFocus value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder={t("badges.revokeReasonPh")} aria-label={t("badges.revokeReason")}
                    onKeyDown={(e) => { if (e.key === "Enter") revoke(h); if (e.key === "Escape") { e.stopPropagation(); setRevoking(null); } }} /></label>
                  <div className="sb-revoke-actions">
                    <button type="button" className="mt-btn ghost sm" onClick={() => setRevoking(null)}>{t("badges.cancel")}</button>
                    <button type="button" className="mt-btn danger sm" disabled={busy} onClick={() => revoke(h)}><UserMinus size={14} /> {t("badges.revokeGo")}</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="sb-revoke" aria-label={t("badges.revokeAria", { name: h.displayName || h.username })} onClick={() => { setRevoking(h.userId); setReason(""); }}>
                  <UserMinus size={14} /> {t("badges.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
        <AuditList entries={audit} me={me} />
      </div>
    </div>
  );
}

function AuditList({ entries }) {
  const { t, locale, name } = useBadgeCopy();
  return (
    <div className="mt-audit">
      <h4><History size={13} style={{ verticalAlign: -2 }} /> {t("badges.audit")}</h4>
      {entries && entries.length === 0 ? <p className="mt-muted">{t("badges.auditEmpty")}</p> : null}
      <ul>
        {(entries || []).map((e) => {
          const user = who(e.user) || "?";
          const badge = name(e.badgeId);
          const text = e.action === "revoke" ? t("badges.auditRevoke", { user, badge })
            : e.action === "release" ? t("badges.auditRelease", { user, badge })
              : e.source === "promo" ? t("badges.auditGrantPromo", { user, badge })
                : t("badges.auditGrant", { user, badge });
          const actor = e.actor?.username || t("badges.system");
          return (
            <li key={e.id}>
              <b>{actor}</b><span>{text}</span>
              {e.note && e.action !== "release" ? <span className="mt-muted">· {e.action === "revoke" ? t("badges.auditReason", { reason: e.note }) : e.note}</span> : null}
              <time className="tnum">{trtWhen(e.at, locale)}</time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SpecialBadgesAdminTab({ me }) {
  const { t, num } = useBadgeCopy();
  const narrow = useNarrow();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(null);
  const [audit, setAudit] = useState(null);
  const load = useCallback(() => {
    adminSpecialBadgesOverview().then((d) => { setData(d); setFailed(false); refreshAdminBadgeOverview(d); }).catch(() => setFailed(true));
    adminSpecialBadgeAudit({ limit: 12 }).then((d) => setAudit(d?.entries || [])).catch(() => setAudit([]));
    loadCatalog({ fresh: true }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const rows = (data?.badges || []).filter((b) => ART_BY_ID[b.id]);
  const row = rows.find((b) => b.id === sel) || null;
  const k = data?.kpis || {};
  const kpis = [
    { label: t("badges.kpiCatalog"), value: t("badges.kpiCatalogV", { n: num(k.catalog ?? rows.length) }), color: "#bf5af2" },
    { label: t("badges.kpiGranted"), value: num(k.granted), color: "#0a84ff" },
    { label: t("badges.kpiEquipped"), value: num(k.equipped), color: "#30d158" },
    { label: t("badges.kpiCodes"), value: num(k.activeCodes), color: "#ffb340" },
  ];
  if (failed && !data) {
    return (
      <section className="admin-section mt-root pc-root">
        <div className="mt-card"><p className="mt-muted">{t("badges.errLoad")}</p><button type="button" className="mt-btn sm" onClick={load}><RefreshCw size={14} /> {t("badges.retry")}</button></div>
      </section>
    );
  }
  return (
    <section className="admin-section mt-root pc-root sb-admin">
      <div className={`mt-kpis${narrow ? " n2" : " n4"}`}>
        {kpis.map((x) => (
          <div className="mt-card mt-kpi" key={x.label}>
            <div className="mt-kpi-label">{x.label}</div>
            <div className="mt-kpi-value tnum"><span className="mt-dot" style={{ background: x.color, boxShadow: `0 0 10px ${x.color}` }} />{data ? x.value : "…"}</div>
          </div>
        ))}
      </div>
      {row ? (
        <div className={`mt-grid sb-split${narrow ? " is-stack" : ""}`}>
          {narrow ? null : <Catalog rows={rows} sel={sel} onSel={setSel} narrow={narrow} />}
          <div className="mt-col">
            {narrow ? <button type="button" className="mt-btn ghost sm sb-back" onClick={() => setSel(null)}>← {t("badges.catalog")}</button> : null}
            <Detail key={row.id} row={row} me={me} onChanged={load} />
          </div>
        </div>
      ) : (
        <>
          <Catalog rows={rows} sel={null} onSel={setSel} narrow={narrow} />
          <div className="mt-card sb-audit-all"><AuditList entries={audit} /></div>
        </>
      )}
    </section>
  );
}
