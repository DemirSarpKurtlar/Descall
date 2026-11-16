// "Sahne" (draft C of the sets): try the set on inside the user's own server and voice
// channel. Channel list with the voice channel members, the user's voice tile with the
// join sound notice, the profile card opened from their row, and the text channel with the
// last real messages plus the user's own line in the try-on bubble.
import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import shop2Api from "../../lib/shop2Api.js";
import { useS2 } from "./Shop2Context.js";
import { Layer } from "./Shop2Bits.jsx";
import { S2Avatar, S2ChatMessage, S2Name, S2OtherMessage, S2PeerTile, S2ProfileCard, S2VoiceTile, displayNameOf } from "./Shop2Preview.jsx";
import { ChevronDown, Hash, Store, Volume2 } from "./shop2Icons.jsx";

const nameOfMember = (m) => m?.displayName || m?.display_name || m?.nickname || m?.user?.displayName || m?.user?.display_name || m?.username || m?.user?.username || "";
const textOf = (msg) => String(msg?.content ?? msg?.text ?? msg?.body ?? "").trim();
const authorOf = (msg) => msg?.author?.displayName || msg?.author?.display_name || msg?.author?.username || msg?.user?.displayName || msg?.user?.username || msg?.senderName || msg?.username || "";

/** Loads the user's servers and, for the chosen one, its channels, members and messages. */
export function useStage() {
  const s2 = useS2();
  const prefs = s2.data.prefs;
  const [servers, setServers] = useState([]);
  const [server, setServer] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const serverId = prefs.stageServerId || servers[0]?.id || null;
  useEffect(() => {
    let off = false;
    shop2Api.myServers().then((res) => {
      if (!off) setServers(Array.isArray(res?.servers) ? res.servers : Array.isArray(res) ? res : []);
    }).catch(() => {});
    return () => {
      off = true;
    };
  }, []);
  useEffect(() => {
    if (!serverId) return undefined;
    let off = false;
    shop2Api.server(serverId).then((res) => {
      if (off) return;
      const sv = res?.server || res;
      setServer(sv);
      const text = (sv?.channels || []).find((c) => c.type === "text");
      if (text) {
        shop2Api.channelMessages(serverId, text.id).then((m) => {
          if (!off) setMessages((m?.messages || []).filter((x) => textOf(x)).slice(-3));
        }).catch(() => {});
      }
    }).catch(() => {});
    shop2Api.serverMembers(serverId).then((res) => {
      if (!off) setMembers((res?.members || res || []).filter((m) => String(m.userId || m.id || m.user?.id) !== String(s2.me?.id)).slice(0, 3));
    }).catch(() => {});
    return () => {
      off = true;
    };
  }, [serverId, s2.me?.id]);
  const channels = server?.channels || [];
  const voice = channels.find((c) => String(c.id) === String(prefs.stageChannelId)) || channels.find((c) => c.type === "voice") || null;
  return { servers, server, channels, voice, members, messages, serverId };
}

/** "Sahnem: Kuzey Oyuncular · Oyun Gecesi" picker (bottom sheet on phone). */
export function StagePicker({ stage }) {
  const { t } = useLocale();
  const s2 = useS2();
  const [open, setOpen] = useState(false);
  const label = stage.server ? `${stage.server.name}${stage.voice ? ` · ${stage.voice.name}` : ""}` : t("shop2.stage.sample");
  const list = (
    <div className="s2-picker-list">
      {stage.servers.length ? stage.servers.map((sv) => (
        <button key={sv.id} type="button" className={String(sv.id) === String(stage.serverId) ? "is-on" : ""} onClick={() => {
          s2.actions.setPref({ stageServerId: sv.id, stageChannelId: null });
        }}>
          <Store size={15} />{sv.name}
        </button>
      )) : <p className="s2-muted">{t("shop2.stage.noServers")}</p>}
      {stage.channels.filter((c) => c.type === "voice").length ? <div className="s2-eyebrow">{t("shop2.stage.voiceChannels")}</div> : null}
      {stage.channels.filter((c) => c.type === "voice").map((c) => (
        <button key={c.id} type="button" className={stage.voice && String(c.id) === String(stage.voice.id) ? "is-on" : ""} onClick={() => {
          s2.actions.setPref({ stageServerId: stage.serverId, stageChannelId: c.id });
          setOpen(false);
        }}>
          <Volume2 size={15} />{c.name}
        </button>
      ))}
    </div>
  );
  return (
    <span className="s2-popwrap">
      <button type="button" className="s2-btn is-sm s2-stagepick" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <Store size={15} />
        <span className="s2-muted">{t("shop2.stage.mine")}</span>
        <b>{label}</b>
        <ChevronDown size={14} />
      </button>
      {open ? (
        s2.layout === "phone" ? (
          <Layer kind="sheet" onClose={() => setOpen(false)} label={t("shop2.stage.mine")} className="s2-sheet">
            <h4 className="s2-sheet-title">{t("shop2.stage.pick")}</h4>
            {list}
          </Layer>
        ) : (
          <div className="s2-pop is-picker" role="dialog" aria-label={t("shop2.stage.pick")}>{list}</div>
        )
      ) : null}
    </span>
  );
}

