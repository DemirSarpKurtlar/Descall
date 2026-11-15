/**
 * Detail drawer (right side panel; tabs Özet / Değişiklik / İstek / İlgili
 * kayıtlar / Ham JSON): the sentence, local + relative + UTC time, the target
 * card with "Kullanıcı dosyası", before / after, request facts (masked IP,
 * device, endpoint, step-up, request id), merged copies, agent tools, notes,
 * related entries, and the undo / "Yeniden yasakla" button.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../api/adminHttp";
import { Ban, ChevronRight, Code, Copy, Undo2, User, X } from "../../ui/Icon.jsx";
import { formatDate } from "../../../i18n/format.js";
import { ActionIcon, ActionChip, Av, useFocusTrap } from "./AuditUi.jsx";
import { clock, deviceOf, diffRows, fullLocal, handle, targetOf, utcStamp } from "./auditModel.js";
import { relText, sentenceText } from "./auditText.js";

const TABS = ["summary", "change", "request", "related", "raw"];

function Cell({ v, t, locale, catLabel }) {
  if (!v) return "—";
  if (v.key) return t(v.key, { n: v.n ?? 0 });
  if (v.date) return formatDate(v.date, locale, { dateStyle: "medium", timeStyle: "short" });
  if (v.category) return catLabel(v.category);
  if (v.sections) return v.sections.map((s) => t(`auditLog.sec.${s}`)).join(", ") || "—";
  return v.text ?? "—";
}

export default function AuditDrawer({ entryId, preview, onClose, users: listUsers, servers: listServers, now, t, locale, catLabel, can, onUndo, onReban, onDossier, onFilterTarget, onCopyLink, onCopyJson, notify, reloadKey }) {
  const open = Boolean(entryId);
  const [tab, setTab] = useState("summary");
  const [state, setState] = useState({ loading: false, data: null, err: "" });
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const ref = useRef(null);
  useFocusTrap(open, ref, onClose, { initial: "[data-autofocus]" });

  const load = useCallback(() => {
    if (!entryId) return;
    setState((s) => ({ loading: true, data: s.data && s.data.entry?.id === entryId ? s.data : null, err: "" }));
    adminFetch(`/audit/entry/${encodeURIComponent(entryId)}`)
      .then((d) => setState({ loading: false, data: d, err: "" }))
      .catch((e) => setState({ loading: false, data: null, err: e?.message || t("auditLog.drawer.failed") }));
  }, [entryId, t]);

  useEffect(() => {
    if (!entryId) return;
    setTab("summary");
    setNote("");
    load();
  }, [entryId, load, reloadKey]);

  if (!open || typeof document === "undefined") return null;
  const d = state.data;
  const entry = d?.entry || preview || null;
  const users = { ...(listUsers || {}), ...(d?.users || {}) };
  const servers = { ...(listServers || {}), ...(d?.servers || {}) };
  const sentence = entry ? sentenceText(entry, users, servers, t, locale) : "";
  const tgt = entry ? targetOf(entry, users, servers) : { kind: "none" };
  const tUser = tgt.userId ? users[tgt.userId] : null;
  const diff = entry ? diffRows(entry) : [];
  const req = d?.request || entry?.request || null;
  const copies = entry ? [{ id: entry.id, source: entry.source, at: entry.at }, ...(entry.merged || []), ...(entry.twins || [])] : [];
  const undo = d?.undo || null;
  const isUnban = entry?.action === "unban" || entry?.action === "appeal_accept";

  const addNote = async () => {
    const body = note.trim();
    if (!body || !entry) return;
    setNoteBusy(true);
    try {
      const r = await adminFetch(`/audit/entry/${encodeURIComponent(entry.id)}/notes`, { method: "POST", body: JSON.stringify({ body }) });
      setState((s) => (s.data ? { ...s, data: { ...s.data, notes: [...(s.data.notes || []), r.note] } } : s));
      setNote("");
      notify(t("auditLog.drawer.noteAdded"));
    } catch (e) {
      notify(e?.code === "NOTES_UNAVAILABLE" ? t("auditLog.err.NOTES_UNAVAILABLE") : e?.message || t("auditLog.err.generic"), "error");
    } finally {
      setNoteBusy(false);
    }
  };

  const section = (id) => tab === "summary" || tab === id;

  return createPortal(
    <div className="alg-drawer-wrap">
      <div className="alg-dim" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={ref} className="alg-drawer" role="dialog" aria-modal="true" aria-label={t("auditLog.drawer.label")} tabIndex={-1} data-testid="audit-drawer">
        <header className="alg-dh">
          {entry ? <ActionIcon action={entry.action} category={entry.category} /> : <span className="alg-aic is-gray" />}
          <div className="alg-dh-t">
            <h2>{sentence || t("auditLog.loading")}</h2>
            {entry ? (
              <p>
                {fullLocal(entry.at, locale)} <span className="alg-dot-sep">·</span> {relText(entry.at, now, t)} <span className="alg-dot-sep">·</span> {t("auditLog.drawer.utc", { time: utcStamp(entry.at) })}
              </p>
            ) : null}
          </div>
          <button type="button" className="alg-mbtn" onClick={onClose} aria-label={t("auditLog.close")} data-autofocus>
            <X size={20} />
          </button>
        </header>
        <div className="alg-dtabs" role="tablist" aria-label={t("auditLog.drawer.label")}>
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`alg-tab${tab === id ? " is-on" : ""}`} onClick={() => setTab(id)}>
              {t(`auditLog.drawer.tabs.${id}`)}
              {id === "related" && d ? <em className="tnum">{d.relatedCount}</em> : null}
            </button>
          ))}
        </div>
        <div className="alg-dbody">
          {state.err ? <p className="alg-err">{state.err}</p> : null}
          {!entry && state.loading ? <p className="alg-muted">{t("auditLog.loading")}</p> : null}
          {entry && tab !== "raw" ? (
            <>
              {section("summary") && tgt.kind === "user" ? (
                <div className="alg-tgt">
                  <Av user={tUser} name={tgt.label} size="l" />
                  <div>
                    <b>
                      {tUser?.displayName || tgt.label}
                      {tUser?.isBanned ? <span className="alg-chip is-red">{t("auditLog.drawer.banned")}</span> : null}
                      {tUser?.isAdmin ? <span className="alg-chip is-blue">{t("auditLog.drawer.admin")}</span> : null}
                    </b>
                    <small>{tgt.label}</small>
                  </div>
                  {can("people") && tgt.userId ? (
                    <button type="button" className="alg-btn" onClick={() => onDossier(tgt.userId)}>
                      <User size={18} />
                      {t("auditLog.drawer.dossier")}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {section("summary") && entry.action === "agent_run" ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.tools")}</div>
                  <div className="alg-chain">
                    {(entry.tools || []).map((tool, i) => (
                      <span key={tool.id} className="alg-chain-i">
                        {i ? <ChevronRight size={14} className="alg-chain-ar" /> : null}
                        <span className={`alg-tl${tool.status >= 400 ? " is-bad" : ""}`} title={tool.path || undefined}>
                          {tool.tool || "?"}
                          <b>{t("auditLog.drawer.toolStatus", { status: tool.status ?? "—" })}</b>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {section("summary") ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.facts")}</div>
                  <dl className="alg-kv">
                    <dt>{t("auditLog.table.action")}</dt>
                    <dd>
                      <ActionChip action={entry.action} category={entry.category} t={t} compact /> <span className="alg-muted alg-mono">{entry.action}</span>
                    </dd>
                    <dt>{t("auditLog.table.actor")}</dt>
                    <dd>{handle(entry.actorUsername || "?")}</dd>
                    <dt>{t("auditLog.filters.cat")}</dt>
                    <dd>{t(`auditLog.cat.${entry.category || "other"}`)} · {t(`auditLog.sev.${entry.severity || "low"}`)}</dd>
                    {Object.entries(entry.meta || {})
                      .filter(([k, v]) => k !== "_req" && v != null && v !== "" && typeof v !== "object")
                      .slice(0, 10)
                      .map(([k, v]) => (
                        <FactRow key={k} k={k} v={v} />
                      ))}
                  </dl>
                </div>
              ) : null}

              {section("change") ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.beforeAfter")}</div>
                  {diff.length ? (
                    <div className="alg-diff">
                      <div className="alg-dr is-h">
                        <span>{t("auditLog.drawer.field")}</span>
                        <span>{t("auditLog.drawer.before")}</span>
                        <span />
                        <span>{t("auditLog.drawer.after")}</span>
                      </div>
                      {diff.map((r) => (
                        <div key={r.field} className="alg-dr">
                          <span className="alg-muted">{r.raw ? r.field : t(`auditLog.diff.${r.field}`)}</span>
                          <span className={r.same ? "is-same" : "is-old"}>
                            <Cell v={r.before} t={t} locale={locale} catLabel={catLabel} />
                          </span>
                          <span className="alg-muted" aria-hidden="true">
                            {r.same ? "=" : <ChevronRight size={14} />}
                          </span>
                          <span className={r.same ? "is-same" : "is-new"}>
                            <Cell v={r.after} t={t} locale={locale} catLabel={catLabel} />
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="alg-muted alg-small">{t("auditLog.drawer.noDiff")}</p>
                  )}
                </div>
              ) : null}

              {section("request") ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.request")}</div>
                  {req ? (
                    <dl className="alg-kv">
                      <dt>{t("auditLog.drawer.ip")}</dt>
                      <dd>{req.ipMasked || "—"}</dd>
                      <dt>{t("auditLog.drawer.device")}</dt>
                      <dd>{deviceOf(req.userAgent) || "—"}</dd>
                      <dt>{t("auditLog.drawer.endpoint")}</dt>
                      <dd className="alg-mono">{req.endpoint || "—"}</dd>
                      <dt>{t("auditLog.drawer.verify")}</dt>
                      <dd>{req.stepUp ? t("auditLog.drawer.stepUp") : t("auditLog.drawer.noStepUp")}</dd>
                      <dt>{t("auditLog.drawer.requestId")}</dt>
                      <dd className="alg-mono">{req.requestId || "—"}</dd>
                    </dl>
                  ) : (
                    <p className="alg-muted alg-small">{t("auditLog.drawer.noRequest")}</p>
                  )}
                </div>
              ) : null}

              {section("summary") && copies.length > 1 ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.mergedTitle")}</div>
                  <div className="alg-merged">
                    {copies.map((c) => (
                      <div key={`${c.source}-${c.id}`}>
                        <span>
                          {t(`auditLog.drawer.src.${c.source === "moderation_actions" ? "moderation_actions" : c.source === "memory" ? "memory" : "admin_audit"}`)} <span className="alg-mono alg-muted">{c.source || "admin_audit"}</span>
                        </span>
                        <span className="alg-mono">{clock(c.at, locale)}.{String(Date.parse(c.at) % 1000).padStart(3, "0")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {section("related") ? (
                <div>
                  {d?.linked?.length ? (
                    <>
                      <div className="alg-lab">{t("auditLog.drawer.linked")}</div>
                      <div className="alg-rel">
                        {d.linked.map((x) => (
                          <RelRow key={x.id} x={x} users={users} servers={servers} t={t} locale={locale} now={now} />
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="alg-lab alg-lab-row">
                    {t("auditLog.drawer.related")}
                    {entry.target != null && entry.action !== "agent_run" ? (
                      <button type="button" className="alg-link" onClick={() => onFilterTarget(entry)}>
                        {t("auditLog.drawer.relatedAll")}
                      </button>
                    ) : null}
                  </div>
                  {d?.related?.length ? (
                    <div className="alg-rel">
                      {d.related.slice(0, tab === "related" ? 40 : 5).map((x) => (
                        <RelRow key={x.id} x={x} users={users} servers={servers} t={t} locale={locale} now={now} />
                      ))}
                    </div>
                  ) : (
                    <p className="alg-muted alg-small">{state.loading ? t("auditLog.loading") : t("auditLog.drawer.noRelated")}</p>
                  )}
                </div>
              ) : null}

              {section("summary") ? (
                <div>
                  <div className="alg-lab">{t("auditLog.drawer.notes")}</div>
                  {d?.notes?.length ? (
                    <ul className="alg-notes">
                      {d.notes.map((nt) => (
                        <li key={nt.id}>
                          <b>{handle(nt.author_username || "?")}</b> <span className="alg-muted">{formatDate(nt.created_at, locale, { dateStyle: "short", timeStyle: "short" })}</span>
                          <p>{nt.body}</p>
                        </li>
                      ))}
                    </ul>
                  ) : d && d.notesReady ? (
                    <p className="alg-muted alg-small">{t("auditLog.drawer.noNotes")}</p>
                  ) : null}
                  {d && !d.notesReady ? (
                    <p className="alg-muted alg-small">{t("auditLog.drawer.notesNotReady")}</p>
                  ) : (
                    <div className="alg-note-new">
                      <textarea className="alg-inp" rows={2} maxLength={1000} value={note} placeholder={t("auditLog.drawer.notePh")} aria-label={t("auditLog.drawer.notes")} onChange={(e) => setNote(e.target.value)} />
                      <button type="button" className="alg-btn" disabled={!note.trim() || noteBusy} onClick={addNote}>
                        {t("auditLog.drawer.addNote")}
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
          {entry && tab === "raw" ? <pre className="alg-raw">{JSON.stringify(entry, null, 2)}</pre> : null}
        </div>
        {entry ? (
          <footer className="alg-dfoot">
            <button type="button" className="alg-btn" onClick={() => onCopyLink(entry)}>
              <Copy size={18} />
              {t("auditLog.drawer.copyLink")}
            </button>
            <button type="button" className="alg-btn" onClick={() => onCopyJson(entry)}>
              <Code size={18} />
              {t("auditLog.drawer.json")}
            </button>
            {undo?.available ? (
              <button type="button" className="alg-btn is-amber alg-ml" onClick={() => onUndo(entry, users)} data-testid="audit-drawer-undo">
                <Undo2 size={18} />
                {t(`auditLog.undo.buttons.${undoFam(entry.action)}`)}
              </button>
            ) : isUnban && tgt.userId && can("moderation") ? (
              <button type="button" className="alg-btn is-red alg-ml" onClick={() => onReban(entry, users)} data-testid="audit-drawer-reban">
                <Ban size={18} />
                {t("auditLog.menu.reban")}
              </button>
            ) : undo && undo.code && undo.code !== "NOT_UNDOABLE" ? (
              <span className="alg-dfoot-note alg-ml">
                {undo.undoneBy ? t("auditLog.drawer.undoneBy", { user: handle(undo.undoneBy.actorUsername || "?"), when: relText(undo.undoneBy.at, now, t) }) : t(`auditLog.drawer.undoBlocked.${undo.code}`)}
              </span>
            ) : null}
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}

function undoFam(action) {
  return { ban: "ban", timeout: "timeout", wallet_freeze: "wallet", access_ban: "access", premium_grant: "premium", special_badge_grant: "badge", server_directory_hide: "directory" }[action] || "ban";
}

function FactRow({ k, v }) {
  return (
    <>
      <dt className="alg-mono">{k}</dt>
      <dd>{String(v).length > 120 ? `${String(v).slice(0, 119)}…` : String(v)}</dd>
    </>
  );
}

function RelRow({ x, users, servers, t, locale, now }) {
  return (
    <div className="alg-rel-r">
      <ActionChip action={x.action} category={x.category} t={t} compact />
      <span className="alg-t">{sentenceText(x, users, servers, t, locale)}</span>
      <span className="alg-muted tnum">{relText(x.at, now, t)}</span>
    </div>
  );
}
