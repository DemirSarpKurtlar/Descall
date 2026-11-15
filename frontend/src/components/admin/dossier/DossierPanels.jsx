/**
 * Kullanıcı dosyası tabs (Draft A): Genel bakış cards and the lazy tabs
 * (Zaman çizelgesi, Bağlantılı hesaplar, Topluluklar, Etkinlik, Cüzdan ve
 * abonelik, Şikayet ve moderasyon, Notlar). Read-only views; actions open the
 * shared dialogs through `onAction(id)`.
 */
import { useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { Avatar } from "../../ui/Avatar";
import { SkeletonLine } from "../../ui/Skeleton";
import {
  AlertTriangle, Ban, Coins, Crown, ExternalLink, Gamepad2, ShoppingBag, Flag, Globe, History, Link2, Lock, Mic, Monitor, Pencil, Plus, Server, Shield,
  Smartphone, Trash2, User, Users, UsersThree,
} from "../../ui/Icon.jsx";
import {
  GROUP_COLORS,
  TIMELINE_FILTERS,
  barHeights,
  filterTimeline,
  groupOf,
  isStrongLink,
  noteValid,
  pointsLabel,
  riskRows,
  riskTone,
  sessionKind,
  timelineCounts,
} from "./dossierModel.js";
import { agoWhen, dayWhen, num, shortWhen, voiceText } from "./dossierFormat.js";

function Card({ icon: Icon, title, action, onAction, children, className = "", testId }) {
  return (
    <section className={`dsr-card ${className}`} data-testid={testId}>
      <h3>
        {Icon ? <Icon size={16} /> : null}
        <span>{title}</span>
        {action ? (
          <button type="button" className="dsr-card-x" onClick={onAction}>
            {action}
          </button>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

function Loading({ rows = 3 }) {
  return (
    <div className="dsr-loading" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={`${90 - i * 14}%`} height={14} />
      ))}
    </div>
  );
}

function Empty({ text, icon: Icon = History }) {
  return (
    <div className="dsr-empty">
      <Icon size={22} />
      <p>{text}</p>
    </div>
  );
}

function SectionError({ error, onRetry }) {
  const { t } = useLocale();
  if (!error) return null;
  return (
    <div className="dsr-warn is-bad" role="alert">
      <AlertTriangle size={16} />
      <span>{error.message || t("dossier.err_generic")}</span>
      {onRetry ? (
        <button type="button" className="dsr-btn is-sm" onClick={onRetry}>
          {t("dossier.retry")}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Genel bakış */

export function RiskCard({ risk }) {
  const { t } = useLocale();
  const [explain, setExplain] = useState(false);
  const tone = riskTone(risk?.level);
  const rows = riskRows(risk).slice(0, 5);
  const score = Number(risk?.score) || 0;
  return (
    <Card icon={Shield} title={t("dossier.riskTitle")} action={explain ? t("dossier.riskHide") : t("dossier.riskHow")} onAction={() => setExplain((v) => !v)} testId="dsr-risk">
      <div className="dsr-risk">
        <div className={`dsr-ring is-${tone}`} style={{ "--p": `${Math.min(100, score)}%` }} role="img" aria-label={t("dossier.riskAria", { score, level: t(`dossier.risk_${risk?.level || "low"}`) })}>
          <div>
            <b className="tnum">{score}</b>
            <span>{t(`dossier.risk_${risk?.level || "low"}`)}</span>
          </div>
        </div>
        <div className="dsr-reasons">
          {rows.length === 0 ? <div className="is-muted">{t("dossier.riskNone")}</div> : null}
          {rows.map((r, i) => (
            <div key={`${r.id}-${i}`} className={r.points ? "" : "is-muted"}>
              <span>{t(`dossier.rr_${r.id}`, r.vars || {})}</span>
              <em className={`tnum${r.points ? "" : " is-ok"}`}>{pointsLabel(r.points)}</em>
            </div>
          ))}
        </div>
      </div>
      {explain ? <p className="dsr-hint">{t("dossier.riskExplain")}</p> : null}
    </Card>
  );
}

export function SessionsCard({ sessions, onManage }) {
  const { t, locale } = useLocale();
  const list = Array.isArray(sessions) ? [...sessions].sort((a, b) => Number(b.live) - Number(a.live) || String(b.lastActiveAt || "").localeCompare(String(a.lastActiveAt || ""))) : [];
  return (
    <Card icon={Monitor} title={t("dossier.sessionsTitle")} action={onManage ? t("dossier.manageAll") : null} onAction={onManage} testId="dsr-sess-card">
      {list.length === 0 ? <Empty icon={Monitor} text={t("dossier.sessNone")} /> : null}
      <div className="dsr-sess">
        {list.slice(0, 2).map((s) => {
          const kind = sessionKind(s.device);
          const Icon = kind === "desktop" ? Monitor : kind === "phone" ? Smartphone : Globe;
          return (
            <div key={s.id} className="dsr-se">
              <span className="dsr-ses-ic">
                <Icon size={16} />
              </span>
              <div>
                <b>{s.device || t("dossier.unknownDevice")}</b>
                <small>{[s.ip, s.live ? t("dossier.now") : agoWhen(s.lastActiveAt || s.createdAt, locale)].filter(Boolean).join(" · ")}</small>
              </div>
              {s.live ? <span className="dsr-live">{t("dossier.live")}</span> : null}
            </div>
          );
        })}
        {list.length > 2 ? <p className="dsr-hint">{t("dossier.moreSessions", { n: list.length - 2 })}</p> : null}
      </div>
    </Card>
  );
}

export function NotesCard({ notes, onAll, onAdd }) {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = notes.list[0];
  const submit = async () => {
    if (!noteValid(draft) || busy) return;
    setBusy(true);
    const ok = await onAdd(draft);
    setBusy(false);
    if (ok) setDraft("");
  };
  return (
    <Card icon={Pencil} title={t("dossier.notesTitle")} action={notes.list.length ? t("dossier.all") : null} onAction={onAll} testId="dsr-notes-card">
      {notes.ready === false ? <p className="dsr-hint">{t("dossier.err_notesUnavailable")}</p> : null}
      {latest ? (
        <div className="dsr-note">
          <small>
            {latest.authorUsername ? `@${latest.authorUsername}` : t("dossier.someAdmin")} · {shortWhen(latest.at, locale)}
          </small>
          <p>{latest.body}</p>
        </div>
      ) : notes.ready !== false ? (
        <p className="dsr-hint">{t("dossier.notesEmpty")}</p>
      ) : null}
      <form
        className="dsr-note-add"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="dsr-input"
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("dossier.notePh")}
          aria-label={t("dossier.notePh")}
          disabled={notes.ready === false}
        />
        <button type="submit" className="dsr-btn is-icon is-primary" disabled={!noteValid(draft) || busy || notes.ready === false} aria-label={t("dossier.noteAdd")}>
          <Plus size={16} />
        </button>
      </form>
      {notes.error ? <p className="dsr-err">{notes.error}</p> : null}
    </Card>
  );
}

function authLine(identity, t) {
  const p = identity?.authProvider;
  const base = p === "google" ? "Google" : p === "apple" ? "Apple" : t("dossier.authEmail");
  return identity?.twoFactor ? t("dossier.authWith2fa", { method: base }) : base;
}

export function IdentityCard({ dossier, sourceLabel }) {
  const { t, locale } = useLocale();
  const [showEmail, setShowEmail] = useState(false);
  const id = dossier.identity || {};
  const signup = dossier.signup || {};
  const shortId = id.id ? `${String(id.id).slice(0, 6)}…${String(id.id).slice(-4)}` : "—";
  const emailText = id.email ? (showEmail ? id.email : id.emailMasked || id.email) : "—";
  const verified = id.emailVerified === true ? t("dossier.verified") : id.emailVerified === false ? t("dossier.notVerified") : null;
  const langName = (() => {
    if (!id.language) return null;
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(id.language) || id.language;
    } catch {
      return id.language;
    }
  })();
  return (
    <Card icon={User} title={t("dossier.identityTitle")} testId="dsr-identity">
      <dl className="dsr-kv">
        <dt>{t("dossier.userId")}</dt>
        <dd title={id.id || ""} className="tnum">{shortId}</dd>
        <dt>{t("dossier.email")}</dt>
        <dd>
          {id.email ? (
            <button type="button" className="dsr-link" onClick={() => setShowEmail((v) => !v)} aria-label={showEmail ? t("dossier.hideEmail") : t("dossier.showEmail")}>
              {emailText}
            </button>
          ) : (
            "—"
          )}
          {verified ? <span className="dsr-muted"> · {verified}</span> : null}
        </dd>
        <dt>{t("dossier.signInMethod")}</dt>
        <dd>{authLine(id, t)}</dd>
        <dt>{t("dossier.firstSource")}</dt>
        <dd>{[sourceLabel(signup.firstSource), signup.campaign].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>{t("dossier.signupDevice")}</dt>
        <dd>{[signup.device, signup.os, signup.browser].filter(Boolean).join(" · ") || "—"}</dd>
        <dt>{t("dossier.language")}</dt>
        <dd>{langName || "—"}</dd>
        <dt>{t("dossier.birthYear")}</dt>
        <dd className="tnum">{id.birthYear ? `${id.birthYear}${new Date().getFullYear() - id.birthYear >= 18 ? " (18+)" : ""}` : "—"}</dd>
        <dt>{t("dossier.signupAt")}</dt>
        <dd>{dayWhen(signup.at || id.createdAt, locale) || "—"}</dd>
      </dl>
    </Card>
  );
}

export function ActivityCard({ activity, onMore }) {
  const { t, locale } = useLocale();
  const data = activity.data;
  const days = data?.days || [];
  const last = days.slice(-14);
  const heights = barHeights(last.map((d) => d.messages + d.voiceMinutes / 10 + d.screenShares));
  return (
    <Card icon={Mic} title={t("dossier.activityTitle")} action={t("dossier.details")} onAction={onMore} testId="dsr-activity-card">
      {!data && activity.loading ? <Loading rows={2} /> : null}
      <SectionError error={activity.error} />
      {data ? (
        <>
          <div className="dsr-bars" aria-hidden="true">
            {last.map((d, i) => (
              <i key={d.day} style={{ height: `${heights[i]}%` }} className={heights[i] ? "" : "is-zero"} />
            ))}
          </div>
          <div className="dsr-mini">
            <div>
              <b className="tnum">{num(data.totals?.messages, locale)}</b>
              <span>{t("dossier.messages")}</span>
            </div>
            <div>
              <b className="tnum">{voiceText(data.totals?.voiceSeconds, t)}</b>
              <span>{t("dossier.voice")}</span>
            </div>
            <div>
              <b className="tnum">{num(data.totals?.screenShares, locale)}</b>
              <span>{t("dossier.screenShares")}</span>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}

export function WalletCard({ dossier }) {
  const { t, locale } = useLocale();
  const w = dossier.wallet || {};
  const sub = dossier.subscription;
  return (
    <Card icon={Coins} title={t("dossier.walletCard")} testId="dsr-wallet-card">
      <div className="dsr-big">
        <span className="tnum">{num(w.balance, locale)}</span> <small>DesCoin</small>
        {w.frozen ? <span className="dsr-chip c-red">{t("dossier.frozen")}</span> : null}
      </div>
      <div className="dsr-led">
        {(w.ledger || []).slice(0, 2).map((r) => (
          <div key={r.id}>
            <span>{r.reason}</span>
            <span className={`tnum ${r.amount >= 0 ? "pos" : "neg"}`}>
              {r.amount >= 0 ? "+" : ""}
              {num(r.amount, locale)}
            </span>
          </div>
        ))}
        <div>
          <span>{sub ? subscriptionLine(sub, t, locale) : t("dossier.noSubscription")}</span>
          {sub ? <span className={`dsr-chip ${sub.active ? "c-blue" : "c-gray"}`}>{sub.active ? t("dossier.subActive") : t(`dossier.subStatus_${sub.status || "ended"}`)}</span> : null}
        </div>
      </div>
    </Card>
  );
}

export function subscriptionLine(sub, t, locale) {
  const plan = t(`dossier.plan_${sub.plan || "plus"}`);
  if (sub.unlimited) return t("dossier.subUnlimited", { plan });
  if (!sub.endsAt) return plan;
  return sub.active ? t("dossier.subUntil", { plan, when: dayWhen(sub.endsAt, locale) }) : t("dossier.subEnded", { plan, when: dayWhen(sub.endsAt, locale) });
}

/* --------------------------------------------------------- Zaman çizelgesi */

function timelineText(item, t, locale) {
  const m = item.meta || {};
  switch (item.type) {
    case "signup":
      return { title: t("dossier.tl_signup"), sub: [m.source, m.campaign].filter(Boolean).join(" · ") };
    case "first_message":
      return { title: t("dossier.tl_first_message"), sub: "" };
    case "login":
      return { title: t("dossier.tl_login"), sub: [m.device, m.ip].filter(Boolean).join(" · ") };
    case "report":
      return { title: t("dossier.tl_report"), sub: [m.reporter ? `@${m.reporter}` : null, t(`dossier.rep_${m.reason}`) !== `dossier.rep_${m.reason}` ? t(`dossier.rep_${m.reason}`) : m.reason, t(`dossier.st_${m.status}`)].filter(Boolean).join(" · ") };
    case "mod": {
      const key = `dossier.mod_${m.action}`;
      const title = t(key) !== key ? t(key) : m.action || t("dossier.tl_mod");
      return { title, sub: [m.reason, m.actor ? `@${m.actor}` : null, m.revoked ? t("dossier.revoked") : null].filter(Boolean).join(" · ") };
    }
    case "ledger":
      return { title: m.amount >= 0 ? t("dossier.tl_ledger_in") : t("dossier.tl_ledger_out"), sub: [`${m.amount >= 0 ? "+" : ""}${num(m.amount, locale)}`, m.reason, m.by ? `@${m.by}` : null].filter(Boolean).join(" · ") };
    case "purchase":
      return { title: t("dossier.tl_purchase"), sub: [m.item, m.descoin != null ? `${num(m.descoin, locale)} DesCoin` : null].filter(Boolean).join(" · ") };
    case "subscription": {
      const key = `dossier.subEv_${m.kind}`;
      return { title: t(key) !== key ? t(key) : t("dossier.tl_subscription"), sub: [m.plan ? t(`dossier.plan_${m.plan}`) : null, m.endsAt ? t("dossier.until", { when: dayWhen(m.endsAt, locale) }) : null].filter(Boolean).join(" · ") };
    }
    case "server_join":
      return { title: t("dossier.tl_server_join"), sub: m.server || "" };
    case "server_own":
      return { title: t("dossier.tl_server_own"), sub: m.server || "" };
    case "group_join":
      return { title: t("dossier.tl_group_join"), sub: m.group || "" };
    case "note":
      return { title: t("dossier.tl_note"), sub: m.actor ? `@${m.actor}` : "" };
    case "admin": {
      const key = `dossier.adm_${m.action}`;
      return { title: t(key) !== key ? t(key) : t("dossier.tl_admin"), sub: [t(key) !== key ? null : m.action, m.actor ? `@${m.actor}` : null].filter(Boolean).join(" · ") };
    }
    default:
      return { title: item.type, sub: "" };
  }
}

export function TimelineTab({ section, onRetry }) {
  const { t, locale } = useLocale();
  const [filter, setFilter] = useState("all");
  const items = section.data?.items || [];
  const counts = useMemo(() => timelineCounts(items), [items]);
  const shown = useMemo(() => filterTimeline(items, filter), [items, filter]);
  return (
    <div className="dsr-tab-body" data-testid="dsr-timeline">
      <div className="dsr-filters" role="group" aria-label={t("dossier.filter")}>
        {TIMELINE_FILTERS.map((f) => (
          <button key={f} type="button" className={`dsr-fp${filter === f ? " is-on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} disabled={f !== "all" && !counts[f]}>
            {t(`dossier.f_${f}`)}
            {counts[f] ? <em className="tnum">{counts[f]}</em> : null}
          </button>
        ))}
      </div>
      <SectionError error={section.error} onRetry={onRetry} />
      {!section.data && section.loading ? <Loading rows={6} /> : null}
      {section.data && !shown.length ? <Empty text={t("dossier.tlEmpty")} /> : null}
      <ol className="dsr-tl">
        {shown.map((it) => {
          const { title, sub } = timelineText(it, t, locale);
          return (
            <li key={`${it.type}:${it.id}`} className="dsr-ev" style={{ "--c": GROUP_COLORS[groupOf(it)] }}>
              <div>
                <b>{title}</b>
                {sub ? <p>{sub}</p> : null}
              </div>
              <time dateTime={it.at}>{shortWhen(it.at, locale)}</time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------- Bağlantılı hesaplar */

export function LinkedTab({ section, onRetry, onOpenPerson, onAction, canAccessBan }) {
  const { t, locale } = useLocale();
  const accounts = section.data?.accounts || [];
  const bannedSameDevice = accounts.filter((a) => a.banned && isStrongLink(a.kinds));
  return (
    <div className="dsr-tab-body" data-testid="dsr-linked">
      <SectionError error={section.error} onRetry={onRetry} />
      <div className="dsr-warn">
        <AlertTriangle size={16} />
        <span>
          {bannedSameDevice.length ? <b>{t("dossier.linkedEvasion", { user: `@${bannedSameDevice[0].username}` })} </b> : null}
          {t("dossier.linkedCaveat")}
        </span>
      </div>
      {!section.data && section.loading ? <Loading rows={4} /> : null}
      {section.data && !accounts.length ? <Empty icon={Link2} text={t("dossier.linkedNone")} /> : null}
      {accounts.length ? (
        <div className="dsr-lk-table" role="table" aria-label={t("dossier.tab_linked")}>
          <div className="dsr-lk is-head" role="row">
            <span role="columnheader">{t("dossier.account")}</span>
            <span role="columnheader">{t("dossier.match")}</span>
            <span role="columnheader">{t("dossier.status")}</span>
            <span role="columnheader">{t("dossier.lastShared")}</span>
            <span role="columnheader" />
          </div>
          {accounts.map((a) => (
            <div key={a.id} className="dsr-lk" role="row">
              <div className="dsr-lk-u" role="cell">
                <Avatar name={a.displayName || a.username || "?"} size={32} user={{ avatarUrl: a.avatarUrl, username: a.username }} />
                <div>
                  <b>@{a.username}</b>
                  <small>{a.createdAt ? t("dossier.joinedOn", { when: dayWhen(a.createdAt, locale) }) : ""}</small>
                </div>
              </div>
              <div className="dsr-why" role="cell">
                {a.kinds.map((k) => (
                  <span key={k} className={k === "device" || k === "session_device" ? "is-hot" : ""}>
                    {t(`dossier.lk_${k}`)}
                  </span>
                ))}
              </div>
              <span role="cell">
                <span className={`dsr-chip ${a.banned ? "c-red" : "c-green"}`}>{a.banned ? t("dossier.banned") : t("dossier.active")}</span>
              </span>
              <span className="dsr-muted" role="cell">{a.lastSharedAt ? agoWhen(a.lastSharedAt, locale) : "—"}</span>
              <span role="cell">
                <button type="button" className="dsr-btn is-sm" onClick={() => onOpenPerson?.(a.id)}>
                  {t("dossier.openFile")}
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {accounts.length && canAccessBan ? (
        <div className="dsr-row-btns">
          <button type="button" className="dsr-btn" onClick={() => onAction?.("accessBan")}>
            <Lock size={15} />
            {t("dossier.blockDeviceNetwork")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- Topluluklar */

export function CommunitiesTab({ section, onRetry, onOpenServer, canServerReview }) {
  const { t, locale } = useLocale();
  const d = section.data;
  return (
    <div className="dsr-tab-body" data-testid="dsr-communities">
      <SectionError error={section.error} onRetry={onRetry} />
      {!d && section.loading ? <Loading rows={5} /> : null}
      {d ? (
        <>
          <div className="dsr-mini is-4">
            <div>
              <b className="tnum">{num(d.owned.length, locale)}</b>
              <span>{t("dossier.serversOwned")}</span>
            </div>
            <div>
              <b className="tnum">{num(d.joined.length, locale)}</b>
              <span>{t("dossier.serversJoined")}</span>
            </div>
            <div>
              <b className="tnum">{num(d.groups.length, locale)}</b>
              <span>{t("dossier.groups")}</span>
            </div>
            <div>
              <b className="tnum">{num(d.friends, locale)}</b>
              <span>{t("dossier.friends")}</span>
            </div>
          </div>
          <div className="dsr-grid is-2">
            <Card icon={Server} title={t("dossier.serversOwned")}>
              {!d.owned.length ? <p className="dsr-hint">{t("dossier.noneYet")}</p> : null}
              <ul className="dsr-list">
                {d.owned.map((s) => (
                  <li key={s.id}>
                    <div>
                      <b>{s.name || "—"}</b>
                      <small>{[s.members != null ? t("dossier.membersN", { n: num(s.members, locale) }) : null, s.isPublic ? t("dossier.public") : t("dossier.private"), dayWhen(s.createdAt, locale)].filter(Boolean).join(" · ")}</small>
                    </div>
                    {canServerReview ? (
                      <button type="button" className="dsr-btn is-sm" onClick={() => onOpenServer?.(s)}>
                        <ExternalLink size={14} />
                        {t("dossier.review")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
            <Card icon={Users} title={t("dossier.serversJoined")}>
              {!d.joined.length ? <p className="dsr-hint">{t("dossier.noneYet")}</p> : null}
              <ul className="dsr-list">
                {d.joined.slice(0, 30).map((s) => (
                  <li key={s.id}>
                    <div>
                      <b>{s.name || "—"}</b>
                      <small>{[s.nickname, t("dossier.joinedOn", { when: dayWhen(s.joinedAt, locale) })].filter(Boolean).join(" · ")}</small>
                    </div>
                    {canServerReview ? (
                      <button type="button" className="dsr-btn is-sm" onClick={() => onOpenServer?.(s)}>
                        <ExternalLink size={14} />
                        {t("dossier.review")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
            <Card icon={UsersThree} title={t("dossier.groups")}>
              {!d.groups.length ? <p className="dsr-hint">{t("dossier.noneYet")}</p> : null}
              <ul className="dsr-list">
                {d.groups.slice(0, 30).map((g) => (
                  <li key={g.id}>
                    <div>
                      <b>{g.name || "—"}</b>
                      <small>{[g.role, t("dossier.joinedOn", { when: dayWhen(g.joinedAt, locale) })].filter(Boolean).join(" · ")}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card icon={Ban} title={t("dossier.serverBans")}>
              {!d.serverBans.length ? <p className="dsr-hint">{t("dossier.serverBansNone")}</p> : null}
              <ul className="dsr-list">
                {d.serverBans.map((b) => (
                  <li key={`${b.serverId}-${b.at}`}>
                    <div>
                      <b>{b.name || "—"}</b>
                      <small>{[b.reason, dayWhen(b.at, locale)].filter(Boolean).join(" · ")}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Etkinlik */

export function ActivityTab({ section, onRetry }) {
  const { t, locale } = useLocale();
  const d = section.data;
  const days = d?.days || [];
  const msgH = barHeights(days.map((x) => x.messages));
  const voiceH = barHeights(days.map((x) => x.voiceMinutes));
  return (
    <div className="dsr-tab-body" data-testid="dsr-activity">
      <SectionError error={section.error} onRetry={onRetry} />
      {!d && section.loading ? <Loading rows={5} /> : null}
      {d ? (
        <>
          <div className="dsr-mini is-4">
            <div>
              <b className="tnum">{num(d.totals.messages, locale)}</b>
              <span>{t("dossier.messages30")}</span>
            </div>
            <div>
              <b className="tnum">{voiceText(d.totals.voiceSeconds, t)}</b>
              <span>{t("dossier.voice30")}</span>
            </div>
            <div>
              <b className="tnum">{num(d.totals.screenShares, locale)}</b>
              <span>{t("dossier.screenShares")}</span>
            </div>
            <div>
              <b className="tnum">{num(d.totals.activeDays, locale)}</b>
              <span>{t("dossier.activeDays")}</span>
            </div>
          </div>
          <Card icon={History} title={t("dossier.messagesPerDay")}>
            <div className="dsr-bars is-tall" role="img" aria-label={t("dossier.messagesPerDay")}>
              {days.map((x, i) => (
                <i key={x.day} style={{ height: `${msgH[i]}%` }} className={msgH[i] ? "" : "is-zero"} title={`${dayWhen(x.day, locale)} · ${num(x.messages, locale)}`} />
              ))}
            </div>
            <p className="dsr-hint">{t("dossier.splitLine", { dm: num(d.split?.dm, locale), group: num(d.split?.group, locale), server: num(d.split?.server, locale) })}</p>
          </Card>
          <Card icon={Mic} title={t("dossier.voicePerDay")}>
            <div className="dsr-bars is-tall is-green" role="img" aria-label={t("dossier.voicePerDay")}>
              {days.map((x, i) => (
                <i key={x.day} style={{ height: `${voiceH[i]}%` }} className={voiceH[i] ? "" : "is-zero"} title={`${dayWhen(x.day, locale)} · ${t("dossier.minutesShort", { n: x.voiceMinutes })}`} />
              ))}
            </div>
          </Card>
          <p className="dsr-hint">{d.truncated ? t("dossier.activityTruncated") : t("dossier.activityPrivacy")}</p>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------- Cüzdan ve abonelik */

export function WalletTab({ section, onRetry, onAction, can }) {
  const { t, locale } = useLocale();
  const d = section.data;
  return (
    <div className="dsr-tab-body" data-testid="dsr-wallet-tab">
      <SectionError error={section.error} onRetry={onRetry} />
      {!d && section.loading ? <Loading rows={5} /> : null}
      {d ? (
        <div className="dsr-grid is-2">
          <Card icon={Coins} title={t("dossier.walletTitle")} action={can("casino") || can("people") ? t("dossier.manage") : null} onAction={() => onAction(can("casino") ? "wallet" : "freeze")}>
            <div className="dsr-big">
              <span className="tnum">{num(d.balance, locale)}</span> <small>DesCoin</small>
              {d.frozen ? <span className="dsr-chip c-red">{t("dossier.frozen")}</span> : null}
            </div>
            <div className="dsr-led is-scroll">
              {!d.ledger.length ? <p className="dsr-hint">{t("dossier.noLedger")}</p> : null}
              {d.ledger.map((r) => (
                <div key={r.id}>
                  <span>
                    {[r.reason, r.by ? `@${r.by}` : null, r.note, shortWhen(r.at, locale)].filter(Boolean).join(" · ")}
                  </span>
                  <span className={`tnum ${r.amount >= 0 ? "pos" : "neg"}`}>
                    {r.amount >= 0 ? "+" : ""}
                    {num(r.amount, locale)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
          <Card icon={Crown} title={t("dossier.subscription")} action={can("premium") ? t("dossier.premiumGift") : null} onAction={() => onAction("premium")}>
            <div className="dsr-led">
              <div>
                <span>{d.subscription ? subscriptionLine(d.subscription, t, locale) : d.subscriptionReady === false ? t("dossier.subUnavailable") : t("dossier.noSubscription")}</span>
                {d.subscription ? <span className={`dsr-chip ${d.subscription.active ? "c-blue" : "c-gray"}`}>{d.subscription.active ? t("dossier.subActive") : t(`dossier.subStatus_${d.subscription.status || "ended"}`)}</span> : null}
              </div>
              {d.subscriptionEvents.map((e) => {
                const key = `dossier.subEv_${e.kind}`;
                return (
                  <div key={e.id}>
                    <span>{[t(key) !== key ? t(key) : e.kind, e.plan && (e.kind === "change_plan" || e.plan !== "plus") ? t(`dossier.plan_${e.plan}`) : null].filter(Boolean).join(" · ")}</span>
                    <span className="dsr-muted">{dayWhen(e.at, locale)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card icon={ShoppingBag} title={t("dossier.purchases")} action={can("casino") ? t("dossier.giftProduct") : null} onAction={() => onAction("gift")}>
            {!d.purchases.length ? <p className="dsr-hint">{t("dossier.noPurchases")}</p> : null}
            <div className="dsr-led">
              {d.purchases.map((p) => (
                <div key={p.id}>
                  <span>{[p.item || "—", dayWhen(p.at, locale)].join(" · ")}</span>
                  <span className="tnum neg">{p.descoin != null ? `-${num(p.descoin, locale)}` : p.status || ""}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card icon={Gamepad2} title={t("dossier.gameCredits")} action={can("casino") ? t("dossier.adjust") : null} onAction={() => onAction("credits")}>
            <div className="dsr-big">
              <span className="tnum">{d.gameCredits == null ? "—" : num(d.gameCredits, locale)}</span> <small>{t("dossier.credits")}</small>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- Şikayet ve moderasyon */

export function ModerationTab({ dossier, highlightReportId, onAction, onDismiss, can }) {
  const { t, locale } = useLocale();
  const reports = dossier.reports || { against: [], filed: [] };
  const mod = dossier.moderation || {};
  const [busyId, setBusyId] = useState("");
  return (
    <div className="dsr-tab-body" data-testid="dsr-moderation">
      {mod.banned || mod.timeout ? (
        <div className="dsr-state-row">
          {mod.banned ? (
            <div className="dsr-warn is-bad">
              <Ban size={16} />
              <span>
                {t("dossier.currentlyBanned")}
                {mod.ban?.expiresAt ? ` · ${t("dossier.until", { when: shortWhen(mod.ban.expiresAt, locale) })}` : ` · ${t("dossier.permanent")}`}
                {mod.ban?.reason ? ` · ${mod.ban.reason}` : ""}
              </span>
              {can("moderation") ? (
                <button type="button" className="dsr-btn is-sm" onClick={() => onAction("unban")}>
                  {t("dossier.unban")}
                </button>
              ) : null}
            </div>
          ) : null}
          {mod.timeout ? (
            <div className="dsr-warn">
              <Shield size={16} />
              <span>
                {t("dossier.currentlyTimedOut")} · {t("dossier.until", { when: shortWhen(mod.timeout.until, locale) })}
                {mod.timeout.reason ? ` · ${mod.timeout.reason}` : ""}
              </span>
              {can("moderation") ? (
                <button type="button" className="dsr-btn is-sm" onClick={() => onAction("untimeout")}>
                  {t("dossier.untimeout")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="dsr-grid is-2">
        <Card icon={Flag} title={t("dossier.reportsAgainst", { n: reports.openCount || 0 })}>
          {!reports.against?.length ? <p className="dsr-hint">{t("dossier.noReports")}</p> : null}
          <ul className="dsr-list is-reports">
            {(reports.against || []).map((r) => (
              <li key={r.id} className={highlightReportId === r.id ? "is-hot" : ""}>
                <div>
                  <b>
                    {r.reporterUsername ? `@${r.reporterUsername}` : t("dossier.someone")} · {t(`dossier.rep_${r.reason}`) !== `dossier.rep_${r.reason}` ? t(`dossier.rep_${r.reason}`) : r.reasonLabel || r.reason}
                  </b>
                  {r.snippet ? <q>{r.snippet}</q> : null}
                  <small>
                    <span className={`dsr-chip ${r.status === "open" ? "c-gold" : "c-gray"}`}>{t(`dossier.st_${r.status}`)}</span> {shortWhen(r.createdAt, locale)}
                  </small>
                </div>
                {r.status === "open" && can("reports") ? (
                  <button
                    type="button"
                    className="dsr-btn is-sm"
                    disabled={busyId === r.id}
                    onClick={async () => {
                      setBusyId(r.id);
                      await onDismiss(r);
                      setBusyId("");
                    }}
                  >
                    {t("dossier.dismiss")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card icon={History} title={t("dossier.modHistory")}>
          {!mod.history?.length ? <p className="dsr-hint">{t("dossier.noModHistory")}</p> : null}
          <ul className="dsr-list">
            {(mod.history || []).map((h) => {
              const key = `dossier.mod_${h.action_type}`;
              return (
                <li key={h.id}>
                  <div>
                    <b>{t(key) !== key ? t(key) : h.action_type}</b>
                    <small>{[h.categoryLabel ? t(h.categoryLabel) : h.category, h.actorUsername ? `@${h.actorUsername}` : null, shortWhen(h.created_at, locale)].filter(Boolean).join(" · ")}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card icon={Flag} title={t("dossier.reportsFiled", { n: reports.filed?.length || 0 })}>
          {!reports.filed?.length ? <p className="dsr-hint">{t("dossier.noReportsFiled")}</p> : null}
          <ul className="dsr-list">
            {(reports.filed || []).slice(0, 15).map((r) => (
              <li key={r.id}>
                <div>
                  <b>
                    {r.targetUsername ? `@${r.targetUsername}` : "—"} · {t(`dossier.rep_${r.reason}`) !== `dossier.rep_${r.reason}` ? t(`dossier.rep_${r.reason}`) : r.reasonLabel || r.reason}
                  </b>
                  <small>{[t(`dossier.st_${r.status}`), shortWhen(r.createdAt, locale)].join(" · ")}</small>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Notlar */

export function NotesTab({ notes, me, onAdd, onDelete }) {
  const { t, locale } = useLocale();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!noteValid(draft) || busy) return;
    setBusy(true);
    const ok = await onAdd(draft);
    setBusy(false);
    if (ok) setDraft("");
  };
  return (
    <div className="dsr-tab-body" data-testid="dsr-notes">
      <form
        className="dsr-note-compose"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="dsr-input dsr-ta"
          rows={3}
          maxLength={2000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("dossier.notePh")}
          aria-label={t("dossier.notePh")}
          disabled={notes.ready === false}
        />
        <div className="dsr-note-compose-row">
          <span className="dsr-hint tnum">{draft.trim().length}/2000</span>
          <button type="submit" className="dsr-btn is-primary" disabled={!noteValid(draft) || busy || notes.ready === false}>
            <Plus size={15} />
            {t("dossier.noteAdd")}
          </button>
        </div>
      </form>
      {notes.error ? <p className="dsr-err">{notes.error}</p> : null}
      {notes.ready === false ? <div className="dsr-warn"><AlertTriangle size={16} /><span>{t("dossier.err_notesUnavailable")}</span></div> : null}
      {notes.ready !== false && !notes.list.length ? <Empty icon={Pencil} text={t("dossier.notesEmpty")} /> : null}
      <div className="dsr-notes">
        {notes.list.map((n) => (
          <article key={n.id} className="dsr-note">
            <small>
              {n.authorUsername ? `@${n.authorUsername}` : t("dossier.someAdmin")} · {shortWhen(n.at, locale)}
              {me && String(n.authorId) === String(me) ? (
                <button type="button" className="dsr-icon-btn" onClick={() => onDelete(n)} aria-label={t("dossier.noteDelete")}>
                  <Trash2 size={14} />
                </button>
              ) : null}
            </small>
            <p>{n.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
