import { useLocale } from "../../context/localeContextInstance";
import { TERMS_CONTENT } from "../../legal/legalContent";
import LegalDocument from "../../components/legal/LegalDocument";

export default function TermsPage() {
  const { locale } = useLocale();
  const data = TERMS_CONTENT[locale] || TERMS_CONTENT.en;
  return <LegalDocument data={data} type="terms" locale={locale} enData={TERMS_CONTENT.en} />;
}
