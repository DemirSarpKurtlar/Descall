/**
 * Sunucu Ağı dialogs (opaque; bottom sheets on a phone, admin-tokens.css + admin-nodes.css):
 *   DrainDialog      graceful drain of the PC: reason (quick picks), who moves
 *   EmergencyDialog  everyone to Render now: reason + "I understand" confirmation
 *   DrillDialog      failover drill: what happens, live timer, result (moved / dropped / s)
 *   ScheduleDialog   weekly hour grid (drag to paint, presets, Istanbul time), plan switch
 *   KeysDrawer       node keys: list, create (secret shown once with copy), revoke, open /
 *                    close the PC setup window (POST /api/node/bootstrap, 30 min)
 *   RevokeKeyDialog  reason + type the key name
 * Every change needs the 2FA step-up (the shared prompt opens from adminFetch).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../../../lib/copyText.js";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AlertCircle, AlertTriangle, Calendar, Check, Copy, Eye, EyeOff, FlaskConical, KeyRound, Plus, Power, RefreshCw, Trash2 } from "../../ui/Icon.jsx";
import { Dialog, Drawer, Skel, Toggle } from "../tokens/TokenUi.jsx";
import { useNx } from "./NodeCards.jsx";
import { nodeApi } from "./nodeApi.js";
import {
  DAY_ORDER,
  KEY_NAME_MAX,
  REASON_MAX,
  agoLabel,
  capacityFor,
  errorKey,
  gridHours,
  gridToSlots,
  keyNameOk,
  keyWindow,
  maskKey,
  pickNodes,
  presetGrid,
  reasonOk,
  slotsToGrid,
} from "./nodeModel.js";

function ReasonField({ value, onChange, picks = [], testId, autoFocus = true }) {
  const { t } = useNx();
  return (
    <div className="atk-field">
      <label className="atk-lb">
        <span>{t("anodes.dlg.reason")}</span>
        <em>{t("anodes.dlg.reasonHint")}</em>
      </label>
      {picks.length ? (
        <div className="anx-chips">
          {picks.map((k) => (
            <button key={k} type="button" className={value === t(k) ? "is-on" : ""} onClick={() => onChange(t(k))}>
              {t(k)}
            </button>
          ))}
        </div>
      ) : null}
      <textarea className="atk-inp is-area is-text" rows={2} maxLength={REASON_MAX} value={value} onChange={(e) => onChange(e.target.value)} data-autofocus={autoFocus ? "" : undefined} data-testid={testId} />
    </div>
  );
}

function ErrLine({ err }) {
  const { t } = useNx();
  if (!err) return null;
  return (
    <p className="atk-err anx-errline" role="alert">
      <AlertCircle size={14} aria-hidden="true" />
      <span>{t(errorKey(err))}</span>
    </p>
  );
}

/* ---------------- drain ---------------- */

export function DrainDialog({ open, data, onClose, onDone }) {
  const f = useNx();
  const { t } = f;
  const { pc } = pickNodes(data);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setBusy(false);
    setErr(null);
  }, [open]);
  const submit = async () => {
    if (!pc || !reasonOk(reason)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await nodeApi.drain(pc.id, reason.trim());
      onDone(r);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Power}
      tone="amber"
      title={t("anodes.drain.title")}
      subtitle={t("anodes.drain.sub", { n: f.n(pc?.conns) })}
      testId="anx-drain-dlg"
      footer={
        <>
          <button type="button" className="atk-btn" onClick={onClose} disabled={busy}>
            {t("anodes.dlg.cancel")}
          </button>
          <button type="button" className="atk-btn is-pri" onClick={submit} disabled={busy || !reasonOk(reason)} data-testid="anx-drain-go">
            {busy ? <RefreshCw size={14} className="anx-spin" /> : <Power size={14} />}
            {t("anodes.drain.go")}
          </button>
        </>
      }
    >
      <ul className="anx-facts">
        <li>
          <Check size={13} aria-hidden="true" />
          {t("anodes.drain.p1")}
        </li>
        <li>
          <Check size={13} aria-hidden="true" />
          {t("anodes.drain.p2")}
        </li>
        <li>
          <Check size={13} aria-hidden="true" />
          {t("anodes.drain.p3")}
        </li>
      </ul>
      <ReasonField value={reason} onChange={setReason} picks={["anodes.drain.pickOff", "anodes.drain.pickGame", "anodes.drain.pickUpdate"]} testId="anx-drain-reason" />
      <ErrLine err={err} />
    </Dialog>
  );
}

