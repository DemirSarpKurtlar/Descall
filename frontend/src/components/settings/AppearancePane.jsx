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

const FONT_LABELS_TR = ["Küçük", "Varsayılan", "Büyük", "Çok büyük"];
const FONT_LABELS_EN = ["Small", "Default", "Large", "Extra large"];

function PreviewAvatar({ size }) {
  return <span className="s3-av" style={{ width: size, height: size, backgroundImage: `url(${ayseUrl})` }} aria-hidden="true" />;
}

/** The live preview: real bubble shapes, the chosen accent and text size. */
export function AppearancePreview({ prefs, premium, tr }) {
  const scale = FONT_STEPS[prefs.fontStep]?.scale || 1;
  const light = !premium && resolveBaseTheme(prefs.themeMode) === "light";
  const style = {
    "--ac": premium ? "var(--g-brand, var(--primary))" : prefs.accentColor,
    "--fs": `${(15.5 * scale).toFixed(2)}px`,
  };
  return (
    <div className={`s3-prev${light ? " is-light" : ""}`} style={style} aria-label={tr ? "Canlı önizleme" : "Live preview"} role="img">
      <div className="hd">
        <PreviewAvatar size={30} />
        <div>
          Ayşe<small>{tr ? "Çevrimiçi" : "Online"}</small>
        </div>
        <span className="live">{tr ? "CANLI ÖNİZLEME" : "LIVE PREVIEW"}</span>
      </div>
      <div className="s3-pm">
        <PreviewAvatar size={24} />
        <div className="s3-pb">
          {tr ? "Akşam oyuna var mısın? 🎮" : "Up for a game tonight? 🎮"}
          <span className="tm">20:41</span>
        </div>
      </div>
      <div className="s3-pm me">
        <div className="s3-pb">
          {tr ? "Varım! 21:00'de sesliye gelirim" : "I'm in! Joining voice at 21:00"}
          <span className="tm">20:42</span>
          <span className="s3-pr">❤️</span>
        </div>
      </div>
      <div className="s3-pm" style={{ marginTop: 14 }}>
        <PreviewAvatar size={24} />
        <div className="s3-pb">
          {tr ? "Süper, Mert'e de haber ver 👍" : "Great, let Mert know too 👍"}
          <span className="tm">20:42</span>
        </div>
      </div>
      <div className="s3-pin">
        {tr ? "Mesaj" : "Message"}
        <i>
          <S3Glyph name="send" size={13} stroke={2.4} />
        </i>
      </div>
    </div>
  );
}

