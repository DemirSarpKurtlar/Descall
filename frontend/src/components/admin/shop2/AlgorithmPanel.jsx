/**
 * Vitrin algoritması (Draft A frame A1, right column): pool, rarity weights with the live
 * colour strip and "+4" deltas, slot price bands, toggles, versions ("v13'e dön"),
 * simulate on 10 000 sampled users, apply at the next 00:00 Istanbul.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { formatAppDateTime } from "../../../lib/datetime";
import { stepUpHeaders } from "../../../lib/adminStepUp";
import { Clock, FlaskConical, History, Play, RotateCcw, SlidersHorizontal, UserRound } from "../../ui/Icon.jsx";
import { shop2Api } from "./adminShop2Api.js";
import { Dialog, Pill, Popover, ReasonField, Skel, Switch, Tabs, useFmt } from "./ui.jsx";
import { RARITIES, RARITY_COLOR, normalizeWeights, reasonOk, ruleChanges, setWeight, validBands, weightDiff } from "./shop2Model.js";

const TOGGLES = ["hideOwned", "noRepeat", "minEpic", "lockSurvives", "featureSetPieces"];
const DEFAULT_TOGGLES = { hideOwned: true, noRepeat: true, noRepeatDays: 7, minEpic: true, lockSurvives: true, featureSetPieces: false };

function draftFrom(rules) {
  const live = rules?.live;
  const d = rules?.draft || live;
  if (!d) return null;
  return {
    version: rules?.draft?.version || (live?.version || 0) + 1,
    weights: normalizeWeights(d.weights),
    bands: (d.bands?.length === 4 ? d.bands : [[150, 600], [600, 1500], [1500, 3000], [3000, null]]).map((b) => [...b]),
    toggles: { ...DEFAULT_TOGGLES, ...(d.toggles || {}) },
    newAccount: { days: 3, slotCap: 1500, ...(d.newAccount || {}) },
  };
}

export default function AlgorithmPanel({ rules, now, onChanged, notify, fail, compact = false }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const [tab, setTab] = useState("weights");
  const [draft, setDraft] = useState(() => draftFrom(rules));
  const [dirty, setDirty] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [sim, setSim] = useState(null); // { loading } | result
  const [revert, setRevert] = useState(null); // version
  const [apply, setApply] = useState(false);
  const verRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!dirty) setDraft(draftFrom(rules));
  }, [rules, dirty]);

  // Keep the server draft in step without prompting for a code mid-drag: only while a
  // step-up token is already valid; otherwise it is sent with simulate / apply.
  useEffect(() => {
    if (!dirty || !draft) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (Object.keys(stepUpHeaders() || {}).length) shop2Api.saveDraft(draft).catch(() => {});
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [draft, dirty]);

  const live = rules?.live;
  const changes = useMemo(() => (draft && live ? ruleChanges(draft, live) : 0), [draft, live]);
  const diff = useMemo(() => (draft && live ? weightDiff(draft.weights, live.weights) : {}), [draft, live]);
  const prev = (rules?.versions || []).filter((v) => v.version < (live?.version || 0)).sort((a, b) => b.version - a.version)[0];
  const scheduled = rules?.scheduled;

  const edit = (fn) => {
    setDirty(true);
    setDraft((d) => fn({ ...d, weights: { ...d.weights }, bands: d.bands.map((b) => [...b]), toggles: { ...d.toggles }, newAccount: { ...d.newAccount } }));
  };

  const runSim = async () => {
    setSim({ loading: true });
    try {
      const r = await shop2Api.simulate(draft);
      setSim(r || {});
    } catch (e) {
      setSim(null);
      fail(e);
    }
  };

  if (!rules) {
    return (
      <section className="as2-card as2-algo" data-testid="as2-algo">
        <header className="as2-ch">
          <h2>
            <SlidersHorizontal size={17} />
            {t("adminShop2.algo.title")}
          </h2>
        </header>
        <Skel h={200} r={12} />
      </section>
    );
  }
  if (!draft) return null;

  return (
    <section className="as2-card as2-algo" data-testid="as2-algo">
      <header className="as2-ch">
        <h2>
          <SlidersHorizontal size={17} />
          {t("adminShop2.algo.title")}
        </h2>
        {changes ? <Pill tone="amber">{t("adminShop2.algo.draftBadge", { v: draft.version, n: changes })}</Pill> : <Pill tone="gray">{t("adminShop2.algo.liveBadge", { v: live?.version || 0 })}</Pill>}
        <span className="as2-rel as2-ml" ref={verRef}>
          <button type="button" className="as2-link" onClick={() => setVerOpen((v) => !v)} aria-expanded={verOpen} data-testid="as2-versions">
            {t("adminShop2.algo.versions")}
          </button>
        </span>
        <Popover open={verOpen} onClose={() => setVerOpen(false)} anchorRef={verRef} width={320} label={t("adminShop2.algo.versions")}>
          <div className="as2-pop-cap">{t("adminShop2.algo.versions")}</div>
          {(rules.versions || []).slice(0, 8).map((v) => (
            <div key={v.version} className="as2-ver-row">
              <span className="as2-ver-n">v{v.version}</span>
              <span className="as2-ver-t">
                <b>{v.note || t("adminShop2.algo.noNote")}</b>
                <small>
                  {v.at ? formatAppDateTime(v.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  {v.by ? ` · ${v.by}` : ""}
                </small>
              </span>
              {v.version === live?.version ? (
                <Pill tone="green">{t("adminShop2.algo.liveNow")}</Pill>
              ) : (
                <button
                  type="button"
                  className="as2-link"
                  onClick={() => {
                    setVerOpen(false);
                    setRevert(v.version);
                  }}
                >
                  {t("adminShop2.algo.backTo", { v: v.version })}
                </button>
              )}
            </div>
          ))}
        </Popover>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        label={t("adminShop2.algo.title")}
        options={[
          { id: "pool", label: t("adminShop2.algo.pool"), count: rules.pool?.total ?? live?.pool ?? null },
          { id: "weights", label: t("adminShop2.algo.weights") },
          { id: "rules", label: t("adminShop2.algo.rules"), count: TOGGLES.length + 1 },
          { id: "newAccount", label: t("adminShop2.algo.newAccount") },
        ]}
      />

      <div className="as2-algo-body">
        {tab === "weights" ? (
          <>
            <div className="as2-cap">{t("adminShop2.algo.rarityWeight")}</div>
            <div className="as2-wstrip" aria-hidden="true">
              {RARITIES.map((r) => (
                <i key={r} style={{ flexGrow: Math.max(0.5, draft.weights[r]), background: RARITY_COLOR[r] }} />
              ))}
            </div>
            <div className="as2-wrows">
              {RARITIES.map((r) => (
                <div key={r} className={`as2-wrow is-${r}`}>
                  <span className="as2-wname" style={{ "--rc": RARITY_COLOR[r] }}>
                    {t(`adminShop2.rarity.${r}`)}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="1"
                    value={draft.weights[r]}
                    onChange={(e) => edit((d) => ({ ...d, weights: setWeight(d.weights, r, Number(e.target.value)) }))}
                    style={{ "--rc": RARITY_COLOR[r], "--fill": `${(draft.weights[r] / 80) * 100}%` }}
                    aria-label={t(`adminShop2.rarity.${r}`)}
                    data-testid={`as2-w-${r}`}
                  />
                  <b className="tnum">{f.p(draft.weights[r], 0)}</b>
                  <span className={`as2-wdiff tnum${diff[r] ? (diff[r] > 0 ? " is-up" : " is-down") : ""}`}>{diff[r] ? `${diff[r] > 0 ? "+" : "−"}${Math.abs(diff[r])}` : ""}</span>
                </div>
              ))}
            </div>
            <div className="as2-cap as2-mt12">{t("adminShop2.algo.bands")}</div>
            <div className="as2-bands">
              {draft.bands.map((b, i) => (
                <BandBox key={i} index={i} band={b} onChange={(nb) => edit((d) => ({ ...d, bands: d.bands.map((x, j) => (j === i ? nb : x)) }))} />
              ))}
            </div>
            {!validBands(draft.bands) ? <p className="as2-hint is-amber">{t("adminShop2.algo.bandsBad")}</p> : null}
            <Toggles draft={draft} edit={edit} />
          </>
        ) : tab === "pool" ? (
          <PoolTab pool={rules.pool} />
        ) : tab === "rules" ? (
          <RulesTab draft={draft} edit={edit} live={live} />
        ) : (
          <NewAccountTab draft={draft} edit={edit} />
        )}
      </div>

      <footer className="as2-algo-ft">
        <button type="button" className="as2-btn" onClick={runSim} data-testid="as2-simulate">
          <FlaskConical size={15} />
          {t("adminShop2.algo.simulate")}
        </button>
        {prev ? (
          <button type="button" className="as2-btn" onClick={() => setRevert(prev.version)}>
            <RotateCcw size={15} />
            {t("adminShop2.algo.backTo", { v: prev.version })}
          </button>
        ) : null}
        {scheduled ? (
          <span className="as2-sched as2-ml">
            <Clock size={14} />
            {t("adminShop2.algo.scheduled", { v: scheduled.version })}
          </span>
        ) : null}
        <button type="button" className={`as2-btn is-p${scheduled ? "" : " as2-ml"}`} disabled={!changes || !validBands(draft.bands)} onClick={() => setApply(true)} data-testid="as2-apply">
          <Clock size={15} />
          {t("adminShop2.algo.applyMidnight")}
        </button>
      </footer>

      <SimulateDialog sim={sim} onClose={() => setSim(null)} draft={draft} />
      <ApplyDialog
        open={apply}
        draft={draft}
        live={live}
        changes={changes}
        onClose={() => setApply(false)}
        onDone={() => {
          setApply(false);
          setDirty(false);
          notify(t("adminShop2.toast.applyScheduled", { v: draft.version }));
          onChanged?.();
        }}
        fail={fail}
      />
      <RevertDialog
        version={revert}
        onClose={() => setRevert(null)}
        onDone={(v) => {
          setRevert(null);
          setDirty(false);
          notify(t("adminShop2.toast.reverted", { v }));
          onChanged?.();
        }}
        fail={fail}
      />
    </section>
  );
}

function BandBox({ index, band, onChange }) {
  const { t } = useLocale();
  const f = useFmt();
  const [edit, setEdit] = useState(false);
  const [lo, setLo] = useState(String(band[0]));
  const [hi, setHi] = useState(band[1] == null ? "" : String(band[1]));
  useEffect(() => {
    setLo(String(band[0]));
    setHi(band[1] == null ? "" : String(band[1]));
  }, [band]);
  const commit = () => {
    setEdit(false);
    const a = Math.max(0, Number(lo) || 0);
    const b = hi === "" ? null : Math.max(a + 10, Number(hi) || 0);
    onChange([a, b]);
  };
  return (
    <div className={`as2-band${edit ? " is-edit" : ""}`}>
      <small>{t("adminShop2.algo.slot", { n: index + 1 })}</small>
      {edit ? (
        <span className="as2-band-in">
          <input value={lo} onChange={(e) => setLo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label={t("adminShop2.algo.bandMin")} data-autofocus="" onKeyDown={(e) => e.key === "Enter" && commit()} />
          <input value={hi} onChange={(e) => setHi(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label={t("adminShop2.algo.bandMax")} placeholder={t("adminShop2.algo.bandOpen")} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
        </span>
      ) : (
        <button type="button" onClick={() => setEdit(true)} className="tnum">
          {band[1] == null ? (index === 3 ? t("adminShop2.algo.epicUp") : t("adminShop2.algo.bandFrom", { a: f.n(band[0]) })) : `${f.n(band[0])}–${f.n(band[1])}`}
        </button>
      )}
    </div>
  );
}

function Toggles({ draft, edit }) {
  const { t } = useLocale();
  const tg = draft.toggles;
  const set = (k, v) => edit((d) => ({ ...d, toggles: { ...d.toggles, [k]: v } }));
  return (
    <div className="as2-toggles">
      <label className="as2-tg">
        <Switch checked={tg.hideOwned} onChange={(v) => set("hideOwned", v)} label={t("adminShop2.algo.tg.hideOwned")} />
        <span>{t("adminShop2.algo.tg.hideOwned")}</span>
      </label>
      <label className="as2-tg">
        <Switch checked={tg.noRepeat} onChange={(v) => set("noRepeat", v)} label={t("adminShop2.algo.tg.noRepeat")} />
        <span className="as2-tg-inline">
          {t("adminShop2.algo.tg.noRepeatA")}
          <input
            className="as2-mini-num tnum"
            value={tg.noRepeatDays}
            inputMode="numeric"
            onChange={(e) => set("noRepeatDays", Math.max(1, Math.min(30, Number(e.target.value.replace(/\D/g, "")) || 1)))}
            aria-label={t("adminShop2.algo.tg.noRepeatDays")}
          />
          {t("adminShop2.algo.tg.noRepeatB")}
        </span>
      </label>
      <label className="as2-tg">
        <Switch checked={tg.minEpic} onChange={(v) => set("minEpic", v)} label={t("adminShop2.algo.tg.minEpic")} />
        <span>{t("adminShop2.algo.tg.minEpic")}</span>
      </label>
      <label className="as2-tg">
        <Switch checked={tg.featureSetPieces} onChange={(v) => set("featureSetPieces", v)} label={t("adminShop2.algo.tg.featureSetPieces")} />
        <span>{t("adminShop2.algo.tg.featureSetPieces")}</span>
        {!tg.featureSetPieces ? <small className="as2-muted as2-ml">{t("adminShop2.off")}</small> : null}
      </label>
    </div>
  );
}

function PoolTab({ pool }) {
  const { t } = useLocale();
  const f = useFmt();
  if (!pool) return <p className="as2-empty">{t("adminShop2.algo.poolNone")}</p>;
  const cats = Object.entries(pool.byCategory || {}).sort((a, b) => b[1] - a[1]);
  const maxC = Math.max(1, ...cats.map(([, n]) => n));
  return (
    <div className="as2-pool">
      <div className="as2-pool-sum">
        <span>
          <b className="tnum">{f.n(pool.total)}</b>
          <small>{t("adminShop2.algo.poolActive")}</small>
        </span>
        <span>
          <b className="tnum">{f.n(pool.setOnly ?? 0)}</b>
          <small>{t("adminShop2.algo.poolSetOnly")}</small>
        </span>
        <span>
          <b className="tnum">{f.n(pool.retired ?? 0)}</b>
          <small>{t("adminShop2.algo.poolRetired")}</small>
        </span>
      </div>
      <div className="as2-pool-rar">
        {RARITIES.map((r) => (
          <span key={r} style={{ "--rc": RARITY_COLOR[r] }}>
            <i />
            {t(`adminShop2.rarity.${r}`)}
            <b className="tnum">{f.n(pool.byRarity?.[r] ?? 0)}</b>
          </span>
        ))}
      </div>
      <div className="as2-pool-cats">
        {cats.map(([c, n]) => (
          <div key={c} className="as2-pool-cat">
            <span>{t(`adminShop2.cat.${c}`)}</span>
            <i>
              <b style={{ width: `${(n / maxC) * 100}%` }} />
            </i>
            <em className="tnum">{f.n(n)}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function RulesTab({ draft, edit, live }) {
  const { t } = useLocale();
  const set = (k, v) => edit((d) => ({ ...d, toggles: { ...d.toggles, [k]: v } }));
  const rows = [
    ["hideOwned", "adminShop2.algo.rule.hideOwned"],
    ["noRepeat", "adminShop2.algo.rule.noRepeat"],
    ["minEpic", "adminShop2.algo.rule.minEpic"],
    ["lockSurvives", "adminShop2.algo.rule.lockSurvives"],
    ["featureSetPieces", "adminShop2.algo.rule.featureSetPieces"],
  ];
  return (
    <ol className="as2-rstack">
      <li className="is-fixed">
        <span className="as2-rs-n tnum">1</span>
        <span className="as2-rs-t">
          <b>{t("adminShop2.algo.rule.retired.t")}</b>
          <small>{t("adminShop2.algo.rule.retired.d")}</small>
        </span>
        <Pill tone="gray">{t("adminShop2.algo.always")}</Pill>
      </li>
      {rows.map(([k, base], i) => {
        const changed = String(draft.toggles[k]) !== String(live?.toggles?.[k] ?? DEFAULT_TOGGLES[k]);
        return (
          <li key={k} className={changed ? "is-changed" : ""}>
            <span className="as2-rs-n tnum">{i + 2}</span>
            <span className="as2-rs-t">
              <b>{t(`${base}.t`)}</b>
              <small>{t(`${base}.d`, { n: draft.toggles.noRepeatDays })}</small>
            </span>
            <Switch checked={Boolean(draft.toggles[k])} onChange={(v) => set(k, v)} label={t(`${base}.t`)} />
          </li>
        );
      })}
    </ol>
  );
}

function NewAccountTab({ draft, edit }) {
  const { t } = useLocale();
  const f = useFmt();
  const na = draft.newAccount;
  const set = (k, v) => edit((d) => ({ ...d, newAccount: { ...d.newAccount, [k]: v } }));
  return (
    <div className="as2-na">
      <p className="as2-hint">
        <UserRound size={14} /> {t("adminShop2.algo.na.intro")}
      </p>
      <div className="as2-num-grid">
        <NumBox label={t("adminShop2.algo.na.days")} value={na.days} unit={t("adminShop2.unit.days")} onChange={(v) => set("days", v)} min={0} max={30} />
        <NumBox label={t("adminShop2.algo.na.cap")} value={na.slotCap} unit="D" onChange={(v) => set("slotCap", v)} min={0} max={20000} step={50} />
      </div>
      <p className="as2-hint is-blue">{t("adminShop2.algo.na.example", { days: na.days, cap: f.n(na.slotCap) })}</p>
    </div>
  );
}

export function NumBox({ label, value, unit, onChange, min = 0, max = 999999, step = 1, tag, testId }) {
  return (
    <label className="as2-numbox" data-testid={testId}>
      <small>{label}</small>
      <span>
        <input
          className="tnum"
          inputMode="numeric"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d]/g, "");
            onChange(raw === "" ? min : Math.max(min, Math.min(max, Number(raw))));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onChange(Math.min(max, Number(value || 0) + step));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              onChange(Math.max(min, Number(value || 0) - step));
            }
          }}
        />
        {unit ? <em>{unit}</em> : null}
        {tag}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ dialogs */

