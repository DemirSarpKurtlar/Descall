/**
 * Inside a Descall+ category (approved draft E, "Hikaye":
 * docs/design/premium-settings/category-drafts/e-windows.png and e-audio.png).
 *
 *   - Hero: the category name, its chapters with how many features are on, and a scene of
 *     the whole category with numbered markers (click one to open that feature).
 *   - Chapters (../chapters.js): numbered sections of feature cards.
 *   - Feature card: preview thumbnail, number, name, description, a short "what is set"
 *     line and the on / off switch. Opened, it grows in place: a live preview on the left
 *     that follows the settings, the feature's settings groups (its panel) on the right.
 *   - Features the member cannot use stay as locked cards with their pill (Descall+,
 *     Ultra, Masaüstü, Yakında).
 * The panels (../settings/<key>.jsx) stay the source of truth for every setting.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { FEATURES } from "../features.js";
import { PREMIUM_CHAPTERS, storyNumber } from "../chapters.js";
import { useFeatureSettings } from "../featureSettings.js";
import { Ico } from "./icons.jsx";
import { PREVIEWS, summarize } from "./previews.jsx";
import { HEROES } from "./heroes.jsx";
import "./story.css";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Preview({ fkey, settings, enabled, size }) {
  const { t } = useLocale();
  const P = PREVIEWS[fkey];
  return (
    <div className={`ps-pv is-${size}${enabled ? "" : " is-offpv"}`} data-preview={fkey} aria-hidden="true">
      {P ? <P s={settings || {}} t={t} size={size} /> : null}
    </div>
  );
}

/**
 * One feature. `block`: null (usable) or "plus" | "ultra" | "desktop" | "soon".
 * `catIcon` renders in place of the number in the search results list.
 */