/* ---------------- emergency ---------------- */

export function EmergencyDialog({ open, data, onClose, onDone }) {
  const f = useNx();
  const { t } = f;
  const { pc } = pickNodes(data);
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setSure(false);
    setBusy(false);
    setErr(null);
  }, [open]);
  const renderCap = data ? capacityFor(data, 0).renderUsers : 0;
  const total = data?.totals?.conns || 0;
  const over = total > renderCap;
  const submit = async () => {
    if (!reasonOk(reason) || !sure) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(await nodeApi.allToRender(reason.trim()));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={AlertTriangle}
      tone="red"
      title={t("anodes.emg.title")}
      subtitle={t("anodes.emg.sub")}
      testId="anx-emg-dlg"
      footer={
        <>
          <button type="button" className="atk-btn" onClick={onClose} disabled={busy}>
            {t("anodes.dlg.cancel")}
          </button>
          <button type="button" className="atk-btn is-dan is-solid" onClick={submit} disabled={busy || !sure || !reasonOk(reason)} data-testid="anx-emg-go">
            {busy ? <RefreshCw size={14} className="anx-spin" /> : <AlertTriangle size={14} />}
            {t("anodes.emg.go")}
          </button>
        </>
      }
    >
      <div className={`anx-impact${over ? " is-bad" : ""}`}>
        <div>
          <span className="l">{t("anodes.emg.moving")}</span>
          <b className="tnum">{f.n(pc?.conns || 0)}</b>
        </div>
        <div>
          <span className="l">{t("anodes.emg.total")}</span>
          <b className="tnum">{f.n(total)}</b>
        </div>
        <div>
          <span className="l">{t("anodes.emg.renderCap")}</span>
          <b className="tnum">{t("anodes.approx", { n: f.n(renderCap) })}</b>
        </div>
      </div>
      {over ? (
        <p className="atk-err anx-errline" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{t("anodes.emg.over")}</span>
        </p>
      ) : null}
      <ReasonField value={reason} onChange={setReason} testId="anx-emg-reason" />
      <label className="atk-chk anx-mt8">
        <GlassCheckbox checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="anx-emg-sure" />
        <span>{t("anodes.emg.sure")}</span>
      </label>
      <ErrLine err={err} />
    </Dialog>
  );
}

/* ---------------- drill ---------------- */

