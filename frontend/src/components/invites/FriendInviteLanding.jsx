/**
 * descall.com/r/<username>[?k=wa|ig|tt|qr|other]: the personal invite landing (4A, section 2).
 * Logged out: counts one anonymous open (POST /api/invites/open), keeps the invite and its
 * channel for the sign-up (lib/inviteShare.js rememberInviteOpen + lib/referral.js), then
 * hands off to the existing sign-up flows (email / Google / Apple). Logged in: a short
 * "you are already here" card. Invalid link: a friendly card back to Descall.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/localeContextInstance.js";
import { getInviteLanding, recordInviteOpen } from "../../api/invites.js";
import { channelFromSearch, peekInviteOpen, rememberInviteOpen } from "../../lib/inviteShare.js";
import InviteLandingView from "./InviteLandingView.jsx";
import { Ico } from "./ui.jsx";
import "../../styles/invites.css";

const OPENED_KEY = "descall:inviteOpened";

function visitorKey() {
  try {
    let v = localStorage.getItem("descall:visitor");
    if (!v) {
      v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("descall:visitor", v);
    }
    return v;
  } catch {
    return "";
  }
}

function isPhoneWidth() {
  try {
    return window.matchMedia("(max-width: 760px)").matches;
  } catch {
    return false;
  }
}

export default function FriendInviteLanding({ username, search = "", me = null, onSignup, onLogin, onDismiss, appleAvailable = true }) {
  const { t } = useLocale();
  const channel = useMemo(() => channelFromSearch(search), [search]);
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [phone, setPhone] = useState(isPhoneWidth);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onResize = () => setPhone(isPhoneWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState("loading");
    getInviteLanding(username, { signal: ctrl.signal })
      .then((d) => {
        setData(d);
        setState("ready");
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setState(err?.status === 404 || err?.code === "INVITE_NOT_FOUND" ? "missing" : "error");
      });
    return () => ctrl.abort();
  }, [username]);

  // One anonymous open per visitor per inviter per tab session; remembered for sign-up.
  useEffect(() => {
    if (state !== "ready" || me) return;
    const key = `${OPENED_KEY}:${String(username).toLowerCase()}:${channel}`;
    let already = false;
    try {
      already = sessionStorage.getItem(key) === "1";
    } catch {
      already = false;
    }
    rememberInviteOpen({ username: data?.inviter?.username || username, channel, openId: peekInviteOpen()?.openId || null });
    if (already) return;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    recordInviteOpen({ username, channel, visitor: visitorKey() })
      .then((out) => {
        if (out?.openId) rememberInviteOpen({ username: data?.inviter?.username || username, channel, openId: out.openId });
      })
      .catch(() => {});
  }, [state, me, username, channel, data]);

  const start = (method, extra = {}) => {
    if (busy) return;
    setBusy(true);
    rememberInviteOpen({ username: data?.inviter?.username || username, channel, openId: peekInviteOpen()?.openId || null });
    try {
      if (extra.email) sessionStorage.setItem("descall:inviteEmail", extra.email);
    } catch {
      /* ignore */
    }
    try {
      onSignup?.(method, extra);
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  };

  if (state === "loading") {
    return (
      <div className="dvt-land-page">
        <div className="dvt-skel" role="status">{t("dvt.loading")}</div>
      </div>
    );
  }

  if (state === "missing" || state === "error") {
    return (
      <div className="dvt-land-page">
        <div className="dvt-opq dvt-land-card" role="alert">
          <Ico name="link" className="brt" />
          <b>{state === "missing" ? t("dvt.land.notFound") : t("dvt.loadError")}</b>
          <div className="dvt-row">
            {state === "error" ? (
              <button type="button" className="dvt-btn" onClick={() => window.location.reload()}>
                {t("dvt.retry")}
              </button>
            ) : null}
            <button type="button" className="dvt-btn p" onClick={() => onDismiss?.()}>
              {t("dvt.land.notFoundCta")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (me) {
    return (
      <div className="dvt-land-page">
        <div className="dvt-opq dvt-land-card">
          <Ico name="check" className="okt" />
          <b>{t("dvt.land.signedIn")}</b>
          <button type="button" className="dvt-btn p" onClick={() => onDismiss?.()}>
            {t("dvt.land.signedInCta")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dvt-land-page">
      <InviteLandingView
        data={data}
        phone={phone}
        busy={busy}
        appleAvailable={appleAvailable}
        onGoogle={() => start("google")}
        onApple={() => start("apple")}
        onEmail={(email) => start("email", { email })}
        onLogin={() => onLogin?.()}
      />
    </div>
  );
}
