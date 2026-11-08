/**
 * Route entries (seoConfig PUBLIC_ROUTES) and page copy of the public server directory.
 * Copy: src/i18n/locales/dirSeo.{en,tr}.js. URLs: ./directoryPaths.js.
 */
import { DIR_SEO_EN } from "../../i18n/locales/dirSeo.en.js";
import { DIR_SEO_TR } from "../../i18n/locales/dirSeo.tr.js";
import { formatMessage } from "../../i18n/message.js";
import { DIRECTORY_CATEGORIES, DIRECTORY_SITE_LANGS, directoryPath } from "./directoryPaths.js";

export function directoryCopy(lang) {
  return lang === "tr" ? DIR_SEO_TR : DIR_SEO_EN;
}

/** ICU message of the page copy in the page language ("{count} members"). */
export function directoryText(lang, key, vars) {
  const ui = directoryCopy(lang).ui;
  const raw = ui[key];
  if (typeof raw !== "string") return "";
  return vars ? formatMessage(raw, vars, lang === "tr" ? "tr-TR" : "en-GB") : raw;
}

export function directoryLanguageName(lang, id) {
  const names = directoryCopy(lang).ui.languageNames || {};
  return names[id] || names.other || id;
}

/** Index + 13 category pages per language, newest copy first in the sitemap tables. */
export function directoryRoutes() {
  const out = [];
  for (const lang of DIRECTORY_SITE_LANGS) {
    const copy = directoryCopy(lang);
    out.push({
      path: directoryPath(lang),
      title: copy.home.title,
      description: copy.home.description,
      h1: copy.home.h1,
      image: "/og-default.png",
      changefreq: "daily",
      priority: "0.8",
      lang,
      directory: { lang, category: null },
    });
    for (const id of DIRECTORY_CATEGORIES) {
      const cat = copy.cat[id];
      out.push({
        path: directoryPath(lang, id),
        title: cat.title,
        description: cat.description,
        h1: cat.h1,
        image: "/og-default.png",
        changefreq: "daily",
        priority: "0.6",
        lang,
        directory: { lang, category: id },
      });
    }
  }
  return out;
}

/** Breadcrumb trail of a directory page: Home > Communities (> Category). */
export function directoryCrumbs(lang, category) {
  const copy = directoryCopy(lang);
  const crumbs = [
    { name: copy.ui.home, path: lang === "tr" ? "/tr" : "/" },
    { name: copy.home.crumb, path: directoryPath(lang) },
  ];
  if (category) crumbs.push({ name: copy.cat[category].label, path: directoryPath(lang, category) });
  return crumbs;
}

/** Link to the directory for the home and download pages (seo/pageExtras.js). */
export function directoryHubLink(lang) {
  const copy = directoryCopy(lang);
  return { to: directoryPath(lang), label: copy.home.h1, directory: true };
}
