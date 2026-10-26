import { authedRequest } from "./authedHttp";

/** Settings › Görünüm, stored on the account (GET/PUT /api/me/appearance). */
export const getAccountAppearance = () => authedRequest("/api/me/appearance");

export const putAccountAppearance = (appearance) =>
  authedRequest("/api/me/appearance", { method: "PUT", body: { appearance } });
