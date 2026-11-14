/**
 * Ban screen calls (docs/design/ban-experience/CONTRACT.md sections 3 and 4). A banned user has
 * no session; the account endpoints take the short-lived ban ticket the server returned with
 * the ban, the access appeal needs no token at all.
 */
import { httpRequest } from "./http";

const withTicket = (ticket) => ({ Authorization: `Bearer ${ticket}` });

export function getBanStatus(ticket, { signal } = {}) {
  return httpRequest("/auth/ban/status", { method: "GET", headers: withTicket(ticket), ...(signal ? { signal } : {}) });
}

export function sendBanAppeal(ticket, text) {
  return httpRequest("/auth/ban/appeal", { method: "POST", headers: withTicket(ticket), body: JSON.stringify({ text }) });
}

export function exportBannedAccount(ticket) {
  return httpRequest("/auth/ban/export", { method: "GET", headers: withTicket(ticket) });
}

export function deleteBannedAccount(ticket) {
  return httpRequest("/auth/ban/delete", { method: "POST", headers: withTicket(ticket), body: JSON.stringify({ confirm: "DELETE" }) });
}

export function sendAccessAppeal({ code, email, text }) {
  return httpRequest("/auth/access-appeal", { method: "POST", body: JSON.stringify({ code, email, text }) });
}
