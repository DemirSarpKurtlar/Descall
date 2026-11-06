import { useSyncExternalStore } from "react";
import { getDraftsSnapshot, subscribeDrafts } from "../lib/messageDrafts";

/** The saved draft of one conversation ("" when none). Re-renders only when it changes. */
export default function useConversationDraft(key) {
  return useSyncExternalStore(
    subscribeDrafts,
    () => (key ? getDraftsSnapshot()[key] || "" : ""),
    () => "",
  );
}
