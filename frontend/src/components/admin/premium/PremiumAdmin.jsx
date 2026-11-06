/**
 * Premium Yönetimi (Descall+ / Descall Ultra, phase 1): the nine admin pages.
 * AdminPanel loads this chunk lazily when a premium page opens; each page
 * fetches its own data on mount (docs/premium/CONTRACT.md endpoints through
 * adminFetch, writes behind the admin step-up code).
 */
import PremiumDashboard from "./PremiumDashboard.jsx";
import PremiumUsers from "./PremiumUsers.jsx";
import PremiumBulk from "./PremiumBulk.jsx";
import PremiumHistory from "./PremiumHistory.jsx";
import PremiumAnalytics from "./PremiumAnalytics.jsx";
import PremiumFinance from "./PremiumFinance.jsx";
import PremiumCampaigns from "./PremiumCampaigns.jsx";
import PremiumAudit from "./PremiumAudit.jsx";
import PremiumPlans from "./PremiumPlans.jsx";
import "../../../styles/admin-growth.css";
import "../../../styles/maintenance.css";
import "../../../styles/promo.css";
import "../../../styles/premium-admin.css";

const PAGES = {
  premiumDashboard: PremiumDashboard,
  premiumUsers: PremiumUsers,
  premiumBulk: PremiumBulk,
  premiumHistory: PremiumHistory,
  premiumAnalytics: PremiumAnalytics,
  premiumFinance: PremiumFinance,
  premiumCampaigns: PremiumCampaigns,
  premiumAudit: PremiumAudit,
  premiumPlans: PremiumPlans,
};

export default function PremiumAdmin({ page }) {
  const Page = PAGES[page] || PremiumDashboard;
  return (
    <div className="pa-root mt-root" data-page={page}>
      <Page />
    </div>
  );
}
