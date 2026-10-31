import { useEffect, useState } from "react";
import {
  LEGAL_EMAIL,
  briefLabel,
  contactCopy,
  isRightsHeading,
  jumpLabel,
  legalSlug,
  summaryCards,
  tocLabel,
} from "../../legal/legalView";
import "../../site/legal-doc.css";

function SectionIcon({ index }) {
  const paths = [
    "M12 3l7 3v6c0 4.2-2.8 7.4-7 8.8C7.8 19.4 5 16.2 5 12V6l7-3z",
    "M6 7h12M6 12h12M6 17h8",
    "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
    "M5 19V5h9l5 5v9H5z",
    "M4 8h16M4 16h10",
    "M12 3v18M5 8h14",
    "M8 11V7a4 4 0 118 0v4M6 11h12v9H6z",
    "M4 6h16v12H4zM8 6V4h8v2",
  ];
  return (
    <svg className="legal-doc-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[index % paths.length]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function scrollParent(node) {
  let el = node?.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 8) return el;
    el = el.parentElement;
  }
  return null;
}

function scrollToSection(id) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export default function LegalDocument({ data, enData = null, type = "privacy", locale = "en", actions = null }) {
  const cards = summaryCards(type, data, locale, enData || data);
  const contact = contactCopy(type, locale);
  const [current, setCurrent] = useState(cards[0]?.id || "");

  useEffect(() => {
    const nodes = data.sections
      .map((section, index) => document.getElementById(legalSlug(section.heading, index)))
      .filter(Boolean);
    if (!nodes.length || typeof IntersectionObserver === "undefined") return undefined;
    const root = scrollParent(nodes[0]);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setCurrent(visible.target.id);
      },
      { root, rootMargin: "-10% 0px -70% 0px", threshold: [0.15, 0.4] }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [data, locale, type]);

  return (
    <article className="legal-doc">
      <div className="legal-doc-hero">
        <div>
          <p className="legal-doc-kicker">Descall</p>
          <h1 id="legal-doc-title">{data.title}</h1>
          <p className="legal-doc-updated">{data.updated}</p>
        </div>
        {actions}
      </div>
      <p className="legal-doc-intro">{data.intro}</p>

      {cards.length > 0 ? (
        <section className="legal-doc-brief" aria-label={briefLabel(locale)}>
          <h2>{briefLabel(locale)}</h2>
          <div className="legal-doc-cards">
            {cards.map((card) => (
              <a
                key={card.id}
                className="legal-doc-card"
                href={`#${card.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(card.id);
                }}
              >
                <span>{card.label}</span>
                <strong>{card.heading}</strong>
                <em>{card.excerpt}</em>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="legal-doc-layout">
        <nav className="legal-doc-toc" aria-label={tocLabel(locale)}>
          <p>{tocLabel(locale)}</p>
          <ol>
            {data.sections.map((section, index) => {
              const id = legalSlug(section.heading, index);
              return (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className={current === id ? "is-current" : ""}
                    aria-current={current === id ? "location" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToSection(id);
                    }}
                  >
                    {section.heading}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <label className="legal-doc-jump">
          <span>{jumpLabel(locale)}</span>
          <select
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              scrollToSection(event.target.value);
            }}
          >
            {data.sections.map((section, index) => {
              const id = legalSlug(section.heading, index);
              return (
                <option key={id} value={id}>
                  {section.heading}
                </option>
              );
            })}
          </select>
        </label>

        <div className="legal-doc-main">
          {data.sections.map((section, index) => {
            const id = legalSlug(section.heading, index);
            const rights = isRightsHeading(section.heading, index, enData);
            return (
              <section key={id} id={id} className={rights ? "legal-doc-section is-rights" : "legal-doc-section"}>
                <h2>
                  <SectionIcon index={index} />
                  <span>{section.heading}</span>
                </h2>
                {rights ? (
                  <div className="legal-doc-rights">
                    {section.paragraphs.map((paragraph, idx) => (
                      <p key={idx}>{paragraph}</p>
                    ))}
                  </div>
                ) : (
                  section.paragraphs.map((paragraph, idx) => <p key={idx}>{paragraph}</p>)
                )}
              </section>
            );
          })}

          <section className="legal-doc-contact" id="legal-contact">
            <h2>{contact.heading}</h2>
            <p>
              {contact.before ? `${contact.before} ` : null}
              <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>
              {contact.after}
            </p>
          </section>
        </div>
      </div>
    </article>
  );
}
