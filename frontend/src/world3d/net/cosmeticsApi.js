/**
 * REST client for the character cosmetics (backend/routes/world3d.js). Keeps every field
 * of an error body (items, total, balance, code) so the panel can show the purchase
 * confirmation with the server's prices. POSTs are never retried.
 */
export function createCosmeticsApi({ baseUrl, token }) {
  const root = `${String(baseUrl || "").replace(/\/$/, "")}/api/world3d`;
  const headers = () => {
    const tk = typeof token === "function" ? token() : token;
    return { "Content-Type": "application/json", ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
  };
  async function request(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(`${root}${path}`, { method, cache: "no-store", headers: headers(), body: body ? JSON.stringify(body) : undefined });
    } catch {
      const err = new Error("offline");
      err.code = "offline";
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      Object.assign(err, data, { status: res.status, code: data?.code || (res.status >= 500 ? "server" : "failed") });
      throw err;
    }
    return data;
  }
  return {
    state: () => request("/cosmetics"),
    save: (look, purchase = null) => request("/look", { method: "POST", body: purchase ? { look, purchase } : { look } }),
  };
}

/** Idempotency key for one purchase confirmation. */
export function newRequestId() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  (c?.getRandomValues ? c.getRandomValues.bind(c) : (a) => a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }))(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
