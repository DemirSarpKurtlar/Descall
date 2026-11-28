/**
 * Yönetici Paneli › Topluluk çevirileri (draft C extras 3-5, Nov 2026).
 *
 * Console layout like Duyurular: header (server picker, localization switch with a
 * reason to turn it off), coverage cards per language (click = preview language),
 * toolbar (search, type and status filters, "Taslak çevir", Kaydet / Vazgeç), the grid
 * of items x 7 languages with inline editing (missing / stale / draft / unsaved badges),
 * and the sticky live preview on the right: the desktop window and the phone with the
 * channel list and the pinned message exactly as a reader in that language gets them
 * (same fallback rules as the API, lib/serverL10n.js readerPreview).
 *
 * Nothing is published by "Taslak çevir": drafts fill the cells as "Taslak" until the
 * admin saves. Every save, settings change and draft run is written to the admin audit
 * log on the server (server_l10n_save / server_l10n_settings / server_l10n_draft).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { displayName, formatDate } from "../../../i18n/format.js";
import { readerPreview } from "../../../lib/serverL10n.js";
import { Dialog, Ic, Seg, Switch } from "../announcements/ui.jsx";
import { sl10nApi } from "./serverL10nApi.js";
import {
  KIND_GROUPS,
  cellKey,
  cellState,
  coverageOf,
  draftTargets,
  filterItems,
  fromEditable,
  groupOf,
  itemKey,
  mergeEdits,
  saveBody,
  toEditable,
  unknownMentions,
} from "./serverL10nModel.js";
import "../../../styles/admin-announcements.css";
import "../../../styles/admin-server-l10n.css";

const ERR_CODES = new Set(["TRANSLATE_UNAVAILABLE", "TRANSLATE_FAILED", "NO_EMOJI", "BAD_MENTION", "BAD_ITEM", "TOO_LONG", "REASON_REQUIRED", "SCHEMA_MISSING", "EMPTY", "NOT_FOUND"]);

function errText(e, t) {
  if (e?.code && ERR_CODES.has(e.code)) return t(`srvLoc.admin.err.${e.code}`);
  return t("srvLoc.admin.err.generic");
}

function KindIcon({ it }) {
  const g = groupOf(it);
  const name = g === "server" ? "globe" : g === "category" ? "list" : g === "channel" ? (["voice", "stage"].includes(it.channelType) ? "phone" : "message") : g === "topic" ? "note" : "pin";
  return (
    <span className={`slx-kind is-${g}`} aria-hidden="true">
      <Ic name={name} size={14} />
    </span>
  );
}

/* ---------------- coverage cards ---------------- */