export function DrillDialog({ open, data, onClose, onDone }) {
  const f = useNx();
  const { t } = f;
  const { pc } = pickNodes(data);
  const [phase, setPhase] = useState("intro"); // intro | run | done
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    setPhase("intro");
    setResult(null);
    setErr(null);
    setElapsed(0);
  }, [open]);
  useEffect(() => {
    if (phase !== "run") return undefined;
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => clearInterval(id);
  }, [phase]);
  const run = async () => {
    setErr(null);
    setPhase("run");
    startRef.current = Date.now();
    try {
      const r = await nodeApi.drill();
      setResult(r);
      setPhase("done");
      onDone(r);
    } catch (e) {
      setErr(e);
      setPhase("intro");
    }
  };
  const ok = result && !result.dropped && !result.timedOut;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={phase === "run"}
      icon={FlaskConical}
      tone="blue"
      title={t("anodes.drill.title")}
      subtitle={t("anodes.drill.sub", { n: f.n(pc?.conns || 0) })}
      testId="anx-drill-dlg"
      footer={
        phase === "done" ? (
          <button type="button" className="atk-btn is-pri" onClick={onClose} data-testid="anx-drill-close">
            {t("anodes.dlg.close")}
          </button>
        ) : (
          <>
            <button type="button" className="atk-btn" onClick={onClose} disabled={phase === "run"}>
              {t("anodes.dlg.cancel")}
            </button>
            <button type="button" className="atk-btn is-pri" onClick={run} disabled={phase === "run" || !pc} data-testid="anx-drill-go">
              {phase === "run" ? <RefreshCw size={14} className="anx-spin" /> : <FlaskConical size={14} />}
              {t("anodes.drill.go")}
            </button>
          </>
        )
      }
    >
      {phase === "done" && result ? (
        <div data-testid="anx-drill-result">
          <div className={`anx-verdict ${ok ? "is-ok" : "is-warn"}`}>
            {ok ? <Check size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            <b>{t(ok ? "anodes.drill.ok" : result.timedOut ? "anodes.drill.slow" : "anodes.drill.loss")}</b>
          </div>
          <div className="anx-impact">
            <div>
              <span className="l">{t("anodes.drill.moved")}</span>
              <b className="tnum">{f.n(result.moved)}</b>
            </div>
            <div>
              <span className="l">{t("anodes.drill.dropped")}</span>
              <b className={`tnum ${result.dropped ? "anx-warn" : "anx-ok"}`}>{f.n(result.dropped)}</b>
            </div>
            <div>
              <span className="l">{t("anodes.drill.time")}</span>
              <b className="tnum">{t("anodes.secN", { n: f.d1((result.ms || 0) / 1000) })}</b>
            </div>
          </div>
          <p className="anx-note">{t("anodes.drill.after")}</p>
        </div>
      ) : (
        <>
          <ol className="anx-steps is-compact">
            {["s1", "s2", "s3"].map((k, i) => (
              <li key={k} className={phase === "run" && elapsed > i * 900 ? "is-run" : ""}>
                <span className="anx-stepn" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="anx-at">
                  <b>{t(`anodes.drill.${k}`)}</b>
                </span>
              </li>
            ))}
          </ol>
          {phase === "run" ? (
            <p className="anx-now" role="status" data-testid="anx-drill-running">
              {t("anodes.drill.running", { sec: f.d1(elapsed / 1000) })}
            </p>
          ) : (
            <p className="anx-note">{t("anodes.drill.note")}</p>
          )}
          <ErrLine err={err} />
        </>
      )}
    </Dialog>
  );
}

/* ---------------- schedule ---------------- */