export function FeatureCard({ fkey, num, catIcon, catColor = "blue", premium, desktop, block, open, onOpen, Panel, isOn }) {
  const { t } = useLocale();
  const def = FEATURES[fkey];
  const [settings, update] = useFeatureSettings(fkey, {});
  const enabled = isOn(fkey, settings);
  const name = t(`premium.f.${fkey}.name`);
  const desc = t(`premium.f.${fkey}.desc`);
  const bodyId = useId();
  const ref = useRef(null);
  const locked = block === "plus" || block === "ultra";
  const canOpen = !block;
  const isOpen = canOpen && open;

  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.top < 60 || r.bottom > vh) el.scrollIntoView({ block: r.height > vh - 80 ? "start" : "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
  }, [isOpen]);

  const control = locked ? (
    <span className={`pp-pill${block === "ultra" ? " is-ultra" : ""}`}>
      <Ico n="lock" size={11} sw={2.4} />
      {block === "ultra" ? t("premium.features.lockedUltra") : t("premium.features.lockedPlus")}
    </span>
  ) : block === "desktop" ? (
    <span className="pp-pill"><Ico n="monitor" size={11} sw={2.4} />{t("premium.features.desktop")}</span>
  ) : block === "soon" ? (
    <span className="pp-pill">{t("premium.features.soon")}</span>
  ) : (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={name}
      className={`us-toggle${enabled ? " active" : ""}`}
      data-s={`${fkey}.enabled`}
      onClick={() => update({ enabled: !enabled })}
    >
      <span className="us-toggle-knob" />
    </button>
  );
  const ultraPill = !block && def.tier === "ultra" && premium.plan === "ultra"
    ? <span className="pp-pill is-ultra">{t("premium.name.ultraShort")}</span>
    : null;
  const chips = !block
    ? (enabled ? summarize(fkey, settings, t) : [t("premiumStory.off")])
    : [];
  const numEl = num
    ? <span className="ps-num tnum">{num}</span>
    : <span className={`pp-ico c-${locked ? "gray" : catColor} ps-cico`} aria-hidden="true"><Ico n={catIcon} size={15} /></span>;

  if (isOpen) {
    return (
      <article ref={ref} className={`us-card ps-card is-open c-${catColor}`} data-feature={fkey}>
        <div className="ps-oh">
          <button type="button" className="ps-oh-hit" aria-expanded="true" aria-controls={bodyId} onClick={() => onOpen(null)}>
            {num ? <span className="ps-num is-lg tnum">{num}</span> : numEl}
            <span className="ps-tt">
              <span className="ps-tn"><b>{name}</b>{ultraPill}</span>
              <small>{desc}</small>
            </span>
          </button>
          {control}
          <button type="button" className="ps-x" aria-label={t("premiumStory.collapse")} title={t("premiumStory.collapse")} onClick={() => onOpen(null)}>
            <Ico n="up" size={16} />
          </button>
        </div>
        <div className="ps-body" id={bodyId}>
          <div className="ps-pvcol">
            <div className="ps-pvbox"><Preview fkey={fkey} settings={settings} enabled={enabled} size="lg" /></div>
            <div className="ps-cap">
              <span className="ps-live"><i aria-hidden="true" />{t("premiumStory.live")}</span>
              {chips.map((c, i) => <span key={i} className="ps-chip">{c}</span>)}
            </div>
          </div>
          <div className={`ps-groups${enabled ? "" : " is-off"}`}>
            {enabled && Panel ? (
              <Panel settings={settings} update={update} enabled={enabled} desktop={desktop} has={premium.has} />
            ) : (
              <div className="ps-g ps-offg">
                <p className="ps-hint is-warn"><Ico n="info" size={14} /><span>{t("premiumStory.offHint")}</span></p>
                <div className="ps-act">
                  <button type="button" className="us-btn primary sm ps-btn" onClick={() => update({ enabled: true })}>
                    <Ico n="check" size={14} />{t("premiumStory.turnOn")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  const textBody = (
    <>
      <span className="ps-thumb"><Preview fkey={fkey} settings={settings} enabled={!block && enabled} size="xs" /></span>
      <span className="ps-mid">
        <span className="ps-tn">{numEl}<b>{name}</b>{ultraPill}</span>
        <small>{desc}</small>
        {chips.length ? <span className="ps-chips">{chips.map((c, i) => <span key={i} className={`ps-chip${enabled ? "" : " is-off"}`}>{c}</span>)}</span> : null}
      </span>
    </>
  );
  return (
    <article
      ref={ref}
      className={`us-card ps-card${!block && !enabled ? " is-offc" : ""}${block ? " is-blocked" : ""}${locked ? " is-locked" : ""}`}
      data-feature={fkey}
    >
      {canOpen ? (
        <button type="button" className="ps-hit" aria-expanded="false" aria-label={`${name}. ${t("premiumStory.settings")}`} onClick={() => onOpen(fkey)}>
          {textBody}
          <span className="ps-more" aria-hidden="true"><Ico n="down" size={15} /></span>
        </button>
      ) : (
        <div className="ps-hit is-static">{textBody}</div>
      )}
      <div className="ps-ctl">{control}</div>
    </article>
  );
}

function Hero({ cat, counts, onPin, onChapter, numberOf, settingsMap }) {
  const { t } = useLocale();
  const chapters = PREMIUM_CHAPTERS[cat.id] || [];
  const Scene = HEROES[cat.id];
  return (
    <section className={`us-card ps-hero c-${cat.color}`} aria-labelledby="ps-hero-title">
      <div className="ps-ht">
        <div className="ps-hname">
          <span className={`pp-ico c-${cat.color}`} aria-hidden="true"><Ico n={cat.storyIcon} size={20} /></span>
          <div>
            <h2 id="ps-hero-title">{t(`premium.hub.cat.${cat.id}.name`)}</h2>
            <p>{t(`premium.hub.cat.${cat.id}.desc`)}</p>
          </div>
        </div>
        <ol className="ps-toc">
          {chapters.map((ch, i) => {
            const c = counts(ch.keys);
            return (
              <li key={ch.id}>
                <button type="button" onClick={() => onChapter(ch.id)}>
                  <span className="ps-tocn tnum" aria-hidden="true">{i + 1}</span>
                  <span className="ps-toct">{t(`premiumStory.ch.${cat.id}.${ch.id}.title`)}</span>
                  <small className="tnum">{c.usable ? t("premium.hub.onCount", { on: c.on, total: c.usable }) : t("premiumStory.locked")}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="ps-scene-wrap">
        {Scene ? <Scene t={t} s={settingsMap || {}} pin={(k, style) => <ScenePin key={k} fkey={k} num={numberOf(k)} style={style} onPin={onPin} />} /> : null}
      </div>
    </section>
  );
}

function ScenePin({ fkey, num, style, onPin }) {
  const { t } = useLocale();
  return (
    <button type="button" className="ps-pin tnum" style={style} onClick={() => onPin(fkey)} aria-label={`${num} ${t(`premium.f.${fkey}.name`)}`} title={t(`premium.f.${fkey}.name`)}>
      {num}
    </button>
  );
}

/** The category page body (below the back link and the desktop gate notice). */
export default function StoryCategory({ cat, premium, desktop, blocker, isOn, settingsMap, PANELS, storyIcon }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(null);
  const rootRef = useRef(null);
  const chapters = PREMIUM_CHAPTERS[cat.id] || [];
  const catWithIcon = { ...cat, storyIcon };

  const counts = useCallback((keys) => {
    const usable = keys.filter((k) => !blocker(k, premium, desktop));
    return { usable: usable.length, on: usable.filter((k) => isOn(k, settingsMap[k])).length };
  }, [blocker, premium, desktop, isOn, settingsMap]);

  const goChapter = (id) => {
    const el = rootRef.current?.querySelector(`[data-chapter="${id}"]`);
    el?.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
  };
  const onPin = (k) => {
    if (!blocker(k, premium, desktop)) setOpen(k);
    else rootRef.current?.querySelector(`[data-feature="${k}"]`)?.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
  };

  return (
    <div className="ps-root" ref={rootRef} data-story={cat.id}>
      <Hero cat={catWithIcon} counts={counts} onPin={onPin} onChapter={goChapter} numberOf={(k) => storyNumber(cat.id, k)} settingsMap={settingsMap} />
      {chapters.map((ch, ci) => (
        <section key={ch.id} className="ps-ch" data-chapter={ch.id} aria-labelledby={`ps-ch-${ch.id}`}>
          <header className="ps-cht">
            <span className="ps-chn">{t("premiumStory.chapter", { n: ci + 1 })}</span>
            <h3 id={`ps-ch-${ch.id}`}>{t(`premiumStory.ch.${cat.id}.${ch.id}.title`)}</h3>
            <p>{t(`premiumStory.ch.${cat.id}.${ch.id}.lead`)}</p>
          </header>
          <div className="ps-cards">
            {ch.keys.map((k) => (
              <FeatureCard
                key={k}
                fkey={k}
                num={storyNumber(cat.id, k)}
                catColor={cat.color}
                catIcon={storyIcon}
                premium={premium}
                desktop={desktop}
                block={blocker(k, premium, desktop)}
                open={open === k}
                onOpen={setOpen}
                Panel={PANELS[k]?.Panel}
                isOn={isOn}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Search / filter results in the card style (flat, category icon in place of the number). */
export function StoryResults({ keys, premium, desktop, blocker, isOn, PANELS, catOf, iconOf }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="ps-root ps-results">
      <div className="ps-cards">
        {keys.map((k) => (
          <FeatureCard
            key={k}
            fkey={k}
            catColor={catOf(k)?.color || "gray"}
            catIcon={iconOf(catOf(k)?.id)}
            premium={premium}
            desktop={desktop}
            block={blocker(k, premium, desktop)}
            open={open === k}
            onOpen={setOpen}
            Panel={PANELS[k]?.Panel}
            isOn={isOn}
          />
        ))}
      </div>
    </div>
  );
}
