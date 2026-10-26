// Plugs special badges into the promo-code feature (lib/promoBadges contract from PR #276):
// the glyph, the name/tier/holders text, and the admin badge picker in the promo form.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Check, Search, Lock } from "../ui/Icon.jsx";
import { registerPromoBadges } from "../../lib/promoBadges";
import { translate } from "../../i18n";
import { SpecialBadgeIcon, TIER_ORDER, ART_BY_ID } from "./specialBadgeArt.jsx";
import { useBadgeCopy } from "./SpecialBadge.jsx";
import { catalogRow, holdersOf } from "../../lib/specialBadges";
import { adminSpecialBadgesOverview } from "../../api/specialBadges";

let adminRows = null;
let adminPromise = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

/** Share the admin overview (grant modes, holders) with the promo picker. */
export function refreshAdminBadgeOverview(data) {
  if (data?.badges) { adminRows = data.badges; emit(); return Promise.resolve(adminRows); }
  if (!adminPromise) {
    adminPromise = adminSpecialBadgesOverview()
      .then((d) => { adminRows = d?.badges || []; emit(); return adminRows; })
      .finally(() => { adminPromise = null; });
  }
  return adminPromise;
}

/** Why a badge can't go on a promo code (or null if it can). */
export function promoLockReason(row) {
  if (!row) return null;
  if (row.grantMode === "admin_only") return "adminOnly";
  if (row.active === false) return "inactive";
  if (row.maxHolders != null && row.holders >= row.maxHolders) return "taken";
  return null;
}

function BadgePicker({ value, onChange }) {
  const { t, name, desc, tierLabel, num } = useBadgeCopy();
  const rows = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => adminRows, () => null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);
  useEffect(() => { if (!rows) refreshAdminBadgeOverview().catch(() => {}); }, [rows]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", close, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  const groups = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    const list = (rows || []).filter((r) => ART_BY_ID[r.id] && (!needle || name(r.id).toLocaleLowerCase("tr").includes(needle)));
    return TIER_ORDER.map((tier) => [tier, list.filter((r) => r.tier === tier)]).filter(([, l]) => l.length);
  }, [rows, q, name]);
  const cur = (rows || []).find((r) => r.id === value);
  const lockText = (why) => (why === "adminOnly" ? t("badges.pickerAdminOnly") : why === "taken" ? t("badges.tekilTaken") : t("badges.err_badge_inactive"));
  return (
    <div className="sb-field" ref={box}>
      <button type="button" className={`mt-in sb-trigger${open ? " is-open" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {cur ? (
          <>
            <SpecialBadgeIcon id={cur.id} size={22} />
            <b>{name(cur.id)}</b>
            <span className={`sb-tier-pill t-${cur.tier}`}>{tierLabel(cur.tier)}</span>
            <span className="mt-muted tnum sb-trigger-n">{t("badges.holdersShort", { n: num(cur.holders) })}</span>
          </>
        ) : <span className="mt-muted sb-trigger-n0">{t("badges.pickerPlaceholder")}</span>}
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="sb-pop" role="listbox" aria-label={t("badges.pickerPlaceholder")}>
          <label className="mt-in sb-pop-search"><Search size={14} className="mt-i" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("badges.search")} aria-label={t("badges.search")} /></label>
          <div className="sb-pop-scroll">
            {!rows ? <div className="sb-pop-group">…</div> : null}
            {groups.map(([tier, list]) => (
              <div key={tier} role="group" aria-label={tierLabel(tier)}>
                <div className="sb-pop-group">{tierLabel(tier)}</div>
                {list.map((r) => {
                  const why = promoLockReason(r);
                  const on = r.id === value;
                  return (
                    <button type="button" role="option" aria-selected={on} aria-disabled={Boolean(why)} key={r.id}
                      className={`sb-pop-row${on ? " on" : ""}${why ? " is-locked" : ""}`}
                      onClick={() => { if (why) return; onChange(r.id); setOpen(false); }}>
                      <SpecialBadgeIcon id={r.id} size={26} />
                      <span className="sb-pop-copy"><b>{name(r.id)}</b><span>{why ? lockText(why) : desc(r.id)}</span></span>
                      {why ? <Lock size={13} className="mt-muted" /> : <span className="mt-muted tnum">{num(r.holders)}</span>}
                      {on ? <Check size={14} className="sb-pop-check" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PromoIcon({ badgeId, size = 18 }) {
  return <SpecialBadgeIcon id={badgeId} size={size} />;
}

/** Called from App whenever the locale changes so promo text matches the UI language. */
export function registerSpecialPromoBadges(locale) {
  const tr = (key, vars) => {
    const v = translate(locale, key, vars);
    return v && v !== key ? v : null;
  };
  registerPromoBadges({
    Icon: PromoIcon,
    describe(id) {
      if (!ART_BY_ID[id]) return null;
      const tier = ART_BY_ID[id].tier;
      return {
        name: tr(`badges.names.${id}`) || catalogRow(id)?.name || id,
        tierLabel: tr(`badges.tier_${tier}`) || tier,
        holders: holdersOf(id),
      };
    },
    Picker: BadgePicker,
  });
}
