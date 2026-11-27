/**
 * "Paylaş > Descall", draft A ("Hızlı cam sayfa", share.html#A). The page behind the
 * Android share target (DescallShareActivity loads /share) and the web share sheet; the
 * iOS share extension draws the same sheet in SwiftUI (ios/App/DescallShare).
 *
 * Compose: attachments on top (quality sizes precomputed), recents + tabbed list (friends,
 * groups, servers > channels, search, multi-select), message, quality / silent / schedule /
 * location chips and Gönder at the bottom. Permission precheck and the duplicate-send
 * warning run while you pick. After Gönder the same sheet shows live progress and the
 * result (sent with a 10 s undo, scheduled, partial with retry, offline queue).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { getLocaleMeta } from "../../i18n/registry.js";
import * as M from "../../lib/share/shareModel.js";
import { createShareHost, shareHistory, targetsCache } from "../../lib/share/shareHost.js";
import { DescallMark, Icon } from "./shareIcons.jsx";
import useModalFocus from "../../hooks/useModalFocus";
import { removeBootSplashNow } from "../../lib/bootSplashDirect.js";
import ShareRun from "./ShareRun.jsx";
import "../../styles/shareSheet.css";

const PALETTE = ["#E8457A", "#19A2B3", "#9B5DE5", "#E1780F", "#2DAA53", "#5E5CE6", "#C9A227", "#3E7BFA"];

export function colorFor(id) {
  let h = 0;
  for (const ch of String(id || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({ entry, size = 40, sel = false, presence = true, ring }) {
  const style = { "--s": `${size}px`, "--c": colorFor(entry?.id), ...(ring ? { "--shs-ring": ring } : {}) };
  if (entry?.kind === "channel") {
    return (
      <span className="shs-av sq ch" style={style} aria-hidden="true">
        <Icon name="hash" />
        {sel ? <i className="selb"><Icon name="check" /></i> : null}
      </span>
    );
  }
  const img = entry?.avatarUrl || entry?.iconUrl;
  const cls = `shs-av${entry?.kind === "server" ? " sq" : ""}${img ? " img" : ""}`;
  return (
    <span className={cls} style={img ? { ...style, "--img": `url("${img}")` } : style} aria-hidden="true">
      {img ? null : entry?.kind === "group" ? <Icon name="users" /> : entry?.initials || String(entry?.name || "?").slice(0, 1).toUpperCase()}
      {presence && entry?.kind === "dm" && entry.presence ? <i className={`shs-pd ${entry.presence}`} /> : null}
      {sel ? <i className="selb"><Icon name="check" /></i> : null}
    </span>
  );
}

function variantFromUrl() {
  try {
    const v = new URLSearchParams(window.location.search).get("variant");
    return v === "android" || v === "ios" ? v : null;
  } catch {
    return null;
  }
}

export default function SharePage({ host: hostProp = null, now: nowProp = null }) {
  const translate = useT();
  const { locale } = useLocale();
  const intl = getLocaleMeta(locale)?.intl || "tr-TR";
  const host = useMemo(() => hostProp || createShareHost(), [hostProp]);
  const variant = variantFromUrl() || (host.platform === "android" ? "android" : "ios");
  const now = useCallback(() => (nowProp ? nowProp() : Date.now()), [nowProp]);
  const t = translate;

  const [items, setItems] = useState([]);
  const [sourceLabel, setSourceLabel] = useState(null);
  const [targets, setTargets] = useState(null);
  const [load, setLoad] = useState("loading"); // loading | ready | error | signedout
  const [selected, setSelected] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [quality, setQuality] = useState("high");
  const [strip, setStrip] = useState(true);
  const [silent, setSilent] = useState(false);
  const [sendAt, setSendAt] = useState(null);
  const [menu, setMenu] = useState(null); // quality | schedule
  const [customAt, setCustomAt] = useState("");
  const [precheck, setPrecheck] = useState({});
  const [dismissed, setDismissed] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [toast, setToast] = useState(null);
  const [linkMeta, setLinkMeta] = useState({});
  const [job, setJob] = useState(null);
  const toastTimer = useRef(null);
  const sheetRef = useRef(null);
  // The sheet is the whole page: keep keyboard focus inside it (Android hardware keyboards, web).
  useModalFocus(true, sheetRef);

  const say = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-react-ready", "1");
      // A share sheet opens at once: no boot logo animation (it holds the splash up to 4.5 s).
      removeBootSplashNow();
    } catch {
      /* ignore */
    }
  }, []);

  // Payload + targets.
  const loadTargets = useCallback(async () => {
    if (!host.hasSession()) {
      setLoad("signedout");
      return;
    }
    const cached = targetsCache.read();
    if (cached) {
      setTargets(cached);
      setLoad("ready");
    } else setLoad("loading");
    try {
      const fresh = await host.api.targets();
      setTargets(fresh);
      setLoad("ready");
      targetsCache.write(fresh);
      host.publishDirectShare?.(M.recentEntries(fresh, 8).map((e) => ({ conv: e.conv, kind: e.kind, name: e.name, username: e.username || null, serverId: e.serverId || null, avatarUrl: e.avatarUrl || null })));
    } catch (err) {
      if (err?.status === 401) setLoad("signedout");
      else if (!cached) setLoad("error");
    }
  }, [host]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await host.getPayload();
        if (!alive) return;
        const list = (p.items || []).slice(0, M.MAX_ITEMS);
        if ((p.items || []).length > M.MAX_ITEMS) say(t("shareSheet.limitItems", { count: M.MAX_ITEMS }));
        setItems(list);
        setSourceLabel(p.sourceLabel || null);
        if (p.preset && M.parseConv(p.preset)) setSelected([p.preset]);
        if (p.job?.id) {
          setJob(p.job);
          host.watch?.(p.job, (j) => setJob(j));
        }
      } catch {
        setItems([]);
      }
    })();
    loadTargets();
    return () => {
      alive = false;
    };
  }, [host, loadTargets, say, t]);

  // Link cards: title and site from the app's own link preview service.
  useEffect(() => {
    for (const it of items) {
      if (M.kindOf(it) !== "link" || linkMeta[it.url] || it.title) continue;
      setLinkMeta((m) => ({ ...m, [it.url]: { loading: true } }));
      host.api.linkPreview(it.url).then((r) => setLinkMeta((m) => ({ ...m, [it.url]: r?.preview || {} }))).catch(() => setLinkMeta((m) => ({ ...m, [it.url]: {} })));
    }
  }, [items, host, linkMeta]);

  const index = useMemo(() => M.indexTargets(targets), [targets]);
  const allowed = targets?.limits?.mimes || null;
  const problems = useMemo(() => new Map(items.map((it) => [it.id, M.itemProblem(it, { allowedMimes: allowed, quality })])), [items, allowed, quality]);
  const sendable = useMemo(() => items.filter((it) => !problems.get(it.id)), [items, problems]);
  const hasFiles = M.hasUploads(sendable);
  const tot = useMemo(() => M.totals(sendable, quality), [sendable, quality]);
  const recents = useMemo(() => M.recentEntries(targets, 8), [targets]);
  const sections = useMemo(() => M.buildSections(targets, { tab, query, variant, selected }), [targets, tab, query, variant, selected]);

  // Drop selections that cannot take this share any more (files added, permission changed).
  useEffect(() => {
    if (!targets) return;
    const bad = selected.filter((c) => index.get(c) && !M.targetVerdict(index.get(c), { hasFiles }).ok);
    if (bad.length) {
      setSelected((s) => s.filter((c) => !bad.includes(c)));
      const e = index.get(bad[0]);
      say(t("shareSheet.targetRemoved", { name: e.name, reason: t(`shareSheet.reason.${M.targetVerdict(e, { hasFiles }).reason}`) }));
    }
  }, [targets, index, hasFiles, selected, say, t]);

  // Permission precheck + duplicate warning for what is selected.
  useEffect(() => {
    if (!selected.length || load !== "ready") return undefined;
    const links = items.filter((it) => M.kindOf(it) === "link").map((it) => it.url);
    const files = sendable.filter(M.isUpload).map((it) => ({ name: it.name, size: it.size || it.estimates?.original || 0 }));
    const timer = setTimeout(() => {
      host.api
        .precheck({ convs: selected, links, files, text: message.slice(0, 500) })
        .then((r) => {
          const res = r?.results || {};
          setPrecheck(res);
          const lost = selected.filter((c) => res[c] && res[c].canSend === false);
          if (lost.length) {
            setSelected((s) => s.filter((c) => !lost.includes(c)));
            const e = index.get(lost[0]);
            say(t("shareSheet.targetRemoved", { name: e?.name || "", reason: t(`shareSheet.reason.${res[lost[0]].reason || "no_permission"}`) }));
          }
        })
        .catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [selected, items, sendable, host, load, index, say, t, message]);

  const dups = useMemo(
    () => M.duplicates({ history: shareHistory.read(), items: sendable.concat(items.filter((i) => M.kindOf(i) === "link")), convs: selected, precheck, now: now() }).filter((d) => !dismissed.includes(d.conv)),
    [sendable, items, selected, precheck, dismissed, now]
  );

  const toggle = (conv) => {
    const e = index.get(conv);
    if (e && !M.targetVerdict(e, { hasFiles }).ok) return;
    const r = M.toggleTarget(selected, conv);
    if (r.limited) say(t("shareSheet.limitTargets", { count: M.MAX_TARGETS }));
    setSelected(r.selected);
  };

  const removeItem = (id) => setItems((list) => list.filter((it) => it.id !== id));

  const whenText = (at) => {
    const r = M.relativeDay(new Date(at).toISOString(), now());
    return r ? t(`shareSheet.when.${r.key}`, { count: r.n }) : "";
  };
  const timeText = (at) => new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit" }).format(new Date(at));
  const scheduleText = (at) => {
    const d = new Date(at);
    const r = M.relativeDay(d.toISOString(), now());
    const day = r && r.key === "today" ? "" : new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", month: "short" }).format(d);
    return `${day ? `${day} ` : ""}${timeText(at)}`;
  };

  const submit = async () => {
    if (!selected.length || (!sendable.length && !message.trim() && !items.some((i) => ["link", "text"].includes(M.kindOf(i))))) return;
    const tgs = selected.map((c) => index.get(c)).filter(Boolean);
    const payloadItems = sendable.concat(items.filter((i) => ["link", "text"].includes(M.kindOf(i))));
    const fresh = M.createJob({ items: payloadItems, targets: tgs, text: message, silent, sendAt, quality, stripLocation: strip, now: now() });
    setJob(fresh);
    setMenu(null);
    try {
      const end = await host.run(fresh, (j) => setJob(j));
      if (end) setJob(end);
      const ok = (end?.targets || []).filter((x) => x.status === "sent" || x.status === "scheduled").map((x) => x.conv);
      if (ok.length) shareHistory.write(M.recordHistory(shareHistory.read(), { convs: ok, items: payloadItems, at: now() }));
    } catch {
      setJob((j) => (j ? M.reduceJob(j, { type: "finish" }) : j));
    }
  };

  if (job) {
    return (
      <div className={`shs-root ${variant}`} data-variant={variant}>
        {variant === "ios" ? <div className="shs-dim" /> : null}
        <div className="shs-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t("shareSheet.title")}>
          {variant === "ios" ? <div className="shs-grab" /> : null}
          <ShareRun job={job} setJob={setJob} host={host} t={t} intl={intl} now={now} timeText={timeText} scheduleText={scheduleText} itemsSource={items} index={index} say={say} variant={variant} />
        </div>
        {toast ? <div className="shs-toast" role="status">{toast}</div> : null}
      </div>
    );
  }

  const count = selected.length;
  const ctaLabel = count ? (sendAt ? t("shareSheet.sendScheduled", { count }) : variant === "android" ? t("shareSheet.sendShort", { count }) : t("shareSheet.send", { count })) : t("shareSheet.pick");
  const itemsText = t("shareSheet.items", { count: items.length });
  const subtitle = sourceLabel ? t("shareSheet.source", { app: sourceLabel, items: itemsText }) : t("shareSheet.itemsSize", { items: itemsText, size: M.formatBytes(tot.chosen, intl) });
  const media = M.hasMedia(sendable);

  const chips = (
    <div className="shs-opts">
      {hasFiles ? (
        <button type="button" className={`shs-opt on${menu === "quality" ? " focus" : ""}`} onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-haspopup="menu" aria-expanded={menu === "quality"}>
          <Icon name={quality === "saver" ? "zap" : quality === "original" ? "image" : "spark"} />
          {t(`shareSheet.quality.chip.${quality}`)}
          {variant === "ios" ? <Icon name="chevD" /> : null}
        </button>
      ) : null}
      <button type="button" className={`shs-opt${silent ? " on" : ""}`} aria-pressed={silent} onClick={() => { setSilent(!silent); if (!silent) say(t("shareSheet.silentHint")); }}>
        <Icon name="bellOff" />
        {t("shareSheet.silent")}
      </button>
      <button type="button" className={`shs-opt${sendAt ? " on" : ""}${menu === "schedule" ? " focus" : ""}`} onClick={() => setMenu(menu === "schedule" ? null : "schedule")} aria-haspopup="menu" aria-expanded={menu === "schedule"} aria-label={t("shareSheet.scheduleChip")}>
        <Icon name="clock" />
        {variant === "android" && !sendAt ? null : sendAt ? scheduleText(sendAt) : t("shareSheet.scheduleChip")}
      </button>
      {media && variant === "ios" ? (
        <button type="button" className={`shs-opt${strip ? " on" : ""}`} aria-pressed={strip} onClick={() => setStrip(!strip)}>
          <Icon name={strip ? "pinOff" : "pin"} />
          {strip ? t("shareSheet.location.chipOn") : t("shareSheet.location.chipOff")}
        </button>
      ) : null}
    </div>
  );

  return (
    <div className={`shs-root ${variant}`} data-variant={variant}>
      {variant === "ios" ? <div className="shs-dim" onClick={() => host.finish()} /> : null}
      <div className="shs-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t("shareSheet.title")}>
        {variant === "ios" ? (
          <>
            <div className="shs-grab" />
            <div className="shs-nav">
              <button type="button" className="shs-lnk" onClick={() => host.finish()}>{t("shareSheet.cancel")}</button>
              <div className="shs-title">
                <span className="tl"><span className="shs-mlogo"><DescallMark /></span>{t("shareSheet.title")}</span>
                <small>{subtitle}</small>
              </div>
              <button type="button" className={`shs-ibtn${menu === "quality" ? " on" : ""}`} aria-label={t("shareSheet.options")} onClick={() => setMenu(menu === "quality" ? null : "quality")}><Icon name="sliders" /></button>
            </div>
          </>
        ) : (
          <div className="shs-tba">
            <button type="button" className="ib" aria-label={t("shareSheet.close")} onClick={() => host.finish()}><Icon name="x" /></button>
            <h1>{t("shareSheet.title")}<small>{subtitle}</small></h1>
            <button type="button" className="ib" aria-label={t("shareSheet.options")} onClick={() => setMenu(menu === "quality" ? null : "quality")}><Icon name="sliders" /></button>
          </div>
        )}

        <div className="shs-body">
          {dups.length ? (
            <div className="shs-bnr w" role="status" style={{ marginBottom: 8 }}>
              <Icon name="alert" />
              <span>
                <b>{t(dups[0].kind === "link" ? "shareSheet.dup.link" : "shareSheet.dup.file", { when: whenText(dups[0].at), name: index.get(dups[0].conv)?.name || "" })}</b>
                {t("shareSheet.dup.body", { name: M.firstName(index.get(dups[0].conv)?.name || "") })}
              </span>
              <button type="button" className="shs-mini" onClick={() => { setSelected((s) => s.filter((c) => c !== dups[0].conv)); setDismissed((d) => [...d, dups[0].conv]); }}>{t("shareSheet.dup.remove")}</button>
            </div>
          ) : null}

          <Strip items={items} problems={problems} linkMeta={linkMeta} onRemove={removeItem} t={t} intl={intl} />
          {items.length ? (
            <div className="shs-ameta">
              <b>{itemsText}</b>
              {hasFiles ? (
                <>
                  <span className="d" />
                  <span className="shs-tnum">{quality === "original" ? M.formatBytes(tot.original, intl) : `${M.formatBytes(tot.original, intl)} → ${M.formatBytes(tot.chosen, intl)}`}</span>
                  {variant === "android" ? <span className="gr">{t(`shareSheet.quality.chip.${quality}`)}</span> : tot.savedPercent > 0 ? <span className="gr">{t("shareSheet.saved", { percent: tot.savedPercent })}</span> : null}
                </>
              ) : null}
              {[...problems.values()].some(Boolean) ? (<><span className="d" /><span className="bad">{t(`shareSheet.reason.${[...problems.values()].find(Boolean)}`)}</span></>) : null}
            </div>
          ) : (
            <div className="shs-ameta"><b>{t("shareSheet.noItems")}</b></div>
          )}

          <label className="shs-search">
            <Icon name="search" />
            <span className="shs-sr">{t("shareSheet.search")}</span>
            <input type="search" value={query} placeholder={t("shareSheet.search")} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" autoComplete="off" />
            {query ? <button type="button" className="clr" aria-label={t("shareSheet.clearSearch")} onClick={() => setQuery("")}><Icon name="x" /></button> : null}
          </label>

          {!query && recents.length ? (
            <div className="shs-recent" role="list">
              {recents.map((e) => {
                const on = selected.includes(e.conv);
                return (
                  <button key={e.conv} type="button" role="listitem" className={`shs-rc${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(e.conv)}>
                    <Avatar entry={e} size={variant === "android" ? 52 : 54} sel presence={false} />
                    <span>{e.kind === "channel" ? `#${e.name}` : M.firstName(e.name)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {variant === "ios" ? (
            <div className="shs-pad" style={{ paddingTop: 4, paddingBottom: 2 }}>
              <div className="shs-seg" role="tablist">
                {M.TABS.map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t(`shareSheet.tabs.${k}`)}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="shs-mchips" role="tablist">
              {M.TABS.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`shs-mchip${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
                  {tab === k ? <Icon name="check" /> : null}
                  {t(`shareSheet.tabs.${k}`)}
                </button>
              ))}
            </div>
          )}

          <List
            load={load}
            sections={sections}
            tab={tab}
            query={query}
            selected={selected}
            toggle={toggle}
            hasFiles={hasFiles}
            expanded={expanded}
            setExpanded={setExpanded}
            t={t}
            now={now}
            retry={loadTargets}
            openApp={() => host.openApp("descall://open")}
          />
        </div>

        {menu ? <div className="shs-scrim" onClick={() => setMenu(null)} /> : null}
        {menu === "quality" ? (
          <div className="shs-menu" role="menu" aria-label={t("shareSheet.quality.title")}>
            {M.QUALITIES.map((q) => (
              <button key={q} type="button" role="menuitemradio" aria-checked={quality === q} className={`shs-mi${quality === q ? " on" : ""}`} onClick={() => { setQuality(q); setMenu(null); }}>
                <Icon name={q === "original" ? "image" : q === "high" ? "spark" : "zap"} />
                <span className="shs-rt"><b>{t(`shareSheet.quality.${q}`)}</b><small>{t(`shareSheet.quality.${q}Desc`, { size: M.formatBytes(M.totals(sendable, q).chosen, intl) })}</small></span>
                {quality === q ? <span className="ck2"><Icon name="check" /></span> : null}
              </button>
            ))}
            {media ? (
              <>
                <div className="shs-msep" />
                <button type="button" role="menuitemcheckbox" aria-checked={strip} className="shs-mi" onClick={() => setStrip(!strip)}>
                  <Icon name="pinOff" />
                  <span className="shs-rt"><b>{t("shareSheet.location.title")}</b><small>{t("shareSheet.location.desc")}</small></span>
                  <span className={`shs-tg${strip ? " on" : ""}`} />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {menu === "schedule" ? (
          <div className="shs-menu" role="menu" aria-label={t("shareSheet.scheduleTitle")}>
            <div className="mh">{t("shareSheet.scheduleTitle")}</div>
            {M.schedulePresets(now()).map((p) => (
              <button key={p.key} type="button" role="menuitemradio" aria-checked={sendAt === p.at} className={`shs-mi${sendAt === p.at ? " on" : ""}`} onClick={() => { setSendAt(p.at); setMenu(null); }}>
                <Icon name="clock" />
                <span className="shs-rt"><b>{t(`shareSheet.schedule.${p.key}`)}</b><small>{scheduleText(p.at)}</small></span>
                {sendAt === p.at ? <span className="ck2"><Icon name="check" /></span> : null}
              </button>
            ))}
            <div className="shs-dt">
              <input type="datetime-local" aria-label={t("shareSheet.schedule.custom")} value={customAt} onChange={(e) => setCustomAt(e.target.value)} />
              <button type="button" className="shs-mini p" onClick={() => {
                const at = Date.parse(customAt);
                if (!M.validScheduleTime(at, now())) return say(t("shareSheet.schedule.invalid"));
                setSendAt(at);
                setMenu(null);
              }}>{t("shareSheet.schedule.set")}</button>
            </div>
            {sendAt ? (
              <>
                <div className="shs-msep" />
                <button type="button" className="shs-mi" onClick={() => { setSendAt(null); setMenu(null); }}>
                  <Icon name="send" />
                  <span className="shs-rt"><b>{t("shareSheet.schedule.now")}</b></span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="shs-foot" style={menu ? { zIndex: 28 } : undefined}>
          {menu ? null : (
            <label className="shs-field">
              <Icon name="msg" />
              <span className="shs-sr">{t("shareSheet.message")}</span>
              <textarea rows={1} value={message} maxLength={M.MAX_TEXT} placeholder={t("shareSheet.message")} onChange={(e) => { setMessage(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(92, e.target.scrollHeight)}px`; }} />
              {M.MAX_TEXT - message.length < 200 ? <span className="cnt shs-tnum">{M.MAX_TEXT - message.length}</span> : null}
            </label>
          )}
          {variant === "android" ? (
            <div className="shs-footrow">
              {chips}
              <button type="button" className="shs-fab" disabled={!count} onClick={submit}><Icon name="send" /><span>{ctaLabel}</span></button>
            </div>
          ) : (
            <>
              {chips}
              <button type="button" className="shs-cta" disabled={!count} onClick={submit}><Icon name="send" /><span>{ctaLabel}</span></button>
            </>
          )}
        </div>
      </div>
      {toast ? <div className="shs-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function Strip({ items, problems, linkMeta, onRemove, t, intl }) {
  if (!items.length) return null;
  return (
    <div className="shs-strip">
      {items.map((it) => {
        const k = M.kindOf(it);
        const bad = problems.get(it.id);
        const x = (
          <button type="button" className="x" aria-label={`${t("shareSheet.remove")} ${it.name || ""}`} onClick={() => onRemove(it.id)}><Icon name="x" /></button>
        );
        if (k === "link") {
          const meta = linkMeta[it.url] || {};
          let host = "";
          try { host = new URL(it.url).hostname.replace(/^www\./, ""); } catch { host = it.url; }
          const img = it.image || meta.image;
          return (
            <div key={it.id} className="shs-att link">
              <div className="lk-img" style={img ? { backgroundImage: `url("${img}")` } : undefined} />
              <div className="lk-t"><small>{meta.siteName || host}</small><b>{it.title || meta.title || it.url}</b></div>
              {x}
            </div>
          );
        }
        if (k === "text") return <div key={it.id} className="shs-att text">{it.text}{x}</div>;
        if (k === "file") {
          const ext = String(it.name || "").split(".").pop().toUpperCase().slice(0, 4);
          return (
            <div key={it.id} className={`shs-att file${bad ? " bad" : ""}`} title={bad ? t(`shareSheet.reason.${bad}`) : undefined}>
              <span className="shs-ftile"><Icon name="file" />{ext ? <em>{ext}</em> : null}</span>
              <span><b>{it.name}</b><small>{M.formatBytes(it.size || it.estimates?.original || 0, intl)}{it.pages ? ` · ${it.pages}` : ""}</small></span>
            </div>
          );
        }
        return (
          <div key={it.id} className={`shs-att${bad ? " bad" : ""}`} style={it.thumb ? { backgroundImage: `url("${it.thumb}")` } : undefined} title={bad ? t(`shareSheet.reason.${bad}`) : it.name}>
            {x}
            {k === "video" ? <span className="dur shs-tnum"><Icon name="play" />{M.formatDuration(it.durationMs)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function Row({ e, on, dis, sub = false, hasFiles, t, now, onToggle }) {
  const s = M.rowSubtitle(e, { hasFiles, now: now() });
  const presence = e.presence ? t(`shareSheet.presence.${e.presence}`) : "";
  const vars = { ...(s.vars || {}), presence };
  return (
    <button type="button" className={`shs-row${sub ? " sub" : ""}${on ? " on" : ""}${dis ? " dis" : ""}`} aria-pressed={on} aria-disabled={dis} onClick={() => onToggle(e.conv)}>
      <Avatar entry={e} size={sub ? 32 : 40} />
      <span className="shs-rt">
        <b>{e.kind === "channel" && !sub ? <>{e.name} <span className="mut">· {e.serverName}</span></> : e.name}</b>
        <small>{t(`shareSheet.${s.key}`, vars)}</small>
      </span>
      {dis ? <span className="shs-lockc"><Icon name="lock" /></span> : <span className="shs-chk"><Icon name="check" /></span>}
    </button>
  );
}

function List({ load, sections, tab, query, selected, toggle, hasFiles, expanded, setExpanded, t, now, retry, openApp }) {
  if (load === "signedout") {
    return (
      <div className="shs-empty">
        <b>{t("shareSheet.signedOutTitle")}</b>
        {t("shareSheet.signedOutBody")}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}><button type="button" className="shs-mini p" onClick={openApp}>{t("shareSheet.openApp")}</button></div>
      </div>
    );
  }
  if (load === "error") {
    const off = typeof navigator !== "undefined" && navigator.onLine === false;
    return (
      <div className="shs-empty">
        <b>{t("shareSheet.errorTitle")}</b>
        {off ? t("shareSheet.errorOffline") : null}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}><button type="button" className="shs-mini" onClick={retry}><Icon name="refresh" />{t("shareSheet.retry")}</button></div>
      </div>
    );
  }
  if (load === "loading") {
    return (
      <div aria-busy="true">
        <div className="shs-sec"><span className="shs-skel" style={{ width: 90 }} /></div>
        <div className="shs-grp">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="shs-row">
              <span className="shs-av" style={{ "--s": "40px", "--c": "#3a3d4d", opacity: 0.6 }} />
              <span className="shs-rt" style={{ gap: 6 }}><span className="shs-skel" style={{ width: `${60 - i * 8}%` }} /><span className="shs-skel" style={{ width: "34%", height: 10 }} /></span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (!sections.length) {
    return (
      <div className="shs-empty">
        {query ? <b>{t("shareSheet.emptySearch", { query })}</b> : (<><b>{t("shareSheet.emptyTitle")}</b>{t("shareSheet.emptyBody")}</>)}
      </div>
    );
  }
  if (tab === "servers") {
    return sections.map((sec, i) => {
      const s = sec.server;
      const open = query ? true : expanded == null ? i === 0 : expanded === s.id;
      const ok = sec.rows.filter((c) => M.targetVerdict(c, { hasFiles }).ok).length;
      return (
        <div key={sec.key}>
          <div className="shs-sec">{i === 0 || open ? s.name : null}{i === 0 || open ? <span className="cnt">{t("shareSheet.server.channels", { count: sec.rows.length })}</span> : null}</div>
          <div className="shs-grp">
            <button type="button" className="shs-row srvhead" aria-expanded={open} onClick={() => setExpanded(open ? "__none" : s.id)}>
              <Avatar entry={{ ...s, kind: "server" }} size={40} />
              <span className="shs-rt"><b>{s.name}</b><small>{ok ? t("shareSheet.server.sendable", { count: ok }) : t("shareSheet.server.none")}</small></span>
              <span className={`shs-chev${open ? " open" : ""}`}><Icon name={open ? "chevD" : "chevR"} /></span>
            </button>
            {open
              ? sec.rows.map((c) => (
                  <Row key={c.conv} e={c} sub on={selected.includes(c.conv)} dis={!M.targetVerdict(c, { hasFiles }).ok} hasFiles={hasFiles} t={t} now={now} onToggle={toggle} />
                ))
              : null}
          </div>
        </div>
      );
    });
  }
  return sections.map((sec) => (
    <div key={sec.key}>
      <div className="shs-sec">{t(`shareSheet.sec.${sec.key}`)}</div>
      <div className="shs-grp">
        {sec.rows.map((e) => (
          <Row key={e.conv} e={e} on={selected.includes(e.conv)} dis={!M.targetVerdict(e, { hasFiles }).ok} hasFiles={hasFiles} t={t} now={now} onToggle={toggle} />
        ))}
      </div>
    </div>
  ));
}
