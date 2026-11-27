/*
 * Settings > Siri ve Kisayollar, widgets draft B ("Yuzler"): three panels on one page.
 *   Siri          a live Siri answer preview built from the user's own data (tap a question),
 *                 the favourites' shortcuts (message: ready on its own; call: add in Shortcuts)
 *                 and the general ones, then every phrase.
 *   Favori yuzler the 8 numbered faces the widgets show (tap to pick, hold and drag to order),
 *                 a live preview of the medium widget on a dark or light wallpaper, the widget
 *                 preferences, undo.
 *   Kilit ekrani  a lock screen with the user's own accessories (first favourite, latest
 *                 message or the current speaker) and the "Widget ekle" gallery, with which
 *                 widgets are already placed on this phone and how to add one.
 * Data: /api/native/summary?activity=1&previews=1 and /api/native/friends?activity=1 (the same
 * answers the widgets get). Favourites: lib/nativeWidgets.js (synced to the shell by
 * hooks/useNativeWidgets.js). Strings: vsc.wg.* in vsc.<locale>.js.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { authedRequest } from "../../api/authedHttp";
import { VOICE_SHORTCUTS, SHORTCUT_LOCALES, phrasePlaceholders, speakablePhrase } from "../../i18n/voiceShortcutsCatalog.js";
import { safeAvatarUrl } from "../../lib/nativeIntents.js";
import {
  MAX_FAVORITES,
  WAVES_PER_FRIEND,
  getWidgetSettings,
  getWidgetState,
  initialsOf,
  moveFavorite,
  normalizeFavorites,
  subscribeWidgetSettings,
  suggestedFavorites,
  toggleFavorite,
  updateWidgetSettings,
} from "../../lib/nativeWidgets.js";
import "../../styles/widgets-settings.css";

/** Product name: the same in every language (Siri and the widget gallery show it). */
const APP_NAME = "Descall";

const GRADIENTS = [
  ["#FF8FB1", "#B05CFF"], ["#5AC8FA", "#3B5BFF"], ["#C6A7FF", "#6A4CFF"], ["#FFA27A", "#E0435F"],
  ["#7EE3D2", "#1F8F86"], ["#FFD36E", "#F2803A"], ["#FFB7D5", "#D9468B"], ["#9BE77C", "#2E9B52"],
  ["#B8C4FF", "#5D6BD6"], ["#7C93FF", "#4A68E0"],
];

/** Same colour as the native widgets (DescallAvatarPalette: FNV-1a over UTF-8). */
export function paletteIndex(id) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(String(id || ""))) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % GRADIENTS.length;
}

const PRESENCE_PATHS = {
  online: "M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0z",
  idle: "M5 0A5 5 0 1 0 10 5 3.7 3.7 0 0 1 5 0z",
  dnd: "M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0zM2.2 4.05h5.6v1.9H2.2z",
  offline: "M5 0a5 5 0 1 1 0 10A5 5 0 0 1 5 0zm0 2.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z",
};

function PresenceGlyph({ presence, size = 10 }) {
  const d = PRESENCE_PATHS[presence] || PRESENCE_PATHS.offline;
  return (
    <svg className={`wgs-pg is-${presence || "offline"}`} width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
      <path fillRule="evenodd" d={d} />
    </svg>
  );
}

