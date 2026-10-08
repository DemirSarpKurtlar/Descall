import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HeadphoneOff,
  Headphones,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreHorizontal,
  Radio,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { resolveDisplayName } from "../../lib/userProfile";
import { serverHasPermission, serverPermissionsLoaded } from "../../lib/serverPermissions";
import useSpeaking from "../../hooks/useSpeaking";
import { isNoiseSuppressionEnabled } from "../../lib/noiseSuppression";
import { visibleScreenStream } from "../../lib/screenShareTracks";
import VoiceMemberContextMenu from "./VoiceMemberContextMenu";
import { DockDeviceSlot } from "../call/DevicePicker";
import { screenShareComingSoonOnIos } from "../../lib/webrtcScreenShare";

function TileFullscreenVideo({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    el.play?.().catch(() => {});
  }, [stream]);
  return <video ref={ref} className="server-voice-screen-video" autoPlay playsInline muted />;
}

function streamHasLiveVideo(stream) {
  return Boolean(
    stream?.getVideoTracks?.()?.some((t) => t && t.readyState === "live" && !t.muted)
  );
}

function streamHasLiveAudio(stream) {
  return Boolean(
    stream?.getAudioTracks?.()?.some((t) => t && t.readyState !== "ended")
  );
}

/** Must run inside the click. Fullscreen requests outside the gesture are rejected. */
function presentScreenFullscreen(root, onFallback) {
  const video =
    root?.querySelector?.(".server-voice-screen-video") ||
    root?.querySelector?.(".server-voice-tile-video");
  const isiOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent || "");
  if (isiOS && typeof video?.webkitEnterFullscreen === "function") {
    try {
      video.webkitEnterFullscreen();
      return "video";
    } catch {
      /* page overlay below */
    }
  }
  const target = document.documentElement;
  if (typeof target?.requestFullscreen === "function" && !document.fullscreenElement && !document.webkitFullscreenElement) {
    target.requestFullscreen().catch(() => {});
  }
  onFallback?.();
}

function gridBand(count) {
  if (count <= 1) return "is-1";
  if (count === 2) return "is-2";
  if (count <= 4) return "is-4";
  if (count <= 6) return "is-6";
  if (count <= 9) return "is-9";
  return "is-many";
}

function avatarSizeFor(count, compact) {
  if (compact) return 52;
  if (count <= 1) return 112;
  if (count === 2) return 88;
  if (count <= 4) return 72;
  return 56;
}

function sameTile(prev, next) {
  if (
    prev.compact !== next.compact ||
    prev.count !== next.count ||
    prev.youLabel !== next.youLabel ||
    prev.onOpenMenu !== next.onOpenMenu ||
    prev.onExpandShare !== next.onExpandShare
  ) {
    return false;
  }
  const a = prev.tile;
  const b = next.tile;
  if (a === b) return true;
  return (
    a?.id === b?.id &&
    a?.label === b?.label &&
    a?.muted === b?.muted &&
    a?.deafened === b?.deafened &&
    a?.sharing === b?.sharing &&
    a?.cameraOn === b?.cameraOn &&
    a?.cameraStream === b?.cameraStream &&
    a?.audioStream === b?.audioStream &&
    a?.isLocal === b?.isLocal &&
    a?.member === b?.member &&
    a?.member?.stageRole === b?.member?.stageRole &&
    a?.member?.requestedToSpeak === b?.member?.requestedToSpeak
  );
}

