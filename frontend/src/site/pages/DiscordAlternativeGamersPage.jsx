import SeoExtraContent from "../components/SeoExtraContent";
import { Link } from "react-router-dom";
import { IconCheck as Check } from "../icons";
import SeoLandingShell from "../components/SeoLandingShell";
import SeoProductPreview from "../components/SeoProductPreview";
import { buildBreadcrumbLd, buildFaqLd, buildDiscordAlternativeAppLd } from "../JsonLd";
import { GAMER_FAQ } from "../content/discordSeoContent";
import { useT } from "../../context/localeContextInstance";

const crumbs = [
  { label: "Home", to: "/" },
  { label: "Discord alternative", to: "/discord-alternative" },
  { label: "For gamers", to: "/best-discord-alternative-for-gamers" },
];

export default function DiscordAlternativeGamersPage({ onSignIn }) {
  const t = useT();
  return (
    <SeoLandingShell
      breadcrumbs={crumbs}
      kicker={t("For gamers")}
      title={t("Best Discord alternative for gamers")}
      lead={t(
        "Gamers don’t need another bloated server, they need voice and screen share that actually work. Descall is the Discord alternative built around squads and playing together."
      )}
      tone="gaming"
      faq={GAMER_FAQ}
      jsonLd={[buildBreadcrumbLd(crumbs), buildFaqLd(GAMER_FAQ), buildDiscordAlternativeAppLd()]}
      primaryCta={
        <button type="button" className="mkt-btn mkt-btn-primary" onClick={onSignIn}>
          {t("Open Descall")}
        </button>
      }
      secondaryCta={
        <Link to="/download" className="mkt-btn mkt-btn-soft">
          {t("Download for Windows")}
        </Link>
      }
      heroExtra={<SeoProductPreview mode="friends" caption={t("Friends and presence inside Descall")} />}
    >
      <section className="seo-section">
        <h2>{t("Why gamers leave Discord")}</h2>
        <p>
          {t(
            "A classic Discord gaming server means bots, roles, and channel spam."
          )}
        </p>
      </section>

      <section className="seo-section">
        <h2>{t("Gamer checklist")}</h2>
        <ul className="seo-checklist">
          {[
            "Group voice/video with screen share",
            "Gaming templates with squad-up rooms",
            "account link for rank on profile",
            "Desktop app for low-friction gaming sessions",
            "Free core, cosmetics optional",
          ].map((item) => (
            <li key={item}>
              <Check size={16} aria-hidden />
              <span>{t(item)}</span>
            </li>
          ))}
        </ul>
      </section>

      <SeoExtraContent path="/best-discord-alternative-for-gamers" />

      <section className="seo-section">
        <h2>{t("Keep reading")}</h2>
        <ul className="seo-link-list">
          <li>
            <Link to="/compare/discord">{t("Descall vs Discord")}</Link>
          </li>
          <li>
            <Link to="/features">{t("All features")}</Link>
          </li>
        </ul>
      </section>
    </SeoLandingShell>
  );
}
