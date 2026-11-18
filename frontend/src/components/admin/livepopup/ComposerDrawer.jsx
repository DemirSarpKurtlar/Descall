/**
 * Canlı popup › "Yeni popup" drawer (Draft B frame b2): start from a template,
 * tone + icon, title / message with counters, audience rules with a live
 * estimate, auto-close, now or scheduled, OK required, "Düzeldi" follow-up,
 * send to me too, optional button, desktop / phone preview, test to my phone,
 * save as template, then review with a required audit note.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Globe,
  Mic,
  Monitor,
  Plus,
  Save,
  Search,
  Send,
  Server,
  Smartphone,
  Star,
  User,
  Users,
  Eye,
  X,
  BellRing,
} from "../../ui/Icon.jsx";
import { useLocale } from "../../../context/LocaleContext";
import { LIVE_POPUP_ICONS, TONE_ICONS } from "../../../lib/livePopupIcons";
import { AdminBroadcastPopupCard } from "../AdminBroadcastPopup.jsx";
import { Avatar } from "../../ui/Avatar";
import { livePopupApi } from "./livePopupApi.js";
import { Dialog, Drawer, FieldLabel, Menu, Seg, Toggle } from "./ui.jsx";
import {
  BUILTIN_TEMPLATES,
  DURATIONS,
  LANGS,
  MAX_BODY,
  MAX_TITLE,
  MIN_NOTE,
  PLATFORMS,
  RULE_TYPES,
  TONES,
  TONE_COLOR,
  applyTone,
  audiencePayload,
  dayTime,
  draftContent,
  draftDirty,
  draftErrors,
  draftFromTemplate,
  draftPayload,
  emptyDraft,
  fmtNumber,
  fromLocalInput,
  newRule,
  removeRule,
  ruleComplete,
  ruleLabel,
  upsertRule,
} from "./livePopupModel.js";


const RULE_ICON = { voice: Mic, platform: Monitor, language: Globe, premium: Star, server: Server, users: User, accountAge: Clock, visibility: Eye };

/* ---------------- rule editor ---------------- */

function SearchPicker({ kind, onPick, selectedIds = [] }) {
  const { t, locale } = useLocale();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setRows([]);
      return undefined;
    }
    let alive = true;
    setBusy(true);
    const id = window.setTimeout(async () => {
      try {
        const out = kind === "server" ? await livePopupApi.searchServers(term) : await livePopupApi.searchUsers(term);
        if (alive) setRows(kind === "server" ? out.servers || [] : out.users || []);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setBusy(false);
      }
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [q, kind]);
  return (
    <div className="lp-picker">
      <label className="lp-search is-sm">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t(kind === "server" ? "livePopup.rules.searchServer" : "livePopup.rules.searchUser")}
          aria-label={t(kind === "server" ? "livePopup.rules.searchServer" : "livePopup.rules.searchUser")}
          data-autofocus
        />
      </label>
      <div className="lp-picker-list" role="listbox">
        {rows.map((r) => {
          const on = selectedIds.includes(r.id);
          return (
            <button key={r.id} type="button" role="option" aria-selected={on} className={`lp-mi${on ? " is-checked" : ""}`} onClick={() => onPick(r)}>
              <Avatar name={kind === "server" ? r.name : r.username} size={24} user={{ id: r.id, username: kind === "server" ? r.name : r.username, avatar_url: kind === "server" ? r.iconUrl : r.avatarUrl }} animate="none" />
              <span className="lp-mi-txt">
                {kind === "server" ? r.name : r.username}
                {kind === "server" && r.members != null ? <small>{t("livePopup.rules.members", { n: fmtNumber(r.members, locale) })}</small> : null}
                {kind === "users" && r.displayName && r.displayName !== r.username ? <small>{r.displayName}</small> : null}
              </span>
              {on ? <span className="lp-mi-check is-on" aria-hidden="true" /> : null}
            </button>
          );
        })}
        {q.trim() && !busy && !rows.length ? <p className="lp-empty-line">{t("livePopup.rules.noMatch")}</p> : null}
      </div>
    </div>
  );
}

