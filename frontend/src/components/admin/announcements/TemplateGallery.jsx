/**
 * Şablon galerisi (Draft C "Şablondan başla"): categories, built-in templates
 * with use counts and language count, my templates, recently used; the right
 * panel fills the template's variables (date, time, duration, choice, percent,
 * text) and shows the result card live, rendered on the server for every
 * language. "Bu şablonla başla" opens the composer with all 7 versions filled.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import AnnouncementCard from "../../announcements/AnnouncementCard.jsx";
import { AnnTile } from "../../announcements/AnnGlyph.jsx";
import { annApi } from "./announcementsApi.js";
import { TEMPLATE_CATEGORIES, emptyDraft, errorKey, minutesBetween, splitVars, templateValues } from "./announcementsModel.js";
import { Chip, Dialog, Ic, Label, Menu, Skeleton } from "./ui.jsx";

const CAT_ICON = { all: "tpl", maintenance: "wrench", feature: "party", event: "calendar", security: "shield", campaign: "star", rules: "check", mine: "user", recent: "history" };

function tplName(tpl, lang, t) {
  if (tpl.name) return tpl.name;
  return tpl.text?.[lang]?.name || tpl.text?.tr?.name || t(`annc.tplcat.${tpl.category}`);
}

export default function TemplateGallery({ open, onClose, onUse, meta = {}, say }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [values, setValues] = useState({});
  const [filled, setFilled] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const menuRefs = useRef({});
  const lang = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"].includes(locale) ? locale : "tr";

  const load = async () => {
    setErr("");
    try {
      const r = await annApi.templates();
      setData(r);
      if (!sel && r.builtin?.[0]) pick(r.builtin[0]);
    } catch (e) {
      setErr(errorKey(e) ? t(errorKey(e)) : e?.message || t("annc.err.generic"));
    }
  };

  useEffect(() => {
    if (!open) return;
    setCat("all");
    setQ("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(tpl) {
    setSel(tpl);
    setFilled(null);
    setValues(tpl.key.startsWith("b:") ? templateValues(tpl) : {});
  }

  // Server render of the builtin template for every language.
  useEffect(() => {
    if (!open || !sel || !sel.key.startsWith("b:")) return undefined;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const r = await annApi.fillTemplate(sel.key, values, "tr");
        if (!cancelled) setFilled(r.filled);
      } catch {
        if (!cancelled) setFilled(null);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [open, sel, values]);

  const all = useMemo(() => [...(data?.builtin || []), ...(data?.custom || [])], [data]);
  const counts = useMemo(() => {
    const out = { all: all.length, mine: (data?.custom || []).filter((c) => c.mine).length, recent: (data?.recent || []).length };
    for (const c of TEMPLATE_CATEGORIES) out[c] = all.filter((x) => x.category === c).length;
    return out;
  }, [all, data]);
  const shown = useMemo(() => {
    let list = data?.builtin || [];
    if (cat === "mine") list = (data?.custom || []).filter((c) => c.mine);
    else if (cat === "recent") list = (data?.recent || []).map((k) => all.find((x) => x.key === k)).filter(Boolean);
    else if (cat !== "all") list = all.filter((x) => x.category === cat);
    const s = q.trim().toLocaleLowerCase(lang);
    if (s) list = list.filter((x) => `${tplName(x, lang, t)} ${t(`annc.tplcat.${x.category}`)}`.toLocaleLowerCase(lang).includes(s));
    return list;
  }, [cat, data, all, q, lang, t]);
  const mine = (data?.custom || []).filter((c) => c.mine || cat === "all");

  if (!open) return null;

  const setVal = (id, v) => {
    setValues((cur) => {
      const next = { ...cur, [id]: v };
      const dur = sel?.vars?.find((x) => x.type === "duration" && x.from?.includes(id));
      if (dur) {
        const m = minutesBetween(next[dur.from[0]], next[dur.from[1]]);
        if (m != null) next[dur.id] = m;
      }
      return next;
    });
  };

  const resultItem = () => {
    if (!sel) return null;
    if (sel.key.startsWith("c:")) return { id: "tpl", title: sel.title, content: sel.content, ctaLabel: sel.ctaLabel, ctaUrl: sel.ctaUrl, icon: sel.icon, color: sel.color, priority: sel.priority, author: meta?.me?.username || "admin", createdAt: new Date().toISOString() };
    if (!filled) return null;
    const tx = lang === "tr" ? filled : filled.translations?.[lang] ? { title: filled.translations[lang].title, content: filled.translations[lang].content, ctaLabel: filled.translations[lang].cta_label } : filled;
    return { id: "tpl", title: tx.title, content: tx.content, ctaLabel: tx.ctaLabel || filled.ctaLabel, ctaUrl: filled.ctaUrl, icon: filled.icon, color: filled.color, priority: filled.priority, author: meta?.me?.username || "admin", createdAt: new Date().toISOString() };
  };

  const start = () => {
    if (!sel) return;
    if (sel.key.startsWith("c:")) {
      onUse?.(emptyDraft({ title: sel.title, content: sel.content, icon: sel.icon, color: sel.color, priority: sel.priority, ctaLabel: sel.ctaLabel, ctaUrl: sel.ctaUrl, sourceLang: sel.sourceLang, translations: sel.translations, templateKey: sel.key }), tplName(sel, lang, t));
      return;
    }
    if (!filled) return;
    onUse?.(
      emptyDraft({ title: filled.title, content: filled.content, icon: filled.icon, color: filled.color, priority: filled.priority, ctaLabel: filled.ctaLabel, ctaUrl: filled.ctaUrl, sourceLang: "tr", translations: filled.translations, templateKey: filled.templateKey }),
      tplName(sel, lang, t)
    );
  };

  const removeTemplate = async (tpl) => {
    try {
      await annApi.deleteTemplate(tpl.id);
      say?.(t("annc.gallery.deleted"));
      if (sel?.key === tpl.key) setSel(null);
      load();
    } catch (e) {
      setErr(errorKey(e) ? t(errorKey(e)) : e?.message || t("annc.err.generic"));
    }
  };

  const item = resultItem();
  const varLabel = (id) => {
    const s = t(`annc.var.${id}`);
    return s.startsWith("annc.") ? id : s;
  };
  const srcText = sel ? (sel.key.startsWith("b:") ? sel.text?.tr : { title: sel.title, content: sel.content }) : null;

  const field = (v) => {
    const id = `an-var-${v.id}`;
    const val = values[v.id] ?? "";
    if (v.type === "choice") {
      return (
        <select id={id} className="an-inp" value={val} onChange={(e) => setVal(v.id, e.target.value)}>
          {Object.entries(v.options || {}).map(([k, labels]) => (
            <option key={k} value={k}>
              {labels[lang] || labels.tr}
            </option>
          ))}
        </select>
      );
    }
    if (v.type === "date") return <input id={id} type="date" className="an-inp" value={val} onChange={(e) => setVal(v.id, e.target.value)} />;
    if (v.type === "time") return <input id={id} type="time" className="an-inp" value={val} onChange={(e) => setVal(v.id, e.target.value)} />;
    if (v.type === "duration")
      return (
        <div className="an-inp-wrap">
          <input id={id} type="number" min={5} step={5} className="an-inp" value={val} onChange={(e) => setVal(v.id, Number(e.target.value) || 0)} />
          <em>{t("annc.var.minutes")}</em>
        </div>
      );
    if (v.type === "percent")
      return (
        <div className="an-inp-wrap">
          <input id={id} type="number" min={1} max={100} className="an-inp" value={val} onChange={(e) => setVal(v.id, Number(e.target.value) || 0)} />
          <em>%</em>
        </div>
      );
    return <input id={id} className="an-inp" value={val} maxLength={200} onChange={(e) => setVal(v.id, e.target.value)} placeholder={v.optional ? t("annc.var.optional") : ""} />;
  };

  const freeText = sel?.vars?.some((v) => v.type === "text" && String(values[v.id] || "").trim());

  return (
    <Dialog open={open} onClose={onClose} bare labelledBy="an-gal-title" width={1640} className="is-gal" testId="an-gallery">
      <div className="an-gal">
        <aside className="an-gal-side">
          <span className="an-cap">{t("annc.gallery.categories")}</span>
          {["all", ...TEMPLATE_CATEGORIES].map((c) => (
            <button key={c} type="button" className={`an-ri${cat === c ? " is-on" : ""}`} onClick={() => setCat(c)} aria-pressed={cat === c}>
              <Ic name={CAT_ICON[c]} size={18} />
              {c === "all" ? t("annc.gallery.all") : t(`annc.tplcat.${c}`)}
              <em>{counts[c] ?? 0}</em>
            </button>
          ))}
          <div className="an-sep" />
          <button type="button" className={`an-ri${cat === "mine" ? " is-on" : ""}`} onClick={() => setCat("mine")}>
            <Ic name="user" size={18} />
            {t("annc.gallery.mine")}
            <em>{counts.mine}</em>
          </button>
          <button type="button" className={`an-ri${cat === "recent" ? " is-on" : ""}`} onClick={() => setCat("recent")}>
            <Ic name="history" size={18} />
            {t("annc.gallery.recent")}
            <em>{counts.recent}</em>
          </button>
          <div className="an-note is-gold an-gal-tip">
            <small>{t("annc.gallery.tipTitle")}</small>
            {t("annc.gallery.tip")}
          </div>
        </aside>
        <div className="an-gal-mid">
          <div className="an-gal-hd">
            <div>
              <h2 id="an-gal-title">{t("annc.gallery.title")}</h2>
              <p className="an-muted">{t("annc.gallery.subtitle")}</p>
            </div>
            <label className="an-search is-sm">
              <Ic name="search" size={17} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("annc.gallery.search")} aria-label={t("annc.gallery.search")} data-autofocus />
            </label>
          </div>
          {err ? (
            <div className="an-err" role="alert">
              <Ic name="alert" size={15} />
              {err}
              <button type="button" className="an-linkbtn" onClick={load}>
                {t("annc.retry")}
              </button>
            </div>
          ) : null}
          <div className="an-tgrid">
            {!data
              ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={232} r={16} />)
              : shown.map((tpl) => (
                  <button key={tpl.key} type="button" className={`an-tc${sel?.key === tpl.key ? " is-on" : ""}`} onClick={() => pick(tpl)} aria-pressed={sel?.key === tpl.key} style={{ "--ann-c": tpl.color }}>
                    <div className="an-tc-pv">
                      <AnnTile icon={tpl.icon} color={tpl.color} size="sm" />
                      <span className="an-tc-us">{t("annc.gallery.uses", { n: tpl.uses || 0 })}</span>
                      <div className="an-tc-t">{tplName(tpl, lang, t)}</div>
                      <div className="an-tc-ln" style={{ width: "90%" }} />
                      <div className="an-tc-ln" style={{ width: "65%" }} />
                    </div>
                    <div className="an-tc-inf">
                      <b>{tplName(tpl, lang, t)}</b>
                      <span>{t("annc.gallery.meta", { cat: t(`annc.tplcat.${tpl.category}`), vars: tpl.vars?.length || 0, langs: tpl.langs || 1 })}</span>
                    </div>
                  </button>
                ))}
            {data && !shown.length ? <p className="an-muted an-gal-empty">{t("annc.gallery.empty")}</p> : null}
          </div>
          <div className="an-tc is-blank">
            <span className="an-tile-plus" aria-hidden="true">
              <Ic name="plus" size={18} />
            </span>
            <div>
              <b>{t("annc.gallery.blank")}</b>
              <span className="an-muted">{t("annc.gallery.blankSub")}</span>
            </div>
            <span className="an-sp" />
            <button type="button" className="an-btn is-sm" onClick={() => onUse?.(emptyDraft(), "")}>
              {t("annc.gallery.blankStart")}
            </button>
            <button type="button" className="an-btn is-sm" onClick={() => onUse?.(emptyDraft(), "", "template")}>
              {t("annc.gallery.newTemplate")}
            </button>
          </div>
          {mine.length ? (
            <div>
              <span className="an-cap">{t("annc.gallery.mine")}</span>
              {mine.map((tpl) => (
                <div key={tpl.key} className="an-dr">
                  <AnnTile icon={tpl.icon} color={tpl.color} size="sm" />
                  <div className="an-dr-txt">
                    <b>{tpl.name}</b>
                    <small>{t("annc.gallery.mineMeta", { by: tpl.createdByName ? `@${tpl.createdByName}` : "—", vars: tpl.vars?.length || 0, langs: tpl.langs || 1, n: tpl.uses || 0 })}</small>
                  </div>
                  <button type="button" className="an-btn is-sm" onClick={() => { pick(tpl); }}>
                    {t("annc.gallery.use")}
                  </button>
                  <button type="button" className="an-ibtn is-sm" ref={(el) => { if (!menuRefs.current[tpl.key]) menuRefs.current[tpl.key] = { current: null }; menuRefs.current[tpl.key].current = el; }} aria-label={t("annc.more")} aria-haspopup="menu" onClick={() => setMenuFor(menuFor === tpl.key ? null : tpl.key)}>
                    <Ic name="more" size={16} />
                  </button>
                  <Menu
                    open={menuFor === tpl.key}
                    anchorRef={menuRefs.current[tpl.key]}
                    onClose={() => setMenuFor(null)}
                    label={tpl.name}
                    width={220}
                    items={[
                      { id: "use", icon: "chevr", label: t("annc.gallery.use"), onSelect: () => pick(tpl) },
                      { id: "del", icon: "trash", label: t("annc.gallery.delete"), danger: true, onSelect: () => removeTemplate(tpl) },
                    ]}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="an-gal-rt">
          {sel ? (
            <>
              <div className="an-gal-rt-hd">
                <span className="an-cap">{tplName(sel, lang, t)}</span>
                <span className="an-sp" />
                <Chip tone={freeText ? "gold" : "green"}>{freeText ? t("annc.gallery.langsCheck", { n: sel.langs || 1 }) : t("annc.gallery.langsReady", { n: sel.langs || 1 })}</Chip>
              </div>
              <div className="an-src is-tpl">
                <b>
                  {splitVars(srcText?.title).map((p, i) => (p.v ? <span key={i} className="an-var">{`{${varLabel(p.v)}}`}</span> : <span key={i}>{p.text}</span>))}
                </b>
                <br />
                {splitVars(srcText?.content).map((p, i) => (p.v ? <span key={i} className="an-var">{`{${varLabel(p.v)}}`}</span> : <span key={i}>{p.text}</span>))}
              </div>
              {sel.vars?.length ? (
                <>
                  <span className="an-cap">{t("annc.gallery.vars")}</span>
                  <div className="an-g2 an-vars">
                    {sel.vars.map((v) => (
                      <div key={v.id} className={`an-field${v.type === "text" || v.type === "choice" ? " is-wide" : ""}`}>
                        <Label htmlFor={`an-var-${v.id}`}>{varLabel(v.id)}</Label>
                        {sel.key.startsWith("b:") ? field(v) : <input id={`an-var-${v.id}`} className="an-inp" disabled value={`{${v.id}}`} />}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <span className="an-cap">{t("annc.gallery.result")}</span>
              {item ? <AnnouncementCard item={item} preview expandable={false} /> : <Skeleton h={150} r={16} />}
              {freeText ? <p className="an-muted an-small">{t("annc.gallery.freeTextNote")}</p> : null}
              <div className="an-gal-ft">
                <button type="button" className="an-btn is-lg" onClick={onClose}>
                  {t("annc.cancel")}
                </button>
                <span className="an-sp" />
                <button type="button" className="an-btn is-lg is-primary" onClick={start} disabled={!item} data-testid="an-gallery-start">
                  <Ic name="chevr" size={16} />
                  {t("annc.gallery.start")}
                </button>
              </div>
            </>
          ) : (
            <p className="an-muted">{t("annc.gallery.pick")}</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
