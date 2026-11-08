/**
 * Structured data of the server directory pages (prerender and React page share it).
 * Index pages: an ItemList of the category pages. Category pages: an ItemList of the
 * listed servers (each item points at its card on the page). Only public card fields.
 */
import { absoluteUrl } from "../seoConfig.js";
import { DIRECTORY_CATEGORIES, directoryPath } from "./directoryPaths.js";
import { directoryCopy } from "./directoryRoutes.js";

/** Element id of a server card on a directory page (ItemList item URL fragment). */
export function directoryCardId(serverId) {
  return `server-${String(serverId).replace(/[^A-Za-z0-9_-]/g, "")}`;
}

export function buildDirectoryItemListLd({ lang, category, servers = [] }) {
  const copy = directoryCopy(lang);
  const path = directoryPath(lang, category);
  if (!category) {
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: copy.home.h1,
      url: absoluteUrl(path),
      inLanguage: lang,
      numberOfItems: DIRECTORY_CATEGORIES.length,
      itemListElement: DIRECTORY_CATEGORIES.map((id, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: copy.cat[id].h1,
        url: absoluteUrl(directoryPath(lang, id)),
      })),
    };
  }
  if (!servers.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: copy.cat[category].h1,
    url: absoluteUrl(path),
    inLanguage: lang,
    numberOfItems: servers.length,
    itemListElement: servers.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      url: `${absoluteUrl(path)}#${directoryCardId(s.id)}`,
    })),
  };
}
