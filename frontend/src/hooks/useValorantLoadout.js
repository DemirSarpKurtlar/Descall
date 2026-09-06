import { useCallback, useEffect, useRef, useState } from "react";
import {
  getValorantLoadout,
  getValorantStoreStatus,
  localStoreTokens,
  putValorantLoadout,
} from "../api/valorantStore";

/**
 * Wire hook for Dima's Adım 6 Companion loadout panel (view + equip).
 *
 * @param {{ enabled?: boolean, region?: string, puuid?: string, pollMs?: number }} opts
 */
export default function useValorantLoadout(opts = {}) {
  const { enabled = true, region = "eu", puuid = null, pollMs = 120000 } = opts;
  const [loading, setLoading] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [capability, setCapability] = useState(null);
  const [loadout, setLoadout] = useState(null);
  const [configured, setConfigured] = useState(true);
  const [envNeeded, setEnvNeeded] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const resolveTokens = useCallback(async () => {
    const local = await localStoreTokens();
    return {
      accessToken: local?.tokens?.accessToken,
      entitlementToken: local?.tokens?.entitlementToken,
      region: region || local?.session?.region || "eu",
      puuid: puuid || local?.session?.puuid || null,
    };
  }, [region, puuid]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const cap = await getValorantStoreStatus().catch(() => null);
      if (!mounted.current) return null;
      setCapability(cap);

      if (cap && cap.configured === false) {
        setConfigured(false);
        setEnvNeeded(cap.envNeeded || ["RIOT_API_KEY"]);
        setLoadout(null);
        setError("");
        return cap;
      }

      setConfigured(true);
      setEnvNeeded([]);

      const tokens = await resolveTokens();
      const data = await getValorantLoadout(tokens);
      if (!mounted.current) return null;

      if (data?.configured === false) {
        setConfigured(false);
        setEnvNeeded(data.envNeeded || ["RIOT_API_KEY"]);
        setLoadout(null);
        return data;
      }

      setLoadout(data?.loadout || null);
      setError("");
      return data;
    } catch (err) {
      if (!mounted.current) return null;
      setError(err.message || "Failed to load loadout");
      if (err.body?.configured === false) {
        setConfigured(false);
        setEnvNeeded(err.body.envNeeded || ["RIOT_API_KEY"]);
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, resolveTokens]);

  useEffect(() => {
    refresh();
    if (!enabled || !pollMs) return undefined;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, enabled, pollMs]);

  /**
   * Equip patch — merges into current Riot loadout and PUTs (reflects in-game).
   * @param {{ guns?: object[], sprays?: object[], identity?: object, incognito?: boolean, raw?: object }} patch
   */
  const equip = useCallback(
    async (patch) => {
      if (!patch || busy) return null;
      setBusy(true);
      setError("");
      try {
        const tokens = await resolveTokens();
        const data = await putValorantLoadout(patch, tokens);
        if (mounted.current) {
          if (data?.configured === false) {
            setConfigured(false);
            setEnvNeeded(data.envNeeded || ["RIOT_API_KEY"]);
          } else {
            setLoadout(data?.loadout || null);
          }
        }
        return data;
      } catch (err) {
        if (mounted.current) setError(err.message || "Equip failed");
        return null;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [busy, resolveTokens]
  );

  return {
    loading,
    busy,
    error,
    capability,
    configured,
    envNeeded,
    loadout,
    refresh,
    equip,
  };
}
