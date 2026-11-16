import { createContext, useContext } from "react";

/** Shared Market 2.0 state (data hook, layout, openers, cart, toasts). Set by Shop2Market. */
export const Shop2Ctx = createContext(null);

export function useS2() {
  const v = useContext(Shop2Ctx);
  if (!v) throw new Error("useS2 outside Shop2Market");
  return v;
}