function ThemeCards({ prefs, premium, onPick, tr }) {
  const ac = premium ? "var(--g-brand, var(--primary))" : prefs.accentColor;
  const cards = [
    { id: "dark", label: tr ? "Koyu" : "Dark", bg: "#151722", bars: ["rgba(255,255,255,.12)", ac, "rgba(255,255,255,.12)"] },
    { id: "light", label: tr ? "Açık" : "Light", bg: "#EEF0F6", bars: ["#fff", ac, "#fff"] },
    { id: "auto", label: tr ? "Otomatik" : "Automatic", bg: "linear-gradient(135deg,#151722 50%,#EEF0F6 50%)", bars: [null, ac, null] },
  ];
  return (
    <div className="s3-group s3-th" style={{ "--ac": ac }} role="radiogroup" aria-label={tr ? "Tema" : "Theme"}>
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

function Swatches({ prefs, premium, tr }) {
  return (
    <div className="s3-group">
      <div className="s3-sw" role="radiogroup" aria-label={tr ? "Vurgu rengi" : "Accent color"}>
        {ACCENTS.map((a) => {
          const on = !premium && prefs.accentColor.toUpperCase() === a.hex.toUpperCase();
          return (
            <button
              key={a.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={a.label}
              title={a.label}
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

function FontSize({ prefs, tr }) {
  const labels = tr ? FONT_LABELS_TR : FONT_LABELS_EN;
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
          aria-label={tr ? "Yazı boyutu" : "Text size"}
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
  const { locale } = useLocale();
  const tr = locale !== "en";
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
      ? tr
        ? `${ownedThemes.length} tema sende`
        : `${ownedThemes.length} ${ownedThemes.length === 1 ? "theme" : "themes"} owned`
      : tr
        ? "Mağazada keşfet"
        : "Browse the shop";

  const left = (
    <>
      <S3Sec first>{tr ? "Tema" : "Theme"}</S3Sec>
      <ThemeCards prefs={prefs} premium={premium} onPick={pickMode} tr={tr} />
      <S3Group className="s3-store">
        <S3Row
          icon="palette"
          color="purple"
          title={tr ? "Mağaza temaları" : "Shop themes"}
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
              <S3Row key="shop" icon="bag" color="purple" title={tr ? "Mağazaya git" : "Open the shop"} chevron onClick={() => onOpenShop?.()} />,
            ]
          : null}
      </S3Group>

      <S3Sec>{tr ? "Vurgu rengi" : "Accent color"}</S3Sec>
      <Swatches prefs={prefs} premium={premium} tr={tr} />
      <S3Foot>
        {premium
          ? tr
            ? "Mağaza teması kullanırken vurgu rengini tema belirler."
            : "While a shop theme is on, the theme sets the accent."
          : tr
            ? "Butonlar, seçili sekmeler ve kendi mesaj balonların bu rengi alır."
            : "Buttons, selected tabs and your own message bubbles use this color."}
      </S3Foot>

      <S3Sec>{tr ? "Yazı boyutu" : "Text size"}</S3Sec>
      <FontSize prefs={prefs} tr={tr} />
      <S3Foot>
        {!desk
          ? tr
            ? "Sohbet, listeler ve menülerde geçerli. iPhone'un Dinamik Yazı ayarını da izler."
            : "Applies to chat, lists and menus. Also follows iPhone Dynamic Type."
          : tr
            ? "Sohbet, kanal listesi ve menülerde geçerli. Ctrl + / Ctrl − ile de değişir."
            : "Applies to chat, the channel list and menus. Ctrl + / Ctrl − also change it."}
      </S3Foot>

      <S3Sec>{desk ? (tr ? "Erişilebilirlik ve performans" : "Accessibility and performance") : tr ? "Erişilebilirlik" : "Accessibility"}</S3Sec>
      <S3Group>
        <S3Row
          icon="eye"
          color="gray"
          title={tr ? "Şeffaflığı azalt" : "Reduce transparency"}
          sub={
            desk
              ? tr
                ? "Cam yerine düz yüzey; eski bilgisayarlarda daha akıcı"
                : "Solid surfaces instead of glass; smoother on older computers"
              : tr
                ? "Cam yerine düz, koyu yüzey"
                : "Solid, dark surfaces instead of glass"
          }
          toggle={prefs.reduceTransparency}
          onToggle={(on) => updateAppearance({ reduceTransparency: on })}
        />
        <S3Row
          icon="sparkle"
          color="gray"
          title={tr ? "Hareketi azalt" : "Reduce motion"}
          sub={tr ? "Geçiş ve yay animasyonlarını sadeleştirir" : "Simplifies transitions and spring animations"}
          toggle={prefs.reduceMotion}
          onToggle={(on) => updateAppearance({ reduceMotion: on })}
        />
      </S3Group>
      <S3Foot>
        {tr
          ? "Görünüm hesabına kaydedilir ve tüm cihazlarında aynı olur. Durumunu artık profil menüsünden değiştirirsin."
          : "Appearance is saved to your account and is the same on all your devices. You now change your status from the profile menu."}
      </S3Foot>
    </>
  );

  const gone = (
    <>
      <div className="s3-cap">{tr ? "Kaldırılanlar:" : "Removed:"}</div>
      <div className="s3-gone">
        <span>{tr ? "Yoğunluk" : "Density"}</span>
        <span>{tr ? "Mesaj balonu stili" : "Message bubble style"}</span>
        <span>{tr ? "Durum (profil menüsüne taşındı)" : "Status (moved to the profile menu)"}</span>
      </div>
    </>
  );

  if (phone) {
    return (
      <div className="s3 s3-appearance is-phone">
        <div style={{ margin: "2px 0 4px" }}>
          <AppearancePreview prefs={prefs} premium={premium} tr={tr} />
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
        <S3Sec first>{tr ? "Önizleme" : "Preview"}</S3Sec>
        <AppearancePreview prefs={prefs} premium={premium} tr={tr} />
        <div className="s3-cap">
          {tr ? "Değişiklikler anında burada ve uygulamanın tamamında görünür." : "Changes show up here and across the app right away."}
        </div>
      </div>
    </div>
  );
}
