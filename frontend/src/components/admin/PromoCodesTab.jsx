import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Coins, ShoppingBag, Award, RefreshCw, Copy, Search, Calendar, Eye, Plus, ChevronDown, Check,
  Megaphone, Users, Clock, Gift, Shield, Ticket, Keyboard, X, Pause, Play,
} from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { useLocale } from "../../context/LocaleContext";
import { copyText } from "../../lib/copyText";
import {
  adminPromoOverview, adminPromoShopItems, adminPromoUsers, adminPromoCreate, adminPromoUpdate, adminPromoRedemptions,
} from "../../api/promo";
import { normalizeCode, codeGroups, generateCode, shortWhen, fmtNum } from "../../lib/promoCode";
import { toTrtInputs, fromTrtInputs, dottedDate } from "../../lib/maintenance";
import { describePromoBadge, getPromoBadges, onPromoBadgesChange } from "../../lib/promoBadges";
import { PromoGiftPopup, BadgeGlyph } from "../promo/PromoUi.jsx";
import "../../styles/maintenance.css";
import "../../styles/promo.css";

const QUICK = [100, 250, 500, 1000];
const AGES = [0, 1, 3, 7, 14, 30];
const AUDIENCES = [["all", "audienceAll"], ["active_7d", "audienceActive"], ["selected", "audienceSelected"]];

function defaultExpiry() {
  const d = toTrtInputs(new Date(Date.now() + 7 * 864e5));
  return { date: d.date, time: "23:59" };
}

function freshForm() {
  const exp = defaultExpiry();
  return {
    mode: "random", code: generateCode(), rewardType: "descoin", amount: 250, itemId: "", badgeId: "",
    message: "", maxUses: "250", expDate: exp.date, expTime: exp.time, age: 7, audience: "active_7d",
    targets: [], oncePerUser: true, active: true,
  };
}

function PickerPart({ type, value, onChange, label, text }) {
  return (
    <span className={`seg-part is-${type}`}>
      <span className="seg-text">{text || "--"}</span>
      <input type={type} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* not allowed */ } }} />
    </span>
  );
}

function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`mt-tg${on ? " on" : ""}`} onClick={() => onChange(!on)} />;
}

function Seg({ label, value, options, onChange, className = "" }) {
  return (
    <div className={`mt-seg ${className}`} role="radiogroup" aria-label={label}>
      {options.map(([id, text, Icon, disabled]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? "on" : ""} disabled={disabled} onClick={() => onChange(id)}>
          {Icon ? <Icon size={13} /> : null}{text}
        </button>
      ))}
    </div>
  );
}

export function RewardCell({ r, t }) {
  if (!r) return null;
  if (r.type === "descoin") return <span className="pc-rw"><Coins size={14} className="pc-rw-ic dc" /><span className="tnum">{fmtNum(r.amount)}</span><span className="mt-muted">DC</span></span>;
  if (r.type === "special_badge") return <span className="pc-rw"><BadgeGlyph badgeId={r.badgeId} size={18} />{describePromoBadge(r.badgeId).name}</span>;
  return <span className="pc-rw"><ShoppingBag size={14} className="pc-rw-ic" />{r.name || t("promo.rewardItem")}</span>;
}

function statusBadge(s, t) {
  if (s === "active") return <span className="mt-badge mt-b-done">{t("promo.stActive")}</span>;
  if (s === "full") return <span className="mt-badge mt-b-cancel">{t("promo.stFull")}</span>;
  if (s === "expired") return <span className="mt-badge mt-b-cancel">{t("promo.stExpired")}</span>;
  return <span className="mt-badge mt-b-cancel">{t("promo.stStopped")}</span>;
}

function useBadgeRegistry() {
  const [reg, setReg] = useState(() => getPromoBadges());
  useEffect(() => onPromoBadgesChange(setReg), []);
  return reg;
}

