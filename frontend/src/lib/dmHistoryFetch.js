/**
 * The socket emit patch used to REST-fetch DM history on every dm:history
 * and every dm:set_active. set_active is only "which chat is open". History
 * is loaded by the chat screen itself. A second REST pull is only a fallback
 * when the socket cannot deliver dm:history.
 */
export function shouldPullDmHistory(event, socketConnected) {
  return event === "dm:history" && !socketConnected;
}
