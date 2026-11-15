/**
 * Moderasyon dialogs on the shared dossier shell (opaque, focus trap, Esc,
 * focus returns): Erken kaldır (reason required, Draft B2), custom extend, edit
 * the note the user sees, save the composer as a template, and the Kademe
 * kuralları editor (rules, steps ladder, recent triggers).
 */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { RotateCcw, Clock, Copy, Layout, Zap, Plus, Trash2, ChevronRight } from "../../ui/Icon.jsx";
import DossierDialog, { Field, Pills, DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { Toggle, durationText, remainingText, categoryText } from "./ModParts.jsx";
import { LIFT_REASONS, STEP_KINDS, minutesValue } from "./modDeskModel.js";

export function LiftDialog({ item, meta, onClose, onDone }) {
  const { t, locale } = useLocale();
  const [reason, setReason] = useState("wrong_person");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [discount, setDiscount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setReason("wrong_person");
    setNote("");
    setNotify(true);
    setDiscount(false);
    setErr("");
    setBusy(false);
  }, [open, item?.key]);

  if (!item) return null;
  const isBan = item.type === "ban";
  const total = item.endsAt && item.startedAt ? Math.round((Date.parse(item.endsAt) - Date.parse(item.startedAt)) / 1000) : null;
  const left = item.endsAt ? Date.parse(item.endsAt) - Date.now() : null;
  const who = item.auto ? t("modDesk.board.auto") : item.actor?.username ? `@${item.actor.username}` : "—";
  const when = item.startedAt ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.startedAt)) : "";
  const needsNote = reason === "other" && note.trim().length < 3;

  const submit = async () => {
    if (needsNote) {
      setErr(t("modDesk.lift.needNote"));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/moderation/sanctions/${item.user.id}/lift`, {
        method: "POST",
        body: JSON.stringify({ type: item.type, reasonCode: reason, note: note.trim() || undefined, notify: !isBan && notify, discount }),
      });
      onDone(t(isBan ? "modDesk.lift.doneBan" : "modDesk.lift.doneTimeout", { user: `@${item.user.username}` }));
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
      setBusy(false);
    }
  };

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={RotateCcw}
      tone="blue"
      width={640}
      title={t(isBan ? "modDesk.lift.titleBan" : "modDesk.lift.titleTimeout", { user: `@${item.user.username}` })}
      subtitle={t(isBan ? "modDesk.lift.subBan" : "modDesk.lift.subTimeout")}
      testId="mdk-lift"
    >
      <div className="mdk-dkv">
        <div>
          <span>{t("modDesk.lift.sanction")}</span>
          <b>
            {t(`modDesk.type.${item.type}`)} · {total ? durationText(total, t) : t("modDesk.permanent")}
          </b>
        </div>
        <div>
          <span>{t("modDesk.lift.reason")}</span>
          <b>{categoryText(item.category, t, meta?.categories)}</b>
        </div>
        <div>
          <span>{t("modDesk.lift.by")}</span>
          <b>
            {who}
            {when ? ` · ${when}` : ""}
          </b>
        </div>
        <div>
          <span>{t("modDesk.lift.left")}</span>
          <b className="is-amber tnum">{left != null ? remainingText(left, t) : t("modDesk.permanent")}</b>
        </div>
      </div>
      <Field label={t("modDesk.lift.why")}>
        <Pills tone="blue" small items={LIFT_REASONS.map((id) => ({ id, label: t(`modDesk.liftReason.${id}`) }))} value={reason} onChange={setReason} label={t("modDesk.lift.why")} />
      </Field>
      <textarea
        className="dsr-input dsr-ta is-short"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        placeholder={reason === "other" ? t("modDesk.lift.notePhRequired") : t("modDesk.lift.notePh")}
        aria-label={t("modDesk.lift.why")}
        data-autofocus
      />
      {!isBan ? (
        <label className="dsr-check">
          <GlassCheckbox checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span>{t("modDesk.lift.notify")}</span>
        </label>
      ) : null}
      <label className="dsr-check">
        <GlassCheckbox checked={discount} onChange={(e) => setDiscount(e.target.checked)} />
        <span>{t("modDesk.lift.discount")}</span>
      </label>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("modDesk.cancel")} busy={busy} disabled={needsNote} onSubmit={submit} submitLabel={busy ? t("modDesk.working") : t("modDesk.board.lift")} icon={RotateCcw} />
    </DossierDialog>
  );
}

export function CustomExtendDialog({ item, onClose, onSubmit }) {
  const { t } = useLocale();
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("h");
  useEffect(() => {
    if (item) {
      setAmount("");
      setUnit("h");
    }
  }, [item]);
  if (!item) return null;
  const n = minutesValue(amount);
  const secs = n * (unit === "m" ? 60 : unit === "h" ? 3600 : 86400);
  const ok = secs >= 60 && secs <= 365 * 86400;
  return (
    <DossierDialog open onClose={onClose} icon={Clock} tone="amber" width={460} title={t("modDesk.extend.title", { user: `@${item.user.username}` })} subtitle={t("modDesk.extend.sub")}>
      <div className="mdk-dinline">
        <input className="dsr-input is-num" type="number" min={1} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2" aria-label={t("modDesk.extend.amount")} data-autofocus />
        <Pills tone="amber" small value={unit} onChange={setUnit} label={t("modDesk.extend.unit")} items={["m", "h", "d"].map((u) => ({ id: u, label: t(`modDesk.unit.${u}`) }))} />
      </div>
      {ok ? <p className="dsr-hint">{t("modDesk.extend.preview", { duration: durationText(secs, t) })}</p> : null}
      <DialogActions onCancel={onClose} cancelLabel={t("modDesk.cancel")} disabled={!ok} onSubmit={() => onSubmit(secs)} submitLabel={t("modDesk.extend.submit")} icon={Clock} tone="amber" />
    </DossierDialog>
  );
}

export function EditNoteDialog({ item, onClose, onSaved }) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (item) {
      setText(item.message || "");
      setErr("");
      setBusy(false);
    }
  }, [item]);
  if (!item) return null;
  const save = async () => {
    setBusy(true);
    try {
      await adminFetch(`/moderation/sanctions/${item.user.id}/message`, { method: "PATCH", body: JSON.stringify({ type: item.type, message: text }) });
      onSaved(t("modDesk.note.saved", { user: `@${item.user.username}` }));
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
      setBusy(false);
    }
  };
  return (
    <DossierDialog open onClose={onClose} busy={busy} icon={Copy} tone="violet" width={520} title={t("modDesk.note.title", { user: `@${item.user.username}` })} subtitle={t("modDesk.note.sub")}>
      <textarea className="dsr-input dsr-ta" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} aria-label={t("modDesk.note.title", { user: `@${item.user.username}` })} data-autofocus />
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("modDesk.cancel")} busy={busy} onSubmit={save} submitLabel={t("modDesk.save")} />
    </DossierDialog>
  );
}

export function SaveTemplateDialog({ open, defaults, onClose, onSaved }) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (open) {
      setName(defaults?.suggestedName || "");
      setErr("");
      setBusy(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const save = async () => {
    setBusy(true);
    try {
      const d = await adminFetch("/moderation/templates", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), action: defaults.action, category: defaults.category, presetId: defaults.presetId, durationSeconds: defaults.durationSeconds, message: defaults.message || null }),
      });
      onSaved(d?.template);
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
      setBusy(false);
    }
  };
  return (
    <DossierDialog open onClose={onClose} busy={busy} icon={Layout} tone="violet" width={480} title={t("modDesk.tpl.title")} subtitle={t("modDesk.tpl.sub")}>
      <Field label={t("modDesk.tpl.name")} id="mdk-tpl-name">
        <input id="mdk-tpl-name" className="dsr-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} data-autofocus />
      </Field>
      <p className="dsr-hint">{t("modDesk.tpl.hint")}</p>
      <DialogError text={err} />
      <DialogActions onCancel={onClose} cancelLabel={t("modDesk.cancel")} busy={busy} onSubmit={save} submitLabel={t("modDesk.save")} />
    </DossierDialog>
  );
}

const WINDOWS = [7, 14, 30, 90];
const STEP_LENGTHS = { timeout: [300, 1800, 3600, 21600, 86400, 3 * 86400, 7 * 86400], ban: [86400, 3 * 86400, 7 * 86400, 30 * 86400, null] };

function blankRule() {
  return { id: null, name: "", enabled: true, categories: ["language"], windowDays: 30, steps: [{ kind: "warn", seconds: null }, { kind: "timeout", seconds: 1800 }], discountEarlyLift: true, recentTriggers: [], triggerCount: 0 };
}

export function RulesDialog({ open, meta, onClose, onSaved }) {
  const { t, locale } = useLocale();
  const [rules, setRules] = useState(null);
  const [ready, setReady] = useState(true);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const cats = meta?.categories || [];

  const load = async (keepId) => {
    try {
      const d = await adminFetch("/moderation/rules");
      setRules(d?.rules || []);
      setReady(d?.ready !== false);
      const pick = (d?.rules || []).find((r) => r.id === keepId) || (d?.rules || [])[0] || null;
      setDraft(pick ? { ...pick } : blankRule());
    } catch (e) {
      setErr(e?.message || t("modDesk.loadError"));
      setRules([]);
    }
  };

  useEffect(() => {
    if (open) {
      setErr("");
      load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleName = (r) => r.name || t("modDesk.rules.suggestedName");
  const triggers = useMemo(() => (draft?.recentTriggers || []).slice(0, 5), [draft]);
  if (!open) return null;

  const setStep = (i, patch) => setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const toggleCat = (id) => setDraft((d) => ({ ...d, categories: d.categories.includes(id) ? d.categories.filter((c) => c !== id) : [...d.categories, id] }));

  const save = async (patch) => {
    const body = { ...draft, ...patch };
    setBusy(true);
    setErr("");
    try {
      const path = body.id ? `/moderation/rules/${body.id}` : "/moderation/rules";
      const d = await adminFetch(path, { method: body.id ? "PUT" : "POST", body: JSON.stringify({ name: body.name, enabled: body.enabled, categories: body.categories, windowDays: body.windowDays, steps: body.steps, discountEarlyLift: body.discountEarlyLift }) });
      onSaved(t("modDesk.rules.saved"));
      await load(d?.rule?.id);
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return setDraft(blankRule());
    setBusy(true);
    try {
      await adminFetch(`/moderation/rules/${draft.id}`, { method: "DELETE" });
      onSaved(t("modDesk.rules.deleted"));
      await load();
    } catch (e) {
      setErr(e?.message || t("modDesk.actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const stepLabel = (s) =>
    s.kind === "warn" || s.kind === "kick"
      ? t(`modDesk.step.${s.kind}`)
      : s.kind === "ban"
        ? s.seconds == null
          ? t("modDesk.stepText.banPermanent")
          : t("modDesk.stepText.ban", { duration: durationText(s.seconds, t) })
        : t("modDesk.stepText.timeout", { duration: durationText(s.seconds, t) });

  return (
    <DossierDialog open onClose={onClose} busy={busy} icon={Zap} tone="red" width={900} title={t("modDesk.rules.title")} subtitle={t("modDesk.rules.sub")} testId="mdk-rules">
      {!ready ? <p className="dsr-warn">{t("modDesk.notReady")}</p> : null}
      <div className="mdk-rules">
        <div className="mdk-rules-list" role="listbox" aria-label={t("modDesk.rules.title")}>
          {(rules || []).map((r) => (
            <div key={r.id} role="option" aria-selected={draft?.id === r.id} tabIndex={0} className={`mdk-rule${draft?.id === r.id ? " is-on" : ""}`} onClick={() => setDraft({ ...r })} onKeyDown={(e) => e.key === "Enter" && setDraft({ ...r })}>
              <div>
                <b>{ruleName(r)}</b>
                <small>
                  {r.categories.slice(0, 2).map((c) => categoryText(c, t, cats)).join(", ")}
                  {r.categories.length > 2 ? ` +${r.categories.length - 2}` : ""} · {t("modDesk.rules.windowShort", { count: r.windowDays })}
                </small>
              </div>
              <Toggle checked={r.enabled} label={t("modDesk.rules.enabled")} disabled={busy || !ready} onChange={(v) => (setDraft({ ...r, enabled: v }), save({ ...r, enabled: v }))} />
            </div>
          ))}
          <button type="button" className="mdk-rule is-add" disabled={!ready} onClick={() => setDraft(blankRule())}>
            <Plus size={16} aria-hidden="true" />
            {t("modDesk.rules.new")}
          </button>
        </div>
        {draft ? (
          <div className="mdk-rules-edit">
            <Field label={t("modDesk.rules.name")} id="mdk-rule-name">
              <input id="mdk-rule-name" className="dsr-input" value={draft.name} maxLength={80} placeholder={t("modDesk.rules.suggestedName")} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field label={t("modDesk.rules.categories")}>
              <div className="dsr-pills is-small is-blue mdk-rule-cats" role="group" aria-label={t("modDesk.rules.categories")}>
                {cats.filter((c) => c.id !== "other").map((c) => (
                  <button key={c.id} type="button" className={draft.categories.includes(c.id) ? "is-on" : ""} aria-pressed={draft.categories.includes(c.id)} onClick={() => toggleCat(c.id)}>
                    {categoryText(c.id, t, cats)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("modDesk.rules.window")}>
              <Pills tone="blue" small value={draft.windowDays} onChange={(v) => setDraft((d) => ({ ...d, windowDays: v }))} label={t("modDesk.rules.window")} items={WINDOWS.map((w) => ({ id: w, label: t("modDesk.rules.windowShort", { count: w }) }))} />
            </Field>
            <div>
              <div className="dsr-lab">{t("modDesk.rules.steps")}</div>
              <div className="mdk-ladder">
                {draft.steps.map((s, i) => (
                  <div key={i} className={`mdk-rung is-${s.kind}`}>
                    <span className="mdk-rung-n">{t("modDesk.rules.nth", { n: i + 1 })}</span>
                    <b>{stepLabel(s)}</b>
                    <select className="mdk-rung-sel" value={s.kind} aria-label={t("modDesk.rules.stepKind", { n: i + 1 })} onChange={(e) => setStep(i, { kind: e.target.value, seconds: e.target.value === "timeout" ? 1800 : e.target.value === "ban" ? 86400 : null })}>
                      {STEP_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`modDesk.step.${k}`)}
                        </option>
                      ))}
                    </select>
                    {s.kind === "timeout" || s.kind === "ban" ? (
                      <select className="mdk-rung-sel" value={s.seconds == null ? "perm" : String(s.seconds)} aria-label={t("modDesk.rules.stepLength", { n: i + 1 })} onChange={(e) => setStep(i, { seconds: e.target.value === "perm" ? null : Number(e.target.value) })}>
                        {STEP_LENGTHS[s.kind].map((sec) => (
                          <option key={String(sec)} value={sec == null ? "perm" : String(sec)}>
                            {sec == null ? t("modDesk.permanent") : durationText(sec, t)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <small>{t(`modDesk.rules.stepHint.${s.kind}`)}</small>
                    {draft.steps.length > 1 ? (
                      <button type="button" className="mdk-rung-x" aria-label={t("modDesk.rules.removeStep", { n: i + 1 })} onClick={() => setDraft((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                    {i < draft.steps.length - 1 ? <ChevronRight className="mdk-rung-arr" size={16} aria-hidden="true" /> : null}
                  </div>
                ))}
                {draft.steps.length < 6 ? (
                  <button type="button" className="mdk-rung-add" aria-label={t("modDesk.rules.addStep")} onClick={() => setDraft((d) => ({ ...d, steps: [...d.steps, { kind: "timeout", seconds: 86400 }] }))}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            <label className="dsr-check">
              <GlassCheckbox checked disabled onChange={() => {}} />
              <span>{t("modDesk.rules.banSuggest")}</span>
            </label>
            <label className="dsr-check">
              <GlassCheckbox checked={draft.discountEarlyLift} onChange={(e) => setDraft((d) => ({ ...d, discountEarlyLift: e.target.checked }))} />
              <span>{t("modDesk.rules.discount")}</span>
            </label>
            {draft.id ? (
              <div className="mdk-trig">
                <div className="dsr-lab">{t("modDesk.rules.recent", { count: draft.triggerCount || 0 })}</div>
                {triggers.length ? (
                  triggers.map((tr, i) => (
                    <div key={i} className="mdk-trig-row">
                      <span className="tnum">{new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(tr.at))}</span>
                      <span>{t("modDesk.rules.trigStep", { n: tr.nth, step: stepLabel(tr.step || {}) })}</span>
                      <span className={`mdk-chip is-${tr.outcome === "suggested" ? "blue" : tr.outcome === "applied" ? "gold" : "gray"}`}>{t(`modDesk.rules.outcome.${tr.outcome || "noted"}`)}</span>
                    </div>
                  ))
                ) : (
                  <p className="dsr-hint">{t("modDesk.rules.noTriggers")}</p>
                )}
              </div>
            ) : null}
            <DialogError text={err} />
            <div className="dsr-dlg-acts">
              <button type="button" className="dsr-btn is-danger-ghost" onClick={remove} disabled={busy || !ready}>
                <Trash2 size={16} aria-hidden="true" />
                {draft.id ? t("modDesk.rules.delete") : t("modDesk.cancel")}
              </button>
              <button type="button" className="dsr-btn is-primary" onClick={() => save()} disabled={busy || !ready || !draft.categories.length || !draft.steps.length}>
                {busy ? t("modDesk.working") : t("modDesk.save")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </DossierDialog>
  );
}