export function ScheduleDialog({ open, schedule, onClose, onSave }) {
  const f = useNx();
  const { t } = f;
  const [grid, setGrid] = useState(() => slotsToGrid(schedule?.slots));
  const [enabled, setEnabled] = useState(schedule?.enabled !== false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const paint = useRef(null); // true / false while dragging
  useEffect(() => {
    if (!open) return;
    setGrid(slotsToGrid(schedule?.slots));
    setEnabled(schedule?.enabled !== false);
    setBusy(false);
    setErr(null);
  }, [open, schedule]);
  useEffect(() => {
    const up = () => {
      paint.current = null;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const set = (d, h, v) => setGrid((g) => (g[d][h] === v ? g : g.map((row, i) => (i === d ? row.map((c, j) => (j === h ? v : c)) : row))));
  const hours = gridHours(grid);
  const emptyOn = enabled && hours === 0;
  const save = async () => {
    if (emptyOn) return;
    setBusy(true);
    setErr(null);
    try {
      await onSave({ schedule: { enabled, slots: gridToSlots(grid) } });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  const presets = useMemo(() => ["evenings", "nightly", "always", "clear"], []);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Calendar}
      tone="blue"
      width={820}
      title={t("anodes.plan.title")}
      subtitle={t("anodes.plan.sub")}
      testId="anx-plan-dlg"
      footer={
        <>
          <span className="anx-sub anx-grow">{emptyOn ? t("anodes.plan.emptyOn") : t("anodes.plan.total", { n: f.n(hours) })}</span>
          <button type="button" className="atk-btn" onClick={onClose} disabled={busy}>
            {t("anodes.dlg.cancel")}
          </button>
          <button type="button" className="atk-btn is-pri" onClick={save} disabled={busy || emptyOn} data-testid="anx-plan-save">
            {busy ? <RefreshCw size={14} className="anx-spin" /> : <Check size={14} />}
            {t("anodes.plan.save")}
          </button>
        </>
      }
    >
      <div className="anx-kv">
        <span>
          <b>{t("anodes.plan.on")}</b>
          <span className="anx-sub anx-block">{t(enabled ? "anodes.plan.onSub" : "anodes.plan.offSub")}</span>
        </span>
        <Toggle checked={enabled} onChange={setEnabled} label={t("anodes.plan.on")} testId="anx-plan-toggle" />
      </div>
      <div className="anx-chips anx-mt8">
        {presets.map((k) => (
          <button key={k} type="button" onClick={() => setGrid(presetGrid(k))} disabled={!enabled}>
            {t(`anodes.plan.preset.${k}`)}
          </button>
        ))}
      </div>
      <div className={`anx-heat${enabled ? "" : " is-off"}`} role="grid" aria-label={t("anodes.plan.gridAria")} data-testid="anx-heat">
        <div className="anx-heat-row is-head" role="row">
          <span role="columnheader" />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} role="columnheader" className="anx-heat-h">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
        {DAY_ORDER.map((d) => (
          <div key={d} className="anx-heat-row" role="row">
            <span role="rowheader" className="anx-heat-d">
              {t(`anodes.day.s${d}`)}
            </span>
            {grid[d].map((on, h) => (
              <button
                key={h}
                type="button"
                role="gridcell"
                aria-pressed={on}
                aria-label={t("anodes.plan.cell", { day: t(`anodes.day.l${d}`), from: `${String(h).padStart(2, "0")}:00` })}
                className={on ? "is-on" : ""}
                disabled={!enabled}
                onPointerDown={(e) => {
                  e.preventDefault();
                  paint.current = !on;
                  set(d, h, !on);
                }}
                onPointerEnter={() => {
                  if (paint.current != null) set(d, h, paint.current);
                }}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    set(d, h, !on);
                  }
                }}
                data-testid={`anx-cell-${d}-${h}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="anx-note">{t("anodes.plan.help")}</p>
      <ErrLine err={err} />
    </Dialog>
  );
}

/* ---------------- node keys ---------------- */

function Reveal({ secret, onDone }) {
  const { t } = useNx();
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="atk-reveal anx-reveal" data-testid="anx-reveal">
      <div className="atk-rv-warn" role="alert">
        <AlertCircle size={22} aria-hidden="true" />
        <div>
          <b>{t("anodes.keys.onceTitle")}</b>
          <p>{t("anodes.keys.onceBody")}</p>
        </div>
      </div>
      <div className="atk-tokbox">
        <code className={hidden ? "is-hid" : ""} data-testid="anx-secret">
          {secret}
        </code>
        <button type="button" className="atk-btn is-sm is-ghost is-ic" onClick={() => setHidden((v) => !v)} aria-label={t(hidden ? "anodes.keys.show" : "anodes.keys.hide")} title={t(hidden ? "anodes.keys.show" : "anodes.keys.hide")}>
          {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          className="atk-btn is-sm is-pri"
          onClick={async () => {
            if (await copyText(secret)) setCopied(true);
          }}
          data-testid="anx-secret-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {t(copied ? "anodes.keys.copied" : "anodes.keys.copy")}
        </button>
      </div>
      <p className="anx-note">{t("anodes.keys.where")}</p>
      <div className="atk-ffoot is-line">
        <label className="atk-chk">
          <GlassCheckbox checked={saved} onChange={(e) => setSaved(e.target.checked)} data-testid="anx-saved-chk" />
          <span>{t("anodes.keys.saved")}</span>
        </label>
        <button type="button" className="atk-btn is-pri" disabled={!saved} onClick={onDone} data-testid="anx-reveal-done">
          {t("anodes.dlg.close")}
        </button>
      </div>
    </div>
  );
}

export function KeysDrawer({ open, startCreate = false, refresh = 0, onClose, onChanged, onRevoke }) {
  const f = useNx();
  const { t } = f;
  const [state, setState] = useState({ loading: true, available: true, keys: [], max: 5, err: null });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [secret, setSecret] = useState(null);
  const load = async () => {
    try {
      const d = await nodeApi.keys();
      setState({ loading: false, available: d?.available !== false, keys: Array.isArray(d?.keys) ? d.keys : [], max: d?.max || 5, err: null });
    } catch (e) {
      setState((p) => ({ ...p, loading: false, err: e }));
    }
  };
  useEffect(() => {
    if (!open) return;
    setName(startCreate ? t("anodes.keys.defaultName") : "");
    setBusy(false);
    setErr(null);
    setSecret(null);
    setState((p) => ({ ...p, loading: true }));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // A revoke finished in the dialog on top: reload the list.
  useEffect(() => {
    if (open && refresh) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  const active = state.keys.filter((k) => k.status === "active").length;
  const full = active >= state.max;
  // The window line counts down while the drawer is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [open]);
  const [winBusy, setWinBusy] = useState(null);
  const [winErr, setWinErr] = useState(null);
  const toggleWindow = async (k, want) => {
    setWinBusy(k.id);
    setWinErr(null);
    try {
      await nodeApi.bootstrapWindow(k.id, want);
      setNow(Date.now());
      await load();
      onChanged?.();
    } catch (x) {
      setWinErr(x);
    } finally {
      setWinBusy(null);
    }
  };
  const create = async (e) => {
    e?.preventDefault?.();
    if (!keyNameOk(name) || full) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await nodeApi.createKey(name.trim());
      if (r?.secret) setSecret(r.secret);
      setName("");
      await load();
      onChanged?.();
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} busy={busy} locked={Boolean(secret)} icon={KeyRound} title={t("anodes.keys.title")} subtitle={t("anodes.keys.sub", { n: f.n(active), max: f.n(state.max) })} testId="anx-keys">
      {secret ? (
        <Reveal secret={secret} onDone={() => setSecret(null)} />
      ) : (
        <>
          {!state.available ? (
            <div className="atk-banner is-info" role="note" data-testid="anx-keys-off">
              <AlertCircle size={20} aria-hidden="true" />
              <div className="atk-banner-t">
                <b>{t("anodes.keys.offTitle")}</b>
                {t("anodes.keys.offBody")}
              </div>
            </div>
          ) : (
            <form className="anx-keyform" onSubmit={create}>
              <div className="atk-field">
                <label className="atk-lb" htmlFor="anx-key-name">
                  <span>{t("anodes.keys.name")}</span>
                  <em>{t("anodes.keys.nameHint", { max: KEY_NAME_MAX })}</em>
                </label>
                <input id="anx-key-name" className="atk-inp" maxLength={KEY_NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("anodes.keys.namePh")} data-autofocus="" data-testid="anx-key-name" />
              </div>
              <button type="submit" className="atk-btn is-pri" disabled={busy || !keyNameOk(name) || full} data-testid="anx-key-create">
                {busy ? <RefreshCw size={14} className="anx-spin" /> : <Plus size={14} />}
                {t("anodes.keys.create")}
              </button>
              {full ? <p className="anx-note anx-warn">{t("anodes.keys.full", { max: f.n(state.max) })}</p> : null}
              <ErrLine err={err} />
            </form>
          )}
          <div className="anx-keylist" data-testid="anx-keylist">
            {state.loading ? (
              <>
                <Skel h={44} r={10} />
                <Skel h={44} r={10} />
              </>
            ) : state.err ? (
              <ErrLine err={state.err} />
            ) : !state.keys.length ? (
              <p className="atk-empty-s">{t("anodes.keys.empty")}</p>
            ) : (
              state.keys.map((k) => (
                <div key={k.id} className={`anx-key${k.status === "revoked" ? " is-dead" : ""}`} data-testid="anx-key-row">
                  <span className="atk-tki is-brand" aria-hidden="true">
                    <KeyRound size={14} />
                  </span>
                  <span className="anx-at">
                    <b>{k.name}</b>
                    <code>{maskKey(k)}</code>
                    <span>
                      {k.status === "revoked"
                        ? t("anodes.keys.revokedAt", { when: f.dt(k.revokedAt), reason: k.revokeReason || "" })
                        : k.lastUsedAt
                          ? t("anodes.keys.used", { when: f.L(agoLabel(k.lastUsedAt)), node: k.lastUsedNode || t("anodes.dash") })
                          : t("anodes.keys.unused", { when: f.dt(k.createdAt) })}
                    </span>
                    {k.status === "active" ? (
                      <span className={`anx-win${keyWindow(k, now).open ? " is-open" : ""}`} data-testid="anx-key-win">
                        {keyWindow(k, now).open ? t("anodes.keys.windowOpen", { n: f.n(keyWindow(k, now).minutes) }) : t("anodes.keys.windowClosed")}
                        {k.bootstrappedAt ? ` · ${t("anodes.keys.bootstrapped", { when: f.L(agoLabel(k.bootstrappedAt)) })}` : ""}
                      </span>
                    ) : null}
                  </span>
                  {k.status === "active" ? (
                    <span className="anx-keyacts">
                      <button
                        type="button"
                        className={`atk-btn is-sm${keyWindow(k, now).open ? "" : " is-pri"}`}
                        onClick={() => toggleWindow(k, !keyWindow(k, now).open)}
                        disabled={winBusy === k.id}
                        title={t("anodes.keys.windowHint")}
                        data-testid="anx-key-window"
                      >
                        {winBusy === k.id ? <RefreshCw size={13} className="anx-spin" /> : keyWindow(k, now).open ? <Power size={13} /> : <KeyRound size={13} />}
                        {t(keyWindow(k, now).open ? "anodes.keys.closeWindow" : "anodes.keys.openWindow")}
                      </button>
                      <button type="button" className="atk-btn is-sm is-dan" onClick={() => onRevoke(k)} data-testid="anx-key-revoke">
                        <Trash2 size={13} />
                        {t("anodes.keys.revoke")}
                      </button>
                    </span>
                  ) : (
                    <span className="atk-pill st-revoked is-sm">{t("anodes.keys.revoked")}</span>
                  )}
                </div>
              ))
            )}
          </div>
          <ErrLine err={winErr} />
          <p className="anx-note">{t("anodes.keys.windowHint")}</p>
          <p className="anx-note">{t("anodes.keys.foot")}</p>
        </>
      )}
    </Drawer>
  );
}

export function RevokeKeyDialog({ open, keyRow, onClose, onDone }) {
  const f = useNx();
  const { t } = f;
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setTyped("");
    setBusy(false);
    setErr(null);
  }, [open]);
  const match = keyRow && typed.trim() === keyRow.name;
  const submit = async () => {
    if (!keyRow || !match || !reasonOk(reason)) return;
    setBusy(true);
    setErr(null);
    try {
      onDone(await nodeApi.revokeKey(keyRow.id, { reason: reason.trim(), confirmName: typed.trim() }));
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Trash2}
      tone="red"
      title={t("anodes.revoke.title")}
      subtitle={keyRow ? `${keyRow.name} · ${maskKey(keyRow)}` : ""}
      testId="anx-revoke-dlg"
      footer={
        <>
          <button type="button" className="atk-btn" onClick={onClose} disabled={busy}>
            {t("anodes.dlg.cancel")}
          </button>
          <button type="button" className="atk-btn is-dan is-solid" onClick={submit} disabled={busy || !match || !reasonOk(reason)} data-testid="anx-revoke-go">
            {busy ? <RefreshCw size={14} className="anx-spin" /> : <Trash2 size={14} />}
            {t("anodes.revoke.go")}
          </button>
        </>
      }
    >
      <p className="atk-err anx-errline" role="note">
        <AlertTriangle size={14} aria-hidden="true" />
        <span>{t("anodes.revoke.warn")}</span>
      </p>
      <ReasonField value={reason} onChange={setReason} picks={["anodes.revoke.pickStolen", "anodes.revoke.pickNew", "anodes.revoke.pickLeak"]} testId="anx-revoke-reason" />
      <div className="atk-field">
        <label className="atk-lb" htmlFor="anx-revoke-typed">
          <span>{t("anodes.revoke.type", { name: keyRow?.name || "" })}</span>
        </label>
        <input id="anx-revoke-typed" className="atk-inp is-typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="anx-revoke-typed" />
      </div>
      <ErrLine err={err} />
    </Dialog>
  );
}
