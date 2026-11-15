/**
 * Yönetici Paneli › Canlı popup. The page lives in ./livepopup/ (remake of
 * Nov 2026, Draft B "Kontrol merkezi"); this file keeps the import AdminPanel uses.
 * Sends go through POST /popup/campaigns (preview: true is replaced by the
 * live audience estimate POST /popup/audience/preview and the review step).
 */
import LivePopupPage from "./livepopup/LivePopupPage.jsx";

export default function AdminLivePopup({ socket = null, viewerUsername = "" }) {
  return <LivePopupPage socket={socket} viewerUsername={viewerUsername} />;
}