export default function Shop2Stage({ user, stage, compact = false, joinName }) {
  const { t, locale } = useLocale();
  const [cardOpen, setCardOpen] = useState(false);
  const myName = displayNameOf(user, t("shop2.preview.you"));
  const peers = stage.members.length ? stage.members.map(nameOfMember).filter(Boolean) : [t("shop2.sample.p2"), t("shop2.sample.p3"), t("shop2.sample.p4")];
  const lines = stage.messages.length
    ? stage.messages.map((m) => ({ name: authorOf(m) || t("shop2.sample.p2"), text: textOf(m), time: m.createdAt || m.created_at ? new Date(m.createdAt || m.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "" }))
    : [
        { name: t("shop2.sample.p4"), text: t("shop2.sample.stage1"), time: "21:31" },
        { name: t("shop2.sample.p3"), text: t("shop2.sample.stage2"), time: "21:34" },
        { name: t("shop2.sample.p2"), text: t("shop2.sample.stage3"), time: "21:38" },
      ];
  const joined = { who: t("shop2.sample.joined", { name: myName }), sound: joinName || "" };
  if (compact) {
    return (
      <div className="s2-stage is-compact">
        <div className="s2-stage-voice-grid">
          <S2VoiceTile user={user} size="md" joined={joined} />
          <div className="s2-stage-peers">
            {peers.slice(0, 2).map((p, i) => <S2PeerTile key={p + i} name={p} tone={i + 1} small />)}
          </div>
        </div>
        <div className="s2-stage-chat">
          <S2OtherMessage name={lines[0].name} text={lines[0].text} time={lines[0].time} tone={2} />
          <S2ChatMessage user={user} text={t("shop2.sample.stageMine")} time="21:41" highlight />
        </div>
        <button type="button" className="s2-stage-cardrow" onClick={() => setCardOpen((x) => !x)} aria-expanded={cardOpen}>
          <S2Avatar user={user} size={44} />
          <span><S2Name user={user}>{myName}</S2Name><small>{t("shop2.stage.cardRow")}</small></span>
        </button>
        {cardOpen ? <S2ProfileCard user={user} compact /> : null}
      </div>
    );
  }
  return (
    <div className="s2-stage">
      <nav className="s2-stage-channels" aria-label={t("shop2.stage.channels")}>
        <b className="s2-stage-server">{stage.server?.name || t("shop2.stage.sampleServer")}</b>
        {(stage.channels.length ? stage.channels.slice(0, 5) : [
          { id: "a", name: t("shop2.stage.general"), type: "text" },
          { id: "b", name: t("shop2.stage.clips"), type: "text" },
          { id: "c", name: t("shop2.stage.gameNight"), type: "voice" },
        ]).map((c) => (
          <div key={c.id} className={`s2-stage-ch${stage.voice && String(c.id) === String(stage.voice.id) || (!stage.voice && c.type === "voice") ? " is-on" : ""}`}>
            {c.type === "voice" ? <Volume2 size={14} /> : <Hash size={14} />}
            <span>{c.name}</span>
            {c.type === "voice" && (!stage.voice || String(c.id) === String(stage.voice.id)) ? (
              <div className="s2-stage-in">
                <button type="button" className="s2-stage-me" onClick={() => setCardOpen((x) => !x)} aria-expanded={cardOpen}>
                  <S2Avatar user={user} size={20} />
                  <S2Name user={user}>{myName}</S2Name>
                </button>
                {peers.map((p, i) => (
                  <span key={p + i} className="s2-stage-peer"><span className={`s2-letter is-xs tone-${i + 1}`}>{p.charAt(0)}</span>{p}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div className="s2-stage-tiles">
        <button type="button" className="s2-stage-mytile" onClick={() => setCardOpen((x) => !x)} aria-expanded={cardOpen} aria-label={t("shop2.stage.cardRow")}>
          <S2VoiceTile user={user} size="lg" joined={joined} />
        </button>
        {peers.slice(0, 3).map((p, i) => <S2PeerTile key={p + i} name={p} tone={i + 1} />)}
        {cardOpen ? (
          <div className="s2-stage-card">
            <S2ProfileCard user={user} compact />
          </div>
        ) : null}
      </div>
      <div className="s2-stage-chat">
        <div className="s2-stage-chat-h"><Hash size={13} />{(stage.channels.find((c) => c.type === "text") || {}).name || t("shop2.stage.general")}</div>
        {lines.map((l, i) => <S2OtherMessage key={i} name={l.name} text={l.text} time={l.time} tone={i + 2} />)}
        <S2ChatMessage user={user} text={t("shop2.sample.stageMine")} time="21:41" highlight />
      </div>
    </div>
  );
}