function RuleEditor({ rule, onChange, onDone }) {
  const { t } = useLocale();
  if (rule.type === "platform" || rule.type === "language") {
    const all = rule.type === "platform" ? PLATFORMS : LANGS;
    const map = rule.type === "platform" ? "livePopup.platform" : "livePopup.lang";
    return (
      <div className="lp-editor">
        {all.map((v) => {
          const on = rule.values.includes(v);
          return (
            <button
              key={v}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              className={`lp-mi${on ? " is-checked" : ""}`}
              onClick={() => {
                const values = on ? rule.values.filter((x) => x !== v) : [...rule.values, v];
                onChange({ ...rule, values: all.filter((x) => values.includes(x)) });
              }}
            >
              <span className="lp-mi-txt">{t(`${map}.${v}`)}</span>
              <span className={`lp-mi-check${on ? " is-on" : ""}`} aria-hidden="true" />
            </button>
          );
        })}
        {!rule.values.length ? <p className="lp-empty-line is-bad">{t("livePopup.rules.pickAtLeastOne")}</p> : null}
        <button type="button" className="lp-btn is-sm is-primary lp-editor-done" onClick={onDone}>{t("livePopup.rules.done")}</button>
      </div>
    );
  }
  if (rule.type === "premium") {
    return (
      <div className="lp-editor">
        {["member", "non"].map((v) => (
          <button key={v} type="button" role="menuitemradio" aria-checked={rule.value === v} className={`lp-mi${rule.value === v ? " is-checked" : ""}`} onClick={() => { onChange({ ...rule, value: v }); onDone(); }}>
            <span className="lp-mi-txt">{t(v === "member" ? "livePopup.aud.premiumMember" : "livePopup.aud.premiumNon")}</span>
            <span className={`lp-mi-check${rule.value === v ? " is-on" : ""}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  }
  if (rule.type === "accountAge") {
    return (
      <div className="lp-editor is-pad">
        <Seg
          items={[{ id: "older", label: t("livePopup.rules.older") }, { id: "newer", label: t("livePopup.rules.newer") }]}
          value={rule.op}
          onChange={(op) => onChange({ ...rule, op })}
          label={t("livePopup.rules.accountAge")}
        />
        <label className="lp-days">
          <input
            type="number"
            min={1}
            max={3650}
            value={rule.days}
            onChange={(e) => onChange({ ...rule, days: Math.max(1, Math.min(3650, Math.round(Number(e.target.value) || 1))) })}
            aria-label={t("livePopup.rules.days")}
            data-autofocus
          />
          <span>{t("livePopup.rules.days")}</span>
        </label>
        <button type="button" className="lp-btn is-sm is-primary" onClick={onDone}>{t("livePopup.rules.done")}</button>
      </div>
    );
  }
  if (rule.type === "server") {
    return (
      <div className="lp-editor is-pad">
        <SearchPicker kind="server" selectedIds={rule.serverId ? [rule.serverId] : []} onPick={(s) => { onChange({ ...rule, serverId: s.id, name: s.name }); onDone(); }} />
      </div>
    );
  }
  if (rule.type === "users") {
    const ids = rule.users.map((u) => u.id);
    return (
      <div className="lp-editor is-pad">
        {rule.users.length ? (
          <div className="lp-picked">
            {rule.users.map((u) => (
              <span key={u.id} className="lp-rule is-mini">
                <b>{u.username}</b>
                <button type="button" className="lp-rx" aria-label={t("livePopup.rules.remove", { rule: u.username })} onClick={() => onChange({ ...rule, users: rule.users.filter((x) => x.id !== u.id) })}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <SearchPicker
          kind="users"
          selectedIds={ids}
          onPick={(u) => onChange({ ...rule, users: ids.includes(u.id) ? rule.users.filter((x) => x.id !== u.id) : [...rule.users, { id: u.id, username: u.username }].slice(0, 200) })}
        />
        <button type="button" className="lp-btn is-sm is-primary" onClick={onDone}>{t("livePopup.rules.done")}</button>
      </div>
    );
  }
  return null;
}

/* ---------------- preview ---------------- */

function DesktopMock({ popup }) {
  return (
    <div className="lp-mock" aria-hidden="true">
      <div className="lp-mock-ap">
        <div className="c1">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
        <div className="c2">{[60, 80, 50, 70, 40, 65, 55].map((w, i) => <i key={i} style={{ width: `${w}%` }} />)}</div>
        <div className="c3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}><b /><span><i style={{ width: "40%" }} /><i style={{ width: `${70 - i * 8}%` }} /></span></div>
          ))}
        </div>
      </div>
      <div className="lp-mock-dim">
        <div className="lp-mock-scale is-desk">
          <AdminBroadcastPopupCard popup={popup} preview compact />
        </div>
      </div>
    </div>
  );
}

function PhoneMock({ popup }) {
  return (
    <div className="lp-phone" aria-hidden="true">
      <span className="lp-phone-nt" />
      <div className="lp-phone-ap">{[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}</div>
      <div className="lp-mock-dim">
        <div className="lp-mock-scale is-phone">
          <AdminBroadcastPopupCard popup={popup} preview compact />
        </div>
      </div>
    </div>
  );
}

/* ---------------- review ---------------- */

function ReviewDialog({ open, draft, reach, onClose, onSent, errText }) {
  const { t, locale } = useLocale();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteId = useId();
  useEffect(() => {
    if (open) {
      setNote("");
      setError("");
    }
  }, [open]);
  if (!draft) return null;
  const n = (v) => fmtNumber(v, locale);
  const scheduled = draft.when === "schedule";
  const count = reach?.count ?? 0;
  const ok = note.trim().length >= MIN_NOTE;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await livePopupApi.send({ ...draftPayload(draft), note: note.trim() });
      onSent({ id: out.id, status: out.status, message: scheduled ? t("livePopup.review.scheduled") : t("livePopup.review.sent", { n: n(out.stats?.targeted ?? count) }) });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };
  const when = scheduled ? dayTime(fromLocalInput(draft.scheduleAt), locale) : "";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Send}
      tone={draft.severity === "urgent" ? "red" : scheduled ? "amber" : "blue"}
      title={t(scheduled ? "livePopup.review.titleSchedule" : "livePopup.review.title", { n: n(count) })}
      subtitle={t(scheduled ? "livePopup.review.subSchedule" : "livePopup.review.sub", { title: draft.title.trim(), when })}
      testId="lp-review"
    >
      <div className="lp-kpis is-3">
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.review.online")}</span><b className="tnum">{n(reach?.online ?? 0)}</b><em className="lp-muted">{t("livePopup.review.onlineSub")}</em></div>
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.review.offline")}</span><b className="tnum">{n(reach?.offline ?? 0)}</b><em className="lp-muted">{t("livePopup.review.offlineSub")}</em></div>
        <div className="lp-kpi"><span className="lp-kpi-l">{t("livePopup.review.tone")}</span><b style={{ color: TONE_COLOR[draft.severity] }}>{t(`livePopup.tone.${draft.severity}`)}</b><em className="lp-muted">{draft.requireAck ? t("livePopup.requireAckChip") : t(`livePopup.durations.${draft.durationMs}`)}</em></div>
      </div>
      <div className="lp-f">
        <FieldLabel htmlFor={noteId} extra={t("livePopup.review.noteHint")}>{t("livePopup.review.note")}</FieldLabel>
        <textarea id={noteId} className="lp-ta" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("livePopup.review.notePlaceholder")} data-autofocus />
      </div>
      {error ? <p className="lp-conf" role="alert">{error}</p> : null}
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} disabled={busy}>{t("livePopup.review.cancel")}</button>
        <button type="button" className={`lp-btn ${draft.severity === "urgent" ? "is-dng" : "is-primary"}`} onClick={submit} disabled={!ok || busy} data-testid="lp-review-send">
          <Send size={16} />
          {scheduled ? t("livePopup.review.schedule") : t("livePopup.review.send", { n: n(count) })}
        </button>
      </div>
    </Dialog>
  );
}

function TemplateNameDialog({ open, initial, onClose, onSave, busy, error }) {
  const { t } = useLocale();
  const [name, setName] = useState(initial || "");
  const id = useId();
  useEffect(() => {
    if (open) setName(initial || "");
  }, [open, initial]);
  return (
    <Dialog open={open} onClose={onClose} busy={busy} icon={Save} title={t("livePopup.composer.saveTemplate")} width={460}>
      <div className="lp-f">
        <FieldLabel htmlFor={id}>{t("livePopup.composer.templateName")}</FieldLabel>
        <input id={id} className="lp-inp" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} data-autofocus onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }} />
      </div>
      {error ? <p className="lp-conf" role="alert">{error}</p> : null}
      <div className="lp-row">
        <button type="button" className="lp-btn" onClick={onClose} disabled={busy}>{t("livePopup.review.cancel")}</button>
        <button type="button" className="lp-btn is-primary" onClick={() => onSave(name.trim())} disabled={!name.trim() || busy}>
          <Save size={16} />
          {t("livePopup.composer.saveTemplate")}
        </button>
      </div>
    </Dialog>
  );
}

/* ---------------- drawer ---------------- */

export default function ComposerDrawer({ open, initial, editId, viewerUsername, templates, voiceAvailable, onClose, onSent, onTemplatesChanged, errText }) {
  const { t, locale } = useLocale();
  const titleId = useId();
  const ids = { title: useId(), body: useId(), ctaL: useId(), ctaU: useId(), when: useId() };
  const [draft, setDraft] = useState(emptyDraft());
  const [reach, setReach] = useState(null);
  const [reachBusy, setReachBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [review, setReview] = useState(false);
  const [view, setView] = useState("desktop");
  const [note, setNote] = useState(null); // { text, tone }
  const [busy, setBusy] = useState(false);
  const [tplDialog, setTplDialog] = useState(false);
  const [tplError, setTplError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [editing, setEditing] = useState(null); // rule type
  const [menu, setMenu] = useState(null); // "rules" | "templates" | "duration"
  const chipRefs = useRef({});
  const anchor = useRef(null);
  const addRef = useRef(null);
  const tplRef = useRef(null);
  const durRef = useRef(null);

  useEffect(() => {
    if (open) {
      setDraft(initial ? { ...emptyDraft(), ...initial } : emptyDraft());
      setReach(null);
      setShowErrors(false);
      setReview(false);
      setNote(null);
      setConfirmClose(false);
      setEditing(null);
      setMenu(null);
    }
  }, [open, initial]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  // Live audience estimate.
  const audienceKey = JSON.stringify([audiencePayload(draft.rules), draft.includeSelf, draft.severity]);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setReachBusy(true);
    const id = window.setTimeout(async () => {
      try {
        const out = await livePopupApi.audience({ audience: audiencePayload(draft.rules), includeSelf: draft.includeSelf, severity: draft.severity });
        if (alive) setReach(out);
      } catch {
        if (alive) setReach(null);
      } finally {
        if (alive) setReachBusy(false);
      }
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, audienceKey]);

  const errors = draftErrors(draft);
  const count = reach?.count ?? 0;
  const n = (v) => fmtNumber(v, locale);
  const preview = useMemo(
    () => ({
      id: "preview",
      title: draft.title.trim() || t("livePopup.composer.titlePlaceholder"),
      body: draft.body.trim() || t("livePopup.composer.bodyPlaceholder"),
      severity: draft.severity,
      icon: draft.icon,
      requireAck: draft.requireAck,
      ctaLabel: draft.ctaLabel.trim(),
      ctaUrl: draft.ctaUrl.trim(),
      from: { username: viewerUsername || "admin" },
    }),
    [draft, t, viewerUsername]
  );

  const requestClose = () => {
    if (busy) return;
    if (draftDirty(draft) && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const startReview = async () => {
    setShowErrors(true);
    if (errors.length) return;
    if (editId) {
      setBusy(true);
      try {
        const p = draftPayload(draft);
        await livePopupApi.updateScheduled(editId, p);
        onSent({ id: editId, status: "scheduled", message: t("livePopup.review.scheduled") });
      } catch (err) {
        setNote({ text: errText(err), tone: "bad" });
      } finally {
        setBusy(false);
      }
      return;
    }
    setReview(true);
  };

  const testSend = async () => {
    setNote(null);
    if (!draft.title.trim() || !draft.body.trim()) {
      setShowErrors(true);
      return;
    }
    try {
      const out = await livePopupApi.test(draftContent(draft));
      setNote({ text: t("livePopup.composer.testSent", { n: out.devices }), tone: "ok" });
    } catch (err) {
      setNote({ text: errText(err), tone: "bad" });
    }
  };

  const saveTemplate = async (name) => {
    setBusy(true);
    setTplError("");
    try {
      await livePopupApi.saveTemplate({ name, content: draftContent(draft), audience: audiencePayload(draft.rules) });
      setTplDialog(false);
      setNote({ text: t("livePopup.composer.templateSaved"), tone: "ok" });
      onTemplatesChanged?.();
    } catch (err) {
      setTplError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  /* rules */
  const ruleItems = RULE_TYPES.filter((type) => (type !== "voice" || voiceAvailable) && !draft.rules.some((r) => r.type === type)).map((type) => ({
    id: type,
    label: t(`livePopup.rules.${type}`),
    sub: t(`livePopup.rules.${type}Sub`),
    icon: RULE_ICON[type],
    onSelect: () => {
      const rule = newRule(type);
      setDraft((d) => ({ ...d, rules: upsertRule(d.rules, rule) }));
      if (!["voice", "visibility"].includes(type)) window.requestAnimationFrame(() => openEditor(type));
    },
  }));
  const openEditor = (type) => {
    anchor.current = chipRefs.current[type] || addRef.current;
    setEditing(type);
  };
  const closeEditor = () => {
    setDraft((d) => {
      const r = d.rules.find((x) => x.type === editing);
      return r && !ruleComplete(r) ? { ...d, rules: removeRule(d.rules, r.type) } : d;
    });
    setEditing(null);
  };
  const editingRule = draft.rules.find((r) => r.type === editing) || null;

  const tplItems = [
    ...BUILTIN_TEMPLATES.map((b) => ({ id: b.id, label: t(`livePopup.templates.${b.key}.name`), sub: t(`livePopup.tone.${b.severity}`), icon: LIVE_POPUP_ICONS[b.icon], onSelect: () => setDraft(draftFromTemplate(b, t)) })),
    ...(templates?.list?.length ? ["sep"] : []),
    ...(templates?.list || []).map((tpl) => ({ id: tpl.id, label: tpl.name, sub: tpl.title, icon: LIVE_POPUP_ICONS[tpl.icon], onSelect: () => setDraft(draftFromTemplate(tpl, t)) })),
    "sep",
    { id: "blank", label: t("livePopup.templates.blank"), sub: t("livePopup.templates.blankSub"), icon: Plus, onSelect: () => setDraft(emptyDraft()) },
  ];

  const durItems = DURATIONS.map((ms) => ({ id: String(ms), label: t(`livePopup.durations.${ms}`), checked: draft.durationMs === ms, onSelect: () => { patch({ durationMs: ms }); setMenu(null); } }));

  const iconRow = TONE_ICONS[draft.severity] || TONE_ICONS.info;
  const color = TONE_COLOR[draft.severity];

  const reachText = reachBusy && !reach
    ? t("livePopup.reachLoading")
    : !count
      ? t(draft.rules.length ? "livePopup.reachZero" : "livePopup.reachNobodyOnline")
      : reach?.offline
        ? t("livePopup.reachOffline", { n: n(count), online: n(reach.online), offline: n(reach.offline) })
        : t("livePopup.reach", { n: n(count), share: reach?.share ?? 0 });
  const reachNum = reachText.match(/^[\d.,\s]+/)?.[0]?.trim();

  return (
    <>
      <Drawer open={open} onClose={requestClose} busy={busy || Boolean(editing) || Boolean(menu)} suspended={review || tplDialog} labelledBy={titleId} testId="lp-composer">
        <header className="lp-dh">
          <span className="lp-dh-ic is-blue" aria-hidden="true"><BellRing size={20} /></span>
          <div>
            <h2 id={titleId}>{t(editId ? "livePopup.composer.editTitle" : "livePopup.composer.title")}</h2>
            <p>
              {t("livePopup.composer.fromTemplate")} <b className="lp-tplname">{draft.templateName || t("livePopup.composer.blank")}</b> ·{" "}
              <button ref={tplRef} type="button" className="lp-link" aria-haspopup="menu" aria-expanded={menu === "templates"} onClick={() => setMenu(menu === "templates" ? null : "templates")} data-testid="lp-tpl-change">
                {t("livePopup.composer.change")}
              </button>
            </p>
          </div>
          <button type="button" className="lp-x-close" onClick={requestClose} aria-label={t("livePopup.composer.close")}>
            <X size={18} />
          </button>
        </header>
        <Menu open={menu === "templates"} anchorRef={tplRef} onClose={() => setMenu(null)} items={tplItems} label={t("livePopup.templates.pickerTitle")} align="left" width={300} />

        <div className="lp-drawer-body">
          <div className="lp-grid2">
            <div className="lp-f">
              <FieldLabel>{t("livePopup.composer.tone")}</FieldLabel>
              <Seg
                items={TONES.map((id) => ({ id, label: t(`livePopup.tone.${id}`), tone: id }))}
                value={draft.severity}
                onChange={(sev) => setDraft((d) => applyTone(d, sev))}
                label={t("livePopup.composer.tone")}
                className="lp-tone-seg"
              />
            </div>
            <div className="lp-f">
              <FieldLabel>{t("livePopup.composer.icon")}</FieldLabel>
              <div className="lp-icons" role="radiogroup" aria-label={t("livePopup.composer.icon")} style={{ "--c": color }}>
                {iconRow.map((id) => {
                  const G = LIVE_POPUP_ICONS[id];
                  return (
                    <button key={id} type="button" role="radio" aria-checked={draft.icon === id} aria-label={t(`livePopup.icon.${id}`)} className={draft.icon === id ? "is-on" : ""} onClick={() => patch({ icon: id })}>
                      <G size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lp-f">
            <FieldLabel htmlFor={ids.title} extra={`${draft.title.length}/${MAX_TITLE}`}>{t("livePopup.composer.titleLabel")}</FieldLabel>
            <input id={ids.title} className={`lp-inp${showErrors && errors.includes("title") ? " is-bad" : ""}`} maxLength={MAX_TITLE} value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t("livePopup.composer.titlePlaceholder")} data-autofocus />
          </div>
          <div className="lp-f">
            <FieldLabel htmlFor={ids.body} extra={`${draft.body.length}/${MAX_BODY}`}>{t("livePopup.composer.body")}</FieldLabel>
            <textarea id={ids.body} className={`lp-ta${showErrors && errors.includes("body") ? " is-bad" : ""}`} rows={2} maxLength={MAX_BODY} value={draft.body} onChange={(e) => patch({ body: e.target.value })} placeholder={t("livePopup.composer.bodyPlaceholder")} />
          </div>

          <div className="lp-f">
            <FieldLabel>{t("livePopup.composer.to")}</FieldLabel>
            <div className="lp-rules">
              {!draft.rules.length ? (
                <span className="lp-rule is-all">
                  <Users size={16} />
                  <b>{t("livePopup.everyone")}</b>
                </span>
              ) : null}
              {draft.rules.map((r) => {
                const Ico = RULE_ICON[r.type] || Users;
                const editable = !["voice", "visibility"].includes(r.type);
                return (
                  <span key={r.type} className="lp-rule" ref={(el) => { chipRefs.current[r.type] = el; }}>
                    <button type="button" className="lp-rule-main" onClick={() => editable && openEditor(r.type)} disabled={!editable} aria-label={editable ? `${ruleLabel(r, t)} · ${t("livePopup.rules.edit")}` : undefined}>
                      <Ico size={16} />
                      <b>{ruleLabel(r, t)}</b>
                    </button>
                    <button type="button" className="lp-rx" aria-label={t("livePopup.rules.remove", { rule: ruleLabel(r, t) })} onClick={() => setDraft((d) => ({ ...d, rules: removeRule(d.rules, r.type) }))}>
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {ruleItems.length ? (
                <button ref={addRef} type="button" className="lp-btn is-sm is-bq" aria-haspopup="menu" aria-expanded={menu === "rules"} onClick={() => setMenu(menu === "rules" ? null : "rules")} data-testid="lp-add-rule">
                  <Plus size={15} />
                  {t("livePopup.rules.add")}
                </button>
              ) : null}
            </div>
            <Menu open={menu === "rules"} anchorRef={addRef} onClose={() => setMenu(null)} items={ruleItems} label={t("livePopup.rules.menu")} align="left" width={300} testId="lp-rule-menu" />
            <Menu open={Boolean(editingRule)} anchorRef={anchor} onClose={closeEditor} items={[]} label={t("livePopup.rules.edit")} align="left" width={editingRule?.type === "users" || editingRule?.type === "server" ? 320 : 260} keepOpen>
              {editingRule ? <RuleEditor rule={editingRule} onChange={(rule) => setDraft((d) => ({ ...d, rules: upsertRule(d.rules, rule) }))} onDone={closeEditor} /> : null}
            </Menu>
            <p className="lp-legend lp-reach" aria-live="polite" data-testid="lp-reach">
              {reachNum && count ? (
                <>
                  <b>{reachNum}</b>
                  {reachText.slice(reachText.indexOf(reachNum) + reachNum.length)}
                </>
              ) : (
                reachText
              )}
            </p>
          </div>

          <div className="lp-grid2">
            <div className="lp-f">
              <FieldLabel>{t("livePopup.composer.autoClose")}</FieldLabel>
              <button ref={durRef} type="button" className="lp-inp lp-select" aria-haspopup="menu" aria-expanded={menu === "duration"} disabled={draft.requireAck} onClick={() => setMenu(menu === "duration" ? null : "duration")}>
                <span>{t(`livePopup.durations.${draft.requireAck ? 0 : draft.durationMs}`)}</span>
                <ChevronDown size={15} />
              </button>
              <Menu open={menu === "duration"} anchorRef={durRef} onClose={() => setMenu(null)} items={durItems} label={t("livePopup.composer.autoClose")} align="left" width={240} keepOpen />
            </div>
            <div className="lp-f">
              <FieldLabel>{t("livePopup.composer.when")}</FieldLabel>
              <Seg items={[{ id: "now", label: t("livePopup.composer.now") }, { id: "schedule", label: t("livePopup.composer.schedule") }]} value={draft.when} onChange={(when) => patch({ when })} label={t("livePopup.composer.when")} />
            </div>
          </div>
          {draft.when === "schedule" ? (
            <div className="lp-f">
              <FieldLabel htmlFor={ids.when}>{t("livePopup.composer.scheduleAt")}</FieldLabel>
              <input id={ids.when} type="datetime-local" className={`lp-inp${showErrors && errors.includes("schedule") ? " is-bad" : ""}`} value={draft.scheduleAt} onChange={(e) => patch({ scheduleAt: e.target.value })} />
            </div>
          ) : null}

          <div className="lp-toggles">
            <Toggle checked={draft.requireAck} onChange={(v) => patch({ requireAck: v })} label={t("livePopup.composer.requireAck")} hint={t("livePopup.composer.requireAckHint")} />
            <Toggle checked={draft.autoResolve} onChange={(v) => patch({ autoResolve: v })} label={t("livePopup.composer.autoResolve")} hint={t("livePopup.newBadge")} />
            <Toggle checked={draft.includeSelf} onChange={(v) => patch({ includeSelf: v })} label={t("livePopup.composer.includeSelf")} />
          </div>

          <div className="lp-f">
            <FieldLabel extra={t("livePopup.composer.optional")}>{t("livePopup.composer.button")}</FieldLabel>
            <div className="lp-cta">
              <input id={ids.ctaL} className={`lp-inp${showErrors && errors.includes("cta") ? " is-bad" : ""}`} maxLength={40} value={draft.ctaLabel} onChange={(e) => patch({ ctaLabel: e.target.value })} placeholder={t("livePopup.composer.buttonLabel")} aria-label={t("livePopup.composer.buttonLabel")} />
              <input id={ids.ctaU} className={`lp-inp${showErrors && errors.includes("cta") ? " is-bad" : ""}`} maxLength={300} value={draft.ctaUrl} onChange={(e) => patch({ ctaUrl: e.target.value })} placeholder={t("livePopup.composer.buttonUrl")} aria-label={t("livePopup.composer.buttonUrl")} />
            </div>
          </div>

          <div className="lp-pv">
            {view === "desktop" ? <DesktopMock popup={preview} /> : <PhoneMock popup={preview} />}
            <div className="lp-pv-side">
              <b>{t("livePopup.composer.preview")}</b>
              <span className="lp-pv-switch" role="radiogroup" aria-label={t("livePopup.composer.previewSub")}>
                <button type="button" role="radio" aria-checked={view === "desktop"} className={view === "desktop" ? "is-on" : ""} onClick={() => setView("desktop")}>{t("livePopup.composer.desktop")}</button>
                <span aria-hidden="true">{" "}·{" "}</span>
                <button type="button" role="radio" aria-checked={view === "mobile"} className={view === "mobile" ? "is-on" : ""} onClick={() => setView("mobile")}>{t("livePopup.composer.mobile")}</button>
              </span>
              <button type="button" className="lp-btn is-sm" onClick={testSend} data-testid="lp-test-send">
                <Smartphone size={16} />
                {t("livePopup.composer.testSend")}
              </button>
              {note ? <p className={`lp-note is-${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</p> : null}
            </div>
          </div>

          {showErrors && errors.length ? (
            <p className="lp-conf" role="alert">
              <AlertTriangle size={14} /> {errors.map((e) => t(`livePopup.composer.errors.${e}`)).join(" ")}
            </p>
          ) : null}
          {confirmClose ? (
            <div className="lp-conf is-row" role="alert">
              <span>{t("livePopup.composer.dirtyClose")}</span>
              <span className="lp-sp" />
              <button type="button" className="lp-btn is-sm" onClick={() => setConfirmClose(false)}>{t("livePopup.review.cancel")}</button>
              <button type="button" className="lp-btn is-sm is-dng" onClick={onClose} data-autofocus>{t("livePopup.composer.close")}</button>
            </div>
          ) : null}
        </div>

        <footer className="lp-row lp-drawer-foot">
          <button type="button" className="lp-btn" onClick={() => { setTplError(""); setTplDialog(true); }} disabled={!draft.title.trim() || !draft.body.trim() || templates?.persistent === false} title={templates?.persistent === false ? t("livePopup.composer.templateUnavailable") : undefined}>
            <Save size={16} />
            {t("livePopup.composer.saveTemplate")}
          </button>
          <button type="button" className={`lp-btn ${draft.severity === "urgent" ? "is-dng" : "is-primary"}`} onClick={startReview} disabled={busy || (!editId && !count)} data-testid="lp-review-open">
            <Send size={16} />
            {editId ? t("livePopup.composer.saveSchedule") : t(draft.when === "schedule" ? "livePopup.composer.reviewSchedule" : "livePopup.composer.review", { n: n(count) })}
          </button>
        </footer>
      </Drawer>

      <ReviewDialog open={review} draft={draft} reach={reach} onClose={() => setReview(false)} onSent={(out) => { setReview(false); onSent(out); }} errText={errText} />
      <TemplateNameDialog open={tplDialog} initial={draft.templateName || draft.title.trim().slice(0, 60)} onClose={() => setTplDialog(false)} onSave={saveTemplate} busy={busy} error={tplError} />
    </>
  );
}