/** A face like the widgets draw it: photo, or the initial on the person's own gradient. */
export function Face({ person, size = 32, dot = false, speaking = false, mono = false }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? safeAvatarUrl(person?.avatarUrl || "") : "";
  const [a, b] = GRADIENTS[paletteIndex(person?.id)];
  const letter = (person?.initials || initialsOf(person?.name || "?")).slice(0, 1);
  return (
    <span
      className={`wgs-face${speaking ? " is-speaking" : ""}${mono ? " is-mono" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), "--fa": a, "--fb": b }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /> : letter}
      {dot ? (
        <span className="wgs-dot" style={{ width: Math.round(size * 0.38), height: Math.round(size * 0.38) }}>
          <PresenceGlyph presence={person?.presence} size={Math.round(size * 0.26)} />
        </span>
      ) : null}
    </span>
  );
}

const ICONS = {
  check: "M5 12.5l4.2 4.2L19 7",
  plus: "M12 5v14M5 12h14",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  at: "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1",
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6 6 0 0 1 3.5 5.5",
  wave: "M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2",
  join: "M10 17l5-5-5-5M15 12H3M21 4v16",
  msg: "M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  micoff: "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 11a7 7 0 0 1-1.2 3.9M5 11a7 7 0 0 0 10.6 6M12 18v3",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.8-2.4L3 14.5a1.6 1.6 0 0 1 2.5-2L8 15",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  retry: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
};

function Icon({ name, size = 16, stroke = 2 }) {
  return (
    <svg className="wgs-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ICONS.sparkle} />
    </svg>
  );
}

function Tile({ icon, tone }) {
  return (
    <span className={`wgs-tile is-${tone}`} aria-hidden="true">
      <Icon name={icon} size={17} stroke={2.2} />
    </span>
  );
}

// ---- data ----------------------------------------------------------------------------------------

/** The widgets' own answers, with loading / error / offline / retry. */
export function useWidgetData(platform) {
  const [state, setState] = useState({ status: "loading", summary: null, friends: [] });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    setState((s) => ({ ...s, status: s.summary ? "refreshing" : "loading" }));
    Promise.all([
      authedRequest("/api/native/summary?activity=1&previews=1", { signal: ctrl?.signal }),
      authedRequest("/api/native/friends?activity=1", { signal: ctrl?.signal }),
    ])
      .then(([summary, list]) => {
        if (!live) return;
        setState({ status: "ready", summary, friends: Array.isArray(list?.friends) ? list.friends : [] });
      })
      .catch(() => {
        if (!live) return;
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setState((s) => ({ ...s, status: offline ? "offline" : "error" }));
      });
    return () => {
      live = false;
      ctrl?.abort?.();
    };
  }, [nonce, platform]);
  useEffect(() => {
    const on = () => setNonce((n) => n + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

function activityText(t, a, presence) {
  if (!a?.kind) {
    if (presence === "idle") return t("vsc.wg.act.idle");
    if (presence === "dnd") return t("vsc.wg.act.dnd");
    return "";
  }
  const label = a.label || "";
  switch (a.kind) {
    case "screen":
      return t("vsc.wg.act.screen");
    case "voice":
      return label ? t("vsc.wg.act.voiceIn", { name: label }) : t("vsc.wg.act.voice");
    case "game":
      return label ? t("vsc.wg.act.game", { name: label }) : "";
    case "music":
      return label ? t("vsc.wg.act.music", { name: label }) : "";
    case "app":
      return label ? t("vsc.wg.act.app", { name: label }) : "";
    case "idle":
      return t("vsc.wg.act.idle");
    case "dnd":
      return t("vsc.wg.act.dnd");
    case "custom":
      return label;
    case "offline":
      return t("vsc.wg.act.offline");
    default:
      return "";
  }
}

function pickPhrase(phrases, locale) {
  const lang = SHORTCUT_LOCALES.includes(locale) ? locale : String(locale || "").slice(0, 2);
  return (p) => p[lang] || p[SHORTCUT_LOCALES.find((l) => l.slice(0, 2) === lang)] || p.en;
}

/** "Descall ile Ece kisisine mesaj gönder": the real Siri phrase with the name in it. */
export function favoriteMessagePhrase(name, locale) {
  const send = VOICE_SHORTCUTS.find((s) => s.id === "send");
  const withFriend = send?.phrases.find((p) => phrasePlaceholders(p.en).includes("friend"));
  if (!withFriend) return name;
  return speakablePhrase(pickPhrase(send.phrases, locale)(withFriend), { slot: name });
}

// ---- Siri ----------------------------------------------------------------------------------------

const QUESTIONS = ["unread", "online", "voice"];

function SiriAnswer({ t, data, question }) {
  const s = data.summary;
  if (!s) return null;
  if (question === "unread") {
    const total = Number(s.unread?.total) || 0;
    const rows = (s.unread?.top || []).slice(0, 3);
    return (
      <>
        <div className="wgs-siri-text">
          {total === 0 ? t("vsc.wg.siri.aUnreadNone") : total === 1 ? t("vsc.wg.siri.aUnreadOne") : t("vsc.wg.siri.aUnreadMany", { count: total })}
        </div>
        {rows.map((r) => (
          <div key={r.conv} className="wgs-siri-row">
            <Face person={{ id: r.peerId || r.conv, name: r.by || r.title, initials: r.initials, avatarUrl: r.avatarUrl }} size={22} />
            <span className="wgs-siri-row-t">{r.title}</span>
            <b className="wgs-count">{r.count > 99 ? "99+" : r.count}</b>
          </div>
        ))}
      </>
    );
  }
  if (question === "online") {
    const list = s.friends?.online || [];
    const n = Number(s.friends?.onlineCount) || 0;
    return (
      <>
        <div className="wgs-siri-text">{n === 0 ? t("vsc.wg.siri.aOnlineNone") : t("vsc.wg.siri.aOnlineMany", { count: n })}</div>
        {list.slice(0, 3).map((f) => (
          <div key={f.id} className="wgs-siri-row">
            <Face person={f} size={22} dot />
            <span className="wgs-siri-row-t">{f.name}</span>
            <span className="wgs-siri-row-s">{activityText(t, f.activity, f.presence)}</span>
          </div>
        ))}
      </>
    );
  }
  const rooms = s.voice || [];
  const people = rooms.reduce((n, r) => n + (Number(r.occupantCount) || 0), 0);
  return (
    <>
      <div className="wgs-siri-text">{people === 0 ? t("vsc.wg.siri.aVoiceNone") : t("vsc.wg.siri.aVoiceMany", { count: people })}</div>
      {rooms.slice(0, 3).map((r) => (
        <div key={r.channelId} className="wgs-siri-row">
          <span className="wgs-mini-stack">
            {(r.occupants || []).slice(0, 3).map((o) => (
              <Face key={o.id} person={o} size={20} />
            ))}
          </span>
          <span className="wgs-siri-row-t">{r.channelName}</span>
          <span className="wgs-siri-row-s">{t("vsc.wg.people", { count: r.occupantCount })}</span>
        </div>
      ))}
    </>
  );
}

function SiriPanel({ t, locale, data, favorites, people, siriReady, onAddToSiri, siriState, phraseList }) {
  const [question, setQuestion] = useState("unread");
  const favRows = people.slice(0, 4);
  const general = [
    ["status", "moon", "red"],
    ["unread", "at", "indigo"],
    ["online", "users", "green"],
    ["voice", "join", "teal"],
  ];
  const pick = (id) => {
    const s = VOICE_SHORTCUTS.find((x) => x.id === id);
    const p = s?.phrases.find((x) => phrasePlaceholders(x.en).length === 0) || s?.phrases[0];
    return p ? speakablePhrase(pickPhrase(s.phrases, locale)(p)) : "";
  };
  return (
    <div className="wgs-panel" role="tabpanel" aria-labelledby="wgs-tab-siri">
      <section className="wgs-siri" aria-label={t("vsc.wg.siri.previewLabel")}>
        <div className="wgs-q-chips" role="radiogroup" aria-label={t("vsc.wg.siri.tryHint")}>
          {QUESTIONS.map((q) => (
            <button key={q} type="button" role="radio" aria-checked={question === q} className={`wgs-q-chip${question === q ? " is-on" : ""}`} onClick={() => setQuestion(q)}>
              {t(`vsc.wg.siri.q.${q}`)}
            </button>
          ))}
        </div>
        <div className="wgs-siri-user">
          <span>{t(`vsc.wg.siri.q.${question}`)}</span>
        </div>
        <div className="wgs-siri-reply">
          <span className="wgs-siri-orb" aria-hidden="true" />
          <div className="wgs-siri-card" aria-live="polite">
            <div className="wgs-siri-brand">
              <Icon name="msg" size={12} stroke={2.4} /> {APP_NAME.toLocaleUpperCase("en-US")}
            </div>
            {data.status === "loading" ? (
              <div className="wgs-skel" aria-label={t("vsc.wg.state.loading")}>
                <i /><i /><i />
              </div>
            ) : data.summary ? (
              <SiriAnswer t={t} data={data} question={question} />
            ) : (
              <StateNote t={t} data={data} />
            )}
          </div>
        </div>
      </section>

      <h3 className="wgs-gh">{t("vsc.wg.siri.favTitle")}</h3>
      {favRows.length ? (
        <ul className="wgs-grp">
          {favRows.map((p, i) => {
            const call = i % 2 === 1;
            return (
              <li key={`${p.id}-${call ? "c" : "m"}`} className="wgs-row">
                <Face person={p} size={30} />
                <span className="wgs-row-tx">
                  <b>
                    <q>{call ? t("vsc.wg.siri.callPhrase", { name: p.name }) : favoriteMessagePhrase(p.name, locale)}</q>
                  </b>
                  <span>{call ? t("vsc.wg.siri.callHint") : t("vsc.wg.siri.msgHint")}</span>
                </span>
                {call ? (
                  <button type="button" className="wgs-add" onClick={onAddToSiri} disabled={!siriReady || siriState === "busy"}>
                    <Icon name="plus" size={13} stroke={2.6} />
                    {t("vsc.addToSiri")}
                  </button>
                ) : (
                  <span className="wgs-add is-ok">
                    <Icon name="check" size={13} stroke={2.6} />
                    {t("vsc.wg.siri.added")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="wgs-foot">{t("vsc.wg.siri.noFav")}</p>
      )}
      <p className="wgs-foot">{t("vsc.wg.siri.favHint", { count: favorites.length })}</p>

      <h3 className="wgs-gh">{t("vsc.wg.siri.generalTitle")}</h3>
      <ul className="wgs-grp">
        {general.map(([id, icon, tone]) => (
          <li key={id} className="wgs-row">
            <Tile icon={icon} tone={tone} />
            <span className="wgs-row-tx">
              <b>
                <q>{pick(id)}</q>
              </b>
            </span>
            <span className="wgs-add is-ok">
              <Icon name="check" size={13} stroke={2.6} />
              {t("vsc.wg.siri.ready")}
            </span>
          </li>
        ))}
      </ul>
      {siriReady === false ? <p className="wgs-foot" role="note">{t("vsc.needsIos17")}</p> : null}
      {siriState === "failed" ? <p className="wgs-foot wgs-err" role="alert">{t("vsc.siriFailed")}</p> : null}
      <details className="wgs-more">
        <summary>{t("vsc.wg.siri.allPhrases")}</summary>
        {phraseList}
      </details>
    </div>
  );
}

function StateNote({ t, data }) {
  if (data.status === "offline") return <div className="wgs-state">{t("vsc.wg.state.offline")} <button type="button" className="wgs-link" onClick={data.retry}>{t("vsc.wg.state.retry")}</button></div>;
  if (data.status === "error") return <div className="wgs-state">{t("vsc.wg.state.error")} <button type="button" className="wgs-link" onClick={data.retry}>{t("vsc.wg.state.retry")}</button></div>;
  return null;
}

// ---- favourite faces ------------------------------------------------------------------------------

/** The medium friends widget, as the phone draws it (live preview). */
export function FriendsWidgetPreview({ t, people, onlineCount, showActivity, theme = "dark" }) {
  return (
    <div className={`wgs-w wgs-wm is-${theme}`} aria-label={t("vsc.wg.faces.previewLabel")}>
      <div className="wgs-w-hd">
        <Icon name="msg" size={14} stroke={2.4} />
        <span>{t("vsc.wg.faces.online")}</span>
        <em>{t("vsc.wg.people", { count: onlineCount })}</em>
      </div>
      <div className="wgs-w-faces">
        {people.slice(0, 4).map((p) => (
          <div key={p.id} className="wgs-w-face">
            <Face person={p} size={50} dot />
            <b>{p.name}</b>
            {showActivity ? <span className="wgs-w-line">{p.line || " "}</span> : null}
          </div>
        ))}
        {people.length === 0 ? <p className="wgs-w-empty">{t("vsc.wg.faces.emptyPreview")}</p> : null}
      </div>
    </div>
  );
}

function FacesPanel({ t, data, settings, favorites, people, friendsById }) {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark"
  );
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState(null); // previous list
  const [notice, setNotice] = useState("");
  const [drag, setDrag] = useState(null); // { from, over }
  const holdRef = useRef(null);
  const undoTimer = useRef(null);

  const friends = data.friends || [];
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    const chosen = favorites.map((id) => friendsById.get(id)).filter(Boolean);
    const rest = friends.filter((f) => !favorites.includes(String(f.id)));
    const all = [...chosen, ...rest];
    return q ? all.filter((f) => `${f.name} ${f.username || ""}`.toLocaleLowerCase("tr-TR").includes(q)) : all;
  }, [friends, favorites, friendsById, query]);

  const commit = (next) => {
    const prev = favorites;
    if (JSON.stringify(prev) === JSON.stringify(next)) return;
    updateWidgetSettings({ favorites: next });
    setUndo(prev);
    setNotice(t("vsc.wg.faces.changed"));
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => {
      setUndo(null);
      setNotice("");
    }, 6000);
  };
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const tap = (id) => {
    if (!favorites.includes(id) && favorites.length >= MAX_FAVORITES) {
      setNotice(t("vsc.wg.faces.full"));
      setUndo(null);
      return;
    }
    commit(toggleFavorite(favorites, id));
  };

  // Hold a numbered face, then drag it onto another place (mouse, touch and pen alike).
  const onPointerDown = (e, index) => {
    if (index < 0) return;
    const start = { x: e.clientX, y: e.clientY };
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => {
      setDrag({ from: index, over: index, start });
    }, 260);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-fav-index]");
    const over = el ? Number(el.getAttribute("data-fav-index")) : drag.over;
    if (Number.isFinite(over) && over >= 0 && over !== drag.over) setDrag((d) => ({ ...d, over }));
  };
  const onPointerUp = () => {
    clearTimeout(holdRef.current);
    if (!drag) return;
    const { from, over } = drag;
    setDrag(null);
    if (from !== over) commit(moveFavorite(favorites, from, over));
  };
  const suppressClick = useRef(false);
  useEffect(() => {
    suppressClick.current = Boolean(drag);
  }, [drag]);

  const keyMove = (e, index) => {
    if (index < 0) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(moveFavorite(favorites, index, index - 1));
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(moveFavorite(favorites, index, index + 1));
    }
  };

  const setPref = (key, value) => updateWidgetSettings({ prefs: { [key]: value } });
  const prefs = settings.prefs;
  const onlineCount = Number(data.summary?.friends?.onlineCount) || friends.filter((f) => f.presence && f.presence !== "offline").length;

  return (
    <div className="wgs-panel" role="tabpanel" aria-labelledby="wgs-tab-faces">
      <div className={`wgs-wall is-${theme}`}>
        <FriendsWidgetPreview t={t} people={people} onlineCount={onlineCount} showActivity={prefs.showActivity} theme={theme} />
        <div className="wgs-seg wgs-seg-sm" role="radiogroup" aria-label={t("vsc.wg.faces.wallpaper")}>
          {["dark", "light"].map((th) => (
            <button key={th} type="button" role="radio" aria-checked={theme === th} className={theme === th ? "is-on" : ""} onClick={() => setTheme(th)}>
              {t(`vsc.wg.faces.wall.${th}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="wgs-gh-row">
        <h3 className="wgs-gh">
          {t("vsc.wg.faces.pickTitle")} · <span className="wgs-num">{favorites.length}</span>/{MAX_FAVORITES}
        </h3>
        {settings.picked ? (
          <button type="button" className="wgs-link" onClick={() => commit(suggestedFavorites(friends))}>
            {t("vsc.wg.faces.reset")}
          </button>
        ) : null}
      </div>
      {friends.length > 12 ? (
        <label className="wgs-search">
          <Icon name="search" size={15} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("vsc.wg.faces.search")} aria-label={t("vsc.wg.faces.search")} />
        </label>
      ) : null}
      {data.status === "loading" ? (
        <div className="wgs-grp wgs-pick is-loading" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="wgs-pick-skel" />
          ))}
        </div>
      ) : !friends.length ? (
        data.status === "ready" ? <p className="wgs-foot">{t("vsc.wg.faces.noFriends")}</p> : <div className="wgs-grp wgs-pad"><StateNote t={t} data={data} /></div>
      ) : (
        <div
          className={`wgs-grp wgs-pick${drag ? " is-dragging" : ""}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => clearTimeout(holdRef.current)}
          role="listbox"
          aria-multiselectable="true"
          aria-label={t("vsc.wg.faces.pickTitle")}
        >
          {visible.map((f) => {
            const id = String(f.id);
            const index = favorites.indexOf(id);
            const isOver = drag && drag.over === index && index >= 0;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={index >= 0}
                data-fav-index={index >= 0 ? index : undefined}
                className={`wgs-pick-f${index >= 0 ? " is-on" : ""}${drag?.from === index && index >= 0 ? " is-lifted" : ""}${isOver ? " is-over" : ""}`}
                onPointerDown={(e) => onPointerDown(e, index)}
                onKeyDown={(e) => keyMove(e, index)}
                onClick={() => {
                  if (suppressClick.current) return;
                  tap(id);
                }}
                title={f.name}
              >
                <Face person={f} size={52} dot />
                <span className="wgs-ord" aria-hidden="true">{index >= 0 ? index + 1 : ""}</span>
                <span className="wgs-pick-n">{f.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="wgs-foot">{t("vsc.wg.faces.pickHint")}</p>
      {notice ? (
        <div className="wgs-undo" role="status">
          <span>{notice}</span>
          {undo ? (
            <button type="button" onClick={() => { updateWidgetSettings({ favorites: undo }); setUndo(null); setNotice(""); }}>
              <Icon name="undo" size={14} />
              {t("vsc.wg.faces.undo")}
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="wgs-grp">
        {[
          ["showActivity", t("vsc.wg.faces.showActivity"), t("vsc.wg.faces.showActivityHint")],
          ["waveButton", t("vsc.wg.faces.wave"), t("vsc.wg.faces.waveHint", { count: WAVES_PER_FRIEND })],
          ["showPreview", t("vsc.wg.faces.preview"), t("vsc.wg.faces.previewHint")],
        ].map(([key, title, hint]) => (
          <li key={key} className="wgs-row is-noic">
            <span className="wgs-row-tx">
              <b>{title}</b>
              <span>{hint}</span>
            </span>
            <button type="button" role="switch" aria-checked={prefs[key]} aria-label={title} className={`wgs-sw${prefs[key] ? " is-on" : ""}`} onClick={() => setPref(key, !prefs[key])} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- lock screen ---------------------------------------------------------------------------------

function LockAccessories({ t, first, lastMsg, speaker }) {
  return (
    <div className="wgs-acc-row">
      <div className="wgs-acc is-c" title={t("vsc.wg.lock.favPerson")}>
        <span className="wgs-acc-big">{(first?.initials || initialsOf(first?.name || "?")).slice(0, 1)}</span>
        {first ? <span className="wgs-acc-pg"><PresenceGlyph presence={first.presence} size={13} /></span> : null}
      </div>
      <div className="wgs-acc is-r">
        {speaker ? (
          <>
            <span className="wgs-acc-face is-ring">{speaker.initial}</span>
            <span className="wgs-acc-tx">
              <b>{t("vsc.wg.lock.speaking", { name: speaker.name })}</b>
              <span>{speaker.sub}</span>
            </span>
          </>
        ) : lastMsg ? (
          <>
            <span className="wgs-acc-face">{(lastMsg.initials || initialsOf(lastMsg.by || lastMsg.title)).slice(0, 1)}</span>
            <span className="wgs-acc-tx">
              <b>
                {lastMsg.kind === "dm" ? lastMsg.title : lastMsg.by || lastMsg.title} · {lastMsg.count}
              </b>
              <span>{lastMsg.preview || t("vsc.wg.lock.newMessages", { count: lastMsg.count })}</span>
            </span>
          </>
        ) : (
          <span className="wgs-acc-tx">
            <b>{t("vsc.wg.lock.noMessages")}</b>
          </span>
        )}
      </div>
    </div>
  );
}

const GALLERY = [
  { kind: "friends", icon: "users", tone: "brand", title: "vsc.wg.lock.favPerson", hint: "vsc.wg.lock.favPersonHint" },
  { kind: "unread", icon: "msg", tone: "red", title: "vsc.wg.lock.lastMsg", hint: "vsc.wg.lock.lastMsgHint" },
  { kind: "voice", icon: "wave", tone: "green", title: "vsc.wg.lock.cluster", hint: "vsc.wg.lock.clusterHint" },
  { kind: "call", icon: "phone", tone: "teal", title: "vsc.wg.lock.speaker", hint: "vsc.wg.lock.speakerHint" },
];

function LockPanel({ t, locale, data, people, native, speaker }) {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  const lastMsg = data.summary?.unread?.top?.[0] || null;
  const room = data.summary?.voice?.[0] || null;
  const installed = new Set((native?.installed || []).map((w) => w.kind));
  // "Pzt 23 Kasım" like the iPhone lock screen (weekday first in every language).
  const parts = new Intl.DateTimeFormat(locale || undefined, { weekday: "short", day: "numeric", month: "long" }).formatToParts(now);
  const part = (type) => parts.find((x) => x.type === type)?.value || "";
  const dateText = `${part("weekday")} ${part("day")} ${part("month")}`.trim();
  const timeText = new Intl.DateTimeFormat(locale || undefined, { hour: "2-digit", minute: "2-digit" }).format(now);
  return (
    <div className="wgs-panel" role="tabpanel" aria-labelledby="wgs-tab-lock">
      <div className="wgs-lock">
        <div className="wgs-lock-date">{dateText}</div>
        <div className="wgs-lock-time">{timeText}</div>
        <div className="wgs-lock-slot">
          <LockAccessories t={t} first={people[0]} lastMsg={lastMsg} speaker={speaker} />
        </div>
        <div className="wgs-sheet">
          <span className="wgs-grab" aria-hidden="true" />
          <div className="wgs-sheet-hd">
            <b>{t("vsc.wg.lock.addWidget")}</b>
          </div>
          <div className="wgs-sheet-acc">
            <div className="wgs-acc is-c is-sheet">
              <span className="wgs-acc-big">{(lastMsg?.initials || initialsOf(lastMsg?.by || lastMsg?.title || "D")).slice(0, 1)}</span>
              {lastMsg ? <span className="wgs-acc-badge">{data.summary?.unread?.total > 99 ? "99+" : data.summary?.unread?.total}</span> : null}
            </div>
            <div className="wgs-acc is-c is-sheet">
              <span className="wgs-acc-cluster">
                {(room?.occupants || []).slice(0, 3).map((o, i) => (
                  <i key={o.id} className={`p${i}`}>{(o.initials || initialsOf(o.name)).slice(0, 1)}</i>
                ))}
              </span>
              {room && room.occupantCount > 3 ? <span className="wgs-acc-more">+{room.occupantCount - 3}</span> : null}
            </div>
            <div className="wgs-acc is-r is-sheet">
              {lastMsg ? (
                <>
                  <span className="wgs-acc-face">{(lastMsg.initials || initialsOf(lastMsg.by || lastMsg.title)).slice(0, 1)}</span>
                  <span className="wgs-acc-tx">
                    <b>{lastMsg.kind === "dm" ? lastMsg.title : lastMsg.by || lastMsg.title} · {lastMsg.count}</b>
                    <span>{lastMsg.preview || t("vsc.wg.lock.newMessages", { count: lastMsg.count })}</span>
                  </span>
                </>
              ) : (
                <span className="wgs-acc-tx"><b>{t("vsc.wg.lock.noMessages")}</b></span>
              )}
            </div>
          </div>
          <div className="wgs-sheet-app">
            <span className="wgs-appicon" aria-hidden="true"><Icon name="msg" size={17} stroke={2.4} /></span>
            <b>{APP_NAME}</b>
            <span>{t("vsc.wg.lock.widgetsCount", { count: 8 })}</span>
          </div>
          <ul className="wgs-sheet-list">
            {GALLERY.map((g) => (
              <li key={g.kind}>
                <div className="wgs-row is-sheet">
                  <Tile icon={g.icon} tone={g.tone} />
                  <span className="wgs-row-tx">
                    <b>{t(g.title)}</b>
                    <span>{t(g.hint)}</span>
                  </span>
                  {installed.has(g.kind) ? (
                    <span className="wgs-add is-ok"><Icon name="check" size={13} stroke={2.6} />{t("vsc.wg.lock.placed")}</span>
                  ) : null}
                  <button
                    type="button"
                    className="wgs-plus"
                    aria-expanded={open === g.kind}
                    aria-label={t("vsc.wg.lock.howToFor", { name: t(g.title) })}
                    onClick={() => setOpen((o) => (o === g.kind ? null : g.kind))}
                  >
                    <Icon name="plus" size={18} stroke={2.4} />
                  </button>
                </div>
                {open === g.kind ? (
                  <ol className="wgs-howto">
                    <li>{t("vsc.wg.lock.step1")}</li>
                    <li>{t("vsc.wg.lock.step2")}</li>
                    <li>{t("vsc.wg.lock.step3", { name: t(g.title) })}</li>
                  </ol>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="wgs-foot">{native?.liveActivities === false ? t("vsc.wg.lock.liveOff") : t("vsc.wg.lock.liveOn")}</p>
      <p className="wgs-foot">{t("vsc.wg.lock.homeHint")}</p>
    </div>
  );
}

// ---- page ----------------------------------------------------------------------------------------

/**
 * @param {object} p
 * @param {"ios"|"android"} p.platform
 * @param {Function} p.t
 * @param {string} p.locale
 * @param {boolean} p.siriReady
 * @param {Function} p.onAddToSiri
 * @param {string} p.siriState
 * @param {React.ReactNode} p.phraseList  every phrase (the old list), under "Tum soyleyisler"
 * @param {React.ReactNode} p.androidShortcuts  Android launcher sections (Android tab)
 * @param {object} [p.speaker]   { name, initial, sub } while in a call (lock screen preview)
 */
export default function WidgetsSiriPane({ platform, t, locale, siriReady, onAddToSiri, siriState, phraseList, androidShortcuts = null, speaker = null }) {
  const tabs = platform === "ios" ? ["siri", "faces", "lock"] : ["faces", "shortcuts"];
  const [tab, setTab] = useState(tabs[0]);
  const settings = useSyncExternalStore(subscribeWidgetSettings, getWidgetSettings, getWidgetSettings);
  const data = useWidgetData(platform);
  const [native, setNative] = useState(null);

  useEffect(() => {
    let live = true;
    getWidgetState()
      .then((s) => live && setNative(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab]);

  const friends = data.friends;
  const friendsById = useMemo(() => new Map(friends.map((f) => [String(f.id), f])), [friends]);
  const favorites = useMemo(() => {
    if (settings.picked) return normalizeFavorites(settings.favorites, friends.length ? friends.map((f) => String(f.id)) : null);
    return suggestedFavorites(friends.map((f) => ({ ...f, status: f.presence })));
  }, [settings, friends]);
  const people = useMemo(
    () =>
      favorites
        .map((id) => friendsById.get(id))
        .filter(Boolean)
        .map((f) => ({ ...f, line: activityText(t, f.activity, f.presence) })),
    [favorites, friendsById, t]
  );

  const tabsRef = useRef([]);
  const onTabKey = useCallback(
    (e, i) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      setTab(tabs[next]);
      tabsRef.current[next]?.focus();
    },
    [tabs]
  );

  return (
    <div className="wgs" data-platform={platform}>
      <div className="wgs-seg" role="tablist" aria-label={t("vsc.wg.tabsLabel")}>
        {tabs.map((id, i) => (
          <button
            key={id}
            ref={(el) => (tabsRef.current[i] = el)}
            id={`wgs-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? "is-on" : ""}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <Icon name={{ siri: "sparkle", faces: "users", lock: "lock", shortcuts: "grid" }[id]} size={15} />
            {t(`vsc.wg.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === "siri" ? (
        <SiriPanel t={t} locale={locale} data={data} favorites={favorites} people={people} siriReady={siriReady} onAddToSiri={onAddToSiri} siriState={siriState} phraseList={phraseList} />
      ) : null}
      {tab === "faces" ? <FacesPanel t={t} data={data} settings={settings} favorites={favorites} people={people} friendsById={friendsById} /> : null}
      {tab === "lock" ? <LockPanel t={t} locale={locale} data={data} people={people} native={native} speaker={speaker} /> : null}
      {tab === "shortcuts" ? <div className="wgs-panel" role="tabpanel" aria-labelledby="wgs-tab-shortcuts">{androidShortcuts}</div> : null}
    </div>
  );
}
