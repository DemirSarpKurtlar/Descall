import { useLocale } from "../../context/localeContextInstance";
import { PRIVACY_CONTENT } from "../../legal/legalContent";
import LegalDocument from "../../components/legal/LegalDocument";

export default function PrivacyPage() {
  const { locale } = useLocale();
  const data = PRIVACY_CONTENT[locale] || PRIVACY_CONTENT.en;
  return <LegalDocument data={data} type="privacy" locale={locale} />;
}
