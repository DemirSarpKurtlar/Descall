/**
 * Duyuru oluşturucu (Draft A "Oluştur: canlı önizleme" + Draft C "Diller adımı").
 *
 * İçerik view: language chips, title, text (bold, italic, link, list), icon,
 * colour, priority, button, audience with a live estimate, publish time, end,
 * pin / live / phone toggles, cover image; on the right the live desktop and
 * phone preview, the phone notification and the pre-publish checks.
 * Diller view: the 7 language versions side by side with the source, automatic
 * translation (Claude) to review, per-language approval, translation checks,
 * the approval rule, and the phone preview in that language.
 * Autosaves to this browser; "Önce bana gönder" sends it to my own sessions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { ANN_ICON_KEYS, ANN_ICON_QUICK } from "../../../lib/announcementIcons.js";
import { annApi } from "./announcementsApi.js";
import {
  COLORS,
  LIMITS,
  LOCALES,
  LOCALE_CODE,
  composerChecks,
  draftPayload,
  errorKey,
  fmtDateTime,
  fmtNumber,
  fromLocalInput,
  hasBlocking,
  hasEmoji,
  isEveryone,
  langStates,
  langSummary,
  needsApproval,
  phoneLines,
  stripEmoji,
  toLocalInput,
  translationChecks,
  trTimeSuffix,
} from "./announcementsModel.js";
import { DesktopPreview, PhonePreview, PushPreview, previewItem } from "./Previews.jsx";
import { Chip, Dialog, Ic, Label, Menu, Seg, Switch } from "./ui.jsx";

const LANG_KEY = { tr: "tr", en: "en", de: "de", es: "es", fr: "fr", "pt-BR": "ptBR", ru: "ru" };
const STATE_TONE = { source: "blue", ready: "green", auto: "gold", stale: "gold", missing: "red" };
const DOT = { source: "is-green", ready: "is-green", auto: "is-gold", stale: "is-gold", missing: "is-red" };
const APP_LINKS = ["/settings/shop", "/settings/premium", "/settings/profile", "/settings/notifications", "/feedback", "/servers", "/status", "/terms", "/security", "/download"];

function autosaveKey(id) {
  return `descall.annc.draft.${id || "new"}`;
}

function nowTime(locale) {
  return fmtDateTime(new Date().toISOString(), locale, { hour: "2-digit", minute: "2-digit" });
}

function wrapSelection(el, value, before, after = before, placeholder = "") {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const sel = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + sel + after + value.slice(end);
  return { next, caret: [start + before.length, start + before.length + sel.length] };
}

export default function Composer({ open, initial, mode = "create", templateLabel = "", items = [], meta = {}, onClose, onSaved, onOpenGallery, say }) {
  const { t, locale } = useLocale();
  const [d, setD] = useState(initial);
  const [view, setView] = useState("content");
  const [lang, setLang] = useState("en");
  const [pv, setPv] = useState("both");
  const [pvLang, setPvLang] = useState(initial?.sourceLang || "tr");
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(null);
  const [restored, setRestored] = useState(false);
  const [reach, setReach] = useState({ loading: false, count: null });
  const [allIcons, setAllIcons] = useState(false);
  const [menu, setMenu] = useState(null);
  const [cover, setCover] = useState({ busy: false, over: false });
  const [translating, setTranslating] = useState(false);
  const [tplName, setTplName] = useState(templateLabel || "");
  const textRef = useRef(null);
  const fileRef = useRef(null);
  const audRefs = { premium: useRef(null), langs: useRef(null), platforms: useRef(null), newDays: useRef(null) };
  const sections = { audience: useRef(null), schedule: useRef(null), top: useRef(null) };
  const titleId = "an-comp-title";

  // Open: start from the given draft, or a draft this browser kept.
  useEffect(() => {
    if (!open) return;
    let start = initial;
    let back = false;
    try {
      const raw = window.localStorage?.getItem(autosaveKey(initial?.id));
      if (raw && mode !== "template") {
        const saved = JSON.parse(raw);
        if (saved?.draft && Date.now() - (saved.at || 0) < 7 * 86400000 && (!initial?.id || saved.draft.id === initial.id) && !initial?.templateKey) {
          start = { ...initial, ...saved.draft };
          back = JSON.stringify(draftPayload(start)) !== JSON.stringify(draftPayload(initial));
        }
      }
    } catch {
      /* storage off */
    }
    setD(start);
    setRestored(back);
    setView("content");
    setPv("both");
    setPvLang(start?.sourceLang || "tr");
    setError("");
    setSaving("");
    setSavedAt(null);
    setAllIcons(!ANN_ICON_QUICK.includes(start?.icon));
    setTplName(templateLabel || "");
    const firstOpen = LOCALES.find((l) => l !== (start?.sourceLang || "tr") && langStates(start)[l] !== "ready");
    setLang(firstOpen || (start?.sourceLang === "en" ? "tr" : "en"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Autosave to this browser.
  useEffect(() => {
    if (!open || !d || mode === "template") return undefined;
    const id = setTimeout(() => {
      try {
        window.localStorage?.setItem(autosaveKey(d.id), JSON.stringify({ at: Date.now(), draft: d }));
        setSavedAt(nowTime(locale));
      } catch {
        /* storage full */
      }
    }, 700);
    return () => clearTimeout(id);
  }, [d, open, mode, locale]);

  // Audience estimate.
  const audKey = JSON.stringify(d?.audience || {});
  useEffect(() => {
    if (!open || !d) return undefined;
    let cancelled = false;
    setReach((r) => ({ ...r, loading: true }));
    const id = setTimeout(async () => {
      try {
        const r = await annApi.audience(d.audience, d.priority);
        if (!cancelled) setReach({ loading: false, count: r.count });
      } catch {
        if (!cancelled) setReach({ loading: false, count: null });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audKey, open]);

  const patch = useCallback((p) => setD((cur) => ({ ...cur, ...p })), []);
  const patchAud = useCallback((p) => setD((cur) => ({ ...cur, audience: { ...cur.audience, ...p } })), []);
  const patchTr = useCallback(
    (l, p) =>
      setD((cur) => {
        const prev = cur.translations?.[l] || { title: "", content: "", cta_label: "", state: "ready" };
        return { ...cur, translations: { ...cur.translations, [l]: { ...prev, ...p } } };
      }),
    []
  );

  const states = useMemo(() => (d ? langStates(d) : {}), [d]);
  const summary = langSummary(states);
  const checks = useMemo(() => (d ? composerChecks(d) : []), [d]);
  const blocking = hasBlocking(checks);
  const approval = d ? needsApproval(d) : false;
  const item = d ? previewItem(d, pvLang, { author: meta?.me?.username || "admin" }) : null;
  const others = (items || []).filter((i) => i.status === "live" && i.id !== d?.id);
  const scheduled = d?.startsAt && Date.parse(d.startsAt) > Date.now() + 30000;
  const isEdit = mode === "edit" && d?.id;
  const live = isEdit && d.status === "live";

  if (!open || !d) return null;

  const errText = (e) => {
    const k = errorKey(e);
    return k ? t(k) : e?.message || t("annc.err.generic");
  };

  const clearAutosave = () => {
    try {
      window.localStorage?.removeItem(autosaveKey(d.id));
      if (!d.id) window.localStorage?.removeItem(autosaveKey(null));
    } catch {
      /* storage off */
    }
  };

  async function save(action) {
    if (saving) return;
    setError("");
    setSaving(action);
    try {
      let res;
      if (mode === "template") {
        if (!tplName.trim()) throw Object.assign(new Error(""), { code: "NAME_REQUIRED" });
        res = await annApi.saveTemplate({ ...draftPayload(d), name: tplName.trim(), category: "custom" });
        onSaved?.({ result: "template", template: res.template });
        return;
      }
      const body = { ...draftPayload(d), action: action === "draft" ? "draft" : "publish" };
      res = isEdit ? await annApi.update(d.id, action === "draft" ? draftPayload(d) : body) : await annApi.create(body);
      if (isEdit && action !== "draft" && res.result === "saved" && ["draft", "ended"].includes(res.item?.status)) {
        res = await annApi.publish(d.id, {});
      }
      clearAutosave();
      onSaved?.({ result: res.result, item: res.item, reached: res.reached });
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving("");
    }
  }

  async function sendTest() {
    setError("");
    setSaving("test");
    try {
      const r = await annApi.test({ ...draftPayload(d), id: d.id, lang: pvLang });
      say?.(r.pushed ? t("annc.composer.testSentPush") : t("annc.composer.testSent"));
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving("");
    }
  }

  async function translateMissing(only = null) {
    if (translating) return;
    const targets = only ? [only] : LOCALES.filter((l) => states[l] === "missing" || (states[l] === "stale" && !only));
    if (!targets.length) return;
    setError("");
    setTranslating(true);
    try {
      const r = await annApi.translate({ id: d.id, title: d.title, content: d.content, ctaLabel: d.ctaLabel, from: d.sourceLang, to: targets });
      setD((cur) => ({ ...cur, translations: { ...cur.translations, ...r.translations } }));
      say?.(t("annc.composer.translated", { n: Object.keys(r.translations || {}).length }));
    } catch (e) {
      setError(errText(e));
    } finally {
      setTranslating(false);
    }
  }

  async function uploadCover(file) {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return setError(t("annc.err.image"));
    if (file.size > 2 * 1024 * 1024) return setError(t("annc.err.imageBig"));
    setCover({ busy: true, over: false });
    setError("");
    try {
      const r = await annApi.cover(file);
      patch({ coverUrl: r.url });
    } catch (e) {
      setError(errText(e));
    } finally {
      setCover({ busy: false, over: false });
    }
  }

  const fmt = (kind) => {
    const el = textRef.current;
    const v = d.content || "";
    let r;
    if (kind === "bold") r = wrapSelection(el, v, "**", "**", t("annc.composer.boldSample"));
    else if (kind === "italic") r = wrapSelection(el, v, "*", "*", t("annc.composer.italicSample"));
    else if (kind === "link") r = wrapSelection(el, v, "[", "](https://)", t("annc.composer.linkSample"));
    else if (kind === "list") {
      const start = el?.selectionStart ?? v.length;
      const lineStart = v.lastIndexOf("\n", start - 1) + 1;
      const next = `${v.slice(0, lineStart)}- ${v.slice(lineStart)}`;
      r = { next, caret: [start + 2, start + 2] };
    }
    if (!r) return;
    patch({ content: r.next.slice(0, LIMITS.content) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange?.(r.caret[0], r.caret[1]);
    });
  };

  const goto = (where) => {
    setView("content");
    requestAnimationFrame(() => sections[where]?.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  };

  const primaryLabel = mode === "template"
    ? t("annc.composer.saveTemplate")
    : approval && !(isEdit && live)
      ? t("annc.composer.sendApproval")
      : live
        ? t("annc.composer.saveLive")
        : scheduled
          ? t("annc.composer.publishAt", { when: fmtDateTime(d.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), sfx: locale === "tr" ? trTimeSuffix(d.startsAt) : "" })
          : t("annc.composer.publishNow");

  const aud = d.audience || {};
  const audMenus = {
    premium: [
      { id: "member", label: t("annc.aud.premiumMember"), active: aud.premium === "member", onSelect: () => patchAud({ premium: aud.premium === "member" ? null : "member" }) },
      { id: "non_member", label: t("annc.aud.premiumNon"), active: aud.premium === "non_member", onSelect: () => patchAud({ premium: aud.premium === "non_member" ? null : "non_member" }) },
    ],
    langs: LOCALES.map((l) => ({
      id: l,
      label: t(`annc.lang.${LANG_KEY[l]}`),
      trail: LOCALE_CODE[l],
      active: (aud.langs || []).includes(l),
      onSelect: () => patchAud({ langs: (aud.langs || []).includes(l) ? aud.langs.filter((x) => x !== l) : [...(aud.langs || []), l] }),
    })),
    platforms: ["desktop", "web", "ios", "android"].map((p) => ({
      id: p,
      label: t(`annc.platform.${p}`),
      active: (aud.platforms || []).includes(p),
      onSelect: () => patchAud({ platforms: (aud.platforms || []).includes(p) ? aud.platforms.filter((x) => x !== p) : [...(aud.platforms || []), p] }),
    })),
    newDays: [7, 14, 30].map((n) => ({ id: String(n), label: t("annc.aud.newDays", { n }), active: aud.newDays === n, onSelect: () => patchAud({ newDays: aud.newDays === n ? null : n }) })),
  };

  const audChip = (id, icon, label, on) => (
    <button
      key={id}
      ref={audRefs[id] || undefined}
      type="button"
      className={`an-aud${on ? " is-on" : ""}`}
      aria-pressed={on}
      aria-haspopup={id !== "all" ? "menu" : undefined}
      onClick={() => (id === "all" ? patchAud({ premium: null, langs: [], platforms: [], newDays: null }) : setMenu(menu === id ? null : id))}
    >
      <Ic name={icon} size={15} />
      {label}
    </button>
  );

  const header = (
    <header className="an-comp-hd">
      <span className="an-dh-ic is-blue" aria-hidden="true">
        <Ic name="megaphone" size={20} />
      </span>
      <div className="an-comp-hd-txt">
        <h2 id={titleId}>{mode === "template" ? t("annc.composer.newTemplate") : isEdit ? t("annc.composer.editTitle") : t("annc.composer.newTitle")}</h2>
        <p>
          {restored ? (
            <>
              {t("annc.composer.restored")}{" "}
              <button
                type="button"
                className="an-linkbtn"
                onClick={() => {
                  setD(initial);
                  setRestored(false);
                }}
              >
                {t("annc.composer.discardRestored")}
              </button>
            </>
          ) : savedAt ? (
            t("annc.composer.autosaved", { time: savedAt })
          ) : isEdit ? (
            t("annc.composer.versionLine", { n: d.version || 1 })
          ) : (
            t("annc.composer.autosaveHint")
          )}
        </p>
      </div>
      {mode !== "template" ? (
        <button type="button" className="an-btn" onClick={() => onOpenGallery?.(d)}>
          <Ic name="tpl" size={16} />
          {templateLabel ? t("annc.composer.templateIs", { name: templateLabel }) : t("annc.composer.templates")}
          <Ic name="chev" size={15} />
        </button>
      ) : null}
      <button type="button" className="an-ibtn" onClick={onClose} aria-label={t("annc.close")}>
        <Ic name="x" size={18} />
      </button>
    </header>
  );

  /* ---------------- İçerik view ---------------- */
  const contentView = (
    <div className="an-comp" data-testid="an-composer">
      <div className="an-comp-l">
        {header}
        <div className="an-comp-scroll" ref={sections.top}>
          {mode === "template" ? (
            <div className="an-field">
              <Label htmlFor="an-tpl-name">{t("annc.composer.templateName")}</Label>
              <input id="an-tpl-name" className="an-inp" value={tplName} maxLength={80} onChange={(e) => setTplName(e.target.value)} data-autofocus />
            </div>
          ) : null}
          <div>
            <Label>{t("annc.composer.langVersions")}</Label>
            <div className="an-ltabs">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={l === d.sourceLang ? "is-on" : ""}
                  title={t(`annc.lstate.${states[l]}`)}
                  onClick={() => {
                    if (l === d.sourceLang) return;
                    setLang(l);
                    setView("langs");
                  }}
                >
                  <i className={DOT[states[l]]} />
                  {LOCALE_CODE[l]}
                </button>
              ))}
              <button type="button" className="an-ltabs-ai" onClick={() => translateMissing()} disabled={translating || !meta.translateAvailable || !summary.missing.length || !d.title || !d.content} title={meta.translateAvailable ? undefined : t("annc.err.translateOff")}>
                <Ic name="spark" size={14} />
                {translating ? t("annc.composer.translating") : t("annc.composer.translateMissing")}
              </button>
            </div>
          </div>
          <div className="an-field">
            <Label htmlFor="an-title">{t("annc.composer.title")}</Label>
            <div className="an-inp-wrap">
              <input id="an-title" className="an-inp" value={d.title} maxLength={LIMITS.title} onChange={(e) => patch({ title: e.target.value })} placeholder={t("annc.composer.titlePh")} data-autofocus={mode !== "template" ? "" : undefined} />
              <em className={d.title.length > LIMITS.title - 6 ? "is-warn" : ""}>{`${d.title.length}/${LIMITS.title}`}</em>
            </div>
          </div>
          <div className="an-field">
            <Label htmlFor="an-text">{t("annc.composer.text")}</Label>
            <div className="an-ed">
              <div className="an-ed-tb" role="toolbar" aria-label={t("annc.composer.format")}>
                <button type="button" onClick={() => fmt("bold")} aria-label={t("annc.composer.bold")}><Ic name="bold" size={16} /></button>
                <button type="button" onClick={() => fmt("italic")} aria-label={t("annc.composer.italic")}><Ic name="italic" size={16} /></button>
                <button type="button" onClick={() => fmt("link")} aria-label={t("annc.composer.link")}><Ic name="link" size={16} /></button>
                <button type="button" onClick={() => fmt("list")} aria-label={t("annc.composer.list")}><Ic name="list" size={16} /></button>
                <button type="button" onClick={() => fileRef.current?.click()} aria-label={t("annc.composer.image")}><Ic name="img" size={16} /></button>
                <em>{`${d.content.length}/${LIMITS.content}`}</em>
              </div>
              <textarea id="an-text" ref={textRef} className="an-ed-body" value={d.content} maxLength={LIMITS.content} rows={4} onChange={(e) => patch({ content: e.target.value })} placeholder={t("annc.composer.textPh")} />
            </div>
            {hasEmoji(d.title) || hasEmoji(d.content) ? (
              <div className="an-hint is-warn">
                <Ic name="alert" size={14} />
                {t("annc.composer.emojiHint")}
                <button type="button" className="an-linkbtn" onClick={() => patch({ title: stripEmoji(d.title), content: stripEmoji(d.content) })}>
                  {t("annc.composer.emojiFix")}
                </button>
              </div>
            ) : null}
          </div>
          <div className="an-g3">
            <div>
              <Label>{t("annc.composer.icon")}</Label>
              <div className="an-icons" role="radiogroup" aria-label={t("annc.composer.icon")}>
                {(allIcons ? ANN_ICON_KEYS : ANN_ICON_QUICK).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={d.icon === k} aria-label={t(`annc.icon.${k}`)} title={t(`annc.icon.${k}`)} className={d.icon === k ? "is-on" : ""} style={d.icon === k ? { "--ann-c": d.color } : undefined} onClick={() => patch({ icon: k })}>
                    <Ic name={k} size={18} />
                  </button>
                ))}
                <button type="button" className="an-icons-more" aria-expanded={allIcons} onClick={() => setAllIcons((v) => !v)} aria-label={allIcons ? t("annc.composer.fewerIcons") : t("annc.composer.moreIcons")}>
                  <Ic name={allIcons ? "up" : "plus"} size={16} />
                </button>
              </div>
            </div>
            <div>
              <Label>{t("annc.composer.color")}</Label>
              <div className="an-sw-row" role="radiogroup" aria-label={t("annc.composer.color")}>
                {COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={d.color === c} aria-label={t(`annc.color.${c.slice(1)}`)} className={d.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => patch({ color: c })} />
                ))}
              </div>
            </div>
            <div>
              <Label>{t("annc.composer.priority")}</Label>
              <Seg items={["normal", "important", "urgent"].map((p) => ({ id: p, label: t(`annc.prio.${p}`) }))} value={d.priority} onChange={(p) => patch({ priority: p })} label={t("annc.composer.priority")} />
            </div>
          </div>
          <div className="an-g2">
            <div className="an-field">
              <Label htmlFor="an-cta-l">{t("annc.composer.ctaLabel")}</Label>
              <input id="an-cta-l" className="an-inp" value={d.ctaLabel} maxLength={LIMITS.ctaLabel} onChange={(e) => patch({ ctaLabel: e.target.value })} placeholder={t("annc.composer.ctaLabelPh")} />
            </div>
            <div className="an-field">
              <Label htmlFor="an-cta-u">{t("annc.composer.ctaUrl")}</Label>
              <div className="an-inp-wrap has-ic">
                <Ic name="link" size={16} />
                <input id="an-cta-u" className="an-inp" value={d.ctaUrl} list="an-cta-paths" onChange={(e) => patch({ ctaUrl: e.target.value.trim() })} placeholder={t("annc.composer.ctaUrlPh")} />
                <datalist id="an-cta-paths">
                  {APP_LINKS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </div>
          </div>
          <div ref={sections.audience}>
            <Label>{t("annc.composer.audience")}</Label>
            <div className="an-aud-row">
              <div className="an-aud-chips">
                {audChip("all", "users", t("annc.aud.all"), isEveryone(aud))}
                {audChip("premium", "star", aud.premium === "non_member" ? t("annc.aud.premiumNonShort") : t("annc.aud.premium"), Boolean(aud.premium))}
                {audChip("langs", "lang", aud.langs?.length ? aud.langs.map((l) => LOCALE_CODE[l]).join(", ") : t("annc.aud.lang"), Boolean(aud.langs?.length))}
                {audChip("platforms", "monitor", aud.platforms?.length ? aud.platforms.map((p) => t(`annc.platform.${p}`)).join(", ") : t("annc.aud.platform"), Boolean(aud.platforms?.length))}
                {audChip("newDays", "user", aud.newDays ? t("annc.aud.newDaysShort", { n: aud.newDays }) : t("annc.aud.newUsers"), Boolean(aud.newDays))}
              </div>
              <div className="an-reach" aria-live="polite">
                <Ic name="users" size={17} />
                <b className="tnum">{reach.count == null ? "—" : fmtNumber(reach.count, locale)}</b>
                <span>{t("annc.aud.people")}</span>
              </div>
            </div>
            {["premium", "langs", "platforms", "newDays"].map((k) => (
              <Menu key={k} open={menu === k} anchorRef={audRefs[k]} onClose={() => setMenu(null)} items={audMenus[k].map((it) => ({ ...it, trail: it.active ? <Ic name="tick" size={15} /> : it.trail }))} label={t(`annc.aud.menu.${k}`)} width={240} align="left" />
            ))}
          </div>
          <div className="an-g2" ref={sections.schedule}>
            <div className="an-field">
              <Label htmlFor="an-start" extra={d.startsAt ? <button type="button" className="an-linkbtn" onClick={() => patch({ startsAt: null })}>{t("annc.composer.now")}</button> : null}>{t("annc.composer.startsAt")}</Label>
              <div className={`an-dd${d.startsAt ? "" : " is-empty"}`}>
                <Ic name="calendar" size={16} />
                <input id="an-start" type="datetime-local" value={toLocalInput(d.startsAt)} onChange={(e) => patch({ startsAt: fromLocalInput(e.target.value) })} aria-describedby="an-start-h" />
                {!d.startsAt ? <span className="an-dd-ph" id="an-start-h">{t("annc.composer.immediately")}</span> : null}
              </div>
            </div>
            <div className="an-field">
              <Label htmlFor="an-end" extra={d.endsAt ? <button type="button" className="an-linkbtn" onClick={() => patch({ endsAt: null })}>{t("annc.composer.noEnd")}</button> : null}>{t("annc.composer.endsAt")}</Label>
              <div className={`an-dd${d.endsAt ? "" : " is-empty"}`}>
                <Ic name="timer" size={16} />
                <input id="an-end" type="datetime-local" value={toLocalInput(d.endsAt)} onChange={(e) => patch({ endsAt: fromLocalInput(e.target.value) })} />
                {!d.endsAt ? <span className="an-dd-ph">{t("annc.composer.forever")}</span> : null}
              </div>
              <div className="an-quick">
                {[1, 3, 7, 30].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      const base = d.startsAt ? Date.parse(d.startsAt) : Date.now();
                      patch({ endsAt: new Date(base + n * 86400000).toISOString() });
                    }}
                  >
                    {t("annc.composer.plusDays", { n })}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="an-toggles">
            <Switch checked={d.pinned} onChange={(v) => patch({ pinned: v })} label={t("annc.composer.pin")} />
            <Switch checked={d.liveNotify} onChange={(v) => patch({ liveNotify: v })} label={t("annc.composer.liveNotify")} />
            <Switch checked={d.push} onChange={(v) => patch({ push: v })} label={t("annc.composer.push")} />
          </div>
          <div>
            <Label>{t("annc.composer.cover")}</Label>
            {d.coverUrl ? (
              <div className="an-cover-set">
                <img src={d.coverUrl} alt="" />
                <button type="button" className="an-btn is-sm" onClick={() => patch({ coverUrl: "" })}>
                  <Ic name="trash" size={14} />
                  {t("annc.composer.coverRemove")}
                </button>
              </div>
            ) : (
              <div
                className={`an-drop${cover.over ? " is-over" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!cover.over) setCover((c) => ({ ...c, over: true }));
                }}
                onDragLeave={() => setCover((c) => ({ ...c, over: false }))}
                onDrop={(e) => {
                  e.preventDefault();
                  uploadCover(e.dataTransfer?.files?.[0]);
                }}
              >
                <Ic name="img" size={18} />
                <span>{cover.busy ? t("annc.composer.coverUploading") : t("annc.composer.coverHint")}</span>
                <button type="button" className="an-btn is-sm" onClick={() => fileRef.current?.click()} disabled={cover.busy}>
                  {t("annc.composer.coverPick")}
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => uploadCover(e.target.files?.[0])} />
          </div>
          {error ? (
            <div className="an-err" role="alert">
              <Ic name="alert" size={15} />
              {error}
            </div>
          ) : null}
        </div>
        <footer className="an-comp-ft">
          {mode !== "template" ? (
            <>
              <button type="button" className="an-btn is-lg" onClick={() => save("draft")} disabled={Boolean(saving) || (live && !isEdit)}>
                {saving === "draft" ? t("annc.saving") : live ? t("annc.composer.saveOnly") : t("annc.composer.saveDraft")}
              </button>
              <button type="button" className="an-btn is-lg" onClick={sendTest} disabled={Boolean(saving) || !d.title || !d.content}>
                <Ic name="send" size={16} />
                {saving === "test" ? t("annc.saving") : t("annc.composer.sendTest")}
              </button>
            </>
          ) : null}
          <span className="an-sp" />
          <button type="button" className={`an-btn is-lg ${approval && mode !== "template" ? "is-gold" : "is-primary"}`} onClick={() => save("publish")} disabled={Boolean(saving) || blocking} data-testid="an-composer-primary">
            <Ic name={mode === "template" ? "tpl" : approval ? "shield" : scheduled ? "clock" : "send"} size={16} />
            {saving === "publish" ? t("annc.saving") : primaryLabel}
          </button>
        </footer>
      </div>
      <div className="an-comp-r">
        <div className="an-comp-r-hd">
          <span className="an-cap">{t("annc.preview.live")}</span>
          <div className="an-pvlang" role="radiogroup" aria-label={t("annc.preview.lang")}>
            {LOCALES.map((l) => (
              <button key={l} type="button" role="radio" aria-checked={pvLang === l} className={pvLang === l ? "is-on" : ""} onClick={() => setPvLang(l)} title={t(`annc.lang.${LANG_KEY[l]}`)}>
                {LOCALE_CODE[l]}
              </button>
            ))}
          </div>
          <Seg
            items={[
              { id: "desktop", icon: "monitor", label: t("annc.preview.desktop") },
              { id: "mobile", icon: "phone", label: t("annc.preview.mobile") },
              { id: "both", label: t("annc.preview.both") },
            ]}
            value={pv}
            onChange={setPv}
            label={t("annc.preview.live")}
          />
        </div>
        {pv !== "mobile" ? <DesktopPreview item={item} height={pv === "desktop" ? 420 : 296} /> : null}
        {pv !== "desktop" ? (
          <div className="an-comp-r-row">
            <PhonePreview item={item} others={others} />
            <div className="an-comp-side">
              <span className="an-cap">{t("annc.preview.push")}</span>
              <div className={d.push ? "" : "is-dim"}>
                <PushPreview title={item.title} />
              </div>
              {!d.push ? <small className="an-muted">{t("annc.preview.pushOff")}</small> : null}
              <span className="an-cap">{t("annc.checks.heading")}</span>
              <ul className="an-checks">
                {checks.map((c) => (
                  <li key={c.id} className={`is-${c.level}`}>
                    <Ic name={c.level === "ok" ? "tick" : "alert"} size={15} />
                    <span>{t(`annc.checks.${c.id}`, { n: c.langs ? c.langs.length : c.n, langs: (c.langs || []).map((l) => LOCALE_CODE[l]).join(", ") })}</span>
                  </li>
                ))}
              </ul>
              <div className="an-note is-gold">
                <small>{t("annc.note.info")}</small>
                {t("annc.note.fallback")}
              </div>
            </div>
          </div>
        ) : (
          <ul className="an-checks">
            {checks.map((c) => (
              <li key={c.id} className={`is-${c.level}`}>
                <Ic name={c.level === "ok" ? "tick" : "alert"} size={15} />
                <span>{t(`annc.checks.${c.id}`, { n: c.langs ? c.langs.length : c.n, langs: (c.langs || []).map((l) => LOCALE_CODE[l]).join(", ") })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  /* ---------------- Diller view ---------------- */
  const tr = d.translations?.[lang] || { title: "", content: "", cta_label: "" };
  const st = states[lang];
  const tchecks = translationChecks(d, lang);
  const steps = [
    { id: "content", n: 1, label: t("annc.steps.content"), done: true },
    { id: "langs", n: 2, label: t("annc.steps.langs"), on: true },
    { id: "audience", n: 3, label: t("annc.steps.audience") },
    { id: "schedule", n: 4, label: t("annc.steps.schedule") },
  ];
  const langView = (
    <div className="an-wiz" data-testid="an-langs">
      <div className="an-steps">
        {steps.map((s, i) => (
          <div key={s.id} className="an-step-wrap">
            {i ? <span className={`an-stl${s.done || s.on ? " is-done" : ""}`} /> : null}
            <button type="button" className={`an-stp${s.on ? " is-on" : ""}${s.done ? " is-done" : ""}`} aria-current={s.on ? "step" : undefined} onClick={() => (s.id === "langs" ? null : s.id === "content" ? goto("top") : goto(s.id))}>
              <i>{s.done ? <Ic name="tick" size={13} /> : s.n}</i>
              {s.label}
            </button>
          </div>
        ))}
        <button type="button" className="an-ibtn" onClick={onClose} aria-label={t("annc.close")}>
          <Ic name="x" size={18} />
        </button>
      </div>
      <div className="an-wiz-body">
        <div className="an-wiz-ll">
          <span className="an-cap">{t("annc.langs.summary", { total: summary.total, ready: summary.ready })}</span>
          {LOCALES.map((l) => (
            <button key={l} type="button" className={`an-lr${l === lang ? " is-on" : ""}`} onClick={() => l !== d.sourceLang && setLang(l)} aria-pressed={l === lang} disabled={l === d.sourceLang}>
              <span className="an-cd">{LOCALE_CODE[l]}</span>
              <span className="an-lr-txt">
                <b>{t(`annc.lang.${LANG_KEY[l]}`)}</b>
                <small>
                  {states[l] === "source"
                    ? t("annc.langs.sourceLang")
                    : states[l] === "missing"
                      ? t("annc.langs.none")
                      : d.translations?.[l]?.by === "auto"
                        ? t("annc.langs.auto")
                        : d.translations?.[l]?.by && !["template", "migration"].includes(d.translations[l].by)
                          ? t("annc.langs.byHand", { by: d.translations[l].by })
                          : t("annc.langs.ready")}
                </small>
              </span>
              <Chip tone={STATE_TONE[states[l]]}>{t(`annc.lstate.${states[l]}`)}</Chip>
            </button>
          ))}
          <div className="an-sep" />
          <button type="button" className="an-btn is-violet" onClick={() => translateMissing()} disabled={translating || !meta.translateAvailable || !summary.missing.length}>
            <Ic name="spark" size={15} />
            {translating ? t("annc.composer.translating") : summary.missing.length ? t("annc.langs.translateMissing", { n: summary.missing.length }) : t("annc.langs.allDone")}
          </button>
          <div className="an-note is-gold">
            <small>{t("annc.langs.fallbackTitle")}</small>
            {t("annc.note.fallbackPlural")}
          </div>
        </div>
        <div className="an-wiz-ed">
          <div className="an-pane">
            <div className="an-ph">
              <span className="an-cd is-sm">{LOCALE_CODE[d.sourceLang]}</span>
              {t("annc.langs.source")}
              <span className="an-sp" />
              <span className="an-muted">{t("annc.langs.readOnly")}</span>
            </div>
            <Label>{t("annc.composer.title")}</Label>
            <div className="an-src">{d.title || "—"}</div>
            <Label>{t("annc.composer.text")}</Label>
            <div className="an-src is-tall">{d.content || "—"}</div>
            <Label>{t("annc.langs.button")}</Label>
            <div className="an-src">{d.ctaLabel || "—"}</div>
          </div>
          <div className="an-pane">
            <div className="an-ph">
              <span className="an-cd is-sm is-blue">{LOCALE_CODE[lang]}</span>
              {t(`annc.lang.${LANG_KEY[lang]}`)}
              <span className="an-sp" />
              <Chip tone={STATE_TONE[st]}>{st === "auto" ? t("annc.langs.autoCheck") : t(`annc.lstate.${st}`)}</Chip>
            </div>
            <Label htmlFor="an-tr-title">{t("annc.composer.title")}</Label>
            <input id="an-tr-title" className="an-inp is-tgt" lang={lang} value={tr.title || ""} maxLength={LIMITS.title} onChange={(e) => patchTr(lang, { title: e.target.value, state: "ready", by: meta?.me?.username || null, at: new Date().toISOString() })} />
            <Label htmlFor="an-tr-text">{t("annc.composer.text")}</Label>
            <textarea id="an-tr-text" className="an-inp is-tgt is-tall" lang={lang} value={tr.content || ""} maxLength={LIMITS.content} onChange={(e) => patchTr(lang, { content: e.target.value, state: "ready", by: meta?.me?.username || null, at: new Date().toISOString() })} />
            <Label htmlFor="an-tr-cta">{t("annc.langs.button")}</Label>
            <input id="an-tr-cta" className="an-inp is-tgt" lang={lang} value={tr.cta_label || ""} maxLength={LIMITS.ctaLabel} onChange={(e) => patchTr(lang, { cta_label: e.target.value, state: tr.state || "ready" })} placeholder={d.ctaLabel || ""} />
          </div>
          <div className="an-wiz-actions">
            <button type="button" className="an-btn" onClick={() => translateMissing(lang)} disabled={translating || !meta.translateAvailable || !d.title || !d.content}>
              <Ic name="refresh" size={16} />
              {translating ? t("annc.composer.translating") : t("annc.langs.retranslate")}
            </button>
            <button type="button" className="an-btn" onClick={() => patchTr(lang, { title: d.title, content: d.content, cta_label: d.ctaLabel, state: "auto", by: meta?.me?.username || null, at: new Date().toISOString() })}>
              <Ic name="copy" size={16} />
              {t("annc.langs.copySource")}
            </button>
            <span className="an-sp" />
            <button type="button" className="an-btn is-greenq" disabled={!tr.title || !tr.content || st === "ready"} onClick={() => patchTr(lang, { state: "ready", by: meta?.me?.username || tr.by || null, at: new Date().toISOString() })}>
              <Ic name="tick" size={16} />
              {t(`annc.approveLang.${LANG_KEY[lang]}`)}
            </button>
          </div>
          <div className="an-box">
            <span className="an-cap">{t("annc.langs.checks")}</span>
            {tr.title || tr.content ? (
              tchecks.map((c) => (
                <div key={c.id} className={`an-trow is-${c.level}`}>
                  <Ic name={c.level === "ok" ? "tick" : "alert"} size={15} />
                  <span>
                    {t(`annc.tcheck.${c.id}`, {
                      lang: t(`annc.lang.${LANG_KEY[lang]}`),
                      url: c.url || "",
                      terms: (c.terms || []).map((x) => `"${x}"`).join(", "),
                      pct: Math.abs(c.pct || 0),
                      lines: c.lines || phoneLines(tr.content),
                      sample: c.sample || "",
                    })}
                  </span>
                </div>
              ))
            ) : (
              <div className="an-trow is-warn">
                <Ic name="alert" size={15} />
                <span>{t("annc.tcheck.missing", { lang: t(`annc.lang.${LANG_KEY[lang]}`) })}</span>
              </div>
            )}
          </div>
          <div className="an-box">
            <span className="an-cap">{t("annc.langs.lastStep")}</span>
            <div className="an-trow">
              <Ic name="shield" size={15} />
              <span>
                {approval
                  ? t("annc.langs.ruleUrgent")
                  : t("annc.langs.ruleNormal", { prio: t(`annc.prio.${d.priority}`), aud: isEveryone(d.audience) ? t("annc.aud.allLower") : t("annc.aud.someLower") })}
              </span>
            </div>
            <div className="an-trow">
              <Ic name="send" size={15} />
              <span>{t("annc.langs.testHint")}</span>
            </div>
          </div>
          {error ? (
            <div className="an-err" role="alert">
              <Ic name="alert" size={15} />
              {error}
            </div>
          ) : null}
        </div>
        <div className="an-wiz-pv">
          <Seg
            items={[
              { id: "desktop", icon: "monitor", label: t("annc.preview.desktop") },
              { id: "mobile", icon: "phone", label: t("annc.preview.mobile") },
            ]}
            value={pv === "desktop" ? "desktop" : "mobile"}
            onChange={setPv}
            label={t("annc.preview.live")}
          />
          {pv === "desktop" ? (
            <DesktopPreview item={previewItem(d, lang, { author: meta?.me?.username || "admin" })} height={300} />
          ) : (
            <PhonePreview item={previewItem(d, lang, { author: meta?.me?.username || "admin" })} others={others} caption={t("annc.langs.seenBy", { lang: t(`annc.lang.${LANG_KEY[lang]}`) })} />
          )}
        </div>
      </div>
      <footer className="an-wiz-ft">
        <button type="button" className="an-btn is-lg" onClick={() => goto("top")}>
          <Ic name="chevl" size={16} />
          {t("annc.langs.back")}
        </button>
        <span className="an-muted">{savedAt ? t("annc.composer.autosaved", { time: savedAt }) : ""}</span>
        <span className="an-sp" />
        {mode !== "template" ? (
          <button type="button" className="an-btn is-lg" onClick={() => save("draft")} disabled={Boolean(saving)}>
            {saving === "draft" ? t("annc.saving") : t("annc.composer.saveDraft")}
          </button>
        ) : null}
        <button type="button" className="an-btn is-lg is-primary" onClick={() => goto("audience")}>
          {t("annc.langs.next")}
          <Ic name="chevr" size={16} />
        </button>
      </footer>
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} busy={Boolean(saving)} bare labelledBy={titleId} width={view === "langs" ? 1300 : 1260} className="is-comp" testId="an-composer-dlg">
      {view === "langs" ? langView : contentView}
      {view === "langs" ? <span id={titleId} hidden>{t("annc.steps.langs")}</span> : null}
    </Dialog>
  );
}
