/* Ajan yetkileri (Taslak B3 popover) and the Kapsamlar tab: on/off scopes, limits, approval rules. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import OverlayPortal from "../../ui/OverlayPortal.jsx";
import { Ic, Switch } from "./agentUi.jsx";
import { SCOPE_IDS, SCOPE_META, scopeLimit } from "./agentOpsModel.js";

function LimitEditor({ t, id, scope, disabled, onSave }) {
  const [value, setValue] = useState(String(scope.limit ?? ""));
  useEffect(() => setValue(String(scope.limit ?? "")), [scope.limit]);
  const dirty = String(scope.limit ?? "") !== value;
  return (
    <label className="ago-limit">
      <span className="ago-vh">{t("agentOps.scopes.limit")}</span>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(id, Number(value)); }}
        onBlur={() => { if (dirty && value) onSave(id, Number(value)); }}
        aria-label={`${t(`agentOps.scopes.${id}.name`)} · ${t("agentOps.scopes.limit")}`}
      />
      <small>{t(`agentOps.scopes.lim.${id}`, { n: "" }).trim()}</small>
    </label>
  );
}

export function ScopeList({ t, data, saving, onPatch, editLimits = false }) {
  const owner = Boolean(data?.owner);
  const scopes = data?.scopes || {};
  return (
    <div className="ago-scopes">
      {SCOPE_IDS.map((id) => {
        const s = scopes[id] || { on: false };
        const meta = SCOPE_META[id];
        const lim = scopeLimit(id, s);
        return (
          <div key={id} className="ago-scope">
            <span className={`ago-scope-ic is-${meta.tone}`}><Ic name={meta.icon} size={16} /></span>
            <div className="ago-col ago-scope-t">
              <b>{t(`agentOps.scopes.${id}.name`)}</b>
              <small>{t(`agentOps.scopes.${id}.desc`)}</small>
            </div>
            <span className="ago-sp" />
            {editLimits && s.limit != null ? (
              <LimitEditor t={t} id={id} scope={s} disabled={!owner || saving} onSave={(sid, n) => onPatch({ scopes: { [sid]: { limit: n } } })} />
            ) : lim ? (
              <span className="ago-sg">{t(lim.key, lim.vars)}</span>
            ) : null}
            <Switch on={s.on} disabled={!owner || saving} label={t(`agentOps.scopes.${id}.name`)} onChange={(on) => onPatch({ scopes: { [id]: { on } } })} />
          </div>
        );
      })}
      <div className="ago-divh" />
      <div className="ago-policy">
        <span className="ago-sub">{t("agentOps.scopes.require2fa")}</span>
        <span className="ago-sp" />
        <Switch on={data?.require2faEach !== false} disabled={!owner || saving} label={t("agentOps.scopes.require2fa")} onChange={(v) => onPatch({ require2faEach: v })} />
      </div>
      <div className="ago-policy">
        <span className="ago-sub">{t("agentOps.scopes.ownerPermanent")}</span>
        <span className="ago-sp" />
        <Switch on={data?.ownerApprovalPermanent !== false} disabled={!owner || saving} label={t("agentOps.scopes.ownerPermanent")} onChange={(v) => onPatch({ ownerApprovalPermanent: v })} />
      </div>
      {editLimits ? (
        <div className="ago-policy">
          <span className="ago-sub">{t("agentOps.scopes.excludePremium")}</span>
          <span className="ago-sp" />
          <Switch on={data?.excludePremium !== false} disabled={!owner || saving} label={t("agentOps.scopes.excludePremium")} onChange={(v) => onPatch({ excludePremium: v })} />
        </div>
      ) : null}
    </div>
  );
}

function ScopeHead({ t, data }) {
  return (
    <>
      <div className="ago-scopes-head">
        <span className="ago-h2">{t("agentOps.scopes.title")}</span>
        <span className="ago-sp" />
        <span className="ago-chip">{t("agentOps.scopes.owner")}</span>
      </div>
      <p className="ago-sub ago-scopes-lead">{t("agentOps.scopes.lead")}</p>
      {data && !data.owner ? <p className="ago-note">{t("agentOps.scopes.ownerOnly")}</p> : null}
    </>
  );
}

/** Popover under the "Yetkiler" chip / button. Closes on outside click and Esc. */
export function ScopesPopover({ t, open, anchorRef, onClose, data, saving, onPatch }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchorRef?.current?.getBoundingClientRect();
      if (!r) return;
      const width = 440;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left - 360));
      setPos({ top: r.bottom + 8, left, width });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose();
        anchorRef?.current?.focus?.();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const first = ref.current?.querySelector("button:not([disabled])");
    first?.focus({ preventScroll: true });
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose, anchorRef]);
  if (!open || !pos) return null;
  return (
    <OverlayPortal>
      <div ref={ref} className="ago-pop ago-scopes-pop ago-root-vars" role="dialog" aria-label={t("agentOps.scopes.title")} style={{ top: pos.top, left: pos.left, width: pos.width }}>
        <ScopeHead t={t} data={data} />
        <ScopeList t={t} data={data} saving={saving} onPatch={onPatch} />
      </div>
    </OverlayPortal>
  );
}

export default function AgentScopesTab({ t, data, loading, saving, onPatch }) {
  if (loading && !data) return <div className="ago-tabbody">{[0, 1, 2, 3, 4, 5].map((k) => <div key={k} className="ago-skel" style={{ height: 48 }} />)}</div>;
  return (
    <div className="ago-scopes-tab">
      <div className="ago-scopes-card">
        <ScopeHead t={t} data={data} />
        <ScopeList t={t} data={data} saving={saving} onPatch={onPatch} editLimits />
      </div>
      <div className="ago-scopes-card">
        <div className="ago-lab">{t("agentOps.scopes.rulesTitle")}</div>
        <ul className="ago-rules">
          <li><Ic name="shield" size={14} />{t("agentOps.scopes.ruleAdmins")}</li>
          <li><Ic name="badge" size={14} />{t("agentOps.scopes.rulePremium")}</li>
          <li><Ic name="key" size={14} />{t("agentOps.scopes.ruleSelf")}</li>
        </ul>
      </div>
    </div>
  );
}
