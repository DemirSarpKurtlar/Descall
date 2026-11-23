/*
 * Settings > Sesli kısayollar (4.2). What each shell offers outside the app:
 *   iPhone / iPad  the Siri phrases (src/i18n/voiceShortcutsCatalog.js) and "Siri'ye ekle",
 *                  a native sheet with Siri tips and the Shortcuts app link (iOS 17+);
 *   Android        the app icon shortcuts and "Ana ekrana ekle" for a recent chat;
 *   Windows        the taskbar jump list.
 * Rows reuse the settings card (us-card / us-row); styles/voice-shortcuts.css adds the phrase
 * chips. Every string is in vsc.<locale>.js.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale } from "../../context/LocaleContext";
import { S3Glyph } from "./SettingsV3";
import { shortcutsForLocale } from "../../i18n/voiceShortcutsCatalog.js";
import {
  getRecentShortcuts,
  getVoiceShortcutsAvailability,
  nativePlatform,
  pinConversationShortcut,
  presentSiriShortcuts,
  subscribeRecentShortcuts,
} from "../../lib/nativeIntents.js";
import { Avatar } from "../ui/Avatar";
import "../../styles/voice-shortcuts.css";

const GLYPH = {
  send: "send",
  unread: "bell",
  online: "users",
  mute: "micoff",
  deafen: "headoff",
  leave: "phone",
  status: "moon",
  voice: "volume",
  chat: "msg",
  place: "hash",
};

function PhraseList({ rows, t }) {
  return (
    <ul className="us-card stack vsc-list" aria-label={t("vsc.phrasesTitle")}>
      {rows.map((r) => (
        <li key={r.id} className="us-row vsc-row">
          <span className="vsc-ico" aria-hidden="true">
            <S3Glyph name={GLYPH[r.id] || "bolt"} size={16} stroke={2.2} />
          </span>
          <span className="vsc-copy">
            <span className="us-row-title">{t(`vsc.shortcut.${r.id}`)}</span>
            <q className="vsc-phrase">{r.phrase}</q>
          </span>
          {r.more > 0 ? <span className="vsc-more">{t("vsc.morePhrases", { count: r.more })}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export default function VoiceShortcutsPane() {
  const { t, locale } = useLocale();
  const platform = useMemo(() => nativePlatform(), []);
  const desktop = typeof window !== "undefined" && typeof window.electronAPI?.setJumpList === "function";
  const [avail, setAvail] = useState(null);
  const [siriState, setSiriState] = useState("idle"); // idle | busy | failed
  const [pins, setPins] = useState({}); // id -> busy | requested | unsupported | failed
  const recent = useSyncExternalStore(subscribeRecentShortcuts, getRecentShortcuts, getRecentShortcuts);
  const rows = useMemo(() => shortcutsForLocale(locale), [locale]);

  useEffect(() => {
    let live = true;
    getVoiceShortcutsAvailability()
      .then((a) => {
        if (live) setAvail(a || { platform });
      })
      .catch(() => {
        if (live) setAvail({ platform });
      });
    return () => {
      live = false;
    };
  }, [platform]);

  const siriReady = platform === "ios" && avail?.intents === true;

  const openSiri = async () => {
    if (siriState === "busy") return;
    setSiriState("busy");
    const res = await presentSiriShortcuts();
    setSiriState(res === null ? "failed" : "idle");
  };

  const pin = async (item) => {
    if (pins[item.id] === "busy") return;
    setPins((p) => ({ ...p, [item.id]: "busy" }));
    const res = await pinConversationShortcut(item, { openChat: t("vsc.openChatWith", { name: "{name}" }) });
    const next = !res ? "failed" : res.supported === false ? "unsupported" : res.requested ? "requested" : "failed";
    setPins((p) => ({ ...p, [item.id]: next }));
  };

  const lead = platform === "android" ? t("vsc.leadAndroid") : platform === "ios" ? t("vsc.lead") : t("vsc.leadDesktop");

  return (
    <div className="us-tab vsc-pane">
      <p className="us-lead">{lead}</p>

      {platform === "ios" ? (
        <section className="us-section" aria-labelledby="vsc-phrases">
          <h3 id="vsc-phrases" className="vsc-title">{t("vsc.phrasesTitle")}</h3>
          <PhraseList rows={rows} t={t} />
          {avail && !siriReady ? (
            <p className="us-row-desc" role="note">{t("vsc.needsIos17")}</p>
          ) : (
            <div className="us-btn-row">
              <button type="button" className="us-btn primary vsc-siri" onClick={openSiri} disabled={!siriReady || siriState === "busy"}>
                <S3Glyph name="sparkle" size={16} stroke={2.2} />
                {t("vsc.addToSiri")}
              </button>
            </div>
          )}
          {siriState === "failed" ? (
            <p className="us-row-desc vsc-error" role="alert">{t("vsc.siriFailed")}</p>
          ) : null}
        </section>
      ) : null}

      {platform === "android" ? (
        <>
          <section className="us-section" aria-labelledby="vsc-launcher">
            <h3 id="vsc-launcher" className="vsc-title">{t("vsc.launcherTitle")}</h3>
            <div className="us-card stack">
              {[
                ["newMessage", "msg"],
                ["dnd", "moon"],
                ["friends", "users"],
              ].map(([key, glyph]) => (
                <div key={key} className="us-row vsc-row">
                  <span className="vsc-ico" aria-hidden="true">
                    <S3Glyph name={glyph} size={16} stroke={2.2} />
                  </span>
                  <span className="vsc-copy">
                    <span className="us-row-title">{t(`vsc.${key}`)}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="us-row-desc">{t("vsc.launcherHint")}</p>
          </section>

          <section className="us-section" aria-labelledby="vsc-recent">
            <h3 id="vsc-recent" className="vsc-title">{t("vsc.recentTitle")}</h3>
            {recent.length ? (
              <div className="us-card stack">
                {recent.map((item) => {
                  const state = pins[item.id];
                  return (
                    <div key={item.id} className="us-row vsc-row">
                      <Avatar user={{ id: item.id, username: item.username, displayName: item.name, avatarUrl: item.avatarUrl }} size={32} />
                      <span className="vsc-copy">
                        <span className="us-row-title">{item.name}</span>
                        {state === "requested" ? <span className="us-row-desc" role="status">{t("vsc.pinRequested")}</span> : null}
                        {state === "unsupported" ? <span className="us-row-desc" role="status">{t("vsc.pinUnsupported")}</span> : null}
                        {state === "failed" ? <span className="us-row-desc vsc-error" role="alert">{t("vsc.pinFailed")}</span> : null}
                      </span>
                      <button
                        type="button"
                        className="us-btn vsc-pin"
                        onClick={() => pin(item)}
                        disabled={state === "busy" || state === "unsupported" || avail?.pinSupported === false}
                      >
                        {t("vsc.addToHome")}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="us-row-desc">{t("vsc.noRecent")}</p>
            )}
            <p className="us-row-desc">{t("vsc.recentHint")}</p>
          </section>
        </>
      ) : null}

      {!platform && desktop ? (
        <section className="us-section" aria-labelledby="vsc-jump">
          <h3 id="vsc-jump" className="vsc-title">{t("vsc.jumpListTitle")}</h3>
          <div className="us-card stack">
            {[
              ["newMessage", "msg"],
              ["jumpStatus", "moon"],
              ["recentTitle", "clock"],
            ].map(([key, glyph]) => (
              <div key={key} className="us-row vsc-row">
                <span className="vsc-ico" aria-hidden="true">
                  <S3Glyph name={glyph} size={16} stroke={2.2} />
                </span>
                <span className="vsc-copy">
                  <span className="us-row-title">{t(`vsc.${key}`)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="us-row-desc">{t("vsc.jumpListHint")}</p>
        </section>
      ) : null}
    </div>
  );
}