const VoiceTile = memo(function VoiceTile({
  tile,
  compact = false,
  count = 1,
  youLabel = "",
  onOpenMenu,
  onExpandShare,
}) {
  const t = useT();
  const videoRef = useRef(null);
  const cameraStream = tile.cameraStream || null;
  const speaking = useSpeaking(tile.audioStream, {
    muted: Boolean(tile.muted),
    threshold: 0.014,
    attackMs: 55,
    releaseMs: 260,
  });
  const name = tile.label || "User";
  const showVideo = streamHasLiveVideo(cameraStream);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== cameraStream) el.srcObject = cameraStream || null;
    if (cameraStream) el.play?.().catch(() => {});
  }, [cameraStream, showVideo]);

  const openMenu = (event) => {
    if (!tile.member) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMenu?.({
      user: tile.member,
      isSelf: Boolean(tile.isLocal),
      channelId: tile.channelId,
      sharing: Boolean(tile.sharing),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const canExpandShare = Boolean(!tile.isLocal && onExpandShare && (tile.sharing || showVideo));
  const expandShare = (event) => {
    if (!canExpandShare) return;
    if (event.target.closest("button, a, input, label")) return;
    onExpandShare(tile.id, event.currentTarget);
  };

  return (
    <article
      className={`server-voice-tile${showVideo ? " has-video" : ""}${speaking ? " is-speaking" : ""}${tile.muted ? " is-muted" : ""}${compact ? " is-compact" : ""}${canExpandShare ? " is-share-target" : ""}${tile.sharing ? " is-screen-share" : ""}`}
      onContextMenu={openMenu}
      onClick={expandShare}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          className={`server-voice-tile-video${tile.isLocal ? " is-local-mirror" : ""}`}
          autoPlay
          playsInline
          muted
        />
      ) : (
        <div className="server-voice-tile-avatar">
          <Avatar
            name={name}
            size={avatarSizeFor(count, compact)}
            user={tile.member}
            animate="speaking"
            isSpeaking={speaking}
          />
        </div>
      )}
      <div className="server-voice-tile-meta">
        <span className="server-voice-tile-name">{name}</span>
        {tile.isLocal ? <span className="server-voice-you">{youLabel}</span> : null}
        {tile.member?.stageRole === "speaker" ? (
          <span className="server-stage-speaker-badge">{t("Speaker")}</span>
        ) : null}
        {tile.member?.requestedToSpeak ? (
          <span className="server-stage-request-badge">{t("Requested")}</span>
        ) : null}
        <span className="server-voice-tile-flags">
          {speaking ? (
            <span className="server-voice-flag is-speak" title={t("Speaking")} aria-label={t("Speaking")}>
              <Mic size={13} aria-hidden />
            </span>
          ) : null}
          {tile.muted ? (
            <span className="server-voice-flag is-muted" title={t("Muted")} aria-label={t("Muted")}>
              <MicOff size={13} aria-hidden />
            </span>
          ) : null}
          {tile.deafened ? (
            <span className="server-voice-flag is-deaf" title={t("Server deafen")} aria-label={t("Server deafen")}>
              <HeadphoneOff size={13} aria-hidden />
            </span>
          ) : null}
          {tile.sharing ? (
            <span className="server-voice-flag is-share" title={t("Share Screen")} aria-label={t("Share Screen")}>
              <Monitor size={13} aria-hidden />
            </span>
          ) : null}
          {tile.cameraOn && !showVideo ? (
            <span className="server-voice-flag is-cam" title={t("Camera")} aria-label={t("Camera")}>
              <Video size={13} aria-hidden />
            </span>
          ) : null}
        </span>
        {!tile.isLocal ? (
          <button
            type="button"
            className="server-voice-tile-more"
            aria-label={t("More")}
            onClick={openMenu}
          >
            <MoreHorizontal size={14} />
          </button>
        ) : null}
      </div>
    </article>
  );
}, sameTile);

/** Dedicated audio element for remote screen/tab audio (video stays muted). */
function RemoteScreenAudioSink({ stream, volume = 100, enabled = true, sinkId = "" }) {
  const audioRef = useRef(null);
  const trackCount =
    stream?.getAudioTracks?.()?.filter((t) => t && t.readyState !== "ended").length || 0;

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const vol = enabled ? Math.max(0, Math.min(1, Number(volume) / 100)) : 0;
    audioEl.volume = vol;
    if (sinkId && typeof audioEl.setSinkId === "function") {
      audioEl.setSinkId(sinkId).catch(() => {});
    }
    if (!enabled || !stream || trackCount === 0) {
      audioEl.muted = true;
      if (audioEl.srcObject) audioEl.srcObject = null;
      return;
    }
    audioEl.muted = false;
    audioEl.srcObject = null;
    audioEl.srcObject = stream;
    const play = () => audioEl.play().catch(() => {});
    play();
    stream.getAudioTracks().forEach((t) => {
      const prev = t.onunmute;
      t.onunmute = (ev) => {
        try {
          if (typeof prev === "function") prev.call(t, ev);
        } catch {
          /* ignore */
        }
        play();
      };
    });
  }, [stream, trackCount, volume, enabled, sinkId]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} aria-hidden="true" />;
}

/**
 * Multi-sharer screen stage — same UX as group/DM CallOverlay:
 * switch screens, volume, click-to-fullscreen.
 */
