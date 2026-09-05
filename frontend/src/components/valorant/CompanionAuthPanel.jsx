import { useCallback, useEffect, useState } from "react";
import { Link2, LogOut, MonitorSmartphone, RefreshCw, Unplug } from "lucide-react";
import {
  disconnectValorantSession,
  getValorantMe,
  getValorantStatus,
  linkValorantSession,
} from "../../api/valorant";
import { startRiotOAuth } from "../../api/riot";
import {
  hasLocalLockfileApi,
  hasRsoWindowApi,
  isElectronValorant,
  localConnect,
  localDisconnect,
  localGetTokens,
  localSavePublic,
  localStatus,
  onRsoResult,
  openRsoLogin,
} from "../../lib/valorantSecureStore";
import { useT } from "../../context/LocaleContext";
import { SkeletonLine } from "../ui/Skeleton";

/**
 * Adım 2 — Riot auth for Companion tab.
 * Primary: Riot Sign-On (auth.riotgames.com) in browser / Electron BrowserWindow.
 * Secondary (Electron only): local Riot Client lockfile shortcut.
 */
export default function CompanionAuthPanel() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [local, setLocal] = useState(null);
  const [me, setMe] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [st, loc] = await Promise.all([
        getValorantStatus().catch((err) => {
          throw err;
        }),
        localStatus(),
      ]);
      setStatus(st);
      setLocal(loc);

      let tokens = null;
      if (loc?.hasTokens) {
        const tok = await localGetTokens();
        if (tok?.ok) tokens = tok.tokens;
      }

      try {
        const meRes = await getValorantMe({
          accessToken: tokens?.accessToken,
          entitlementToken: tokens?.entitlementToken,
          region: loc?.session?.region || st?.valorant?.region,
        });
        setMe(meRes?.me || st?.valorant || loc?.session || null);
      } catch {
        setMe(st?.valorant || loc?.session || null);
      }
    } catch (err) {
      setError(err.message || t("valorantHub.authLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Electron RSO BrowserWindow callback
  useEffect(() => {
    const off = onRsoResult(async (result) => {
      if (result?.ok || result?.status === "success") {
        setBusy(false);
        setError("");
        // Mirror public RSO identity into on-device safeStorage marker (no password).
        try {
          const st = await getValorantStatus();
          const card = st?.valorant;
          if (card?.gameName && card?.tagLine && hasLocalLockfileApi()) {
            await localSavePublic({
              gameName: card.gameName,
              tagLine: card.tagLine,
              region: card.region || "eu",
              puuid: card.puuid || null,
              linkMethod: "rso",
              // Tokens stay server-side for RSO; lockfile tokens untouched.
            });
          }
        } catch {
          /* ignore */
        }
        await refresh();
        return;
      }
      setBusy(false);
      setError(result?.error || t("valorantHub.rsoUnavailable"));
    });
    return () => {
      try {
        off?.();
      } catch {
        /* ignore */
      }
    };
  }, [refresh, t]);

  // Web OAuth return (?riot_link=) — App.jsx toasts; we refresh if query present.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || "");
      if (params.get("riot_link") === "success") {
        refresh();
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  const connected =
    Boolean(me?.linked || me?.riotId || (me?.gameName && me?.tagLine)) ||
    Boolean(local?.session?.riotId);

  const display = me?.linked || me?.riotId
    ? me
    : local?.session || status?.valorant || null;

  const handleRso = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await startRiotOAuth();
      if (!res?.url) {
        setError(res?.error || t("valorantHub.rsoUnavailable"));
        setBusy(false);
        return;
      }
      const opened = await openRsoLogin(res.url);
      if (!opened?.ok) {
        setError(opened?.error || t("valorantHub.rsoUnavailable"));
        setBusy(false);
        return;
      }
      // BrowserWindow: wait for valorant:rso-result. External/redirect: page navigates away.
      if (opened.mode === "external" || opened.mode === "redirect") {
        // Keep busy briefly; external users finish on web callback.
        if (opened.mode === "external") {
          setBusy(false);
        }
      }
      // mode === browserWindow → stay busy until onRsoResult
    } catch (err) {
      setError(err.message || t("valorantHub.rsoUnavailable"));
      setBusy(false);
    }
  };

  const handleLocalConnect = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await localConnect();
      if (!res?.ok) {
        setError(res?.error || t("valorantHub.localConnectFailed"));
        return;
      }
      const session = res.session;
      let enriched = session;
      try {
        const meRes = await getValorantMe({
          accessToken: res.tokens?.accessToken,
          entitlementToken: res.tokens?.entitlementToken,
          region: session?.region,
        });
        if (meRes?.me) enriched = { ...session, ...meRes.me };
      } catch {
        /* local alias may already have Name#Tag */
      }

      if (enriched?.gameName && enriched?.tagLine) {
        await linkValorantSession({
          gameName: enriched.gameName,
          tagLine: enriched.tagLine,
          region: enriched.region || "eu",
          puuid: enriched.puuid || null,
          linkMethod: "local_client",
        });
        if (hasLocalLockfileApi()) {
          await window.electronAPI.valorantLocalSaveSession({
            gameName: enriched.gameName,
            tagLine: enriched.tagLine,
            region: enriched.region || "eu",
            puuid: enriched.puuid || null,
          });
        }
      } else {
        setError(t("valorantHub.localMissingId"));
      }
      await refresh();
    } catch (err) {
      setError(err.message || t("valorantHub.localConnectFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy) return;
    if (!window.confirm(t("valorantHub.disconnectConfirm"))) return;
    setBusy(true);
    setError("");
    try {
      await localDisconnect();
      await disconnectValorantSession().catch(() => {});
      setMe(null);
      await refresh();
    } catch (err) {
      setError(err.message || t("valorantHub.disconnectFailed"));
    } finally {
      setBusy(false);
    }
  };

  const envNeeded = status?.envNeededIfRsoMissing || [];
  const electron = isElectronValorant();
  const rsoReady = Boolean(status?.rsoEnabled);

  return (
    <div className="valorant-companion">
      <div className="valorant-companion-card valorant-auth-card">
        <div className="valorant-companion-icon" aria-hidden>
          <Link2 size={28} />
        </div>
        <h3>{t("valorantHub.companion")}</h3>
        <p className="valorant-auth-lead">{t("valorantHub.authLead")}</p>

        {loading ? (
          <div className="valorant-auth-skeleton" aria-busy="true">
            <SkeletonLine width="48%" height={14} />
            <div style={{ height: 10 }} />
            <SkeletonLine width="72%" height={12} />
            <div style={{ height: 8 }} />
            <SkeletonLine width="56%" height={12} />
          </div>
        ) : connected && display ? (
          <div className="valorant-auth-connected">
            <div className="valorant-auth-identity">
              <div className="valorant-auth-riotid">
                {display.riotId || `${display.gameName}#${display.tagLine}`}
              </div>
              <div className="valorant-auth-meta">
                <span className="valorant-auth-pill">
                  {(display.region || "eu").toUpperCase()}
                </span>
                {display.linkMethod ? (
                  <span className="valorant-auth-pill muted">{display.linkMethod}</span>
                ) : null}
                {display.rankTier || display.rank ? (
                  <span className="valorant-auth-pill rank">
                    {display.rankTier || display.rank}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="valorant-auth-actions">
              <button type="button" className="valorant-auth-btn ghost" onClick={refresh} disabled={busy}>
                <RefreshCw size={14} /> {t("valorantHub.refresh")}
              </button>
              <button
                type="button"
                className="valorant-auth-btn danger"
                onClick={handleDisconnect}
                disabled={busy}
              >
                <LogOut size={14} /> {t("valorantHub.disconnect")}
              </button>
            </div>
            <p className="valorant-auth-secure-note">
              {electron
                ? t("valorantHub.secureNoteElectron")
                : t("valorantHub.secureNoteWeb")}
            </p>
          </div>
        ) : (
          <div className="valorant-auth-connect">
            {rsoReady ? (
              <button
                type="button"
                className="valorant-auth-btn primary"
                onClick={handleRso}
                disabled={busy}
              >
                <Link2 size={16} />
                {busy ? t("valorantHub.connecting") : t("valorantHub.connectRso")}
              </button>
            ) : (
              <div className="valorant-auth-env-hint" role="note">
                <Unplug size={14} aria-hidden />
                <div>
                  <p>
                    <strong>{t("valorantHub.rsoConfigTitle")}</strong>
                  </p>
                  <p>{t("valorantHub.rsoNotConfigured")}</p>
                  {envNeeded.length > 0 ? (
                    <code className="valorant-auth-env-list">{envNeeded.join(", ")}</code>
                  ) : null}
                </div>
              </div>
            )}

            {electron && hasLocalLockfileApi() ? (
              <button
                type="button"
                className="valorant-auth-btn ghost"
                onClick={handleLocalConnect}
                disabled={busy}
              >
                <MonitorSmartphone size={16} />
                {busy ? t("valorantHub.connecting") : t("valorantHub.connectLocalSecondary")}
              </button>
            ) : null}

            {!electron && !rsoReady ? (
              <p className="valorant-auth-footnote">{t("valorantHub.webRsoRequired")}</p>
            ) : null}

            <p className="valorant-auth-footnote">{t("valorantHub.authFootnote")}</p>
            {hasRsoWindowApi() ? (
              <p className="valorant-auth-footnote muted">{t("valorantHub.rsoElectronHint")}</p>
            ) : null}
          </div>
        )}

        {error ? <div className="valorant-auth-error">{error}</div> : null}

        <p className="valorant-companion-note">{t("valorantHub.tosNote")}</p>
      </div>
    </div>
  );
}
