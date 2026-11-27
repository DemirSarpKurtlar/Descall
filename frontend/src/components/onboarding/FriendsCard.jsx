/**
 * "Arkadaşlarını bul" + "Davet edenin köşesi" (draft 2A). Desktop: a card on the dashboard.
 * Phone: a section on top of the Friends tab (variant="page").
 *   - Who invited you comes first with a ready, editable "Selam ver" (a real DM).
 *   - Others who came with the same invite, with "Ekle" (a friend request).
 *   - Your personal invite link: copy, share (native sheet when there is one), QR, and a live
 *     preview of what your friend will see.
 * Contacts matching is not offered: the app has no contacts permission flow yet.
 */
import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { Avatar, Coin } from "./parts";
import { buildFriendInviteUrl } from "../../lib/referral";
import { getInviteQr } from "../../api/onboarding";
import { Check, Copy, HandWaving, Link, MessageSquare, QrCode, Send, Share, UserPlus, X, Lock } from "../ui/Icon.jsx";

function prettyUrl(url) {
  return String(url || "").replace(/^https?:\/\//, "");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function QrDialog({ onClose }) {
  const t = useT();
  const [qr, setQr] = useState({ state: "loading" });
  useEffect(() => {
    let alive = true;
    getInviteQr()
      .then((r) => alive && setQr({ state: "ready", ...r }))
      .catch(() => alive && setQr({ state: "error" }));
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="onb onb-qr-pop" role="dialog" aria-modal="true" aria-label={t("onb.friends.qrTitle")} onClick={onClose}>
      <div className="onb-qr-card" onClick={(e) => e.stopPropagation()}>
        <b style={{ fontSize: 16 }}>{t("onb.friends.qrTitle")}</b>
        {qr.state === "ready" ? (
          // The SVG comes from our own server (qrcode library output), never from user input.
          <div className="code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
        ) : qr.state === "error" ? (
          <p className="onb-muted">{t("onb.friends.qrError")}</p>
        ) : (
          <div className="onb-skel" style={{ height: 240 }} />
        )}
        <span className="onb-muted" style={{ fontSize: 12.5 }}>{t("onb.friends.qrHint")}</span>
        <button type="button" className="onb-btn gh" onClick={onClose}><X size={14} />{t("onb.preview.close")}</button>
      </div>
    </div>
  );
}

function useInvite() {
  const o = useOnboarding();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const username = o?.data?.me?.username || o?.me?.username || "";
  const url = buildFriendInviteUrl(username);
  const copy = async () => {
    const ok = await copyText(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      void o?.event("onboarding_invite_shared", { slot: "invite" });
    } else {
      o?.pushToast({ kind: "error", text: t("onb.friends.copyFail") });
    }
  };
  const share = async () => {
    const text = t("onb.friends.shareText", { name: o?.myName || username });
    if (navigator.share) {
      try {
        await navigator.share({ title: "Descall", text, url });
        void o?.event("onboarding_invite_shared", { slot: "invite" });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    await copy();
  };
  return { url, copied, copy, share, qr, setQr };
}

function GreetRow({ inviter, page }) {
  const t = useT();
  const o = useOnboarding();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const name = inviter.displayName || inviter.username;
  const start = () => {
    setText(t("onb.friends.greetText", { name }));
    setOpen(true);
  };
  const send = async () => {
    const ok = await o.greet(inviter, text);
    if (ok) {
      setSent(true);
      setOpen(false);
    }
  };
  const sub = inviter.server
    ? t("onb.friends.viaServer", { server: inviter.server.name })
    : inviter.friend === "friend"
      ? t("onb.friends.becameFriends")
      : t("onb.friends.viaLink");
  return (
    <div className="onb-greet">
      <div className={page ? "onb-gl onb-inv-hero is-hl" : "onb-frow"}>
        <Avatar name={name} src={inviter.avatarUrl} size={page ? 44 : 28} online={inviter.online} toneKey={inviter.id} />
        <div>
          <b>{t("onb.friends.invitedYou", { name })}</b>
          <small>
            {sub}
            {inviter.online ? <> · {t("onb.friends.onlineNow")}</> : null}
          </small>
        </div>
        {sent ? (
          <button type="button" className="onb-btn ok sm" onClick={() => o.openDm?.(inviter)}>
            <Check size={13} />
            {t("onb.friends.openChat")}
          </button>
        ) : (
          <button type="button" className="onb-btn pri sm" onClick={start} aria-expanded={open}>
            <HandWaving size={14} />
            {page ? t("onb.friends.greetShort") : t("onb.friends.greet")}
          </button>
        )}
      </div>
      {open ? (
        <div className="onb-greet">
          <label className="onb-sr" htmlFor={`onb-greet-${inviter.id}`}>{t("onb.friends.greetLabel", { name })}</label>
          <textarea id={`onb-greet-${inviter.id}`} className="onb-ta" rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" className="onb-btn gh sm" onClick={() => setOpen(false)}>{t("onb.cancel")}</button>
            <button type="button" className="onb-btn pri sm" onClick={() => void send()} disabled={!text.trim()}>
              <Send size={13} />
              {t("onb.friends.send")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PeerButton({ p }) {
  const t = useT();
  const o = useOnboarding();
  const state = o.friendReq[p.id] || p.friend;
  if (state === "friend") return <span className="onb-pill ok">{t("onb.friends.friend")}</span>;
  if (state === "requested") return <span className="onb-pill ok">{t("onb.friends.requested")}</span>;
  if (state === "incoming") return <span className="onb-pill br">{t("onb.friends.incoming")}</span>;
  return (
    <button type="button" className="onb-btn gh sm" onClick={() => void o.addFriend(p)} disabled={state === "sending"}>
      <UserPlus size={13} />
      {t("onb.friends.add")}
    </button>
  );
}

/** Desktop card on the dashboard. */
export default function FriendsCard() {
  const t = useT();
  const o = useOnboarding();
  const inv = useInvite();
  if (!o) return null;
  const d = o.data || {};
  const friendStep = d.checklist?.items?.find((i) => i.id === "friend");
  const peers = d.sameInvite || [];
  return (
    <div className="onb-gl onb-fr">
      <div className="row1">
        <b>{t("onb.friends.title")}</b>
        {friendStep && !friendStep.done ? (
          <span className="onb-pill gd" style={{ marginLeft: "auto" }}><Coin size={11} />+{friendStep.reward}</span>
        ) : friendStep?.done ? (
          <span className="onb-pill ok" style={{ marginLeft: "auto" }}><Check size={11} />{t("onb.friends.done")}</span>
        ) : null}
      </div>
      {d.inviter ? <GreetRow inviter={d.inviter} /> : null}
      {peers.length ? (
        <div className="onb-frow">
          <span className="onb-stack">
            {peers.slice(0, 2).map((p) => <Avatar key={p.id} name={p.displayName || p.username} src={p.avatarUrl} size={24} toneKey={p.id} />)}
          </span>
          <div>
            <b>{t("onb.friends.sameInvite", { n: d.sameInviteCount || peers.length })}</b>
            <small>{peers.map((p) => p.displayName || p.username).join(", ")} · {t("onb.friends.recent")}</small>
          </div>
          {peers.length === 1 ? <PeerButton p={peers[0]} /> : (
            <button type="button" className="onb-btn gh sm" onClick={() => peers.filter((p) => !(o.friendReq[p.id] || p.friend)).forEach((p) => void o.addFriend(p))} disabled={peers.every((p) => o.friendReq[p.id] || p.friend)}>
              <UserPlus size={13} />
              {peers.every((p) => o.friendReq[p.id] || p.friend) ? t("onb.friends.requested") : t("onb.friends.add")}
            </button>
          )}
        </div>
      ) : !d.inviter ? (
        <p className="onb-muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>{t("onb.friends.noInviter")}</p>
      ) : null}
      <div className="onb-lnk">
        <Link size={14} />
        <span title={inv.url}>{prettyUrl(inv.url)}</span>
        <button type="button" className="onb-btn gh sm" onClick={() => void inv.copy()}>
          {inv.copied ? <Check size={13} /> : <Copy size={13} />}
          {inv.copied ? t("onb.friends.copied") : t("onb.friends.copy")}
        </button>
        <button type="button" className="onb-btn gh sm" onClick={() => void inv.share()} aria-label={t("onb.friends.share")} title={t("onb.friends.share")}>
          <Share size={13} />
        </button>
        <button type="button" className="onb-btn gh sm" onClick={() => inv.setQr(true)} aria-label={t("onb.friends.qr")} title={t("onb.friends.qr")}>
          <QrCode size={13} />
        </button>
      </div>
      {inv.qr ? <QrDialog onClose={() => inv.setQr(false)} /> : null}
    </div>
  );
}

/** Phone: the top of the Friends tab (draft phone 3). */
export function FriendsFinder() {
  const t = useT();
  const o = useOnboarding();
  const inv = useInvite();
  if (!o?.active) return null;
  const d = o.data || {};
  const peers = d.sameInvite || [];
  const firstServer = d.inviter?.server?.name || d.community?.name || "Descall";
  return (
    <div className="onb onb-friends" data-testid="onb-friends">
      {d.inviter ? <GreetRow inviter={d.inviter} page /> : null}
      {peers.length ? (
        <>
          <div className="onb-psec">{t("onb.friends.sameInviteTitle", { n: peers.length })}</div>
          <div className="onb-gl" style={{ borderRadius: 18 }}>
            {peers.map((p) => (
              <div key={p.id} className="onb-prow">
                <Avatar name={p.displayName || p.username} src={p.avatarUrl} size={40} online={p.online} toneKey={p.id} />
                <div>
                  <b>{p.displayName || p.username}</b>
                  <small>{t("onb.friends.sameInviteOne")}</small>
                </div>
                <PeerButton p={p} />
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, color: "var(--onb-t3)", padding: "2px 6px 0", lineHeight: 1.4 }}>
        <Lock size={13} style={{ marginTop: 2, flex: "none" }} />
        {t("onb.friends.privacy")}
      </div>
      <div className="onb-psec">{t("onb.friends.inviteLink")}</div>
      <div className="onb-gl" style={{ padding: "12px 14px", borderRadius: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}>
          <Link size={16} style={{ color: "var(--onb-brand-hi)" }} />
          <b style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyUrl(inv.url)}</b>
        </div>
        <div className="onb-share">
          <button type="button" onClick={() => void inv.copy()}><i className="g1">{inv.copied ? <Check size={20} /> : <Copy size={20} />}</i>{inv.copied ? t("onb.friends.copied") : t("onb.friends.copy")}</button>
          <button type="button" onClick={() => void inv.share()}><i className="g2"><MessageSquare size={20} /></i>{t("onb.friends.messages")}</button>
          <button type="button" onClick={() => inv.setQr(true)}><i className="g3"><QrCode size={20} /></i>{t("onb.friends.qr")}</button>
          <button type="button" onClick={() => void inv.share()}><i style={{ background: "linear-gradient(150deg,#8e97b5,#4e556e)" }}><Share size={20} /></i>{t("onb.friends.more")}</button>
        </div>
        <div className="onb-lbl" style={{ margin: "12px 0 6px" }}>{t("onb.friends.willSee")}</div>
        <div className="onb-inv-prev">
          <Avatar name={o.myName} src={o.me?.avatarUrl} size={34} toneKey={o.me?.id} />
          <div>
            <b>{t("onb.friends.willSeeTitle", { name: o.myName })}</b>
            <small>{t("onb.friends.willSeeSub", { server: firstServer })}</small>
          </div>
          <span className="onb-btn pri sm" aria-hidden="true">{t("onb.card.join")}</span>
        </div>
      </div>
      {inv.qr ? <QrDialog onClose={() => inv.setQr(false)} /> : null}
    </div>
  );
}
