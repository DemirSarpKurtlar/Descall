/**
 * Davet Merkezi (growth phase 4, owner pick 4A): the inviter's dashboard.
 *
 * Desktop (web, Electron, Tauri): personal funnel with sparklines, link + QR + channel-tagged
 * share buttons, milestones 3 / 10 / 25, the live friends table with "Dürt", the reward
 * wallet (countdown and "why is it waiting") and the invitee landing preview.
 * Phone (iOS / Android / mobile web): the draft's phone frame: ring to the next milestone,
 * link + five share buttons, the four-step mini funnel and the live list.
 * Data: GET /api/invites/me; live: "descall:invites-update" (InviteCenterHost relays the
 * socket events). Link opens are anonymous; nobody sees who opened a link.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/localeContextInstance.js";
import { useModalFocusRef } from "../../hooks/useModalFocus";
import { useToast } from "../../context/ToastContext";
import { getInviteDashboard, nudgeInvitee, readInviteNotices } from "../../api/invites.js";
import { copyText } from "../../lib/copyText.js";
import { draftKeyFor, writeDraft } from "../../lib/messageDrafts";
import { directPath } from "../../lib/appRoutes.js";
import {
  APP_OPEN_URL,
  INVITES_UPDATE_EVENT,
  channelBar,
  displayInviteUrl,
  filterFriends,
  friendCounts,
  inviteShortUrl,
  milestoneRing,
  whatsappShareUrl,
} from "../../lib/inviteShare.js";
import { BadgeArt, Brand, Dc, Ico, PAvatar, Pill, Ring, Seg, Spark, StageBar } from "./ui.jsx";
import { channelLabel, fmtCountdown, fmtNum, pctLabel, pctText, relTime } from "./format.js";
import InviteLandingView from "./InviteLandingView.jsx";

const CACHE_KEY = "descall:inviteCenter:last";

function readCache() {
  try {
    return JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}
function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, qrSvg: data.qrSvg || null }));
  } catch {
    /* quota */
  }
}

function openUrl(url) {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    /* shell may block */
  }
}

const SHARE_TINT = { wa: "#2DCB66", ig: "#D4366F", tt: "#25C4CE", qr: "#8FA6FF", link: "#8FA6FF", other: "#B5BCD6" };

function statusPill(f, t, nowLeft) {
  switch (f.status) {
    case "paid":
      return f.inviterSkip ? <Pill tone="ok" icon="check">{t("dvt.st.capped")}</Pill> : <Pill tone="ok" icon="check">{t("dvt.st.paid")}</Pill>;
    case "waiting_return":
      return nowLeft > 0 ? (
        <Pill tone="wa" icon="clock">{t("dvt.st.waitingReturn", { time: fmtCountdown(nowLeft, t) })}</Pill>
      ) : (
        <Pill tone="wa" icon="clock">{t("dvt.st.comeBack")}</Pill>
      );
    case "waiting_message":
      return <Pill>{t("dvt.st.waitingMessage")}</Pill>;
    case "reviewing":
      return <Pill tone="wa" icon="shield">{t("dvt.st.reviewing", { reason: t(`dvt.reason.${f.why || "review"}`) })}</Pill>;
    case "revoked":
      return <Pill tone="dg">{t("dvt.st.revoked")}</Pill>;
    case "expired":
      return <Pill>{t("dvt.st.expired")}</Pill>;
    case "denied":
      return <Pill tone="dg">{t("dvt.st.denied", { reason: t(`dvt.reason.${f.why || "other"}`) })}</Pill>;
    default:
      return null;
  }
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

function svgToPng(svg, size = 512) {
  return new Promise((resolve, reject) => {
    try {
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("png"))), "image/png");
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("svg"));
      };
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

