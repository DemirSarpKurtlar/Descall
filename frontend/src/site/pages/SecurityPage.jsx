import { useLocale } from "../../context/localeContextInstance";
import { SITE_OPERATOR } from "../siteIdentity";
import JsonLd, { buildOrganizationLd } from "../JsonLd";
import { briefLabel } from "../../legal/legalView";
import InfoPage, { InfoSection, InfoSummary, firstSentence } from "../components/InfoPage";

/** Same template as the other info and legal pages: intro, summary cards, section cards. */
export default function SecurityPage() {
  const { t, locale } = useLocale();
  const SECTIONS = [
    {
      id: "transport",
      title: t("Transport encryption (not default E2E)"),
      body: t(
        "Web and API traffic use HTTPS/TLS. Real-time media uses WebRTC with DTLS/SRTP between peers when a call is established. Descall does not claim default end-to-end encryption for all message history stored on the server, messages are encrypted in transit and stored so your devices can load chat history."
      ),
    },
    {
      id: "voice-video",
      title: t("Voice & video"),
      body: t(
        "Call media is transmitted with WebRTC security (DTLS/SRTP). Descall never records or stores call audio, video, or screen shares. If a participant records locally on their device, that recording is outside Descall's control."
      ),
    },
    {
      id: "accounts",
      title: t("Accounts"),
      body: t(
        "Passwords are hashed with bcrypt. Optional email 2FA and Google sign-in are available where configured. Session management lets you revoke devices. Keep credentials private on shared computers."
      ),
    },
  ];
  const cards = [
    ...SECTIONS.map((s, i) => ({ id: s.id, label: String(i + 1).padStart(2, "0"), heading: s.title, excerpt: firstSentence(s.body) })),
    { id: "report", label: String(SECTIONS.length + 1).padStart(2, "0"), heading: t("Report an issue"), excerpt: SITE_OPERATOR.supportEmail },
  ];
  return (
    <>
      <JsonLd data={buildOrganizationLd()} />
      <InfoPage
        title={t("Security at Descall")}
        intro={t(
          "How Descall protects your chats and calls, encryption in transit, account security, and honest limits about what we do not claim."
        )}
        summary={<InfoSummary label={briefLabel(locale)} cards={cards} />}
      >
        {SECTIONS.map((s) => (
          <InfoSection key={s.id} id={s.id} title={s.title}>
            <p>{s.body}</p>
          </InfoSection>
        ))}
        <InfoSection id="report" title={t("Report an issue")}>
          <p>
            {t("Email")}{" "}
            <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>{" "}
            {t("or open an issue on GitHub. Include enough detail for a safe investigation.")}
          </p>
        </InfoSection>
      </InfoPage>
    </>
  );
}
