/**
 * The invited friend's first entry (owner pick 4A, section 2, "Can'ın ilk açılışı"):
 * friendship with the inviter is ready ("say hi" + two quick replies that land in the DM
 * composer), the gift progress in three steps (account, first message, come back tomorrow),
 * the inviter's public server to join and the inviter's friends to add.
 * Phone: full-screen sheet over the app. Desktop: a centered card. Shown once per account
 * by InviteCenterHost; `InviteGiftCard` is exported for the Başla panosu to embed.
 */
import { useEffect, useState } from "react";
import { useLocale } from "../../context/localeContextInstance.js";
import { useModalFocusRef } from "../../hooks/useModalFocus";
import { useToast } from "../../context/ToastContext";
import { sendFriendRequest } from "../../api/friends.js";
import { joinPublicServer } from "../../api/servers.js";
import { draftKeyFor, writeDraft } from "../../lib/messageDrafts";
import { directPath, serverPath } from "../../lib/appRoutes.js";
import { nameVars } from "../../lib/trCase.js";
import { Coin, Ico, PAvatar } from "./ui.jsx";
import { clockTime, fmtNum } from "./format.js";

function stepIcon(done, active) {
  if (done) return <span className="dvt-ib ok"><Ico name="check" /></span>;
  return <span className={`dvt-ib ${active ? "" : "mu"}`}><Ico name={active ? "msg" : "cal"} /></span>;
}

export function InviteGiftCard({ data, compact = false }) {
  const { t, locale } = useLocale();
  const g = data?.gift;
  if (!g) return null;
  const steps = g.steps || [];
  const doneCount = steps.filter((s) => s.done).length;
  const msgDone = steps[1]?.done;
  const returnAt = steps[2]?.at;
  return (
    <div className={`dvt-pg dvt-col dvt-gift ${compact ? "compact" : ""}`} data-testid="dvt-gift">
      <div className="dvt-row">
        <b>{t("dvt.wel.gift")}</b>
        <span className="sp" />
        <span className="dvt-dc">
          <Coin size="l" />
          {fmtNum(g.amount, locale)}
        </span>
        <span className="mu4">+</span>
        <Ico name="shieldc" className="brt" />
      </div>
      <div className="dvt-bar">
        <i style={{ width: `${Math.round((doneCount / 3) * 100)}%` }} />
      </div>
      {g.status === "paid" ? <small className="okt">{t("dvt.wel.paid", { amount: fmtNum(g.amount, locale) })}</small> : null}
      {g.status === "expired" ? <small className="mu">{t("dvt.wel.expired")}</small> : null}
      {g.status === "reviewing" ? <small className="wat">{t("dvt.wel.review")}</small> : null}
      <div className="dvt-row dvt-step">
        {stepIcon(true)}
        <span className="sp">{t("dvt.wel.stepAccount")}</span>
        <span className="mu4">{clockTime(steps[0]?.at, locale)}</span>
      </div>
      <div className="dvt-row dvt-step">
        {stepIcon(msgDone, !msgDone)}
        <span className="sp">{t("dvt.wel.stepMessage")}</span>
        {msgDone ? <span className="mu4">{clockTime(steps[1]?.at, locale)}</span> : <span className="dvt-pl br">{t("dvt.wel.now")}</span>}
      </div>
      <div className="dvt-row dvt-step">
        {stepIcon(steps[2]?.done, false)}
        <span className={`sp ${steps[2]?.done ? "" : "mu"}`}>{t("dvt.wel.stepReturn")}</span>
        <span className="mu4">{steps[2]?.done ? clockTime(returnAt, locale) : t("dvt.wel.tomorrowAt", { time: clockTime(returnAt, locale) })}</span>
      </div>
    </div>
  );
}