function ScreenShareCard({ sharer, label, volume, onVolumeChange, onOpen }) {
  const t = useT();
  const videoRef = useRef(null);
  const stream = sharer?.stream || null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    if (el.srcObject !== stream) el.srcObject = stream || null;
    if (stream) el.play?.().catch(() => {});
  }, [stream]);

  return (
    <div className="server-voice-screen server-voice-screen-card" data-sharer-id={sharer.id}>
      <video ref={videoRef} className="server-voice-screen-video" autoPlay playsInline muted />
      {!streamHasLiveVideo(stream) && (
        <div className="server-voice-screen-waiting">{t("Waiting for screen…")}</div>
      )}
      <button
        type="button"
        className="server-voice-screen-hit"
        aria-label={label}
        onClick={(event) => {
          const root = event.currentTarget.closest(".server-voice-screen");
          if (presentScreenFullscreen(root) !== "video") onOpen?.();
        }}
      />
      <button
        type="button"
        className="server-voice-screen-badge is-button"
        onClick={(event) => {
          const root = event.currentTarget.closest(".server-voice-screen");
          if (presentScreenFullscreen(root) !== "video") onOpen?.();
        }}
      >
        <Monitor size={12} />
        <span>{label}</span>
      </button>
      {!sharer.isLocal && (
        <label className="server-voice-screen-volume" onClick={(event) => event.stopPropagation()}>
          <Volume2 size={14} aria-hidden="true" />
          <input
            aria-label={t("Screen share volume")}
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => onVolumeChange?.(Number(event.target.value))}
          />
          <span>{volume}%</span>
        </label>
      )}
    </div>
  );
}

