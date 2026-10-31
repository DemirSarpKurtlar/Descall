/*
 * Settings › Görünüm (Descall 3.0.0, mockups 34 / 35 / 36).
 * Only options that really work: theme (dark / light / auto + shop themes),
 * accent (also the Liquid Glass --g-brand), a 4-step text size, reduce
 * transparency and reduce motion. Everything is saved to the account
 * (lib/appearanceSync.js) and cached in localStorage.
 */
import { useEffect, useState } from "react";
import ayseUrl from "../../assets/preview-ayse.webp";
import { useLocale } from "../../context/LocaleContext";
import { ACCENTS, APPEARANCE_EVENT, FONT_STEPS, readAppearance, resolveBaseTheme } from "../../lib/appearancePrefs";
import { updateAppearance } from "../../lib/appearanceSync";
import { S3Foot, S3Glyph, S3Group, S3Row, S3Sec } from "./SettingsV3";

export function useAppearancePrefs() {
  const [prefs, setPrefs] = useState(() => readAppearance());
  useEffect(() => {
    const sync = () => setPrefs(readAppearance());
    window.addEventListener(APPEARANCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return prefs;
}

function PreviewAvatar({ size }) {
  return <span className="s3-av" style={{ width: size, height: size, backgroundImage: `url(${ayseUrl})` }} aria-hidden="true" />;
}

/** The live preview: real bubble shapes, the chosen accent and text size. */
export function AppearancePreview({ prefs, premium }) {
  const { t } = useLocale();
  const scale = FONT_STEPS[prefs.fontStep]?.scale || 1;
  const light = !premium && resolveBaseTheme(prefs.themeMode) === "light";
  const style = {
    "--ac": premium ? "var(--g-brand, var(--primary))" : prefs.accentColor,
    "--fs": `${(15.5 * scale).toFixed(2)}px`,
  };
  return (
    <div className={`s3-prev${light ? " is-light" : ""}`} style={style} aria-label={t("shell.appearance.livePreviewLabel")} role="img">
      <div className="hd">
        <PreviewAvatar size={30} />
        <div>
          Ayşe<small>{t("shell.appearance.previewOnline")}</small>
        </div>
        <span className="live">{t("shell.appearance.livePreviewBadge")}</span>
      </div>
      <div className="s3-pm">
        <PreviewAvatar size={24} />
        <div className="s3-pb">
          {t("shell.appearance.previewMsg1")}
          <span className="tm">20:41</span>
        </div>
      </div>
      <div className="s3-pm me">
        <div className="s3-pb">
          {t("shell.appearance.previewMsg2")}
          <span className="tm">20:42</span>
          <span className="s3-pr">❤️</span>
        </div>
      </div>
      <div className="s3-pm" style={{ marginTop: 14 }}>
        <PreviewAvatar size={24} />
        <div className="s3-pb">
          {t("shell.appearance.previewMsg3")}
          <span className="tm">20:42</span>
        </div>
      </div>
      <div className="s3-pin">
        {t("shell.appearance.previewComposer")}
        <i>
          <S3Glyph name="send" size={13} stroke={2.4} />
        </i>
      </div>
    </div>
  );
}

function ThemeCards({ prefs, premium, onPick }) {
  const { t } = useLocale();
  const ac = premium ? "var(--g-brand, var(--primary))" : prefs.accentColor;
  const cards = [
    { id: "dark", label: t("shell.appearance.themeDark"), bg: "#151722", bars: ["rgba(255,255,255,.12)", ac, "rgba(255,255,255,.12)"] },
    { id: "light", label: t("shell.appearance.themeLight"), bg: "#EEF0F6", bars: ["#fff", ac, "#fff"] },
    { id: "auto", label: t("shell.appearance.themeAuto"), bg: "linear-gradient(135deg,#151722 50%,#EEF0F6 50%)", bars: [null, ac, null] },
  ];
  return (
    <div className="s3-group s3-th" style={{ "--ac": ac }} role="radiogroup" aria-label={t("shell.appearance.theme")}>
      {cards.map((c) => {
        const on = !premium && prefs.themeMode === c.id;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => onPick(c.id)}>
            <div className="pv" style={{ background: c.bg }}>
              {c.bars[0] ? <b style={{ top: 14, background: c.bars[0] }} /> : null}
              <b style={{ top: 34, left: 30, right: 10, background: c.bars[1] }} />
              {c.bars[2] ? <b style={{ top: 54, background: c.bars[2] }} /> : null}
            </div>
            <div className="rd">{on ? <S3Glyph name="check" size={12} stroke={3} /> : null}</div>
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({ prefs, premium }) {
  const { t } = useLocale();
  return (
    <div className="s3-group">
      <div className="s3-sw" role="radiogroup" aria-label={t("shell.appearance.accent")}>
        {ACCENTS.map((a) => {
          const on = !premium && prefs.accentColor.toUpperCase() === a.hex.toUpperCase();
          return (
            <button
              key={a.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t(`shell.appearance.accents.${a.id}`)}
              title={t(`shell.appearance.accents.${a.id}`)}
              className={on ? "on" : ""}
              style={{ background: a.hex }}
              onClick={() => updateAppearance({ accentColor: a.hex })}
            />
          );
        })}
      </div>
    </div>
  );
}

function FontSize({ prefs }) {
  const { t } = useLocale();
  const labels = FONT_STEPS.map((s) => t(`shell.appearance.fontSteps.${s.id}`));
  const i = prefs.fontStep;
  const pct = `${[0, 33.3, 66.6, 100][i]}%`;
  return (
    <div className="s3-group">
      <div className="s3-fs">
        <span style={{ fontSize: 13, fontWeight: 600 }} aria-hidden="true">A</span>
        <input
          type="range"
          className="s3-range"
          min={0}
          max={3}
          step={1}
          value={i}
          style={{ "--v": pct }}
          aria-label={t("shell.appearance.textSize")}
          aria-valuetext={labels[i]}
          onChange={(e) => updateAppearance({ fontStep: Number(e.target.value) })}
        />
        <span style={{ fontSize: 21, fontWeight: 600 }} aria-hidden="true">A</span>
      </div>
      <div className="s3-ticks">
        {labels.map((l, j) => (
          <button key={l} type="button" className={j === i ? "on" : ""} onClick={() => updateAppearance({ fontStep: j })}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * layout: "desktop" | "ipad" | "iphone".
 * ownedThemes: shop themes the user owns; equippedThemeKey: the one in use.
 */
export default function AppearancePane({
  layout = "desktop",
  ownedThemes = [],
  equippedThemeKey = null,
  onPickBaseTheme,
  onPickPremiumTheme,
  onOpenShop,
}) {
  const { t } = useLocale();
  const prefs = useAppearancePrefs();
  const [storeOpen, setStoreOpen] = useState(false);
  const premium = Boolean(equippedThemeKey);
  const desk = layout === "desktop";
  const phone = layout === "iphone";

  const pickMode = (mode) => {
    updateAppearance({ themeMode: mode });
    onPickBaseTheme?.(mode);
  };

  const equipped = ownedThemes.find((x) => x.theme_key === equippedThemeKey);
  const storeValue = equipped
    ? equipped.name
    : ownedThemes.length
      ? t("shell.appearance.themesOwned", { count: ownedThemes.length })
      : t("shell.appearance.browseShop");

  const left = (
    <>
      <S3Sec first>{t("shell.appearance.theme")}</S3Sec>
      <ThemeCards prefs={prefs} premium={premium} onPick={pickMode} />
      <S3Group className="s3-store">
        <S3Row
          icon="palette"
          color="purple"
          title={t("shell.appearance.shopThemes")}
          value={storeValue}
          chevron
          className={storeOpen ? "is-open" : ""}
          onClick={() => (ownedThemes.length ? setStoreOpen((v) => !v) : onOpenShop?.())}
        />
        {storeOpen && ownedThemes.length
          ? [
              ...ownedThemes.map((item) => (
                <S3Row
                  key={item.id}
                  lead={<span className={`s3-theme-dot us-theme-swatch theme-${item.theme_key}`} aria-hidden="true" />}
                  title={item.name}
                  check={item.theme_key === equippedThemeKey}
                  onClick={() => onPickPremiumTheme?.(item)}
                />
              )),
              <S3Row key="shop" icon="bag" color="purple" title={t("shell.appearance.openShop")} chevron onClick={() => onOpenShop?.()} />,
            ]
          : null}
      </S3Group>

      <S3Sec>{t("shell.appearance.accent")}</S3Sec>
      <Swatches prefs={prefs} premium={premium} />
      <S3Foot>
        {premium ? t("shell.appearance.accentFootPremium") : t("shell.appearance.accentFoot")}
      </S3Foot>

      <S3Sec>{t("shell.appearance.textSize")}</S3Sec>
      <FontSize prefs={prefs} />
      <S3Foot>
        {!desk ? t("shell.appearance.textSizeFootMobile") : t("shell.appearance.textSizeFootDesktop")}
      </S3Foot>

      <S3Sec>{desk ? t("shell.appearance.a11yPerf") : t("shell.appearance.a11y")}</S3Sec>
      <S3Group>
        <S3Row
          icon="eye"
          color="gray"
          title={t("shell.appearance.reduceTransparency")}
          sub={desk ? t("shell.appearance.reduceTransparencySubDesktop") : t("shell.appearance.reduceTransparencySubMobile")}
          toggle={prefs.reduceTransparency}
          onToggle={(on) => updateAppearance({ reduceTransparency: on })}
        />
        <S3Row
          icon="sparkle"
          color="gray"
          title={t("shell.appearance.reduceMotion")}
          sub={t("shell.appearance.reduceMotionSub")}
          toggle={prefs.reduceMotion}
          onToggle={(on) => updateAppearance({ reduceMotion: on })}
        />
      </S3Group>
      <S3Foot>
        {t("shell.appearance.savedFoot")}
      </S3Foot>
    </>
  );

  const gone = (
    <>
      <div className="s3-cap">{t("shell.appearance.removed")}</div>
      <div className="s3-gone">
        <span>{t("shell.appearance.removedDensity")}</span>
        <span>{t("shell.appearance.removedBubble")}</span>
        <span>{t("shell.appearance.removedStatus")}</span>
      </div>
    </>
  );

  if (phone) {
    return (
      <div className="s3 s3-appearance is-phone">
        <div style={{ margin: "2px 0 4px" }}>
          <AppearancePreview prefs={prefs} premium={premium} />
        </div>
        {left}
        {gone}
      </div>
    );
  }

  return (
    <div className="s3 s3-appearance s3-two">
      <div>
        {left}
        {gone}
      </div>
      <div className="s3-sticky">
        <S3Sec first>{t("shell.appearance.preview")}</S3Sec>
        <AppearancePreview prefs={prefs} premium={premium} />
        <div className="s3-cap">
          {t("shell.appearance.previewCap")}
        </div>
      </div>
    </div>
  );
}
