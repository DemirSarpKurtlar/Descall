/**
 * One template for the site's info pages (Güvenlik, Descall'ın sahibi), built from the
 * legal reader's parts so they match /terms, /privacy and /copyright: Descall kicker +
 * H1, intro, a summary card row, then each topic in its own glass section card.
 * No table of contents (these pages are short).
 */
import "../legal-doc.css";

export function InfoSection({ id, title, children }) {
  return (
    <section id={id} className="legal-doc-section info-doc-section">
      {title ? (
        <h2>
          <span>{title}</span>
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/** Summary cards: label (small caps), heading, one-line excerpt; each jumps to its section. */
export function InfoSummary({ label, cards }) {
  if (!cards?.length) return null;
  return (
    <section className="legal-doc-brief" aria-label={label}>
      {label ? <h2>{label}</h2> : null}
      <div className="legal-doc-cards">
        {cards.map((card) => (
          <a key={card.id} className="legal-doc-card" href={`#${card.id}`}>
            {card.label ? <span>{card.label}</span> : null}
            <strong>{card.heading}</strong>
            {card.excerpt ? <em>{card.excerpt}</em> : null}
          </a>
        ))}
      </div>
    </section>
  );
}

export default function InfoPage({ title, intro, summary = null, children }) {
  return (
    <article className="legal-doc info-doc">
      <div className="legal-doc-hero">
        <div>
          <p className="legal-doc-kicker">Descall</p>
          <h1>{title}</h1>
        </div>
      </div>
      {intro ? <div className="legal-doc-intro">{intro}</div> : null}
      {summary}
      <div className="legal-doc-main info-doc-main">{children}</div>
    </article>
  );
}

/** First sentence of a paragraph, for summary card excerpts. */
export function firstSentence(text) {
  const s = String(text || "").trim();
  const m = s.match(/^.*?[.!?](\s|$)/);
  return m ? m[0].trim() : s;
}