export default function InviteWelcome({ data, mobile = false, onClose, onNavigate }) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [joined, setJoined] = useState(Boolean(data?.server?.joined));
  const [joining, setJoining] = useState(false);
  const [added, setAdded] = useState({});
  const ref = useModalFocusRef();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!data?.invited) return null;
  const inv = data.inviter;
  const invName = inv.displayName || inv.username;
  const nv = nameVars(invName, locale);
  const meName = data.me?.displayName || data.me?.username || "";

  const openDm = (text) => {
    if (text) writeDraft(draftKeyFor({ dmUserId: inv.id }), text);
    onClose?.();
    onNavigate?.(directPath(inv));
  };

  const join = async () => {
    if (!data.server || joining) return;
    setJoining(true);
    try {
      const out = await joinPublicServer(data.server.id);
      setJoined(true);
      const server = out?.server || { id: data.server.id, name: data.server.name };
      try {
        window.dispatchEvent(new CustomEvent("descall:joined-server", { detail: { server, channelId: out?.channelId || null } }));
      } catch {
        onNavigate?.(serverPath(server));
      }
      onClose?.();
    } catch {
      toast(t("dvt.wel.joinFail"), "error");
    } finally {
      setJoining(false);
    }
  };

  const add = async (f) => {
    setAdded((a) => ({ ...a, [f.id]: "busy" }));
    try {
      await sendFriendRequest(f.username);
      setAdded((a) => ({ ...a, [f.id]: "done" }));
    } catch {
      setAdded((a) => ({ ...a, [f.id]: null }));
    }
  };

  const body = (
    <>
      <div className="dvt-pnav">
        <h2 className="sp">{t("dvt.wel.hello", { name: meName })}</h2>
        <button type="button" className="dvt-btn ic g" onClick={onClose} aria-label={t("dvt.close")}>
          <Ico name="x" />
        </button>
      </div>
      <div className="dvt-pg dvt-col dvt-welfriend">
        <div className="dvt-row">
          <span className="dvt-avpair">
            <PAvatar user={{ displayName: meName }} size={46} />
            <PAvatar user={inv} size={46} online={inv.online} />
          </span>
          <div className="dvt-col sp">
            <b>{t("dvt.wel.friends", { name: invName })}</b>
            <small className="mu">{t("dvt.wel.friendsSub")}</small>
          </div>
        </div>
        <button type="button" className="dvt-pbtn" onClick={() => openDm("")} data-testid="dvt-sayhi">
          <Ico name="msg" />
          {t("dvt.wel.sayHi", nv)}
        </button>
        <div className="dvt-row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="dvt-chip" onClick={() => openDm(t("dvt.wel.chip1", { name: invName }))}>
            {t("dvt.wel.chip1", { name: invName })}
          </button>
          <button type="button" className="dvt-chip" onClick={() => openDm(t("dvt.wel.chip2"))}>
            {t("dvt.wel.chip2")}
          </button>
        </div>
      </div>
      <InviteGiftCard data={data} />
      {data.server ? (
        <div className="dvt-pg dvt-row dvt-welserver">
          <span className="dvt-srvicon" aria-hidden="true">
            {data.server.iconUrl ? <img src={data.server.iconUrl} alt="" /> : String(data.server.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div className="dvt-col sp">
            <b className="ell">{data.server.name}</b>
            <small className="mu">
              <span className="okt">{t("dvt.wel.serverOnline", { n: data.server.online })}</span>
              {data.server.inviterInVoice ? <> · {t("dvt.wel.serverVoice", { name: invName, n: Math.max(0, data.server.voiceCount - 1) })}</> : null}
            </small>
          </div>
          <button type="button" className="dvt-pbtn sm s" disabled={joined || joining} onClick={() => void join()}>
            {joined ? t("dvt.wel.joined") : t("dvt.wel.join")}
          </button>
        </div>
      ) : null}
      {data.friends?.length ? (
        <div className="dvt-pg dvt-col dvt-welfriends">
          <div className="dvt-row">
            <b>{t("dvt.wel.friendsOf", nv)}</b>
            <span className="sp" />
            <small className="mu">{t("dvt.wel.people", { n: data.friendsTotal || data.friends.length })}</small>
          </div>
          {data.friends.map((f) => (
            <div key={f.id} className="dvt-row dvt-welrow">
              <PAvatar user={f} size={34} online={f.online} />
              <div className="dvt-col sp">
                <b className="ell">{f.displayName || f.username}</b>
                <small className="mu ell">
                  {f.place?.kind === "voice" ? t("dvt.wel.inVoice", { server: f.place.serverName }) : f.mutualServers ? t("dvt.wel.mutual", { n: f.mutualServers }) : t("dvt.wel.friendOf", nv)}
                </small>
              </div>
              {f.friend === "friend" ? null : (
                <button type="button" className="dvt-pbtn sm s" disabled={Boolean(added[f.id]) || f.friend === "requested"} onClick={() => void add(f)}>
                  <Ico name="uplus" />
                  {added[f.id] === "done" || f.friend === "requested" ? t("dvt.wel.added") : t("dvt.wel.add")}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`dvt-welcome-layer ${mobile ? "is-phone" : "is-desk"}`} role="presentation" onClick={mobile ? undefined : onClose}>
      <div ref={ref} tabIndex={-1} className={`dvt-welcome ${mobile ? "is-phone" : "dvt-opq"}`} role="dialog" aria-modal="true" aria-label={t("dvt.wel.open")} onClick={(e) => e.stopPropagation()} data-testid="dvt-welcome">
        {body}
      </div>
    </div>
  );
}
