/**
 * Phone "Başla" (draft 2A phone 1): on the Chats tab during the first five days. Next step
 * with its reward, interests, live servers to swipe, Rehber in the community. The preview
 * opens as a bottom sheet (PreviewSheet). With conversations already in the list the
 * dashboard sits above them; "Gizle" folds it away (reopen row in the list).
 */
import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { Avatar, ServerIcon, Spark, Toasts } from "./parts";
import { InterestChips } from "./StartDashboard";
import { NextStepCard } from "./StartSidebar";
import { PreviewSheet } from "./PreviewPanel";
import { Bot, Volume2, X } from "../ui/Icon.jsx";

function PhoneCard({ s }) {
  const t = useT();
  const o = useOnboarding();
  const on = o.previewTarget && String(o.previewTarget.id) === String(s.id);
  const open = () => o.openPreview({ id: s.id, name: s.name, iconUrl: s.iconUrl, category: s.category }, { slot: "card" });
  return (
    <div className={`onb-gl onb-pg onb-pcard${on ? " is-hl" : ""}`} data-server={s.id}>
      <div className="t">
        <ServerIcon server={s} size={42} />
        <div>
          <b>{s.name}</b>
          <small>
            {t("onb.card.members", { n: s.members })} · <em>{t("onb.card.online", { n: s.online })}</em>
          </small>
        </div>
      </div>
      <Spark values={s.spark} color="#8FA6FF" label={t("onb.card.sparkAria", { n: s.lastHour })} />
      <div className="vc">
        <Volume2 size={14} />
        {s.voice ? t("onb.card.voiceLine", { name: s.voice.name, n: s.voice.count }) : t("onb.card.perHourLine", { n: s.lastHour })}
      </div>
      <div className="bt">
        <button type="button" className="onb-btn gh" onClick={open}>{t("onb.card.preview")}</button>
        <button type="button" className="onb-btn pri" onClick={open}>{t("onb.card.join")}</button>
      </div>
    </div>
  );
}

export default function PhoneStart({ withTitle = true }) {
  const t = useT();
  const o = useOnboarding();
  const [editing, setEditing] = useState(false);
  if (!o?.active) return null;
  const d = o.data || {};
  const c = d.community;
  const showChips = editing || !o.interests.length;
  const shownInterests = (d.interestCatalog || []).filter((x) => o.interests.includes(x.id));
  return (
    <div className="onb onb-phone" data-testid="onb-phone">
      {withTitle ? <h1 className="onb-ptl">{t("onb.title")}</h1> : null}
      <NextStepCard />
      <div className="onb-psec">
        {t("onb.interests.label")}
        <button type="button" className="r" onClick={() => setEditing((v) => !v)} aria-expanded={showChips}>
          {editing ? t("onb.done") : t("onb.edit")}
        </button>
      </div>
      {showChips ? (
        <InterestChips size="lg" />
      ) : (
        <div className="onb-hs">
          {shownInterests.map((x) => (
            <button key={x.id} type="button" className="onb-chip is-on" onClick={() => setEditing(true)}>
              {t(`onb.interest.${x.id}`)}
              {x.online > 0 ? <em>{x.online}</em> : null}
            </button>
          ))}
        </div>
      )}
      <div className="onb-psec">
        <span className="onb-live" style={{ fontSize: 13, textTransform: "none", letterSpacing: 0 }}>{t("onb.liveNow")}</span>
        <button type="button" className="r" onClick={() => o.openDiscover?.()}>{t("onb.all")}</button>
      </div>
      {d.suggestions?.length ? (
        <div className="onb-hs">
          {d.suggestions.map((s) => <PhoneCard key={s.id} s={s} />)}
        </div>
      ) : (
        <p className="onb-muted" style={{ margin: "0 4px", fontSize: 14, lineHeight: 1.45 }}>{t("onb.empty.body")}</p>
      )}
      {c ? (
        <>
          <div className="onb-psec">{c.name}</div>
          <button
            type="button"
            className="onb-gl onb-pg"
            style={{ padding: "12px 14px", display: "flex", gap: 10, textAlign: "left", width: "100%" }}
            onClick={() => o.openPreview({ id: c.id, name: c.name, iconUrl: c.iconUrl, category: "chat-friends" }, { slot: "community" })}
          >
            <span className="onb-si g1" style={{ "--s": "34px", borderRadius: "50%" }} aria-hidden="true"><Bot size={17} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14.5 }}>{t("onb.rehber.name")}</b> <span className="onb-bot">{t("onb.rehber.bot")}</span>
              <span style={{ display: "block", fontSize: 14, color: "var(--onb-t2)", marginTop: 2, lineHeight: 1.4 }}>
                {t("onb.rehber.greetShort", { name: o.myName, channel: c.introChannel?.name || t("onb.rehber.channel") })}
              </span>
            </span>
          </button>
        </>
      ) : null}
      {d.inviter ? (
        <button type="button" className="onb-gl onb-pg" style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left" }} onClick={() => o.openDm?.(d.inviter)}>
          <Avatar name={d.inviter.displayName || d.inviter.username} src={d.inviter.avatarUrl} size={34} online={d.inviter.online} toneKey={d.inviter.id} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 14.5 }}>{t("onb.friends.invitedYou", { name: d.inviter.displayName || d.inviter.username })}</b>
            <span className="onb-muted" style={{ fontSize: 12.5 }}>{t("onb.friends.tapToGreet")}</span>
          </span>
        </button>
      ) : null}
      <button type="button" className="onb-btn gh" style={{ alignSelf: "center", marginTop: 4 }} onClick={() => void o.setHidden(true)}>
        <X size={13} />
        {t("onb.hide")}
      </button>
      <PreviewSheet />
      <Toasts toasts={o.toasts} />
    </div>
  );
}
