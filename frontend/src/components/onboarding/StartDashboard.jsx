/**
 * "Başla panosu" desktop (draft 2A): the Chats home for an account's first five days.
 * Live numbers on top, interest chips, three live servers ranked by liveness, the official
 * community with Rehber, and "Arkadaşlarını bul". The right panel previews a server before
 * joining (PreviewPanel). No step is required and there is no order.
 */
import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { Avatar, Coin, Rich, RICH, ServerIcon, Spark, Toasts } from "./parts";
import PreviewPanel from "./PreviewPanel";
import FriendsCard from "./FriendsCard";
import { quickReplies } from "../../lib/onboarding";
import { Award, Bot, Clock, Compass, Eye, ShieldCheck, TrendingUp, Volume2, X, RefreshCw, Check } from "../ui/Icon.jsx";

export function InterestChips({ size = "md" }) {
  const t = useT();
  const o = useOnboarding();
  const catalog = o?.data?.interestCatalog || [];
  return (
    <div className="onb-chips" role="group" aria-label={t("onb.interests.label")}>
      {catalog.map((c) => {
        const on = o.interests.includes(c.id);
        return (
          <button key={c.id} type="button" className={`onb-chip${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => o.chooseInterest(c.id)} data-size={size}>
            {on ? <Check size={12} /> : null}
            {t(`onb.interest.${c.id}`)}
            {c.online > 0 ? <em title={t("onb.interests.onlineHint", { n: c.online })}>{c.online}</em> : null}
          </button>
        );
      })}
    </div>
  );
}

export function LiveCard({ s, index }) {
  const t = useT();
  const o = useOnboarding();
  const pv = o.previewTarget && String(o.previewTarget.id) === String(s.id);
  const joined = (o.data?.myServers || []).some((x) => String(x.id) === String(s.id));
  const open = () => {
    o.openPreview({ id: s.id, name: s.name, iconUrl: s.iconUrl, category: s.category }, { slot: "card" });
  };
  return (
    <div
      className={`onb-gl onb-card${pv ? " is-hl" : ""}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      aria-label={t("onb.card.aria", { name: s.name })}
      data-server={s.id}
    >
      <div className="t">
        <ServerIcon server={s} size={36} />
        <div>
          <b>{s.name}</b>
          <small>
            {s.category ? t(`onb.interest.${s.category}`) : t("onb.card.noCategory")}
            {index === 0 && s.lastHour > 0 ? <> · <em>{t("onb.card.mostLive")}</em></> : null}
          </small>
        </div>
      </div>
      <div className="nums">
        <span><b>{s.members}</b> {t("onb.card.membersWord", { n: s.members })}</span>
        <span className="on"><b>{s.online}</b> {t("onb.card.onlineWord", { n: s.online })}</span>
      </div>
      <div className="sk">
        <Spark values={s.spark} color={pv ? "#8FA6FF" : "#6FCF97"} label={t("onb.card.sparkAria", { n: s.lastHour })} />
        <span><b>{s.lastHour}</b> {t("onb.card.perHour")}</span>
      </div>
      <div className="vc">
        <Volume2 size={13} />
        <span>{s.voice?.name || t("onb.card.noVoice")}</span>
        {s.voice?.people?.length ? (
          <span className="onb-stack">
            {s.voice.people.map((p, i) => <Avatar key={p.id || i} name={p.name} src={p.avatarUrl} size={20} speaking={p.speaking} />)}
          </span>
        ) : s.voice?.count ? <span className="onb-muted" style={{ marginLeft: "auto" }}>{t("onb.preview.voiceIn", { n: s.voice.count })}</span> : null}
      </div>
      <div className="rp">
        <Clock size={13} />
        <span>{s.replyMinutes != null ? t("onb.card.replyIn", { n: s.replyMinutes }) : t("onb.card.replyNone")}</span>
      </div>
      <div className="bt">
        <button
          type="button"
          className={`onb-btn ${pv ? "ok" : "gh"} sm`}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {pv ? <Eye size={13} /> : null}
          {pv ? t("onb.card.previewing") : t("onb.card.preview")}
        </button>
        <button
          type="button"
          className="onb-btn pri sm"
          disabled={joined}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {joined ? t("onb.card.joined") : t("onb.card.join")}
        </button>
      </div>
    </div>
  );
}

export function CommunityCard({ compact = false }) {
  const t = useT();
  const o = useOnboarding();
  const c = o?.data?.community;
  const rehber = o?.data?.rehber;
  if (!c) return null;
  const name = o.myName;
  const intro = c.introChannel?.name || t("onb.rehber.channel");
  const openWith = (text) => o.openPreview({ id: c.id, name: c.name, iconUrl: c.iconUrl, category: "chat-friends" }, { slot: "community", text });
  return (
    <div className="onb-gl onb-off">
      <div className="row1">
        <ServerIcon server={c} size={34} official />
        <div>
          <b>
            {c.name}
            <span className="onb-pill br"><ShieldCheck size={11} />{t("onb.community.official")}</span>
          </b>
          <small>
            {c.online != null ? <span className="onb-live" style={{ fontSize: 11 }}>{t("onb.card.online", { n: c.online })}</span> : null}
            {c.members != null ? <> · {t("onb.card.members", { n: c.members })}</> : null}
            {c.joined && c.autoJoined ? <> · {t("onb.community.autoJoined")}</> : null}
            {c.left ? <> · {t("onb.community.left")}</> : null}
          </small>
        </div>
        {!compact && c.joined ? (
          <button type="button" className="onb-btn gh sm" onClick={() => o.openChannel?.(c.id)}>{t("onb.community.open")}</button>
        ) : null}
      </div>
      {rehber ? (
        <div className="onb-botmsg">
          <span className="onb-si g1" style={{ "--s": "24px", borderRadius: "50%" }} aria-hidden="true"><Bot size={13} /></span>
          <p>
            <b>{t("onb.rehber.name")}</b> <span className="onb-bot">{t("onb.rehber.bot")}</span>{" "}
            {rehber.joinedToday > 1
              ? t("onb.rehber.greet", { name, n: rehber.joinedToday - 1, channel: intro })
              : t("onb.rehber.greetNoCount", { name, channel: intro })}
          </p>
        </div>
      ) : null}
      {c.joined ? (
        <div className="onb-qr">
          {quickReplies(t, { name, interests: o.interests }).map((q) => (
            <button key={q} type="button" className="onb-chip" onClick={() => openWith(q)}>{q}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function StartDashboard() {
  const t = useT();
  const o = useOnboarding();
  const [confirmHide, setConfirmHide] = useState(false);
  if (!o) return null;
  const d = o.data || {};
  const loading = o.status === "loading" && !o.data;
  const cl = d.checklist || { earned: 0, rewardTotal: 160 };
  const helloDone = Boolean(d.firstHello?.at);
  const interestLive = d.interestLive || { servers: 0, online: 0, lastHour: 0 };

  return (
    <div className="onb onb-desk" data-testid="onb-dashboard">
      <section className="onb-main" aria-labelledby="onb-hello">
        <header className="onb-hd">
          <div>
            <h1 id="onb-hello">{t("onb.hello", { name: o.myName })}</h1>
            <p>
              <Rich text={t("onb.helloSub", { count: RICH })} bold={t("onb.people", { n: d.online?.now ?? 0 })} />
            </p>
          </div>
          {confirmHide ? (
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <span className="onb-muted" style={{ fontSize: 12 }}>{t("onb.hideConfirm")}</span>
              <button type="button" className="onb-btn gh sm" onClick={() => setConfirmHide(false)}>{t("onb.cancel")}</button>
              <button type="button" className="onb-btn pri sm" onClick={() => void o.setHidden(true)}>{t("onb.hide")}</button>
            </span>
          ) : (
            <button type="button" className="onb-btn gh sm" onClick={() => setConfirmHide(true)}>
              <X size={13} />
              {t("onb.hide")}
            </button>
          )}
        </header>

        <div className="onb-kpis">
          <div className="onb-gl onb-kpi">
            <span className="onb-lbl">{t("onb.kpi.online")}</span>
            <div className="kv"><b>{d.online?.now ?? 0}</b><span className="onb-live">{t("onb.kpi.live")}</span></div>
            <Spark values={d.online?.spark} color="#5BE38A" label={t("onb.kpi.onlineAria")} />
          </div>
          <div className="onb-gl onb-kpi">
            <span className="onb-lbl">{t("onb.kpi.inInterests")}</span>
            {o.interests.length ? (
              <>
                <div className="kv"><b>{interestLive.servers}</b><span>{t("onb.kpi.liveServers", { n: interestLive.servers })}</span></div>
                <small>{t("onb.kpi.interestSub", { online: interestLive.online, msgs: interestLive.lastHour })}</small>
              </>
            ) : (
              <small style={{ marginTop: 2 }}>{t("onb.kpi.pickInterest")}</small>
            )}
          </div>
          <div className="onb-gl onb-kpi">
            <span className="onb-lbl">{t("onb.kpi.waiting")}</span>
            <div className="kv"><Coin size={20} /><b>{cl.rewardTotal - cl.earned}</b><span>{t("onb.coin")}</span></div>
            <div className="onb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={cl.rewardTotal} aria-valuenow={cl.earned} aria-label={t("onb.side.progress", { earned: cl.earned, total: cl.rewardTotal })}>
              <i style={{ width: `${Math.round((cl.earned / Math.max(1, cl.rewardTotal)) * 100)}%` }} />
            </div>
          </div>
          <div className="onb-gl onb-kpi is-gold">
            <span className="onb-lbl">{t("onb.kpi.firstReward")}</span>
            <div className="kv">
              <span className="onb-badge-ico" style={{ width: 26, height: 26, borderRadius: 8 }}><Award size={15} /></span>
              <b>{helloDone ? <Check size={20} /> : "+50"}</b>
              <span>{helloDone ? t("onb.kpi.earned") : t("onb.coin")}</span>
            </div>
            <small>{helloDone ? t("onb.kpi.firstRewardDone") : t("onb.kpi.firstRewardSub")}</small>
          </div>
        </div>

        <div className="onb-int">
          <span className="onb-lbl">{t("onb.interests.label")}</span>
          {loading ? <div className="onb-skel" style={{ height: 28, flex: 1 }} /> : <InterestChips />}
        </div>

        <div className="onb-sh">
          <b>{t("onb.liveFor")}</b>
          <span className="onb-pill tl"><TrendingUp size={12} />{t("onb.liveness")}</span>
          <button type="button" className="onb-link" onClick={() => o.openDiscover?.()}>
            <Compass size={13} />
            {t("onb.discoverAll")}
          </button>
        </div>
        {loading ? (
          <div className="onb-cards">
            {[0, 1, 2].map((i) => <div key={i} className="onb-skel" style={{ height: 196 }} />)}
          </div>
        ) : o.status === "error" && !o.data ? (
          <div className="onb-gl onb-cards-empty" role="alert">
            <div style={{ flex: 1 }}>
              <b>{t("onb.err.loadTitle")}</b>
              <p>{t("onb.err.loadBody")}</p>
            </div>
            <button type="button" className="onb-btn gh" onClick={() => void o.refresh()}><RefreshCw size={14} />{t("onb.preview.retry")}</button>
          </div>
        ) : d.suggestions?.length ? (
          <div className="onb-cards">
            {d.suggestions.map((s, i) => <LiveCard key={s.id} s={s} index={i} />)}
          </div>
        ) : (
          <div className="onb-gl onb-cards-empty">
            <TrendingUp size={22} />
            <div>
              <b>{t("onb.empty.title")}</b>
              <p>{t("onb.empty.body")}</p>
            </div>
          </div>
        )}

        <div className="onb-bot-grid">
          {d.community ? <CommunityCard /> : null}
          <FriendsCard />
        </div>
      </section>
      <PreviewPanel />
      <Toasts toasts={o.toasts} />
    </div>
  );
}
