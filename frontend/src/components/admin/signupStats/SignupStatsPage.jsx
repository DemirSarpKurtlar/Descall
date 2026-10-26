/**
 * /admin/signup-stats: the standalone page the Electron "Kayıt İstatistikleri" window loads
 * (main.jsx boots it instead of the whole app). The server still decides who is an admin.
 */
import SignupStatsWindow from "./SignupStatsWindow.jsx";

export default function SignupStatsPage() {
  return <SignupStatsWindow standalone layout="desktop" />;
}
