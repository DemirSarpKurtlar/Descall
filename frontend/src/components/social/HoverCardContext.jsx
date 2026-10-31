import { createContext, useContext } from "react";

/**
 * What the desktop hover profile card (3.7.13, design C) needs from the app
 * shell: live friend activity, server voice states, the server list, a DM
 * sender and a way to open the DM. Provided by AppLayout; every field is
 * optional, so the card degrades to the profile only.
 */
export const HoverCardContext = createContext({
  friendPresence: null,
  voiceStatesByServer: null,
  servers: null,
  sendDm: null,
  openDm: null,
  meId: null,
});

export function useHoverCardContext() {
  return useContext(HoverCardContext);
}
