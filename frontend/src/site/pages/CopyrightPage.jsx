import { useLocale } from "../../context/localeContextInstance";
import { COPYRIGHT_CONTENT } from "../../legal/legalContent";
import LegalDocument from "../../components/legal/LegalDocument";

export default function CopyrightPage() {
  const { locale } = useLocale();
  const data = COPYRIGHT_CONTENT[locale] || COPYRIGHT_CONTENT.en;
  return <LegalDocument data={data} type="copyright" locale={locale} />;
}
