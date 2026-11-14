import { LocaleProvider } from "../../context/LocaleContext";
import BanScreen from "./BanScreen.jsx";

/**
 * Ban screen for the public marketing shell (site/MarketingBoot.jsx). That shell runs a slim
 * locale provider without the app catalogs, so the ban strings come with the full provider
 * here; the chunk only loads when a sign-in is refused for a ban.
 */
export default function BanScreenStandalone(props) {
  return (
    <LocaleProvider>
      <BanScreen {...props} />
    </LocaleProvider>
  );
}
