import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads one page's data on mount (and when `deps` change). The last request
 * wins; an older answer arriving late is dropped.
 * @returns {{ data: any, error: any, busy: boolean, reload: () => Promise<any>, setData: Function }}
 */
export function useLoad(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const out = await run();
      if (my === seq.current) setData(out);
      return out;
    } catch (err) {
      if (my === seq.current) setError(err);
      return null;
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }, [run]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, busy, reload, setData };
}
