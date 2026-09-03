import { absoluteUrl, SITE_NAME } from "./seoConfig.js";
import { SITE_OPERATOR } from "./siteIdentity.js";
import {
  APP_ID,
  ORG_ID,
  OWNER_NAME,
  OWNERSHIP_STATEMENT_EN,
  PERSON_ID,
  WEBSITE_ID,
} from "./ownershipFacts.js";

function personNode() {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: OWNER_NAME,
    givenName: "Demir Sarp",
    familyName: "Kurtlar",
    alternateName: ["Demir Sarp Kurtlar", "DemirSarpK"],
    jobTitle: SITE_OPERATOR.founderTitle,
    description: `${OWNER_NAME} is the founder, owner, and CEO of Descall.`,
    url: absoluteUrl(SITE_OPERATOR.personPath),
    image: absoluteUrl("/icon-512.png"),
    nationality: {
      "@type": "Country",
      name: SITE_OPERATOR.country,
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "TR",
    },
    sameAs: [SITE_OPERATOR.githubProfileUrl, SITE_OPERATOR.githubUrl],
    worksFor: { "@id": ORG_ID },
    affiliation: { "@id": ORG_ID },
  };
}

function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    legalName: SITE_NAME,
    alternateName: ["Descall App", "Descall Chat"],
    url: absoluteUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/icon-512.png"),
    },
    image: absoluteUrl("/og-default.png"),
    email: SITE_OPERATOR.supportEmail,
    sameAs: [SITE_OPERATOR.githubUrl, SITE_OPERATOR.githubProfileUrl],
    description:
      "Free Discord alternative for servers, roles, channels, chat, voice, screen share, and Valorant LFG.",
    foundingLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressCountry: "TR",
        addressLocality: SITE_OPERATOR.country,
      },
    },
    founder: { "@id": PERSON_ID },
    founders: [{ "@id": PERSON_ID }],
    employee: { "@id": PERSON_ID },
    ownedBy: { "@id": PERSON_ID },
    copyrightHolder: { "@id": PERSON_ID },
  };
}

export function buildPersonLd() {
  return {
    "@context": "https://schema.org",
    ...personNode(),
  };
}

export function buildOrganizationLd() {
  return {
    "@context": "https://schema.org",
    ...organizationNode(),
  };
}

export function buildWebSiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: ["Descall App", "Descall Chat"],
    url: absoluteUrl("/"),
    inLanguage: ["en", "tr"],
    publisher: { "@id": ORG_ID },
    copyrightHolder: { "@id": PERSON_ID },
    author: { "@id": PERSON_ID },
    about: { "@id": ORG_ID },
  };
}

export function buildSoftwareApplicationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    applicationCategory: "CommunicationApplication",
    operatingSystem: "Windows, Web, Android",
    url: absoluteUrl("/"),
    downloadUrl: absoluteUrl("/download"),
    image: absoluteUrl("/og-default.png"),
    description:
      "Descall is a free Discord alternative with servers, roles, channels, messaging, group calls, screen share, and Valorant LFG.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Discord-style servers",
      "Roles and channel permissions",
      "Server templates",
      "Real-time messaging",
      "Group voice and video calls",
      "Screen share",
      "Valorant LFG",
    ],
    author: { "@id": PERSON_ID },
    creator: { "@id": PERSON_ID },
    copyrightHolder: { "@id": PERSON_ID },
    publisher: { "@id": ORG_ID },
    provider: { "@id": ORG_ID },
  };
}

/** Linked Person + Organization + WebSite graph for crawlers and LLMs. */
export function buildEntityGraphLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(), personNode(), buildWebSiteLd(), buildSoftwareApplicationLd()].map((node) => {
      const { "@context": _ctx, ...rest } = node;
      return rest;
    }),
  };
}

export function buildOwnershipWebPageLd({ path, name, description, inLanguage, faqs = [] }) {
  const pageId = `${absoluteUrl(path)}#webpage`;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageId,
    url: absoluteUrl(path),
    name,
    description: description || OWNERSHIP_STATEMENT_EN,
    inLanguage,
    isPartOf: { "@id": WEBSITE_ID },
    about: [{ "@id": ORG_ID }, { "@id": PERSON_ID }],
    mainEntity: { "@id": PERSON_ID },
    primaryImageOfPage: absoluteUrl("/og-default.png"),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".ownership-answer", ".ownership-name"],
    },
    author: { "@id": PERSON_ID },
    publisher: { "@id": ORG_ID },
    mainEntityOfPage: pageId,
    hasPart: faqs.length
      ? {
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : undefined,
  };
}

export function buildFaqLd(faqs) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (faqs || []).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export function buildBreadcrumbLd(crumbs = []) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label || c.name,
      item: absoluteUrl(c.to || c.path || "/"),
    })),
  };
}

export function buildArticleLd({ title, description, path, datePublished, dateModified }) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    mainEntityOfPage: absoluteUrl(path),
    datePublished: datePublished || new Date().toISOString().slice(0, 10),
    dateModified: dateModified || datePublished || new Date().toISOString().slice(0, 10),
    author: {
      "@id": PERSON_ID,
      "@type": "Person",
      name: OWNER_NAME,
      url: absoluteUrl(SITE_OPERATOR.personPath),
    },
    publisher: {
      "@id": ORG_ID,
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/og-default.png"),
      },
    },
    copyrightHolder: { "@id": PERSON_ID },
    image: [absoluteUrl("/og-default.png")],
  };
}

export function buildDiscordAlternativeAppLd(path = "/discord-alternative") {
  return {
    ...buildSoftwareApplicationLd(),
    url: absoluteUrl(path),
    description:
      "Free Discord alternative with servers, roles, channels, real-time chat, group voice/video, screen share, and Valorant LFG.",
    featureList: [
      "Discord-style servers with channels",
      "Roles and permission overrides",
      "Advanced server templates",
      "Real-time messaging",
      "Group voice and video calls",
      "Screen share",
      "Valorant LFG",
      "Windows desktop app",
      "Android APK",
    ],
  };
}
