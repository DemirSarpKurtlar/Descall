/**
 * iOS in-app purchases through StoreKit 2 (native plugin "DescallStore",
 * ios/App/App/DescallStorePlugin.swift). Subscriptions for yourself; gifts are one-time
 * (non-renewing) products, because App Store subscriptions cannot be gifted.
 *
 * Flow: purchase(productId, appAccountToken = our checkout id) -> StoreKit verifies the transaction
 * on the device -> we post its JWS to /api/plus/apple/transactions (the server verifies the Apple
 * certificate chain again and grants) -> finish(transactionId). Unfinished transactions (app killed
 * mid-purchase, Ask to Buy, renewals while closed) arrive through the "transaction" listener and go
 * through the same path, so nothing is lost. Outside the iOS app everything here is a no-op.
 */
import { registerPlugin } from "@capacitor/core";
import { isNativeIOS } from "../lib/platform.js";
import { postAppleTransaction } from "./plusApi.js";

let plugin = null;
function store() {
  if (!isNativeIOS()) return null;
  if (!plugin) plugin = registerPlugin("DescallStore");
  return plugin;
}

export function storeKitAvailable() {
  return Boolean(store());
}

/** { products: [{ id, displayPrice, price, currency }] } for the given ids (store prices win on iOS). */
export async function storeProducts(ids) {
  const p = store();
  if (!p || !ids?.length) return { products: [] };
  try {
    return await p.products({ ids });
  } catch {
    return { products: [] };
  }
}

async function deliver(jws, transactionId) {
  const out = await postAppleTransaction(jws);
  const p = store();
  if (p && transactionId) await p.finish({ transactionId: String(transactionId) }).catch(() => {});
  return out;
}

/**
 * Buy one product. Resolves { status: "purchased" | "pending" | "cancelled" }. Throws on a
 * verification or server error (the transaction stays unfinished and is retried by the listener).
 */
export async function storePurchase({ productId, appAccountToken }) {
  const p = store();
  if (!p) throw Object.assign(new Error("store_unavailable"), { code: "store_unavailable" });
  const res = await p.purchase({ productId, appAccountToken });
  if (res?.status === "purchased" && res.jws) {
    await deliver(res.jws, res.transactionId);
    return { status: "purchased" };
  }
  return { status: res?.status || "cancelled" };
}

let listening = false;
/** Start once after sign-in: delivers transactions that finish outside a purchase call. */
export function startStoreListener() {
  const p = store();
  if (!p || listening) return () => {};
  listening = true;
  const handle = p.addListener("transaction", (ev) => {
    if (ev?.jws) deliver(ev.jws, ev.transactionId).catch(() => {});
  });
  p.start?.().catch(() => {});
  return () => {
    listening = false;
    Promise.resolve(handle).then((h) => h?.remove?.()).catch(() => {});
  };
}

/** "Satın alımları geri yükle": re-sends current entitlements. */
export async function storeRestore() {
  const p = store();
  if (!p) return 0;
  const res = await p.currentEntitlements().catch(() => ({ transactions: [] }));
  let n = 0;
  for (const tx of res?.transactions || []) {
    try {
      await deliver(tx.jws, tx.transactionId);
      n += 1;
    } catch {
      /* next */
    }
  }
  return n;
}
