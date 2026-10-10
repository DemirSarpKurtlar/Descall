import { useLocale } from "../../context/localeContextInstance";
import { COPYRIGHT_CONTENT } from "../../legal/legalContent";
import { SITE_OPERATOR } from "../siteIdentity";

export default function CopyrightPage() {
  const { locale } = useLocale();
  const data = COPYRIGHT_CONTENT[locale] || COPYRIGHT_CONTENT.en;

  return (
    <section className="mkt-section mkt-prose" style={{ marginTop: 12 }}>
      <h1>{data.title}</h1>
      <p className="lead">{data.updated}</p>
      <p>{data.intro}</p>
      {data.sections.map((section) => (
        <div key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph, idx) => (
            <p key={idx}>{paragraph}</p>
          ))}
        </div>
      ))}
      <h2>{locale === "tr" ? "İletişim" : "Contact"}</h2>
      <p>
        <a href={`mailto:${SITE_OPERATOR.supportEmail}`}>{SITE_OPERATOR.supportEmail}</a>
        {" · "}
        {SITE_OPERATOR.operatorName}
      </p>
    </section>
  );
}