export default function InviteCenter({ mobile = false, onClose, onNavigate, fetcher = getInviteDashboard, nudger = nudgeInvitee, initialData = null }) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [data, setData] = useState(() => initialData || readCache());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [state, setState] = useState(initialData ? "ready" : "loading");
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const [seg, setSeg] = useState("all");
  const [walletOpen, setWalletOpen] = useState(false);
  const [why, setWhy] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nudging, setNudging] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const now = useNow();
  const whyTrap = useModalFocusRef();
  const qrTrap = useModalFocusRef();
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const d = await fetcher();
      if (seq !== loadSeq.current) return;
      setData(d);
      setFetchedAt(Date.now());
      setState("ready");
      setOffline(false);
      writeCache(d);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      if (err?.code === "OFFLINE" || err?.status === 0 || (typeof navigator !== "undefined" && navigator.onLine === false)) setOffline(true);
      setState((s) => (s === "ready" || readCache() ? "ready" : "error"));
    }
  }, [fetcher]);

  useEffect(() => {
    if (!initialData) void load();
    let timer = null;
    const onUpdate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 400);
    };
    const onOnline = () => {
      setOffline(false);
      void load();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener(INVITES_UPDATE_EVENT, onUpdate);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(INVITES_UPDATE_EVENT, onUpdate);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [load, initialData]);

  const username = data?.username || "";
  const left = useCallback((ms) => (ms == null ? null : Math.max(0, ms - (now - fetchedAt))), [now, fetchedAt]);

  const copyLink = async () => {
    const ok = await copyText(inviteShortUrl(username));
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else toast(t("dvt.link.copyFailed"), "error");
  };

  const share = async (ch) => {
    if (!username) return;
    const url = inviteShortUrl(username, ch);
    const text = t("dvt.share.message");
    if (ch === "qr") {
      setQrOpen(true);
      return;
    }
    if (ch === "wa") {
      openUrl(whatsappShareUrl(text, url));
      return;
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function" && (mobile || ch === "other")) {
      try {
        await navigator.share({ title: t("dvt.share.title"), text, url });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    const ok = await copyText(`${text} ${url}`);
    if (!ok) {
      toast(t("dvt.link.copyFailed"), "error");
      return;
    }
    if (ch === "ig" || ch === "tt") {
      toast(t("dvt.share.copiedFor", { app: channelLabel(ch, t) }), "success");
      openUrl(APP_OPEN_URL[ch]);
    } else toast(t("dvt.link.copied"), "success");
  };

  const downloadQr = async () => {
    if (!data?.qrSvg) return;
    try {
      const png = await svgToPng(data.qrSvg, 768);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `descall-davet-${username}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      toast(t("dvt.link.copyFailed"), "error");
    }
  };

  const nudge = async (f) => {
    if (nudging) return;
    setNudging(f.id);
    try {
      const out = await nudger(f.id, { lang: locale });
      const friend = out.friend || f.user;
      writeDraft(draftKeyFor({ dmUserId: friend.id }), out.text);
      toast(t("dvt.nudgeDone"), "success");
      setData((d) => (d ? { ...d, friends: d.friends.map((x) => (x.id === f.id ? { ...x, canNudge: false, nudgedAt: new Date().toISOString() } : x)) } : d));
      onClose?.();
      onNavigate?.(directPath(friend));
    } catch (err) {
      toast(err?.code === "NUDGE_LIMIT" ? t("dvt.nudgeLimit") : t("dvt.nudgeFail"), "error");
    } finally {
      setNudging(null);
    }
  };

  const dismissNotice = async (id) => {
    setData((d) => (d ? { ...d, notices: (d.notices || []).filter((n) => n.id !== id) } : d));
    readInviteNotices([id]).catch(() => {});
  };

  const friends = data?.friends || [];
  const counts = useMemo(() => friendCounts(friends), [friends]);
  const shown = useMemo(() => filterFriends(friends, seg), [friends, seg]);
  const ring = useMemo(() => milestoneRing(data?.milestones), [data?.milestones]);
  const bar = useMemo(() => channelBar(data?.channels), [data?.channels]);

  if (state === "loading" && !data) {
    return (
      <div className={`dvt-center ${mobile ? "is-phone" : "is-desk"}`} aria-busy="true">
        <div className="dvt-skel" role="status">{t("dvt.loading")}</div>
      </div>
    );
  }
  if (state === "error" && !data) {
    return (
      <div className={`dvt-center ${mobile ? "is-phone" : "is-desk"}`}>
        <div className="dvt-errorbox" role="alert">
          <Ico name="alert" />
          <span>{t("dvt.loadError")}</span>
          <button type="button" className="dvt-btn p sm" onClick={() => void load()}>
            {t("dvt.retry")}
          </button>
        </div>
      </div>
    );
  }

  const f = data.funnel || { opened: 0, signedUp: 0, firstMessage: 0, active: 0, series: {}, rates: {} };
  const totals = data.totals || { earned: 0, pending: 0 };
  const rules = data.rules || { monthlyCap: 20 };
  const anon = data.anonymous || { opens: 0, byChannel: {} };
  const banners = (
    <>
      {offline ? (
        <div className="dvt-banner" role="status">
          <Ico name="globe" />
          {t("dvt.offline")}
        </div>
      ) : null}
      {data.paused ? (
        <div className="dvt-banner amb" role="status">
          <Ico name="pause" />
          {t("dvt.paused")}
        </div>
      ) : null}
      {(data.notices || []).map((n) => (
        <div key={n.id} className="dvt-banner" role="status">
          <Ico name="bell" />
          <span className="sp">{n.text}</span>
          <button type="button" className="dvt-btn xs" onClick={() => dismissNotice(n.id)}>
            {t("dvt.noticeOk")}
          </button>
        </div>
      ))}
    </>
  );

  const walletChip = (
    <button type="button" className="dvt-gl dvt-wallet-chip" aria-haspopup="dialog" aria-expanded={walletOpen} onClick={() => setWalletOpen((v) => !v)} data-testid="dvt-wallet-chip">
      <span className="dvt-col">
        <small>{t("dvt.earned")}</small>
        <Dc amount={totals.earned} locale={locale} />
      </span>
      <span className="dvt-vsep" aria-hidden="true" />
      <span className="dvt-col">
        <small>{t("dvt.pending")}</small>
        <span className="dvt-dc wat">
          <Ico name="clock" />
          {fmtNum(totals.pending, locale)}
        </span>
      </span>
    </button>
  );

  const wallet = walletOpen ? (
    <WalletPopover data={data} t={t} locale={locale} left={left} mobile={mobile} onClose={() => setWalletOpen(false)} onWhy={(w) => setWhy(w)} />
  ) : null;

  const whyPop = why ? (
    <div className="dvt-modal-scrim" onClick={() => setWhy(null)} role="presentation">
      <div ref={whyTrap} className="dvt-opq dvt-why" role="dialog" aria-modal="true" aria-labelledby="dvt-why-t" onClick={(e) => e.stopPropagation()}>
        <div className="dvt-h" id="dvt-why-t">
          <Ico name="shield" className="brt" />
          {t("dvt.why.title")}
        </div>
        <p>{t(`dvt.why.${whyKey(why)}`)}</p>
        <button type="button" className="dvt-btn sm" onClick={() => setWhy(null)}>
          {t("dvt.close")}
        </button>
      </div>
    </div>
  ) : null;

  const qr = qrOpen ? (
    <div className="dvt-modal-scrim" onClick={() => setQrOpen(false)} role="presentation">
      <div ref={qrTrap} className="dvt-opq dvt-qrsheet" role="dialog" aria-modal="true" aria-labelledby="dvt-qr-t" onClick={(e) => e.stopPropagation()}>
        <div className="dvt-h" id="dvt-qr-t">
          <Ico name="qr" className="brt" />
          {t("dvt.qr.title")}
        </div>
        {/* QR SVG comes from our own backend (qrcode library output), not user content. */}
        <div className="dvt-qr big" dangerouslySetInnerHTML={{ __html: data.qrSvg || "" }} />
        <p className="mu">{t("dvt.qr.body")}</p>
        <div className="dvt-row">
          <button type="button" className="dvt-btn g" onClick={() => setQrOpen(false)}>
            {t("dvt.close")}
          </button>
          <span className="sp" />
          <button type="button" className="dvt-btn p" onClick={downloadQr}>
            <Ico name="dl" />
            {t("dvt.qr.download")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const preview = previewOpen ? (
    <LandingPreview data={data} t={t} onClose={() => setPreviewOpen(false)} />
  ) : null;

  const shareTiles = (list, big) => (
    <div className={`dvt-shr ${big ? "big" : ""}`}>
      {list.map((ch) => (
        <button key={ch} type="button" className="dvt-sh" onClick={() => void share(ch)} data-testid={`dvt-share-${ch}`}>
          <span className={`dvt-t ${ch}`}>{["wa", "ig", "tt"].includes(ch) ? <Brand name={ch} /> : <Ico name={ch === "qr" ? "qr" : "share"} />}</span>
          {channelLabel(ch, t)}
        </button>
      ))}
    </div>
  );

  if (mobile) {
    const next = ring.next;
    const kind = next?.kind || "frame";
    const kindKey = kind === "badge" ? "Badge" : kind === "banner" ? "Banner" : "Frame";
    const activeFriends = friends.filter((x) => x.status === "paid").slice(0, 6);
    const list = (showAll ? friends : friends.slice(0, 3));
    return (
      <div className="dvt-center is-phone" data-testid="dvt-center">
        <div className="dvt-pnav">
          {onClose ? (
            <button type="button" className="dvt-bk" onClick={onClose} aria-label={t("dvt.close")}>
              <Ico name="chl" />
            </button>
          ) : null}
          <h2 className="sp">{t("dvt.phoneTitle")}</h2>
          {walletChip}
        </div>
        {wallet}
        {banners}
        <div className="dvt-pg dvt-row dvt-ringcard">
          <Ring count={ring.count} target={ring.target} pct={ring.pct} />
          <div className="dvt-col sp" style={{ gap: 6 }}>
            <b className="dvt-ringtitle">
              {ring.done ? t("dvt.ms.ringDone") : t(`dvt.ms.ring${kindKey}`, { n: Math.max(0, ring.target - ring.count) })}
            </b>
            <span className="mu">
              {ring.done ? t("dvt.ms.ringDoneSub", { n: ring.count }) : t(`dvt.ms.ringSub${kindKey}`, { amount: fmtNum(next?.amount || 0, locale) })}
            </span>
            {activeFriends.length ? (
              <div className="dvt-avs">
                {activeFriends.map((x) => (
                  <PAvatar key={x.id} user={x.user} size={22} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="dvt-pg dvt-col" style={{ padding: 14, gap: 12 }}>
          <div className="dvt-row">
            <div className="dvt-fld sp big">
              <Ico name="link" className="brt" />
              <span className="ell strong">{displayInviteUrl(username)}</span>
            </div>
            <button type="button" className="dvt-btn p big" onClick={copyLink} data-testid="dvt-copy">
              <Ico name={copied ? "check" : "copy"} />
              {copied ? t("dvt.link.copied") : t("dvt.link.copy")}
            </button>
          </div>
          {shareTiles(["wa", "ig", "tt", "qr", "other"], true)}
        </div>
        <div className="dvt-pg dvt-pfunnel">
          {[
            ["opened", f.opened],
            ["signedUp", f.signedUp],
            ["firstMessage", f.firstMessage],
            ["active", f.active],
          ].map(([k, v], i) => (
            <span key={k} className="dvt-pfstep">
              {i ? <Ico name="chr" className="mu4" /> : null}
              <span className="dvt-col">
                <b className={`n ${k === "active" ? "okt" : ""}`}>{fmtNum(v, locale)}</b>
                <small className="mu">{t(`dvt.funnel.${k}`)}</small>
              </span>
            </span>
          ))}
        </div>
        <div className="dvt-pg dvt-col dvt-plive">
          <div className="dvt-row" style={{ padding: "2px 2px 6px" }}>
            <b>{t("dvt.live.title")}</b>
            <span className="dvt-live">{t("dvt.live.badge")}</span>
            <span className="sp" />
            {friends.length > 3 ? (
              <button type="button" className="brt dvt-link" onClick={() => setShowAll((v) => !v)}>
                {t("dvt.live.allN", { n: friends.length })}
              </button>
            ) : null}
          </div>
          {!friends.length ? (
            <div className="dvt-empty">
              <b>{t("dvt.empty.title")}</b>
              <span>{t("dvt.empty.body")}</span>
            </div>
          ) : (
            list.map((x) => (
              <div key={x.id} className="dvt-prow">
                <PAvatar user={x.user} size={34} online={x.online} />
                <div className="dvt-col sp">
                  <b className="ell">{x.user.displayName || x.user.username}</b>
                  {x.status === "waiting_message" ? (
                    <small className="mu">{t("dvt.st.signedNoMsg")}</small>
                  ) : x.status === "paid" ? (
                    <small className="okt">{t("dvt.st.paidLong")}</small>
                  ) : x.status === "reviewing" ? (
                    <small className="wat">{t("dvt.st.reviewing", { reason: t(`dvt.reason.${x.why || "review"}`) })}</small>
                  ) : (
                    <StageBar stage={x.stage} waiting={x.waiting} status={x.status} label={`${x.stage}/4`} />
                  )}
                </div>
                {x.canNudge ? (
                  <button type="button" className="dvt-btn p sm" disabled={nudging === x.id} onClick={() => void nudge(x)}>
                    <Ico name="bell" />
                    {t("dvt.nudge")}
                  </button>
                ) : x.status === "paid" ? (
                  <Dc amount={x.reward} tone="okt" sign size="l" locale={locale} />
                ) : x.status === "waiting_return" ? (
                  <Pill tone="wa" icon="clock">{left(x.countdownMs) > 0 ? fmtCountdown(left(x.countdownMs), t) : t("dvt.wel.now")}</Pill>
                ) : x.status === "reviewing" ? (
                  <button type="button" className="dvt-btn xs" onClick={() => setWhy(x)}>{t("dvt.why.button")}</button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <button type="button" className="dvt-foot dvt-link" onClick={() => setPreviewOpen(true)}>
          <Ico name="gift" />
          <span className="sp">{t("dvt.footRule", { cap: rules.monthlyCap })}</span>
          <span className="brt">{t("dvt.footPreview")} ›</span>
        </button>
        {whyPop}
        {qr}
        {preview}
      </div>
    );
  }

  const ms = data.milestones || { count: 0, list: [] };
  const msNext = ms.list.find((m) => !m.reached);
  const msTarget = msNext ? msNext.at : ms.list[ms.list.length - 1]?.at || 0;
  return (
    <div className="dvt-center is-desk" data-testid="dvt-center">
      <div className="dvt-ph1">
        <div className="sp">
          <h2>{t("dvt.title")}</h2>
          <p>{t("dvt.subtitle")}</p>
        </div>
        {walletChip}
        {onClose ? (
          <button type="button" className="dvt-btn ic g" onClick={onClose} aria-label={t("dvt.close")}>
            <Ico name="x" />
          </button>
        ) : null}
      </div>
      {wallet}
      {banners}
      <div className="dvt-kpis four">
        <Kpi icon="eye" label={t("dvt.kpi.opened")} value={fmtNum(f.opened, locale)} em={t("dvt.kpi.today", { n: f.openedToday || 0 })} up={(f.openedToday || 0) > 0} series={f.series?.opened} />
        <Kpi icon="uplus" label={t("dvt.kpi.signedUp")} value={fmtNum(f.signedUp, locale)} em={t("dvt.kpi.ofOpens", { pct: pctText(f.rates?.signup, locale) })} series={f.series?.signedUp} />
        <Kpi icon="msg" label={t("dvt.kpi.firstMessage")} value={fmtNum(f.firstMessage, locale)} em={t("dvt.kpi.ofSignups", { pct: pctText(f.rates?.firstMessage, locale) })} series={f.series?.firstMessage} />
        <Kpi icon="check" label={t("dvt.kpi.active")} value={fmtNum(f.active, locale)} em={t("dvt.kpi.reward", { pct: pctText(f.rates?.active, locale) })} up series={f.series?.active} color="#4BE07A" hl />
      </div>
      <div className="dvt-mid">
        <section className="dvt-gl dvt-card">
          <div className="dvt-h">
            <Ico name="link" className="brt" />
            {t("dvt.link.title")}
            <span className="r">
              <Pill tone="tl">{t("dvt.link.tagged")}</Pill>
            </span>
          </div>
          <div className="dvt-row dvt-linkrow">
            <div className="dvt-col sp" style={{ gap: 10 }}>
              <div className="dvt-row">
                <div className="dvt-fld sp">
                  <span className="ell strong">{displayInviteUrl(username)}</span>
                </div>
                <button type="button" className="dvt-btn p sm tall" onClick={copyLink} data-testid="dvt-copy">
                  <Ico name={copied ? "check" : "copy"} />
                  {copied ? t("dvt.link.copied") : t("dvt.link.copy")}
                </button>
              </div>
              {shareTiles(["wa", "ig", "tt", "other"], false)}
            </div>
            <button type="button" className="dvt-col dvt-qrcol" onClick={downloadQr} aria-label={t("dvt.link.qrDownload")}>
              {/* QR SVG from our backend (qrcode library), not user content. */}
              <span className="dvt-qr" dangerouslySetInnerHTML={{ __html: data.qrSvg || "" }} />
              <span className="mu small">
                <Ico name="dl" />
                {t("dvt.link.qrDownload")}
              </span>
            </button>
          </div>
          <div className="dvt-col" style={{ gap: 5 }}>
            <div className="dvt-row small nowrap">
              <span className="mu">{t("dvt.link.bringing")}</span>
              <span className="sp" />
              {bar.length ? (
                bar.map((b) => (
                  <span key={b.channel} className={`dvt-chtxt ${b.channel}`}>
                    {channelLabel(b.channel, t)} {pctLabel(b.pct, locale)}
                  </span>
                ))
              ) : (
                <span className="mu4">{t("dvt.link.none")}</span>
              )}
            </div>
            <div className="dvt-chbar">
              {bar.length ? bar.map((b) => <i key={b.channel} style={{ flex: b.pct, background: SHARE_TINT[b.channel] }} />) : <i style={{ flex: 1 }} />}
            </div>
          </div>
        </section>
        <section className="dvt-gl dvt-card tight">
          <div className="dvt-h">
            <Ico name="trophy" className="gdt" />
            {t("dvt.ms.title")}
            <span className="r num">
              {ms.count} <span className="mu4">/ {msTarget}</span>
            </span>
          </div>
          <div className="dvt-bar gd">
            <i style={{ width: `${Math.round(ring.pct * 100)}%` }} />
          </div>
          {ms.list.map((m) => (
            <div key={m.at} className="dvt-row dvt-msrow">
              {m.kind === "badge" ? <BadgeArt size={28} /> : m.kind === "frame" ? <span className="dvt-frameart" aria-hidden="true">{(data.displayName || "?").slice(0, 1).toUpperCase()}</span> : <span className="dvt-bannerart" aria-hidden="true" />}
              <div className="sp">
                <b>
                  {m.at} · {t(`dvt.ms.${m.kind}`)}
                </b>
                <small className="mu">{t(`dvt.ms.${m.kind}Sub`, { amount: fmtNum(m.amount, locale) })}</small>
              </div>
              {m.claimed || m.reached ? (
                <Pill tone="ok" icon="check">{t("dvt.ms.got")}</Pill>
              ) : m === msNext ? (
                <Pill tone="br">{t("dvt.ms.left", { n: m.left })}</Pill>
              ) : (
                <Pill icon="lock">{m.left}</Pill>
              )}
            </div>
          ))}
        </section>
      </div>
      <section className="dvt-gl dvt-livecard">
        <div className="dvt-h">
          <Ico name="users" className="brt" />
          {t("dvt.live.title")}
          <span className="dvt-live">{t("dvt.live.badge")}</span>
          <span className="r">
            <Seg
              label={t("dvt.live.title")}
              value={seg}
              onChange={setSeg}
              items={[
                { id: "all", label: t("dvt.live.all"), count: counts.all },
                { id: "pending", label: t("dvt.live.pending"), count: counts.pending },
                { id: "active", label: t("dvt.live.active"), count: counts.active },
                { id: "review", label: t("dvt.live.review"), count: counts.review },
              ]}
            />
          </span>
        </div>
        <div className="dvt-tbl" role="table" aria-label={t("dvt.live.title")}>
          <div className="dvt-tr th" role="row">
            <span role="columnheader">{t("dvt.live.colFriend")}</span>
            <span role="columnheader">{t("dvt.live.colStage")}</span>
            <span role="columnheader">{t("dvt.live.colStatus")}</span>
            <span role="columnheader">{t("dvt.live.colReward")}</span>
            <span />
          </div>
          <div className="dvt-tbody">
            {!friends.length && !anon.opens ? (
              <div className="dvt-empty">
                <b>{t("dvt.empty.title")}</b>
                <span>{t("dvt.empty.body")}</span>
              </div>
            ) : !shown.length && seg !== "all" ? (
              <div className="dvt-empty">
                <span>{t("dvt.live.empty")}</span>
              </div>
            ) : null}
            {shown.map((x) => (
              <div key={x.id} className="dvt-tr" role="row" data-testid="dvt-friend">
                <span className="nm" role="cell">
                  <PAvatar user={x.user} size={22} online={x.online} />
                  <span className="ell">
                    <b>{x.user.displayName || x.user.username}</b>
                    <small>{t("dvt.via", { channel: channelLabel(x.channel || "link", t), time: relTime(x.signupAt, locale, now) })}</small>
                  </span>
                </span>
                <span className="dvt-row" role="cell">
                  <StageBar stage={x.stage} waiting={x.waiting} status={x.status} label={`${x.status === "paid" ? 4 : x.stage}/4`} />
                  <small className="mu">{x.status === "paid" ? 4 : x.stage}/4</small>
                </span>
                <span role="cell">{statusPill(x, t, left(x.countdownMs))}</span>
                <span role="cell">
                  {x.rewardPaid ? (
                    <Dc amount={x.reward} tone="okt" sign locale={locale} />
                  ) : x.status === "reviewing" ? (
                    <Dc amount={x.reward} tone="mu4" gray locale={locale} />
                  ) : ["revoked", "expired", "denied"].includes(x.status) ? (
                    <span className="mu4">-</span>
                  ) : (
                    <Dc amount={x.reward} tone="mu" locale={locale} />
                  )}
                </span>
                <span role="cell">
                  {x.canNudge ? (
                    <button type="button" className="dvt-btn xs p" disabled={nudging === x.id} onClick={() => void nudge(x)} data-testid="dvt-nudge">
                      <Ico name="bell" />
                      {t("dvt.nudge")}
                    </button>
                  ) : x.status === "reviewing" || x.status === "waiting_return" || x.status === "waiting_message" ? (
                    x.status === "reviewing" ? (
                      <button type="button" className="dvt-btn xs" onClick={() => setWhy(x)} data-testid="dvt-why">
                        {t("dvt.why.button")}
                      </button>
                    ) : null
                  ) : null}
                </span>
              </div>
            ))}
            {seg === "all" && anon.opens > 0 ? (
              <div className="dvt-tr" role="row">
                <span className="nm" role="cell">
                  <span className="dvt-ib mu small">
                    <Ico name="eye" />
                  </span>
                  <span className="ell">
                    <b>{t("dvt.anonTitle", { n: anon.opens })}</b>
                    <small>{t("dvt.anonSub")}</small>
                  </span>
                </span>
                <span className="dvt-row" role="cell">
                  <StageBar stage={1} label="1/4" />
                  <small className="mu">1/4</small>
                </span>
                <span className="mu small" role="cell">
                  {Object.entries(anon.byChannel || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, n]) => `${channelLabel(c, t)} ${n}`)
                    .join(" · ")}
                </span>
                <span className="mu4" role="cell">-</span>
                <span />
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <div className="dvt-row dvt-footline">
        <Ico name="gift" />
        <span>{t("dvt.footRule", { cap: rules.monthlyCap })}</span>
        <span className="sp" />
        <button type="button" className="brt dvt-link strong" onClick={() => setPreviewOpen(true)} data-testid="dvt-preview">
          {t("dvt.footPreview")} ›
        </button>
      </div>
      {whyPop}
      {qr}
      {preview}
    </div>
  );
}

function whyKey(row) {
  if (row.status === "waiting_message") return "first_message";
  if (row.status === "waiting_return") return row.why === "come_back" ? "come_back" : "next_day";
  const k = row.why || row.holdReason || "review";
  return ["same_device", "inviter_device", "fast_first_message", "anomaly"].includes(k) ? k : "review";
}

function Kpi({ icon, label, value, em, up = false, series, color = "#8FA6FF", hl = false }) {
  return (
    <div className={`dvt-kp dvt-gl ${hl ? "hl" : ""}`.trim()}>
      <small>
        <Ico name={icon} />
        {label}
      </small>
      <div className="dvt-row">
        <b>{value}</b>
        <em className={up ? "up" : ""}>{em}</em>
      </div>
      <Spark values={series} color={color} />
    </div>
  );
}

function WalletPopover({ data, t, locale, left, mobile, onClose, onWhy }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.(".dvt-wallet-chip")) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  const list = data.wallet || [];
  return (
    <div ref={ref} className={`dvt-opq dvt-walletpop ${mobile ? "is-phone" : ""}`} role="dialog" aria-label={t("dvt.wallet.title")} data-testid="dvt-wallet">
      <div className="dvt-h">
        <Ico name="gift" className="gdt" />
        {t("dvt.wallet.title")}
        <span className="r mu small">{t("dvt.wallet.month", { paid: data.month?.paid || 0, cap: data.month?.cap ?? 20 })}</span>
      </div>
      {!list.length ? <p className="mu small">{t("dvt.wallet.empty")}</p> : null}
      {list.map((w) => {
        const ms = left(w.countdownMs);
        const line =
          w.status === "reviewing"
            ? t("dvt.wallet.review", { reason: t(`dvt.reason.${w.why || "review"}`) })
            : w.status === "waiting_message"
              ? t("dvt.wallet.waitMessage")
              : ms > 0
                ? t("dvt.wallet.opensIn", { time: fmtCountdown(ms, t) })
                : t("dvt.wallet.opensOnVisit");
        return (
          <div key={w.id} className="dvt-row dvt-wrow">
            <PAvatar user={w.user} size={26} />
            <div className="dvt-col sp">
              <b className="ell">{w.user?.displayName || w.user?.username || "?"}</b>
              <small className={w.status === "reviewing" ? "wat" : "mu"}>{line}</small>
            </div>
            <Dc amount={w.amount} tone="mu" locale={locale} />
            <button type="button" className="dvt-btn xs" onClick={() => onWhy({ status: w.status, why: w.why })}>
              {t("dvt.why.button")}
            </button>
          </div>
        );
      })}
      <small className="mu4">{t("dvt.wallet.earnedNote")}</small>
    </div>
  );
}

function LandingPreview({ data, t, onClose }) {
  const [device, setDevice] = useState("desk");
  const ref = useModalFocusRef();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sample = {
    inviter: { username: data.username, displayName: data.displayName || data.username, avatarUrl: data.avatarUrl || null, online: "online", activity: null },
    paused: Boolean(data.paused),
    gifts: { inviteeReward: data.paused ? 0 : data.rules?.inviteeReward ?? 50, inviterReward: data.rules?.inviterReward ?? 100, badge: true, friendship: true },
  };
  return (
    <div className="dvt-modal-scrim" onClick={onClose} role="presentation">
      <div ref={ref} tabIndex={-1} className="dvt-opq dvt-previewwin" role="dialog" aria-modal="true" aria-labelledby="dvt-pv-t" onClick={(e) => e.stopPropagation()} data-testid="dvt-preview-win">
        <div className="dvt-row">
          <div className="dvt-h sp" id="dvt-pv-t">
            <Ico name="eye" className="brt" />
            {t("dvt.preview.title")}
          </div>
          <Seg
            label={t("dvt.preview.title")}
            value={device}
            onChange={setDevice}
            items={[
              { id: "desk", label: t("dvt.preview.device") },
              { id: "phone", label: t("dvt.preview.phone") },
            ]}
          />
          <button type="button" className="dvt-btn ic g" onClick={onClose} aria-label={t("dvt.close")}>
            <Ico name="x" />
          </button>
        </div>
        <p className="mu small">{t("dvt.preview.note")}</p>
        <div className={`dvt-preview-frame ${device}`}>
          <InviteLandingView data={sample} preview phone={device === "phone"} />
        </div>
      </div>
    </div>
  );
}
