/**
 * Call ⇄ address-bar sync (2.11.1).
 *
 * Root cause of "can't switch chats during a call": App.jsx re-ran its URL
 * sync on every pathname change and replaced ANY path with the call's
 * /call URL, so clicking another DM/group/server was instantly undone.
 * Now the URL is only rewritten when a call starts (new call identity) or when
 * the user is already on that call's own conversation. Everywhere else
 * navigation is free; the call keeps running (bottom panel + mini pill).
 */
import { directPath, groupPath } from "./appRoutes.js";

/** @returns {{ key: string, chatPath: string, callPath: string } | null} */
export function liveCallRoute(call, groupCall) {
  if (call?.mode && call.peer?.username) {
    const chatPath = directPath(call.peer);
    return { key: `dm:${call.peer.id ?? call.peer.username}`, chatPath, callPath: `${chatPath}/call/${call.callType || "voice"}` };
  }
  if (groupCall?.isInCall && groupCall.activeGroupId) {
    const chatPath = groupPath(groupCall.activeGroupId);
    return { key: `group:${groupCall.activeGroupId}`, chatPath, callPath: `${chatPath}/call` };
  }
  return null;
}

/** Path to replace to, or null to leave the user where they are. */
export function callUrlTarget(route, pathname, lastKey) {
  if (!route) return null;
  if (pathname === route.callPath) return null;
  if (route.key !== lastKey) return route.callPath; // call just started / accepted
  if (pathname === route.chatPath) return route.callPath; // on the call's own chat
  return null; // browsing elsewhere during the call: never yank back
}
