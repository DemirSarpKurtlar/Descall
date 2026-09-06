import { useCallback, useEffect, useRef, useState } from "react";
import {
  getValorantOwnedSkins,
  getValorantStoreOffers,
  getValorantStoreStatus,
  getValorantWallet,
  localStoreTokens,
} from "../api/valorantStore";

/**
 * Wire hook for Dima's Adım 6 Companion store / wallet / owned skins panel.
 * Does not own full UI — polls status + wallet + offers when enabled + linked.
 *
 * @param {{ enabled?: boolean, region?: string, puuid?: string, pollMs?: number }} opts
 */
export default function useValorantStore(opts = {}) {
  const { enabled = true, region = "eu", puuid = null, pollMs = 90000 } = opts;
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const [capability, setCapability] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [offers, setOffers] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [offersRemainingSeconds, setOffersRemainingSeconds] = useState(null);
  const [skins, setSkins] = useState([]);
  const [skinCount, setSkinCount] = useState(0);
  const [configured, setConfigured] = useState(true);
  const [envNeeded, setEnvNeeded] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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
        setWallet(null);
        setOffers([]);
        setBundles([]);
        setSkins([]);
        setSkinCount(0);
        setError("");
        return cap;
      }

      setConfigured(true);
      setEnvNeeded([]);

      const local = await localStoreTokens();
      const tokens = {
        accessToken: local?.tokens?.accessToken,
        entitlementToken: local?.tokens?.entitlementToken,
        region: region || local?.session?.region || "eu",
        puuid: puuid || local?.session?.puuid || null,
      };

      const [walletRes, offersRes, skinsRes] = await Promise.all([
        getValorantWallet(tokens).catch((err) => {
          throw err;
        }),
        getValorantStoreOffers(tokens).catch((err) => {
          throw err;
        }),
        getValorantOwnedSkins(tokens).catch(() => null),
      ]);

      if (!mounted.current) return null;

      if (walletRes?.configured === false) {
        setConfigured(false);
        setEnvNeeded(walletRes.envNeeded || ["RIOT_API_KEY"]);
        setWallet(null);
        setOffers([]);
        setBundles([]);
        return walletRes;
      }

      setWallet(walletRes?.wallet || null);
      setOffers(offersRes?.offers || []);
      setBundles(offersRes?.bundles || []);
      setOffersRemainingSeconds(offersRes?.offersRemainingSeconds ?? null);
      setSkins(skinsRes?.skins || []);
      setSkinCount(skinsRes?.count || skinsRes?.skins?.length || 0);
      setError("");
      return { wallet: walletRes, offers: offersRes, skins: skinsRes };
    } catch (err) {
      if (!mounted.current) return null;
      setError(err.message || "Failed to load store");
      if (err.body?.configured === false) {
        setConfigured(false);
        setEnvNeeded(err.body.envNeeded || ["RIOT_API_KEY"]);
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [enabled, region, puuid]);

  useEffect(() => {
    refresh();
    if (!enabled || !pollMs) return undefined;
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, enabled, pollMs]);

  return {
    loading,
    error,
    capability,
    configured,
    envNeeded,
    wallet,
    offers,
    bundles,
    offersRemainingSeconds,
    skins,
    skinCount,
    refresh,
  };
}