function CoverageCards({ coverage, locales, sourceLocale, active, onPick, t, ui }) {
  return (
    <div className="slx-cov" role="tablist" aria-label={t("srvLoc.admin.coverageLabel")} data-testid="slx-coverage">
      {locales.map((l) => {
        const c = coverage[l] || { pct: 0, missing: 0, stale: 0 };
        const isSource = l === sourceLocale;
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={active === l}
            className={`slx-cov-card${active === l ? " is-on" : ""}${c.missing ? " has-missing" : ""}`}
            onClick={() => onPick(l)}
            data-testid={`slx-cov-${l}`}
            data-pct={c.pct}
          >
            <span className="slx-cov-top">
              <b>{l}</b>
              <span className="slx-cov-name">{displayName(l, ui, "language")}</span>
              {isSource ? <em className="slx-tag">{t("srvLoc.admin.source")}</em> : null}
            </span>
            <span className="slx-cov-pct tnum">{c.pct}%</span>
            <span className="slx-cov-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, c.pct))}%` }} />
            </span>
            <span className="slx-cov-sub">
              {c.missing ? <span className="slx-pill is-missing">{t("srvLoc.admin.missingN", { n: c.missing })}</span> : <span className="slx-pill is-ok">{t("srvLoc.admin.complete")}</span>}
              {c.stale ? <span className="slx-pill is-stale">{t("srvLoc.admin.staleN", { n: c.stale })}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- grid cell ---------------- */

function Cell({ it, locale, sourceLocale, channels, editing, onEdit, onCommit, onCancel, t }) {
  const row = it.translations?.[locale];
  const state = cellState(it, locale, sourceLocale);
  const [value, setValue] = useState("");
  const ref = useRef(null);
  const isEditing = editing === cellKey(it, locale);
  useEffect(() => {
    if (!isEditing) return;
    setValue(toEditable(row?.text || (locale === sourceLocale ? it.original : ""), channels));
    requestAnimationFrame(() => ref.current?.focus());
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!it.original && it.kind === "channel_topic") return <td className="slx-cell is-empty" />;
  const multiline = it.kind === "message" || it.kind === "channel_topic" || it.kind === "server_description";
  if (isEditing) {
    const unknown = unknownMentions(value, channels);
    return (
      <td className="slx-cell is-editing">
        {multiline ? (
          <textarea
            ref={ref}
            className="slx-input"
            value={value}
            rows={it.kind === "message" ? 8 : 3}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCommit(fromEditable(value, channels));
            }}
            aria-label={t("srvLoc.admin.editIn", { lang: locale })}
            data-testid="slx-input"
          />
        ) : (
          <input
            ref={ref}
            className="slx-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter") onCommit(fromEditable(value, channels));
            }}
            aria-label={t("srvLoc.admin.editIn", { lang: locale })}
            data-testid="slx-input"
          />
        )}
        {unknown.length ? <p className="slx-warn">{t("srvLoc.admin.unknownMention", { names: unknown.join(", ") })}</p> : null}
        <div className="slx-cell-actions">
          <button type="button" className="an-btn is-sm is-primary" onClick={() => onCommit(fromEditable(value, channels))} data-testid="slx-commit">
            {t("srvLoc.admin.apply")}
          </button>
          <button type="button" className="an-btn is-sm" onClick={onCancel}>
            {t("srvLoc.admin.cancel")}
          </button>
          {row ? (
            <button type="button" className="an-btn is-sm slx-clear" onClick={() => onCommit("")}>
              {t("srvLoc.admin.clear")}
            </button>
          ) : null}
          <span className="an-sp" />
          <small className="an-muted">{multiline ? t("srvLoc.admin.hintMulti") : t("srvLoc.admin.hintSingle")}</small>
        </div>
      </td>
    );
  }
  const text = row?.text ? toEditable(row.text, channels) : "";
  const label = {
    source: t("srvLoc.admin.stateSource"),
    missing: t("srvLoc.admin.stateMissing"),
    stale: t("srvLoc.admin.stateStale"),
    draft: t("srvLoc.admin.stateDraft"),
    edited: t("srvLoc.admin.stateEdited"),
  }[state];
  return (
    <td className={`slx-cell is-${state}${locale === sourceLocale ? " is-src" : ""}`} data-state={state} data-locale={locale}>
      <button type="button" className="slx-cell-btn" onClick={onEdit} title={row?.updatedBy ? t("srvLoc.admin.lastBy", { who: row.updatedBy }) : undefined} data-testid="slx-cell">
        {text ? <span className="slx-cell-text">{text}</span> : <span className="slx-cell-ph">{state === "source" ? toEditable(it.original, channels) : t("srvLoc.admin.addTranslation")}</span>}
        {label ? <em className={`slx-badge is-${state}`}>{label}</em> : null}
      </button>
    </td>
  );
}

/* ---------------- live preview ---------------- */

function PreviewChannelList({ view, selectedId, onSelect, compact }) {
  const cats = view.channels.filter((c) => c.type === "category");
  const loose = view.channels.filter((c) => c.type !== "category" && !c.parentId);
  const group = (cat) => view.channels.filter((c) => c.type !== "category" && String(c.parentId) === String(cat.id));
  const row = (c) => {
    const voice = c.type === "voice" || c.type === "stage";
    return (
      <button
        key={c.id}
        type="button"
        className={`slx-pv-ch${String(selectedId) === String(c.id) ? " is-on" : ""}`}
        onClick={() => !voice && onSelect(c.id)}
        data-testid="slx-preview-channel"
        data-channel-id={c.id}
      >
        <span className="slx-pv-ico" aria-hidden="true">{voice ? <Ic name="phone" size={compact ? 11 : 12} /> : "#"}</span>
        <span className="an-ell">{c.name}</span>
      </button>
    );
  };
  return (
    <div className="slx-pv-list">
      {loose.map(row)}
      {cats.map((cat) => (
        <div key={cat.id} className="slx-pv-cat">
          <span className="slx-pv-cat-name an-ell">{cat.name}</span>
          {group(cat).map(row)}
        </div>
      ))}
    </div>
  );
}

function PinnedCard({ msg, t, locale }) {
  if (!msg) return <p className="slx-pv-empty">{t("srvLoc.admin.noPinned")}</p>;
  const lines = String(msg.text || "").split("\n");
  return (
    <div className="slx-pv-pin" data-testid="slx-preview-pinned">
      <span className="slx-pv-pin-cap">
        <Ic name="pin" size={12} />
        {t("srvLoc.admin.pinned")}
        {msg.translated ? <em className="slx-pv-mark">{String(msg.locale || locale).split("-")[0].toUpperCase()}</em> : null}
      </span>
      <div className="slx-pv-pin-body">
        {lines.map((line, i) => {
          const bold = /^\*\*(.+)\*\*$/.exec(line.trim());
          return bold ? <b key={i}>{bold[1]}</b> : line ? <p key={i}>{line}</p> : <br key={i} />;
        })}
      </div>
    </div>
  );
}

function LivePreview({ items, channels, locales, sourceLocale, lang, setLang, selectedChannelId, setSelectedChannelId, t }) {
  const view = useMemo(() => readerPreview({ items, channels, lang, sourceLocale }), [items, channels, lang, sourceLocale]);
  const msgItems = items.filter((it) => it.kind === "message");
  const pinnedOf = (chId) => {
    const its = msgItems.filter((it) => String(it.channelId) === String(chId));
    const it = its.find((x) => x.pinned) || its[0];
    return it ? view.messages.get(String(it.refId)) : null;
  };
  const textCh = view.channels.filter((c) => c.type === "text" || c.type === "announcement");
  const selected = textCh.find((c) => String(c.id) === String(selectedChannelId)) || textCh.find((c) => pinnedOf(c.id)) || textCh[0] || null;
  const pinned = selected ? pinnedOf(selected.id) : null;
  return (
    <aside className="slx-preview" aria-label={t("srvLoc.admin.previewTitle")} data-testid="slx-preview" data-lang={lang}>
      <div className="slx-preview-head">
        <span className="an-cap">
          <Ic name="eye" size={13} />
          {t("srvLoc.admin.previewTitle")}
        </span>
        <span className="slx-live-dot">{t("srvLoc.admin.live")}</span>
      </div>
      <div className="slx-langs" role="radiogroup" aria-label={t("srvLoc.admin.readerLanguage")}>
        {locales.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? "is-on" : ""} onClick={() => setLang(l)} data-testid={`slx-pv-lang-${l}`}>
            {l}
          </button>
        ))}
      </div>
      <p className="an-muted an-small">{t("srvLoc.admin.previewHint")}</p>

      <div className="slx-dev-label">
        <Ic name="monitor" size={13} />
        {t("srvLoc.admin.desktop")}
      </div>
      <div className="slx-win" data-testid="slx-preview-desktop">
        <div className="slx-win-bar">
          <i />
          <i />
          <i />
          <span>Descall</span>
        </div>
        <div className="slx-win-app">
          <div className="slx-win-rail">
            <span className="slx-win-srv is-on">D</span>
            <span className="slx-win-srv" />
            <span className="slx-win-srv" />
          </div>
          <div className="slx-win-side">
            <div className="slx-win-title an-ell">{view.serverName}</div>
            <PreviewChannelList view={view} selectedId={selected?.id} onSelect={setSelectedChannelId} />
          </div>
          <div className="slx-win-main">
            <div className="slx-win-head">
              <b className="an-ell"># {selected?.name || ""}</b>
              <span className="an-ell">{selected?.topic || ""}</span>
            </div>
            <PinnedCard msg={pinned} t={t} locale={lang} />
          </div>
        </div>
      </div>

      <div className="slx-dev-label">
        <Ic name="phone" size={13} />
        {t("srvLoc.admin.phone")}
      </div>
      <div className="slx-phone" data-testid="slx-preview-phone">
        <div className="slx-phone-notch" aria-hidden="true" />
        <div className="slx-phone-screen">
          <div className="slx-phone-head">
            <b className="an-ell"># {selected?.name || ""}</b>
            <span className="an-ell">{view.serverName}</span>
          </div>
          <PinnedCard msg={pinned} t={t} locale={lang} />
          <div className="slx-phone-sheet">
            <PreviewChannelList view={view} selectedId={selected?.id} onSelect={setSelectedChannelId} compact />
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- page ---------------- */

export default function ServerTranslationsPage() {
  const { t, locale: ui } = useLocale();
  const [list, setList] = useState(null);
  const [serverId, setServerId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState(null);
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [previewLang, setPreviewLang] = useState(null);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offReason, setOffReason] = useState("");

  const loadList = useCallback(async () => {
    try {
      const r = await sl10nApi.list();
      setList(r);
      setServerId((cur) => cur || r?.servers?.[0]?.id || null);
      if (r && r.schemaReady === false) setError(t("srvLoc.admin.err.SCHEMA_MISSING"));
    } catch (e) {
      setError(errText(e, t));
    }
  }, [t]);

  const load = useCallback(async (id) => {
    if (!id) return;
    try {
      setError("");
      const r = await sl10nApi.load(id);
      setData(r);
      setEdits({});
      setEditing(null);
      setPreviewLang((cur) => cur || (r.locales.includes("pt-BR") ? "pt-BR" : r.locales.find((l) => l !== r.settings.sourceLocale)) || r.locales[0]);
    } catch (e) {
      setError(errText(e, t));
    }
  }, [t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void load(serverId);
  }, [serverId, load]);

  const locales = data?.locales || [];
  const sourceLocale = data?.settings?.sourceLocale || "tr";
  const merged = useMemo(() => mergeEdits(data?.items || [], edits), [data, edits]);
  const coverage = useMemo(() => coverageOf(merged, locales), [merged, locales]);
  const visible = useMemo(() => filterItems(merged, { group, status, q, locales, sourceLocale }), [merged, group, status, q, locales, sourceLocale]);
  const pending = Object.keys(edits).length;
  const drafts = Object.values(edits).filter((e) => e.draft).length;
  const staleTotal = locales.reduce((n, l) => n + (coverage[l]?.stale || 0), 0);

  const flash = (tone, text) => {
    setNotice({ tone, text, at: Date.now() });
    window.setTimeout(() => setNotice((n) => (n && Date.now() - n.at >= 4800 ? null : n)), 5000);
  };

  const commit = (it, locale, text) => {
    setEdits((prev) => {
      const next = { ...prev };
      const k = cellKey(it, locale);
      // Back to what is stored: no longer an unsaved change.
      const stored = data?.items?.find((x) => itemKey(x) === itemKey(it))?.translations?.[locale]?.text || "";
      if (String(text) === String(stored)) delete next[k];
      else next[k] = { text, draft: false };
      return next;
    });
    setEditing(null);
  };

  const save = async () => {
    if (!pending || !data) return;
    setBusy("save");
    try {
      const body = saveBody(edits, data.items, data.channels);
      const r = await sl10nApi.save(data.server.id, body, drafts ? { fromDraft: true } : {});
      setData(r);
      setEdits({});
      flash("ok", t("srvLoc.admin.saved", { n: (r.saved || 0) + (r.removed || 0) }));
      void loadList();
    } catch (e) {
      flash("err", errText(e, t));
    } finally {
      setBusy("");
    }
  };

  const runDraft = async () => {
    if (!data) return;
    if (!data.translateAvailable) {
      flash("err", t("srvLoc.admin.err.TRANSLATE_UNAVAILABLE"));
      return;
    }
    const target = draftTargets(visible, locales, sourceLocale);
    if (!target.items.length) {
      flash("ok", t("srvLoc.admin.nothingToDraft"));
      return;
    }
    setBusy("draft");
    try {
      const r = await sl10nApi.draft(data.server.id, { items: target.items.slice(0, 40), locales: target.locales });
      setEdits((prev) => {
        const next = { ...prev };
        for (const d of r.drafts || []) {
          const it = data.items.find((x) => x.kind === d.kind && String(x.refId).toLowerCase() === String(d.refId).toLowerCase());
          if (it) next[cellKey(it, d.locale)] = { text: d.text, draft: true };
        }
        return next;
      });
      flash(r.failed?.length ? "err" : "ok", r.failed?.length ? t("srvLoc.admin.draftPartial", { n: r.drafts.length, failed: r.failed.length }) : t("srvLoc.admin.drafted", { n: (r.drafts || []).length }));
    } catch (e) {
      flash("err", errText(e, t));
    } finally {
      setBusy("");
    }
  };

  const setEnabled = async (on, reason = "") => {
    if (!data) return;
    setBusy("settings");
    try {
      await sl10nApi.settings(data.server.id, { enabled: on, ...(reason ? { reason } : {}) });
      setOffOpen(false);
      setOffReason("");
      await load(data.server.id);
      void loadList();
      flash("ok", on ? t("srvLoc.admin.turnedOn") : t("srvLoc.admin.turnedOff"));
    } catch (e) {
      flash("err", errText(e, t));
    } finally {
      setBusy("");
    }
  };

  const groups = KIND_GROUPS.map((g) => ({ id: g, label: t(`srvLoc.admin.group.${g}`), count: g === "all" ? merged.filter((it) => it.original || it.kind !== "channel_topic").length : merged.filter((it) => groupOf(it) === g && (it.original || it.kind !== "channel_topic")).length }));
  const statuses = [
    { id: "all", label: t("srvLoc.admin.status.all") },
    { id: "missing", label: t("srvLoc.admin.status.missing") },
    { id: "stale", label: t("srvLoc.admin.status.stale"), count: staleTotal || null },
    { id: "pending", label: t("srvLoc.admin.status.pending"), count: pending || null },
  ];

  const channelName = (id) => data?.channels?.find((c) => String(c.id) === String(id))?.name || "";
  const itemTitle = (it) => {
    if (it.kind === "server_name") return t("srvLoc.admin.kind.serverName");
    if (it.kind === "server_description") return t("srvLoc.admin.kind.serverDescription");
    if (it.kind === "channel_name") return it.channelType === "category" ? t("srvLoc.admin.kind.category") : ["voice", "stage"].includes(it.channelType) ? t("srvLoc.admin.kind.voice") : t("srvLoc.admin.kind.channel");
    if (it.kind === "channel_topic") return t("srvLoc.admin.kind.topic", { channel: channelName(it.refId) });
    return it.pinned ? t("srvLoc.admin.kind.pinnedMessage", { channel: channelName(it.channelId) }) : t("srvLoc.admin.kind.message", { channel: channelName(it.channelId) });
  };

  const server = (list?.servers || []).find((s) => s.id === serverId);

  return (
    <div className="an slx" data-testid="slx-page">
      <div className="an-top">
        <div className="an-top-txt">
          <h1>{t("srvLoc.admin.title")}</h1>
          <p>{t("srvLoc.admin.subtitle")}</p>
        </div>
        {(list?.servers || []).length > 1 ? (
          <select className="slx-select" value={serverId || ""} onChange={(e) => setServerId(e.target.value)} aria-label={t("srvLoc.admin.server")}>
            {list.servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="an-search is-sm">
          <Ic name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("srvLoc.admin.search")} aria-label={t("srvLoc.admin.search")} data-testid="slx-search" />
        </label>
      </div>

      {error ? <p className="an-err">{error}</p> : null}

      {data ? (
        <>
          <div className="slx-strip">
            <div className="slx-server">
              <span className="slx-server-ic" aria-hidden="true">
                {data.server.iconUrl ? <img src={data.server.iconUrl} alt="" /> : <Ic name="globe" size={18} />}
              </span>
              <div className="slx-server-txt">
                <b className="an-ell">{data.server.name}</b>
                <span>
                  {t("srvLoc.admin.sourceIs", { lang: displayName(sourceLocale, ui, "language") })}
                  {server?.official ? ` · ${t("srvLoc.admin.official")}` : ""}
                  {data.settings.updatedAt ? ` · ${t("srvLoc.admin.updated", { when: formatDate(data.settings.updatedAt, ui) })}` : ""}
                </span>
              </div>
            </div>
            <Switch
              checked={data.settings.enabled}
              disabled={Boolean(busy)}
              label={data.settings.enabled ? t("srvLoc.admin.enabled") : t("srvLoc.admin.disabled")}
              hint={t("srvLoc.admin.enabledHint")}
              onChange={(on) => (on ? setEnabled(true) : setOffOpen(true))}
              testId="slx-enabled"
            />
          </div>

          <CoverageCards coverage={coverage} locales={locales} sourceLocale={sourceLocale} active={previewLang} onPick={setPreviewLang} t={t} ui={ui} />

          {staleTotal ? (
            <p className="an-warnline" data-testid="slx-stale-warning">
              <Ic name="alert" size={15} />
              {t("srvLoc.admin.staleWarning", { n: staleTotal })}
              <button type="button" className="an-linkbtn" onClick={() => setStatus("stale")}>
                {t("srvLoc.admin.showStale")}
              </button>
            </p>
          ) : null}

          <div className="slx-tools">
            <Seg items={groups} value={group} onChange={setGroup} label={t("srvLoc.admin.typeFilter")} className="slx-seg" />
            <Seg items={statuses} value={status} onChange={setStatus} label={t("srvLoc.admin.statusFilter")} className="slx-seg" testId="slx-status" />
            <span className="an-sp" />
            <button
              type="button"
              className="an-btn is-violet"
              onClick={runDraft}
              disabled={busy === "draft"}
              title={data.translateAvailable ? t("srvLoc.admin.draftHint") : t("srvLoc.admin.err.TRANSLATE_UNAVAILABLE")}
              aria-describedby={data.translateAvailable ? undefined : "slx-draft-off"}
              data-testid="slx-draft"
            >
              <Ic name="spark" size={15} />
              {busy === "draft" ? t("srvLoc.admin.drafting") : t("srvLoc.admin.draft")}
            </button>
            <button type="button" className="an-btn" onClick={() => setEdits({})} disabled={!pending || Boolean(busy)} data-testid="slx-discard">
              <Ic name="undo" size={15} />
              {t("srvLoc.admin.discard")}
            </button>
            <button type="button" className="an-btn is-primary" onClick={save} disabled={!pending || Boolean(busy)} data-testid="slx-save">
              <Ic name="tick" size={15} />
              {busy === "save" ? t("srvLoc.admin.saving") : t("srvLoc.admin.saveN", { n: pending })}
            </button>
          </div>
          {!data.translateAvailable ? (
            <p id="slx-draft-off" className="an-muted an-small slx-note" data-testid="slx-draft-off">
              <Ic name="info" size={13} />
              {t("srvLoc.admin.err.TRANSLATE_UNAVAILABLE")}
            </p>
          ) : drafts ? (
            <p className="an-muted an-small slx-note">
              <Ic name="info" size={13} />
              {t("srvLoc.admin.reviewDrafts", { n: drafts })}
            </p>
          ) : null}

          <div className="slx-body">
            <div className="slx-grid-wrap" data-testid="slx-grid">
              <table className="slx-grid">
                <thead>
                  <tr>
                    <th className="slx-th-item">{t("srvLoc.admin.item")}</th>
                    {locales.map((l) => (
                      <th key={l} className={l === previewLang ? "is-on" : ""}>
                        <button type="button" onClick={() => setPreviewLang(l)}>
                          {l}
                          <small className="tnum">{coverage[l]?.pct ?? 0}%</small>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((it) => (
                    <tr key={itemKey(it)} data-kind={it.kind} data-ref={it.refId} onClick={() => setSelectedChannelId(it.kind === "message" ? it.channelId : it.kind.startsWith("channel") ? it.refId : null)}>
                      <th className="slx-item">
                        <div className="slx-item-in">
                          <KindIcon it={it} />
                          <span className="slx-item-txt">
                            <small>{itemTitle(it)}</small>
                            <span className="slx-item-orig">{it.original || t("srvLoc.admin.noTopic")}</span>
                          </span>
                        </div>
                      </th>
                      {locales.map((l) => (
                        <Cell
                          key={l}
                          it={it}
                          locale={l}
                          sourceLocale={sourceLocale}
                          channels={data.channels}
                          editing={editing}
                          onEdit={() => setEditing(cellKey(it, l))}
                          onCommit={(text) => commit(it, l, text)}
                          onCancel={() => setEditing(null)}
                          t={t}
                        />
                      ))}
                    </tr>
                  ))}
                  {!visible.length ? (
                    <tr>
                      <td colSpan={locales.length + 1} className="slx-none">
                        {t("srvLoc.admin.noItems")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <LivePreview
              items={merged}
              channels={data.channels}
              locales={locales}
              sourceLocale={sourceLocale}
              lang={previewLang || locales[0]}
              setLang={setPreviewLang}
              selectedChannelId={selectedChannelId}
              setSelectedChannelId={setSelectedChannelId}
              t={t}
            />
          </div>
          <p className="an-muted an-small slx-foot">
            <Ic name="history" size={13} />
            {t("srvLoc.admin.auditNote")}
          </p>
        </>
      ) : !error ? (
        <p className="an-muted">{t("srvLoc.admin.loading")}</p>
      ) : null}

      {notice ? (
        <div className={`slx-toast is-${notice.tone}`} role="status" data-testid="slx-toast">
          <Ic name={notice.tone === "ok" ? "check" : "alert"} size={15} />
          {notice.text}
        </div>
      ) : null}

      <Dialog open={offOpen} onClose={() => setOffOpen(false)} icon="alert" tone="red" title={t("srvLoc.admin.offTitle")} subtitle={t("srvLoc.admin.offBody")} testId="slx-off-dialog">
        <label className="an-field">
          <span className="an-cap">{t("srvLoc.admin.reason")}</span>
          <textarea className="slx-input" rows={3} value={offReason} onChange={(e) => setOffReason(e.target.value)} data-autofocus />
        </label>
        <div className="slx-dlg-actions">
          <button type="button" className="an-btn" onClick={() => setOffOpen(false)}>
            {t("srvLoc.admin.cancel")}
          </button>
          <button type="button" className="an-btn is-danger" disabled={!offReason.trim() || Boolean(busy)} onClick={() => setEnabled(false, offReason.trim())}>
            {t("srvLoc.admin.turnOff")}
          </button>
        </div>
      </Dialog>
    </div>
  );
}
