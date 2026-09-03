/** Extra Admin nav item for voice live listen + recordings archive.
 *  Wired into AdminPanel.jsx:
 *  1. import AdminVoiceRecordings from "./AdminVoiceRecordings";
 *  2. TABS: { id: "voice", label: "Voice", icon: Voicemail }
 *  3. {tab === "voice" && <AdminVoiceRecordings socket={socket} />}
 *  4. tabDef.id === "voice" ? (locale === "tr" ? "Ses" : "Voice") : t(tabDef.label)
 */
import { Voicemail } from "lucide-react";

export const ADMIN_VOICE_TAB = {
  id: "voice",
  label: "Voice",
  icon: Voicemail,
};

export function adminVoiceTabLabel(locale) {
  return locale === "tr" ? "Ses" : "Voice";
}