/** "Seçilenler": username search → chips. Server checks the ids again. */
function PeoplePicker({ value, onChange, t }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const seq = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return undefined; }
    const my = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const data = await adminPromoUsers(term);
        if (my === seq.current) setHits((data?.users || []).filter((u) => !value.some((v) => v.id === u.id)));
      } catch { if (my === seq.current) setHits([]); }
    }, 180);
    return () => clearTimeout(id);
  }, [q, value]);
  return (
    <div className="mt-f">
      <span>{t("promo.pickPeople")}</span>
      <div className="mt-in pc-chips">
        {value.map((u) => (
          <span className="pc-chip" key={u.id}>
            <Avatar name={u.display_name || u.username} size={20} user={{ id: u.id, username: u.username, avatarUrl: u.avatar_url }} animate="none" />
            @{u.username}
            <button type="button" aria-label={t("promo.removePerson", { name: u.username })} onClick={() => onChange(value.filter((v) => v.id !== u.id))}><X size={12} /></button>
          </span>
        ))}
        <input value={q} placeholder={value.length ? "" : t("promo.pickPeoplePh")} aria-label={t("promo.pickPeople")} onChange={(e) => setQ(e.target.value)} />
        {hits.length ? (
          <ul className="pc-suggest" role="listbox">
            {hits.map((u) => (
              <li key={u.id}>
                <button type="button" role="option" aria-selected="false" onClick={() => { onChange([...value, u]); setQ(""); setHits([]); }}>
                  <Avatar name={u.display_name || u.username} size={24} user={{ id: u.id, username: u.username, avatarUrl: u.avatar_url }} animate="none" />
                  <b>{u.display_name || u.username}</b><span>@{u.username}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function PromoForm({ overview, onCreated, t }) {
  const [f, setF] = useState(freshForm);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const reg = useBadgeRegistry();
  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setNote(null); };

  useEffect(() => {
    if (f.rewardType !== "shop_item" || items) return;
    adminPromoShopItems().then((d) => setItems(d?.items || [])).catch(() => setItems([]));
  }, [f.rewardType, items]);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);

  const code = f.mode === "random" ? f.code : normalizeCode(f.code);
  const item = items?.find((i) => String(i.id) === String(f.itemId));
  const reward = f.rewardType === "descoin" ? { type: "descoin", amount: Number(f.amount) || 0 }
    : f.rewardType === "shop_item" ? { type: "shop_item", itemId: f.itemId, name: item?.name }
      : { type: "special_badge", badgeId: f.badgeId };
  const expiresAt = f.expDate ? fromTrtInputs(f.expDate, f.expTime || "23:59") : null;
  const aud = overview?.audience || {};
  const reach = f.audience === "all" ? t("promo.reachAll", { n: fmtNum(aud.all) })
    : f.audience === "active_7d" ? t("promo.reachActive", { n: fmtNum(aud.active7d) })
      : f.audience === "selected" ? t("promo.reachSelected", { n: f.targets.length }) : "";
  const BadgePicker = reg?.Picker;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const out = await adminPromoCreate({
        code, rewardType: f.rewardType,
        rewardAmount: f.rewardType === "descoin" ? Number(f.amount) : undefined,
        rewardRef: f.rewardType === "shop_item" ? f.itemId : f.rewardType === "special_badge" ? f.badgeId : undefined,
        message: f.message, maxUses: f.maxUses === "" ? null : Number(f.maxUses), minAccountAgeDays: f.age,
        oncePerUser: f.oncePerUser, active: f.active, expiresAt,
        popupAudience: f.audience, targetUserIds: f.targets.map((u) => u.id),
      });
      setF((p) => ({ ...freshForm(), rewardType: p.rewardType, amount: p.amount, audience: p.audience }));
      setNote({ ok: true, text: t("promo.created", { code: codeGroups(out?.code || code).join("-") }) });
      onCreated?.(out?.id);
    } catch (err) {
      const key = `promo.err_${err?.message}`;
      const text = t(key);
      setNote({ ok: false, text: text !== key ? text : t("promo.err_generic") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-card pc-form">
      <h3><Ticket size={16} /> {t("promo.newTitle")}<span className="sub">{t("promo.tz")}</span></h3>
      <div className="mt-f">
        <span>{t("promo.code")}</span>
        <div className="pc-code-row">
          <Seg className="pc-mode" label={t("promo.codeMode")} value={f.mode}
            options={[["random", t("promo.modeRandom"), RefreshCw], ["manual", t("promo.modeManual"), Keyboard]]}
            onChange={(mode) => set(mode === "manual" ? { mode, code: "" } : { mode, code: generateCode() })} />
        </div>
        <div className="mt-in pc-code-in">
          {f.mode === "random" ? codeGroups(code).map((g, i) => (
            <span key={i} className="pc-code-grp">{i > 0 && <i aria-hidden="true">–</i>}<span>{g}</span></span>
          )) : (
            <input value={codeGroups(code).filter(Boolean).join("–")} placeholder={t("promo.manualPlaceholder")} aria-label={t("promo.code")}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off"
              onChange={(e) => set({ code: normalizeCode(e.target.value) })} />
          )}
          <span className="pc-code-acts">
            {f.mode === "random" ? <button type="button" className="pc-ibtn" aria-label={t("promo.regenerate")} title={t("promo.regenerate")} onClick={() => set({ code: generateCode() })}><RefreshCw size={15} /></button> : null}
            <button type="button" className="pc-ibtn" aria-label={copied ? t("promo.copied") : t("promo.copyCode")} title={t("promo.copyCode")} disabled={code.length < 16}
              onClick={async () => { await copyText(codeGroups(code).join("-")); setCopied(true); }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </span>
        </div>
        <span className="pc-hint">{t("promo.codeHint")}</span>
      </div>
      <div className="mt-f">
        <span>{t("promo.reward")}</span>
        <Seg className="pc-seg-reward" label={t("promo.rewardType")} value={f.rewardType}
          options={[["descoin", t("promo.rewardDescoin"), Coins], ["shop_item", t("promo.rewardItem"), ShoppingBag], ["special_badge", t("promo.rewardBadge"), Award]]}
          onChange={(rewardType) => set({ rewardType })} />
      </div>
      {f.rewardType === "descoin" && (
        <div className="mt-f">
          <span>{t("promo.amount")}</span>
          <div className="pc-amount">
            <div className="mt-in pc-amount-in"><Coins size={14} className="mt-i" />
              <input className="tnum" type="number" inputMode="numeric" min={1} max={100000} value={f.amount} aria-label={t("promo.amountLabel")}
                onChange={(e) => set({ amount: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
              <span className="mt-muted">DesCoin</span></div>
            <div className="pc-quick">{QUICK.map((n) => <button key={n} type="button" aria-label={`${fmtNum(n)} DesCoin`} aria-pressed={Number(f.amount) === n} className={Number(f.amount) === n ? "on" : ""} onClick={() => set({ amount: n })}>{fmtNum(n)}</button>)}</div>
          </div>
        </div>
      )}
      {f.rewardType === "shop_item" && (
        <div className="mt-f">
          <span>{t("promo.item")}</span>
          <div className="mt-in sel">
            <ShoppingBag size={14} className="mt-i" /><span>{item?.name || t("promo.itemPick")}</span><ChevronDown size={14} className="mt-i" style={{ marginLeft: "auto" }} />
            <select aria-label={t("promo.item")} value={f.itemId} onChange={(e) => set({ itemId: e.target.value })}>
              <option value="">{t("promo.itemPick")}</option>
              {(items || []).map((i) => <option key={i.id} value={i.id}>{i.name} · {fmtNum(i.price_descoin)} DC</option>)}
            </select>
          </div>
        </div>
      )}
      {f.rewardType === "special_badge" && (
        BadgePicker ? <BadgePicker value={f.badgeId} onChange={(badgeId) => set({ badgeId })} />
          : <div className="mt-f"><span>{t("promo.badge")}</span><span className="pc-hint">{t("promo.badgeSoon")}</span></div>
      )}
      <label className="mt-f">
        <span>{t("promo.message")} <em className="pc-opt">{t("promo.optional")}</em></span>
        <div className="mt-in ta pc-ta"><textarea rows={2} maxLength={140} value={f.message} aria-label={t("promo.messageLabel")} onChange={(e) => set({ message: e.target.value })} /><span className="pc-count tnum">{f.message.length}/140</span></div>
      </label>
      <div className="mt-two">
        <label className="mt-f"><span>{t("promo.limit")}</span>
          <div className="mt-in"><Users size={14} className="mt-i" />
            <input className="tnum" type="number" inputMode="numeric" min={1} value={f.maxUses} placeholder={t("promo.unlimited")} onChange={(e) => set({ maxUses: e.target.value.replace(/\D/g, "").slice(0, 7) })} />
            <span className="mt-muted">{t("promo.people")}</span></div></label>
        <div className="mt-f"><span>{t("promo.expires")}</span>
          <div className="mt-in"><Calendar size={14} className="mt-i" />
            <PickerPart type="date" label={t("promo.expiresDate")} value={f.expDate} text={f.expDate ? dottedDate(f.expDate) : t("promo.noExpiry")} onChange={(v) => set({ expDate: v })} />
            {f.expDate ? <><span className="mt-muted">·</span><PickerPart type="time" label={t("promo.expiresTime")} value={f.expTime} text={f.expTime} onChange={(v) => set({ expTime: v })} /></> : null}
          </div></div>
      </div>
      <div className="mt-two">
        <div className="mt-f"><span>{t("promo.minAge")}</span>
          <div className="mt-in sel"><Clock size={14} className="mt-i" /><span>{f.age ? t("promo.ageDays", { n: f.age }) : t("promo.ageNone")}</span><ChevronDown size={14} className="mt-i" style={{ marginLeft: "auto" }} />
            <select aria-label={t("promo.minAge")} value={f.age} onChange={(e) => set({ age: Number(e.target.value) })}>
              {AGES.map((n) => <option key={n} value={n}>{n ? t("promo.ageDays", { n }) : t("promo.ageNone")}</option>)}
            </select></div></div>
        <div className="mt-f"><span>{t("promo.audience")}</span>
          {/* Tapping the chosen audience again turns the popup off ("none"). */}
          <Seg label={t("promo.audience")} value={f.audience} options={AUDIENCES.map(([id, key]) => [id, t(`promo.${key}`)])}
            onChange={(id) => set({ audience: f.audience === id ? "none" : id })} />
        </div>
      </div>
      {f.audience === "selected" ? <PeoplePicker value={f.targets} onChange={(targets) => set({ targets })} t={t} /> : null}
      <div className="mt-row first">
        <Shield size={16} color="#6cb6ff" className="mt-i" />
        <div className="mt-row-copy"><b>{t("promo.oncePerUser")}</b><div className="mt-muted">{t("promo.oncePerUserHint")}</div></div>
        <Toggle on={f.oncePerUser} label={t("promo.oncePerUser")} onChange={(oncePerUser) => set({ oncePerUser })} />
      </div>
      <div className="mt-row">
        <Megaphone size={16} color="#ffb340" className="mt-i" />
        <div className="mt-row-copy"><b>{t("promo.active")}</b><div className="mt-muted">{t("promo.activeHint")}{reach && f.active ? ` · ${reach}` : f.audience === "none" ? ` · ${t("promo.audienceNone")}` : ""}</div></div>
        <Toggle on={f.active} label={t("promo.active")} onChange={(active) => set({ active })} />
      </div>
      {note ? <p className={`pc-hint ${note.ok ? "is-ok" : "is-err"}`} role={note.ok ? "status" : "alert"}>{note.text}</p> : null}
      <div className="mt-form-foot">
        <button type="button" className="mt-btn" style={{ height: 36 }} onClick={() => setPreview(true)}><Eye size={15} /> {t("promo.preview")}</button>
        <button type="button" className="mt-btn primary" style={{ height: 36 }} disabled={busy || code.length !== 16} onClick={create}><Plus size={15} /> {busy ? t("promo.creating") : t("promo.create")}</button>
      </div>
      {preview ? (
        <PromoGiftPopup
          popup={{ id: "preview", code: code.padEnd(16, "•").slice(0, 16), message: f.message, reward, expiresAt }}
          onClose={() => setPreview(false)} onLater={() => setPreview(false)} onUse={() => setPreview(false)}
        />
      ) : null}
    </div>
  );
}

function UsesCard({ code, query, t, onToggle }) {
  const [data, setData] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => { setAll(false); }, [code?.id]);
  useEffect(() => {
    if (!code?.id) return undefined;
    let live = true;
    const id = setTimeout(() => {
      adminPromoRedemptions(code.id, { q: query.trim(), limit: all ? 200 : 6 })
        .then((d) => { if (live) setData(d); })
        .catch(() => { if (live) setData({ total: 0, items: [] }); });
    }, query ? 200 : 0);
    return () => { live = false; clearTimeout(id); };
  }, [code?.id, code?.usedCount, query, all]);
  if (!code) return null;
  const list = data?.items || [];
  return (
    <div className="mt-card">
      <h3>
        <Users size={16} /> <span><span className="pc-mono" style={{ fontSize: 13 }}>{codeGroups(code.code).join("-")}</span> {t("promo.users")}</span>
        <span className="sub tnum">{t("promo.usesSub", { used: fmtNum(code.usedCount), max: code.maxUses ? fmtNum(code.maxUses) : "∞", n: list.length })}</span>
        {code.status === "active" || code.status === "stopped" ? (
          <button type="button" className="mt-btn sm ghost pc-h3-act" onClick={() => onToggle(code)}>
            {code.active ? <><Pause size={13} /> {t("promo.pause")}</> : <><Play size={13} /> {t("promo.resume")}</>}
          </button>
        ) : null}
      </h3>
      {data && !list.length ? <div className="pc-empty">{t("promo.usesNone")}</div> : null}
      <ul className={`pc-uses${all ? " is-all" : ""}`}>
        {list.map((u) => (
          <li key={u.id}>
            <Avatar name={u.user?.displayName || u.user?.username} size={28} user={u.user} animate="none" />
            <div className="pc-uses-who"><b>{u.user?.displayName || u.user?.username}</b><span>@{u.user?.username}</span></div>
            <time className="mt-muted tnum" dateTime={u.at}>{shortWhen(u.at)}</time>
            {u.withheld ? <span className="pc-uses-rw is-held">{t("promo.withheld")}</span>
              : u.descoin ? <span className="pc-uses-rw tnum">+{fmtNum(u.descoin)} DC</span>
                : <span className="pc-uses-rw is-held">{u.reward?.type === "special_badge" ? t("promo.rewardBadge") : t("promo.rewardItem")}</span>}
          </li>
        ))}
      </ul>
      {!all && data && data.total > list.length ? <button type="button" className="mt-btn sm ghost pc-all" onClick={() => setAll(true)}>{t("promo.seeAll", { n: fmtNum(data.total) })}</button> : null}
    </div>
  );
}

/** Admin → Promosyon Kodları. Every call goes through /admin (requireAuth + requireAdmin on the server). */
export default function PromoCodesTab() {
  const { t } = useLocale();
  const [ov, setOv] = useState(null);
  const [failed, setFailed] = useState(false);
  const [selId, setSelId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const data = await adminPromoOverview();
      setOv(data);
      setFailed(false);
      return data;
    } catch {
      setFailed(true);
      return null;
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const codes = useMemo(() => ov?.codes || [], [ov]);
  const q = normalizeCode(query);
  const byCode = q ? codes.filter((c) => c.code.includes(q)) : codes;
  // "Kod ya da kullanıcı ara": a code match filters the table; otherwise the text searches the people list.
  const searchedCodes = byCode.length ? byCode : codes;
  const userQuery = byCode.length && q ? "" : query;
  const visible = searchedCodes.filter((c) => filter === "all" || (filter === "active" ? c.status === "active" : c.status !== "active"));
  const sel = codes.find((c) => c.id === selId) || visible[0] || null;

  const toggle = async (code) => {
    try {
      await adminPromoUpdate(code.id, { active: !code.active });
      await load();
    } catch { setFailed(true); }
  };

  const k = ov?.kpis || {};
  const kpis = [
    { label: t("promo.kpiActive"), value: fmtNum(k.activeCodes), color: "#30d158" },
    { label: t("promo.kpiUses"), value: fmtNum(k.totalUses), color: "#0a84ff" },
    { label: t("promo.kpiDescoin"), value: fmtNum(k.descoinOut), color: "#ffb340" },
    { label: t("promo.kpiRejected"), value: fmtNum(k.rejected24h), color: "#ff6961" },
  ];

  return (
    <section className="admin-section mt-root pc-root">
      <div className="mt-kpis n4">
        {kpis.map((x) => (
          <div className="mt-card mt-kpi" key={x.label}>
            <div className="mt-kpi-label">{x.label}</div>
            <div className="mt-kpi-value tnum"><span className="mt-dot" style={{ background: x.color, boxShadow: `0 0 10px ${x.color}` }} />{ov ? x.value : "–"}</div>
          </div>
        ))}
      </div>
      <div className="mt-grid">
        <div className="mt-col"><PromoForm overview={ov} t={t} onCreated={async (id) => { await load(); if (id) setSelId(id); }} /></div>
        <div className="mt-col">
          <div className="mt-card">
            <h3><Gift size={16} /> {t("promo.codes")}<span className="sub tnum">{t("promo.codesCount", { n: fmtNum(codes.length) })}</span></h3>
            <div className="pc-tools">
              <div className="mt-in pc-search"><Search size={14} className="mt-i" /><input type="search" value={query} placeholder={t("promo.search")} aria-label={t("promo.search")} onChange={(e) => setQuery(e.target.value)} /></div>
              <Seg className="pc-filter" label={t("promo.filter")} value={filter}
                options={[["all", t("promo.filterAll")], ["active", t("promo.filterActive")], ["done", t("promo.filterDone")]]} onChange={setFilter} />
            </div>
            {failed && !ov ? (
              <div className="pc-empty" role="alert">{t("promo.loadFail")} <button type="button" className="mt-btn sm ghost" onClick={load}>{t("promo.retry")}</button></div>
            ) : ov && !codes.length ? (
              <div className="pc-empty">{t("promo.empty")}</div>
            ) : ov && !visible.length ? (
              <div className="pc-empty">{t("promo.noMatch")}</div>
            ) : (
              <div className="pc-table-wrap">
                <table className="mt-h pc-table">
                  <thead><tr><th>{t("promo.colCode")}</th><th>{t("promo.colReward")}</th><th className="r">{t("promo.colUses")}</th><th className="pc-col-ends">{t("promo.colEnds")}</th><th className="pc-col-st">{t("promo.colStatus")}</th></tr></thead>
                  <tbody>
                    {visible.map((c) => (
                      <tr key={c.id} className={sel?.id === c.id ? "is-sel" : ""} tabIndex={0} aria-selected={sel?.id === c.id}
                        onClick={() => setSelId(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(c.id); } }}>
                        <td><span className="pc-mono">{codeGroups(c.code).join("-")}</span><span className="pc-st-inline">{statusBadge(c.status, t)}</span></td>
                        <td><RewardCell r={c.reward} t={t} /></td>
                        <td className="r"><span className="tnum">{fmtNum(c.usedCount)}</span><span className="mt-muted tnum"> / {c.maxUses ? fmtNum(c.maxUses) : "∞"}</span>
                          {c.maxUses ? <div className="pc-bar"><i style={{ width: `${Math.min(100, Math.round((c.usedCount / c.maxUses) * 100))}%` }} /></div> : null}</td>
                        <td className="mt-muted tnum pc-col-ends">{shortWhen(c.expiresAt)}</td>
                        <td className="pc-col-st">{statusBadge(c.status, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <UsesCard code={sel} query={userQuery} t={t} onToggle={toggle} />
        </div>
      </div>
    </section>
  );
}