function ServerScreenShareStage({
  sharers,
  volumes = {},
  onVolumeChange,
  sinkId = "",
  expandToken = 0,
  expandSharerId = null,
}) {
  const t = useT();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [aspectKey, setAspectKey] = useState("0x0");
  const prevCountRef = useRef(0);
  const normalVideoRef = useRef(null);
  const expandedVideoRef = useRef(null);
  const sharersRef = useRef(sharers);
  sharersRef.current = sharers;

  useEffect(() => {
    const n = sharers.length;
    if (n > prevCountRef.current) {
      setSelectedIndex(n - 1);
    } else if (n > 0 && selectedIndex > n - 1) {
      setSelectedIndex(n - 1);
    }
    if (n === 0) setExpanded(false);
    prevCountRef.current = n;
  }, [sharers.length, selectedIndex]);

  const safeIndex = sharers.length ? Math.min(Math.max(selectedIndex, 0), sharers.length - 1) : 0;
  const active = sharers[safeIndex] || null;
  const screenStream = active?.stream || null;

  useEffect(() => {
    const track = screenStream?.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    const w = settings.width || 0;
    const h = settings.height || 0;
    if (w && h) setAspectKey(`${w}x${h}`);
  }, [screenStream]);

  const attachStream = useCallback((el, stream) => {
    if (!el) return;
    el.muted = true;
    if (!stream) {
      if (el.srcObject) el.srcObject = null;
      return;
    }
    if (el.srcObject !== stream) el.srcObject = stream;
    const playWhenReady = () => el.play().catch(() => {});
    const videoTracks = stream.getVideoTracks?.() || [];
    if (videoTracks.some((tr) => tr.muted || tr.readyState !== "live")) {
      videoTracks.forEach((tr) => {
        const prev = tr.onunmute;
        tr.onunmute = (ev) => {
          try {
            if (typeof prev === "function") prev.call(tr, ev);
          } catch {
            /* ignore */
          }
          playWhenReady();
        };
      });
    }
    playWhenReady();
  }, []);

  const normalVideoCallbackRef = useCallback(
    (el) => {
      normalVideoRef.current = el;
      if (el) attachStream(el, screenStream);
    },
    [screenStream, attachStream]
  );

  const expandedVideoCallbackRef = useCallback(
    (el) => {
      expandedVideoRef.current = el;
      if (el) attachStream(el, screenStream);
    },
    [screenStream, attachStream]
  );

  useEffect(() => {
    if (!expandToken || expandSharerId == null) return;
    const list = sharersRef.current || [];
    const index = list.findIndex((item) => String(item.id) === String(expandSharerId));
    if (index < 0) return;
    setSelectedIndex(index);
    setExpanded(true);
  }, [expandToken, expandSharerId]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setExpanded(false);
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const closeExpanded = () => {
    setExpanded(false);
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const openExpanded = (event) => {
    const root = event.currentTarget.closest(".server-voice-screen");
    presentScreenFullscreen(root, () => setExpanded(true));
  };

  if (!sharers.length || !active) return null;

  const labelFor = (sharer) =>
    sharer?.isLocal
      ? t("Your Screen")
      : t("{name}'s Screen", { name: sharer?.username || "Member" });
  const volumeFor = (sharer) => {
    const stored = volumes?.[String(sharer?.id)];
    return stored == null ? 100 : stored;
  };
  const label = labelFor(active);

  const audioSinks = sharers
    .filter((s) => !s.isLocal && s.stream)
    .map((s) => (
      <RemoteScreenAudioSink
        key={`screen-audio-${s.id}`}
        stream={s.stream}
        volume={volumeFor(s)}
        enabled
        sinkId={sinkId}
      />
    ));

  if (sharers.length > 1 && !expanded) {
    return (
      <div className="server-voice-screen-stage is-multi">
        {audioSinks}
        <div className="server-voice-screen-grid">
          {sharers.map((sharer) => (
            <ScreenShareCard
              key={sharer.id}
              sharer={sharer}
              label={labelFor(sharer)}
              volume={volumeFor(sharer)}
              onVolumeChange={(value) => onVolumeChange?.(sharer.id, value)}
              onOpen={() => {
                const index = sharers.findIndex((item) => String(item.id) === String(sharer.id));
                setSelectedIndex(index < 0 ? 0 : index);
                setExpanded(true);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const fullscreen = expanded
    ? createPortal(
        <div
          className="server-voice-screen-expanded"
          onClick={closeExpanded}
        >
          <video
            key={`exp-${active.id}-${aspectKey}`}
            ref={expandedVideoCallbackRef}
            className="server-voice-screen-video"
            autoPlay
            playsInline
            muted
          />
          <div className="server-voice-screen-badge">
            <Monitor size={14} />
            <span>{label}</span>
          </div>
          {!active.isLocal && (
            <label
              className="server-voice-screen-volume is-expanded"
              onClick={(e) => e.stopPropagation()}
            >
              <Volume2 size={14} aria-hidden="true" />
              <input
                aria-label={t("Screen share volume")}
                type="range"
                min="0"
                max="100"
                value={volumeFor(active)}
                onChange={(e) => onVolumeChange?.(active.id, Number(e.target.value))}
              />
              <span>{volumeFor(active)}%</span>
            </label>
          )}
          <div className="server-voice-screen-hint is-expanded">
            {t("Click anywhere to exit fullscreen")}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
    <div className="server-voice-screen-stage">
      {audioSinks}

      <div className="server-voice-screen" data-sharer-id={active.id}>
        <video
          key={`${active.id}-${aspectKey}`}
          ref={normalVideoCallbackRef}
          className="server-voice-screen-video"
          autoPlay
          playsInline
          muted
        />

        {!streamHasLiveVideo(screenStream) && (
          <div className="server-voice-screen-waiting">{t("Waiting for screen…")}</div>
        )}

        <button
          type="button"
          className="server-voice-screen-hit"
          aria-label={t("Click to expand")}
          onClick={openExpanded}
        />

        <div className="server-voice-screen-badge">
          <Monitor size={12} />
          <span>{label}</span>
        </div>

        {!active.isLocal && (
          <label className="server-voice-screen-volume" onClick={(e) => e.stopPropagation()}>
            <Volume2 size={14} aria-hidden="true" />
            <input
              aria-label={t("Screen share volume")}
              type="range"
              min="0"
              max="100"
              value={volumeFor(active)}
              onChange={(e) => onVolumeChange?.(active.id, Number(e.target.value))}
            />
            <span>{volumeFor(active)}%</span>
          </label>
        )}

        <div className="server-voice-screen-hint">{t("Click to expand")}</div>
      </div>

      {sharers.length > 1 && (
        <div className="server-voice-screen-switcher">
          <span>{t("Screens:")}</span>
          {sharers.map((sharer, idx) => (
            <button
              key={sharer.id}
              type="button"
              className={`server-voice-screen-chip${idx === safeIndex ? " is-active" : ""}`}
              onClick={() => setSelectedIndex(idx)}
            >
              <Monitor size={12} />
              {sharer.isLocal
                ? t("Your Screen")
                : t("{name}'s Screen", { name: sharer.username || "Member" })}
            </button>
          ))}
        </div>
      )}
    </div>
    {fullscreen}
    </>
  );
}

/**
 * Server voice channel room.
 * Screen share keeps the group/DM controls: multi-sharer switch, volume, fullscreen.
 */
export default function ServerVoicePanel({
  channel,
  server,
  me,
  serverVoice,
}) {
  const t = useT();
  const { toast } = useToast();
  const inThis =
    serverVoice?.isInVoice &&
    serverVoice.activeChannelId === channel?.id;
  const isStage = channel?.type === "stage" || serverVoice?.channelType === "stage";
  const isStageSpeaker = !isStage || serverVoice?.stageRole === "speaker";
  const state =
    serverVoice?.voiceStatesByServer?.[server?.id]?.[channel?.id] || null;
  const remoteMembers = inThis
    ? serverVoice.participants || []
    : state?.members || [];
  const count = inThis
    ? (serverVoice.participants?.length || 0) + 1
    : state?.memberCount || 0;

  const voicePermissionsReady =
    serverPermissionsLoaded(server) || Boolean(server?.isOwner);
  const canConnect = voicePermissionsReady && serverHasPermission(server, "CONNECT");
  const canStream = voicePermissionsReady && serverHasPermission(server, "STREAM");
  const canPublishMedia = Boolean(serverVoice?.canSpeak && isStageSpeaker);
  const canVideo = Boolean(canStream && serverVoice?.canStream && canPublishMedia);

  const screenSharers = useMemo(() => {
    if (!inThis) return [];
    const list = [];
    if (
      serverVoice?.isScreenSharing &&
      (streamHasLiveVideo(serverVoice.screenStream) || streamHasLiveAudio(serverVoice.screenStream))
    ) {
      list.push({
        id: "local",
        username: resolveDisplayName(me) || me?.username || t("You"),
        stream: serverVoice.screenStream,
        isLocal: true,
      });
    }
    for (const p of serverVoice?.participants || []) {
      const stream = visibleScreenStream(p);
      if (!stream) continue;
      const live =
        p.isScreenSharing ||
        streamHasLiveVideo(stream) ||
        streamHasLiveAudio(stream);
      if (!live) continue;
      list.push({
        id: p.id,
        username: resolveDisplayName(p) || p.username || "Member",
        stream,
        isLocal: false,
      });
    }
    return list;
  }, [
    inThis,
    me,
    serverVoice?.isScreenSharing,
    serverVoice?.screenStream,
    serverVoice?.participants,
    t,
  ]);

  const [memberMenu, setMemberMenu] = useState(null);
  const [screenExpand, setScreenExpand] = useState({ token: 0, id: null });
  const [tileFullscreen, setTileFullscreen] = useState(null);
  const tilesRef = useRef([]);
  const closeTileFullscreen = useCallback(() => {
    setTileFullscreen(null);
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);
  const expandShare = useCallback((id, tileEl) => {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(id)) : String(id);
    const stageRoot = document.querySelector(`.server-voice-screen[data-sharer-id="${escaped}"]`);
    const root = stageRoot || tileEl || null;
    if (presentScreenFullscreen(root) === "video") return;
    if (stageRoot) {
      setTileFullscreen(null);
      setScreenExpand((prev) => ({ token: prev.token + 1, id }));
      return;
    }
    const tile = tilesRef.current.find((item) => String(item.id) === String(id));
    const stream = tile?.cameraStream || null;
    if (!streamHasLiveVideo(stream)) return;
    setTileFullscreen({
      id,
      stream,
      label: tile?.sharing
        ? t("{name}'s Screen", { name: tile.label || "Member" })
        : tile?.label || "",
    });
  }, [t]);
  const voiceChannels = useMemo(
    () => (server?.channels || []).filter((c) => c?.type === "voice" || c?.type === "stage"),
    [server?.channels]
  );
  const canMoveMembers = voicePermissionsReady && serverHasPermission(server, "MOVE_MEMBERS");
  const canMuteMembers = voicePermissionsReady && serverHasPermission(server, "MUTE_MEMBERS");
  const canDeafenMembers = voicePermissionsReady && serverHasPermission(server, "DEAFEN_MEMBERS");

  const tiles = useMemo(() => {
    const list = [];
    const meId = me?.id != null ? String(me.id) : "";
    if (inThis && me) {
      list.push({
        id: meId || "local",
        channelId: channel?.id,
        member: {
          ...me,
          serverMuted: Boolean(serverVoice?.serverMuted),
          serverDeafened: Boolean(serverVoice?.serverDeafened),
        },
        label: resolveDisplayName(me) || me.username || t("You"),
        isLocal: true,
        audioStream: serverVoice?.localStream || null,
        cameraStream: serverVoice?.isCameraOn ? serverVoice.cameraStream : null,
        cameraOn: Boolean(serverVoice?.isCameraOn),
        muted: Boolean(serverVoice?.muted || serverVoice?.serverMuted),
        deafened: Boolean(serverVoice?.serverDeafened),
        sharing: Boolean(serverVoice?.isScreenSharing),
      });
    }
    for (const member of remoteMembers) {
      if (!member?.id) continue;
      if (inThis && meId && String(member.id) === meId) continue;
      const audioStream = inThis
        ? member.stream || serverVoice?.remoteStreams?.get?.(member.id) || null
        : null;
      const promoted = inThis ? visibleScreenStream(member) : null;
      const cameraIsScreen = Boolean(promoted && promoted === member.cameraStream);
      list.push({
        id: String(member.id),
        channelId: channel?.id,
        member,
        label: resolveDisplayName(member) || member.username || "Member",
        isLocal: false,
        audioStream,
        cameraStream: inThis && !cameraIsScreen ? member.cameraStream || null : null,
        cameraOn: Boolean(member.cameraOn || (member.cameraStream && !cameraIsScreen)),
        muted: Boolean(member.muted || member.serverMuted),
        deafened: Boolean(member.serverDeafened),
        sharing: Boolean(member.isScreenSharing || member.screenStream || cameraIsScreen),
      });
    }
    return list;
  }, [
    channel?.id,
    inThis,
    me,
    remoteMembers,
    serverVoice?.cameraStream,
    serverVoice?.isCameraOn,
    serverVoice?.isScreenSharing,
    serverVoice?.localStream,
    serverVoice?.muted,
    serverVoice?.remoteStreams,
    serverVoice?.serverDeafened,
    serverVoice?.serverMuted,
    t,
  ]);
  tilesRef.current = tiles;

  useEffect(() => {
    if (!tileFullscreen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeTileFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tileFullscreen, closeTileFullscreen]);

  const sharing = screenSharers.length > 0;
  const link = serverVoice?.liveKitLink;
  let statusLabel = "";
  let statusTone = "idle";
  if (serverVoice?.error) {
    statusLabel = t(serverVoice.error);
    statusTone = "bad";
  } else if (serverVoice?.connecting || (inThis && link === "connecting")) {
    statusLabel = t("Connecting…");
    statusTone = "wait";
  } else if (inThis && link === "reconnecting") {
    statusLabel = t("Reconnecting…");
    statusTone = "wait";
  } else if (inThis && link === "disconnected") {
    statusLabel = t("Disconnected");
    statusTone = "bad";
  } else if (inThis) {
    statusLabel = t("Connected");
    statusTone = "ok";
  }

  const countLabel = isStage
    ? t("{count} in stage", { count })
    : t("{count} in voice", { count });

  const onToggleScreen = async () => {
    if (!canVideo) return;
    if (!serverVoice?.isScreenSharing && screenShareComingSoonOnIos()) {
      toast(t("Screen sharing is coming soon on iPhone."), "info");
      return;
    }
    if (serverVoice?.isScreenSharing) {
      await serverVoice.stopScreenShare?.();
    } else {
      await serverVoice.startScreenShare?.();
    }
  };

  const onToggleCamera = async () => {
    if (!canVideo) return;
    await serverVoice?.toggleCamera?.();
  };

  const openMemberMenu = useCallback((next) => setMemberMenu(next), []);

  return (
    <div className="server-voice-panel server-voice-room">
      {tileFullscreen
        ? createPortal(
            <div className="server-voice-screen-expanded" onClick={closeTileFullscreen}>
              <TileFullscreenVideo stream={tileFullscreen.stream} />
              <div className="server-voice-screen-badge">
                <Monitor size={14} />
                <span>{tileFullscreen.label}</span>
              </div>
              <div className="server-voice-screen-hint is-expanded">
                {t("Click anywhere to exit fullscreen")}
              </div>
            </div>,
            document.body
          )
        : null}
      <header className="server-voice-room-head">
        <span className="server-voice-room-mark" aria-hidden>
          {isStage ? <Radio size={18} /> : <Volume2 size={18} />}
        </span>
        <div className="server-voice-room-title">
          <h2>
            {channel?.name || t("Voice channel")}
            {isStage ? <span className="server-stage-pill">{t("Stage")}</span> : null}
          </h2>
          <p>
            {isStage ? t("Stage channel") : t("Voice channel")}
            {channel?.topic ? ` · ${channel.topic}` : ""}
          </p>
        </div>
        <div className="server-voice-room-meta">
          {statusLabel ? (
            <span className={`server-voice-status is-${statusTone}`} role="status">
              <i aria-hidden />
              {statusLabel}
            </span>
          ) : null}
          <span className="server-voice-count-pill">
            <Users size={13} aria-hidden />
            {countLabel}
          </span>
          {serverVoice?.mediaMode === "sfu" ? (
            <span className="server-media-mode">{t("SFU voice enabled")}</span>
          ) : null}
        </div>
      </header>

      {serverVoice?.error ? <p className="server-modal-error server-voice-room-error">{t(serverVoice.error)}</p> : null}

      <div className={`server-voice-room-stage${sharing ? " is-sharing" : ""}`}>
        {sharing ? (
          <ServerScreenShareStage
            sharers={screenSharers}
            volumes={serverVoice?.screenVolumes || {}}
            onVolumeChange={(id, value) => serverVoice?.setScreenShareVolume?.(id, value)}
            sinkId={serverVoice?.selectedAudioOutput || ""}
            expandToken={screenExpand.token}
            expandSharerId={screenExpand.id}
          />
        ) : null}
        {tiles.length > 0 ? (
          <div
            className={`server-voice-grid ${gridBand(tiles.length)}${sharing ? " is-rail" : ""}`}
            aria-label={t("In this channel")}
          >
            <div className="server-voice-grid-flow">
              {tiles.map((tile) => (
                <VoiceTile
                  key={tile.id}
                  tile={tile}
                  compact={sharing}
                  count={tiles.length}
                  youLabel={t("You")}
                  onOpenMenu={openMemberMenu}
                  onExpandShare={expandShare}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="server-voice-empty">
            <p>{t("Nobody here yet")}</p>
            <p>
              {isStage
                ? t("Join as audience, then request to speak.")
                : t("Join to talk — no ringing, drop in anytime.")}
            </p>
          </div>
        )}
      </div>

      <footer className="server-voice-dock">
        {inThis ? (
          <>
            <div className="server-voice-dock-group" role="group" aria-label={t("Voice channel")}>
              <DockDeviceSlot
                onOpen={() => serverVoice.refreshMediaDevices?.()}
                menuLabel={t("Audio devices")}
                sections={[
                  {
                    id: "mic",
                    label: t("Microphone"),
                    devices: serverVoice.audioInputDevices || [],
                    selectedId: serverVoice.selectedAudioInput || "",
                    onSelect: (deviceId) => serverVoice.setAudioInput?.(deviceId),
                  },
                  {
                    id: "out",
                    label: t("Headphones"),
                    devices: serverVoice.audioOutputDevices || [],
                    selectedId: serverVoice.selectedAudioOutput || "",
                    onSelect: (deviceId) => serverVoice.setAudioOutput?.(deviceId),
                  },
                ]}
              >
                <button
                  type="button"
                  className={`server-voice-dock-btn${serverVoice.muted ? " is-off" : ""}`}
                  onClick={() => serverVoice.toggleMute?.()}
                  disabled={!serverVoice.canSpeak}
                  aria-pressed={Boolean(serverVoice.muted)}
                  aria-label={serverVoice.muted ? t("Unmute") : t("Mute")}
                  title={
                    !serverVoice.canSpeak
                      ? t("You need to be invited to speak first.")
                      : serverVoice.muted
                        ? t("Unmute")
                        : t("Mute")
                  }
                >
                  {serverVoice.muted ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              </DockDeviceSlot>
              <button
                type="button"
                className={`server-voice-dock-btn${serverVoice.deafened ? " is-off" : ""}`}
                onClick={() => serverVoice.toggleDeafen?.()}
                aria-pressed={Boolean(serverVoice.deafened)}
                aria-label={serverVoice.deafened ? t("Undeafen") : t("Deafen")}
                title={serverVoice.deafened ? t("Undeafen") : t("Deafen")}
              >
                {serverVoice.deafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
              </button>
              {isNoiseSuppressionEnabled() ? (
                <span className="server-voice-ns-badge" title={t("AI noise suppression")}>
                  NS
                </span>
              ) : null}
              {isStage && serverVoice.stageRole !== "speaker" ? (
                <button
                  type="button"
                  className={`server-voice-dock-btn${serverVoice.requestedToSpeak ? " is-live" : ""}`}
                  onClick={() => serverVoice.requestToSpeak?.()}
                  disabled={!serverVoice.canRequestToSpeak || serverVoice.requestedToSpeak}
                  aria-label={serverVoice.requestedToSpeak ? t("Requested") : t("Request to Speak")}
                  title={!serverVoice.canRequestToSpeak ? t("Permission denied") : t("Request to Speak")}
                >
                  <Radio size={18} />
                </button>
              ) : null}
              <DockDeviceSlot
                onOpen={() => serverVoice.refreshMediaDevices?.()}
                menuLabel={t("Camera")}
                sections={[
                  {
                    id: "cam",
                    label: t("Camera"),
                    devices: serverVoice.videoInputDevices || [],
                    selectedId: serverVoice.selectedVideoInput || "",
                    onSelect: (deviceId) => serverVoice.setVideoInput?.(deviceId),
                  },
                ]}
              >
                <button
                  type="button"
                  className={`server-voice-dock-btn${serverVoice.isCameraOn ? " is-live" : ""}`}
                  onClick={onToggleCamera}
                  disabled={!canVideo}
                  aria-pressed={Boolean(serverVoice.isCameraOn)}
                  aria-label={serverVoice.isCameraOn ? t("Turn Camera Off") : t("Turn Camera On")}
                  title={!canVideo ? t("Permission denied") : serverVoice.isCameraOn ? t("Turn Camera Off") : t("Turn Camera On")}
                >
                  {serverVoice.isCameraOn ? <VideoOff size={18} /> : <Video size={18} />}
                </button>
              </DockDeviceSlot>
              <button
                type="button"
                className={`server-voice-dock-btn${serverVoice.isScreenSharing ? " is-live" : ""}`}
                onClick={onToggleScreen}
                disabled={!canVideo}
                aria-pressed={Boolean(serverVoice.isScreenSharing)}
                aria-label={serverVoice.isScreenSharing ? t("Stop Screen Share") : t("Share Screen")}
                title={
                  !canVideo
                    ? t("Permission denied")
                    : serverVoice.isScreenSharing
                      ? t("Stop Screen Share")
                      : t("Share Screen")
                }
              >
                {serverVoice.isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
              </button>
            </div>
            <button
              type="button"
              className="server-voice-dock-btn leave"
              onClick={() => serverVoice.leave?.()}
              aria-label={t("Leave")}
              title={t("Leave")}
            >
              <LogOut size={18} />
              {t("Leave")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="server-voice-dock-btn join"
            disabled={!canConnect || serverVoice?.connecting}
            onClick={() => serverVoice.join?.(server.id, channel)}
            aria-label={t("Join Voice")}
          >
            <LogIn size={18} />
            {serverVoice?.connecting ? t("Please wait...") : t("Join Voice")}
          </button>
        )}
      </footer>

      <VoiceMemberContextMenu
        menu={memberMenu}
        canMove={canMoveMembers}
        canMute={canMuteMembers}
        canDeafen={canDeafenMembers}
        voiceChannels={voiceChannels}
        serverId={server?.id}
        serverVoice={serverVoice}
        voiceVolume={Math.round(((serverVoice?.participantVolumes?.[String(memberMenu?.user?.id)] ?? 1) * 100))}
        onVoiceVolume={(value) => serverVoice?.setParticipantVolume?.(memberMenu?.user?.id, value / 100)}
        onToggleVoiceMute={() => serverVoice?.toggleParticipantMute?.(memberMenu?.user?.id)}
        showScreenVolume={Boolean(memberMenu?.sharing || memberMenu?.user?.isScreenSharing || memberMenu?.user?.screenStream)}
        screenVolume={serverVoice?.screenVolumes?.[String(memberMenu?.user?.id)] ?? 100}
        onScreenVolume={(value) => serverVoice?.setScreenShareVolume?.(memberMenu?.user?.id, value)}
        onViewProfile={() => {
          const user = memberMenu?.user;
          if (!user?.id) return;
          window.dispatchEvent(new CustomEvent("descall:open-profile", { detail: { user } }));
          setMemberMenu(null);
        }}
        onCopyId={() => {
          const id = memberMenu?.user?.id;
          if (id == null) return;
          navigator.clipboard?.writeText(String(id)).then(() => toast(t("Copied"), "success")).catch(() => {});
          setMemberMenu(null);
        }}
        onClose={() => setMemberMenu(null)}
      />
    </div>
  );
}
