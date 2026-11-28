/*
 * Settings > Desktop app (desktop shells only: Electron preload or the Tauri shim). The
 * version, the live update status and a "Check for updates" action, and the switch for the
 * Discord-like unread badge on the taskbar button / dock (every plan, lib/taskbarBadgePref.js). Downloads run in the
 * shell; a staged update installs on restart (restartApp asks first during a call: the shell
 * sends update:confirm-restart and ElectronUpdateToast shows the confirmation).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale } from "../../context/LocaleContext";
import { mergeCheck, startCheck, statusFromCheck, statusFromEvent, statusFromStatus } from "../../lib/desktopUpdateState.js";
import { isMacPlatform } from "../../lib/shortcuts.js";
import { readTaskbarBadge, setTaskbarBadge, subscribeTaskbarBadge } from "../../lib/taskbarBadgePref.js";
import { S3Foot, S3Group, S3Row, S3Sec } from "./SettingsV3";

/** What the badge looks like on the taskbar (same red and white as the shells draw). */
function BadgePreview() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 9,
        background: "#f23f43",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        marginInlineEnd: 10,
      }}
    >
      9+
    </span>
  );
}

export default function DesktopUpdatePane() {
  const { t } = useLocale();
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const [version, setVersion] = useState(() => (typeof window !== "undefined" ? window.__DESCALL_BOOT__?.version || "" : ""));
  const [state, setState] = useState({ status: "idle", version: null });
  const [checkedAt, setCheckedAt] = useState(null);
  const alive = useRef(true);
  const badgeOn = useSyncExternalStore(subscribeTaskbarBadge, readTaskbarBadge, readTaskbarBadge);

  useEffect(() => {
    alive.current = true;
    if (!api) return undefined;
    Promise.resolve(api.getVersion?.())
      .then((v) => alive.current && v && setVersion(String(v)))
      .catch(() => {});
    Promise.resolve(api.getUpdateStatus?.())
      .then((res) => alive.current && setState((prev) => statusFromStatus(res, prev)))
      .catch(() => {});
    const offs = [
      api.onUpdateDownloading?.((p) => setState((prev) => statusFromEvent(prev, "downloading", p))),
      api.onUpdateProgress?.((p) => setState((prev) => statusFromEvent(prev, "progress", p))),
      api.onUpdateReady?.((p) => setState((prev) => statusFromEvent(prev, "ready", p))),
      api.onUpdateError?.((p) => setState((prev) => statusFromEvent(prev, "error", p))),
    ];
    return () => {
      alive.current = false;
      offs.forEach((off) => {
        try {
          if (typeof off === "function") off();
        } catch {
          /* ignore */
        }
      });
    };
  }, [api]);

  const check = useCallback(async () => {
    if (!api?.checkForUpdates) return;
    setState(startCheck);
    let next;
    try {
      next = statusFromCheck(await api.checkForUpdates());
    } catch {
      next = { status: "error", version: null };
    }
    if (!alive.current) return;
    setCheckedAt(new Date());
    // An update:downloading / progress event may already have moved the status on.
    setState((prev) => mergeCheck(prev, next));
  }, [api]);

  const restart = useCallback(() => {
    try {
      api?.restartApp?.();
    } catch {
      /* the shell owns the install */
    }
  }, [api]);

  const { status } = state;
  const v = { version: state.version || "" };
  let statusText = null;
  if (status === "checking") statusText = t("updateToast.settings_checking");
  else if (status === "upToDate") statusText = t("updateToast.settings_upToDate");
  else if (status === "downloading") statusText = state.percent ? `${t("updateToast.settings_downloading", v)} · ${t("updateToast.percent", { percent: state.percent })}` : t("updateToast.settings_downloading", v);
  else if (status === "ready") statusText = t("updateToast.readyIdle");
  else if (status === "error") statusText = t("updateToast.settings_checkFailed");
  else if (status === "unavailable") statusText = t("updateToast.settings_unavailable");

  const timeText = checkedAt ? checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="s3 s3-desktop-update">
      <S3Sec first>{t("updateToast.settings_title")}</S3Sec>
      <S3Group>
        <S3Row icon="win" color="blue" title={version ? t("updateToast.settings_version", { version }) : t("updateToast.settings_title")} />
        {status === "ready" ? (
          <S3Row icon="refresh" color="green" title={t("updateToast.restart")} sub={statusText} tone="blue" onClick={restart} />
        ) : (
          <S3Row
            icon="down"
            color="teal"
            title={t("updateToast.settings_check")}
            sub={statusText}
            tone="blue"
            onClick={status === "checking" ? undefined : check}
          />
        )}
      </S3Group>
      {timeText ? <S3Foot>{t("updateToast.settings_lastChecked", { time: timeText })}</S3Foot> : null}
      <S3Sec>{t("updateToast.settings_badgeSection")}</S3Sec>
      <S3Group>
        <S3Row
          icon="bell"
          color="red"
          title={t("updateToast.settings_badge")}
          sub={t(isMacPlatform() ? "updateToast.settings_badgeHintMac" : "updateToast.settings_badgeHint")}
          badge={badgeOn ? <BadgePreview /> : null}
          toggle={badgeOn}
          onToggle={setTaskbarBadge}
        />
      </S3Group>
    </div>
  );
}
