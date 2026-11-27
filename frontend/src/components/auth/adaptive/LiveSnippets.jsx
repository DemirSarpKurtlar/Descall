/**
 * "Canlı kesitler" around the sign-up card (growth 1B): the live ribbon on top, the server
 * snippet cards either side (desktop) and the "N people here" pills. Real data only
 * (GET /api/public-pages/live: shown public pages and platform aggregates, no names, no
 * messages). Empty or unreachable: the parts simply do not render.
 */
import { useMemo } from "react";
import { useLocale, useT } from "../../../context/localeContextInstance";
import { Mic, Users, Shield, Calendar } from "../../ui/Icon.jsx";

export function fmtNumber(n, locale) {
  try {
    return new Intl.NumberFormat(locale || "en").format(Number(n) || 0);
  } catch {
    return String(Number(n) || 0);
  }
}

function hueOf(s) {
  let h = 0;
  for (const c of String(s || "")) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

export function initials(name, locale) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  const pick = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2);
  try {
    return pick.toLocaleUpperCase(locale || undefined);
  } catch {
    return pick.toUpperCase();
  }
}

export function eventTime(iso, locale, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === now.toDateString();
  try {
    return new Intl.DateTimeFormat(locale || "en", sameDay ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

function countryNames(codes, locale) {
  let dn = null;
  try {
    dn = new Intl.DisplayNames([locale || "en"], { type: "region" });
  } catch {
    dn = null;
  }
  return (codes || []).map((c) => {
    try {
      return dn ? dn.of(c) : c;
    } catch {
      return c;
    }
  });
}

/** Ribbon items from the live data (at least two, else none). */
export function ribbonItems(data, t, locale) {
  if (!data) return [];
  const out = [];
  const n = (v) => fmtNumber(v, locale);
  const online = data.platform?.online;
  if (Number(online) > 0) out.push({ key: "online", html: [t("{count} people online", { count: n(online) })] });
  for (const s of data.servers || []) {
    if (s.voice?.count > 0) out.push({ key: `v-${s.slug}`, name: s.name, text: t("{count} in voice", { count: n(s.voice.count) }) });
    else if (Number(s.online) > 0) out.push({ key: `o-${s.slug}`, name: s.name, text: t("{count} online", { count: n(s.online) }) });
    if (s.event?.title) out.push({ key: `e-${s.slug}`, name: s.name, text: `${s.event.title} ${eventTime(s.event.startsAt, locale)}` });
  }
  const joined = data.platform?.joinedToday;
  if (Number(joined) > 0) out.push({ key: "joined", html: [t("{count} joined today", { count: n(joined) })] });
  return out.length >= 2 ? out : [];
}

export function LiveRibbon({ data }) {
  const t = useT();
  const { locale } = useLocale();
  const items = useMemo(() => ribbonItems(data, t, locale), [data, t, locale]);
  if (!items.length) return null;
  const row = (suffix) =>
    items.map((it) => (
      <span key={`${it.key}${suffix}`} aria-hidden={suffix ? "true" : undefined}>
        <i className="asu-dot" />
        {it.name ? (
          <>
            <b>{it.name}</b> · {it.text}
          </>
        ) : (
          it.html
        )}
      </span>
    ));
  return (
    <div className="asu-ribbon" role="marquee" aria-label={t("Live on Descall")}>
      <span className="asu-ribbon-tag">
        <i className="asu-dot is-pulse" />
        {t("Live")}
      </span>
      <div className="asu-ribbon-track">
        {row("")}
        {row("-2")}
      </div>
    </div>
  );
}

function ServerIcon({ s, locale }) {
  return (
    <span className="asu-sv" style={{ "--h": hueOf(s.slug) }} aria-hidden="true">
      {s.iconUrl ? <img src={s.iconUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : initials(s.name, locale)}
    </span>
  );
}

function ServerSnippet({ s }) {
  const t = useT();
  const { locale } = useLocale();
  const n = (v) => fmtNumber(v, locale);
  const meta = s.members != null ? (s.online > 0 ? t("{members} members · {online} online", { members: n(s.members), online: n(s.online) }) : t("{members} members", { members: n(s.members) })) : "";
  return (
    <a className="asu-snip" href={s.url} target="_blank" rel="noopener noreferrer" aria-label={t("Open {name}", { name: s.name })}>
      <div className="asu-snip-hd">
        <ServerIcon s={s} locale={locale} />
        <div>
          <b>{s.name}</b>
          {meta ? <span>{meta}</span> : null}
        </div>
      </div>
      {s.voice ? (
        <div className="asu-vc">
          <div className="asu-vc-ch">
            <Mic size={13} aria-hidden="true" />
            <span>{s.voice.name}</span>
            <em>{t("{count} people", { count: n(s.voice.count) })}</em>
          </div>
        </div>
      ) : null}
      {s.event ? (
        <div className="asu-vc">
          <div className="asu-vc-ch">
            <Calendar size={13} aria-hidden="true" />
            <span>{s.event.title}</span>
            <em>{eventTime(s.event.startsAt, locale)}</em>
          </div>
        </div>
      ) : null}
      {!s.voice && !s.event && s.pin ? <p className="asu-pin">{s.pin}</p> : null}
    </a>
  );
}

function JoinedToday({ platform }) {
  const t = useT();
  const { locale } = useLocale();
  const names = countryNames(platform?.countries, locale);
  return (
    <div className="asu-snip">
      <div className="asu-snip-hd">
        <span className="asu-sv" style={{ "--h": 150 }} aria-hidden="true">
          <Users size={17} />
        </span>
        <div>
          <b>{t("{count} joined today", { count: fmtNumber(platform.joinedToday, locale) })}</b>
          {names.length ? <span>{names.join(", ")}</span> : null}
        </div>
      </div>
    </div>
  );
}

/** Left / right columns (desktop only, CSS hides them below 1180 px). Plain function, no hooks. */
export function liveSides(data, t) {
  const servers = data?.servers || [];
  const joined = Number(data?.platform?.joinedToday) > 0;
  if (!servers.length && !joined) return [null, null];
  const left = servers.filter((_, i) => i % 2 === 0).slice(0, 3);
  const right = servers.filter((_, i) => i % 2 === 1).slice(0, 2);
  const leftCol = left.length ? (
    <aside className="asu-side" aria-label={t("Live on Descall")}>
      {left.map((s) => (
        <ServerSnippet key={s.slug} s={s} />
      ))}
    </aside>
  ) : (
    <div className="asu-side" aria-hidden="true" />
  );
  const rightCol = (
    <aside className="asu-side" aria-label={t("Live on Descall")}>
      {right[0] ? <ServerSnippet s={right[0]} /> : null}
      {joined ? <JoinedToday platform={data.platform} /> : null}
      {right[1] ? <ServerSnippet s={right[1]} /> : null}
      <p className="asu-sidenote">
        <Shield size={13} aria-hidden="true" />
        <span>{t("These snippets come only from public servers and appear after the card has loaded.")}</span>
      </p>
    </aside>
  );
  return [leftCol, rightCol];
}

export function HerePill({ data, short = false }) {
  const t = useT();
  const { locale } = useLocale();
  const online = Number(data?.platform?.online) || 0;
  if (online <= 0) return null;
  const count = fmtNumber(online, locale);
  return (
    <span className={short ? "asu-livepill" : "asu-herepill"} role="status">
      <i className="asu-dot is-pulse" aria-hidden="true" />
      {short ? t("{count} here", { count }) : t("{count} people are here right now", { count })}
    </span>
  );
}