function SimulateDialog({ sim, onClose, draft }) {
  const { t } = useLocale();
  const f = useFmt();
  const open = Boolean(sim);
  const r = sim && !sim.loading ? sim : null;
  return (
    <Dialog open={open} onClose={onClose} icon={FlaskConical} title={t("adminShop2.sim.title")} subtitle={t("adminShop2.sim.sub", { n: f.n(r?.sample || 10000), v: draft?.version || "" })} width={680} testId="as2-sim-dialog" footer={<button type="button" className="as2-btn" onClick={onClose}>{t("adminShop2.close")}</button>}>
      {!r ? (
        <div className="as2-sim-load">
          <Skel h={18} w="60%" />
          <Skel h={120} r={12} />
          <p className="as2-hint">{t("adminShop2.sim.running")}</p>
        </div>
      ) : (
        <div className="as2-sim">
          <div className="as2-sim-kpis">
            <Kpi label={t("adminShop2.sim.repeat")} value={f.p(r.repeatPct ?? 0)} good={(r.repeatPct ?? 0) === 0} sub={t("adminShop2.sim.goal0")} />
            <Kpi label={t("adminShop2.sim.ownedLeak")} value={f.n(r.ownedLeak ?? 0)} good={(r.ownedLeak ?? 0) === 0} sub={t("adminShop2.sim.noLeak")} />
            <Kpi label={t("adminShop2.sim.minEpic")} value={f.p(r.minEpicPct ?? 100, 0)} good={(r.minEpicPct ?? 100) >= 100} sub={t("adminShop2.sim.minEpicSub")} />
            <Kpi label={t("adminShop2.sim.neverShown")} value={f.n(r.neverShown ?? 0)} sub={t("adminShop2.sim.neverShownSub")} />
          </div>
          <div className="as2-cap">{t("adminShop2.sim.rarity")}</div>
          <div className="as2-sim-bars">
            {RARITIES.map((k) => {
              const target = r.rarity?.[k]?.target ?? draft?.weights?.[k] ?? 0;
              const actual = r.rarity?.[k]?.actual ?? 0;
              const m = Math.max(40, ...RARITIES.map((x) => Math.max(r.rarity?.[x]?.target ?? 0, r.rarity?.[x]?.actual ?? 0)));
              return (
                <div key={k} className="as2-sim-bar" style={{ "--rc": RARITY_COLOR[k] }}>
                  <span className="as2-sim-cols">
                    <i className="is-target" style={{ height: `${(target / m) * 100}%` }} />
                    <i className="is-actual" style={{ height: `${(actual / m) * 100}%` }} />
                  </span>
                  <small>{t(`adminShop2.rarity.${k}`)}</small>
                  <em className="tnum">
                    {f.p(target, 0)} → {f.p(actual, 0)}
                  </em>
                </div>
              );
            })}
          </div>
          <div className="as2-cap">{t("adminShop2.sim.slots")}</div>
          <div className="as2-sim-slots">
            {(r.slots || []).map((s, i) => (
              <span key={i}>
                <small>{t("adminShop2.algo.slot", { n: i + 1 })}</small>
                <b className="tnum">
                  {f.n(s.avgPrice)} D
                </b>
                <em className="tnum">{t("adminShop2.sim.buyRate", { pct: f.p(s.buyPct ?? 0) })}</em>
              </span>
            ))}
          </div>
          {r.notes?.length ? (
            <ul className="as2-sim-notes">
              {r.notes.map((n, i) => (
                <li key={i}>{typeof n === "string" ? n : t(n.key, n.vars)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function Kpi({ label, value, sub, good }) {
  return (
    <div className={`as2-kpi${good === true ? " is-good" : good === false ? " is-bad" : ""}`}>
      <small>{label}</small>
      <b className="tnum">{value}</b>
      <em>{sub}</em>
    </div>
  );
}

function ApplyDialog({ open, draft, live, changes, onClose, onDone, fail }) {
  const { t } = useLocale();
  const f = useFmt();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const diff = draft && live ? weightDiff(draft.weights, live.weights) : {};
  const go = async () => {
    setBusy(true);
    try {
      await shop2Api.saveDraft(draft);
      await shop2Api.applyRules({ reason: reason.trim(), at: "midnight" });
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Clock}
      title={t("adminShop2.apply.title", { v: draft?.version || "" })}
      subtitle={t("adminShop2.apply.sub")}
      width={560}
      testId="as2-apply-dialog"
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-p" onClick={go} disabled={busy || !reasonOk(reason)} data-testid="as2-apply-confirm">
            <Play size={15} />
            {busy ? t("adminShop2.saving") : t("adminShop2.apply.go")}
          </button>
        </>
      }
    >
      <div className="as2-diffs">
        <div className="as2-cap">{t("adminShop2.apply.changes", { n: changes })}</div>
        {RARITIES.filter((r) => diff[r]).map((r) => (
          <div key={r} className="as2-diff-row">
            <span>{t(`adminShop2.rarity.${r}`)}</span>
            <s className="tnum">{f.p(normalizeWeights(live.weights)[r], 0)}</s>
            <b className="tnum">{f.p(draft.weights[r], 0)}</b>
          </div>
        ))}
        {draft?.bands?.map((b, i) =>
          String(b) !== String(live?.bands?.[i]) ? (
            <div key={`b${i}`} className="as2-diff-row">
              <span>{t("adminShop2.algo.slot", { n: i + 1 })}</span>
              <s className="tnum">{(live?.bands?.[i] || []).map((x) => (x == null ? "∞" : f.n(x))).join("–")}</s>
              <b className="tnum">{b.map((x) => (x == null ? "∞" : f.n(x))).join("–")}</b>
            </div>
          ) : null
        )}
        {Object.keys(draft?.toggles || {}).map((k) =>
          String(draft.toggles[k]) !== String(live?.toggles?.[k] ?? DEFAULT_TOGGLES[k]) ? (
            <div key={k} className="as2-diff-row">
              <span>{t(`adminShop2.algo.tgName.${k}`)}</span>
              <s>{String(live?.toggles?.[k] ?? DEFAULT_TOGGLES[k])}</s>
              <b>{String(draft.toggles[k])}</b>
            </div>
          ) : null
        )}
      </div>
      <p className="as2-hint is-blue">
        <History size={14} /> {t("adminShop2.apply.note")}
      </p>
      <ReasonField value={reason} onChange={setReason} autoFocus testId="as2-apply-reason" />
    </Dialog>
  );
}

function RevertDialog({ version, onClose, onDone, fail }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (version != null) setReason("");
  }, [version]);
  const go = async () => {
    setBusy(true);
    try {
      await shop2Api.revertRules(version, reason.trim());
      onDone(version);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={version != null}
      onClose={onClose}
      busy={busy}
      icon={RotateCcw}
      tone="amber"
      title={t("adminShop2.revert.title", { v: version ?? "" })}
      subtitle={t("adminShop2.revert.sub")}
      width={520}
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-danger" onClick={go} disabled={busy || !reasonOk(reason)}>
            <RotateCcw size={15} />
            {t("adminShop2.revert.go", { v: version ?? "" })}
          </button>
        </>
      }
    >
      <ReasonField value={reason} onChange={setReason} autoFocus />
    </Dialog>
  );
}
