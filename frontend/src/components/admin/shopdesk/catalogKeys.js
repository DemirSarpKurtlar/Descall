// Effect / theme keys an admin can pick when creating a shop item (moved from the old
// AdminShop.jsx editor so the Mağaza masası drawer offers the same choices).
import { PROFILE_COLORS } from "../../../lib/profileColors";

export const EFFECT_KEY_OPTIONS = {
  name_effect: [
    "fire", "rainbow", "neon", "gold-shimmer", "ice", "void",
    "plasma", "ember", "glitch", "mintglow", "sunset", "ocean", "chrome", "toxic", "royal", "candy",
    "magma", "arctic", "holo", "embercore", "noir", "laser", "matrix", "sand",
  ],
  avatar_effect: [
    "pulse", "orbit", "spark", "aurora", "flame", "frost",
    "halo", "ripple", "comet", "static", "petal", "hex", "solar", "toxic", "prism", "ember",
    "frostbite", "neon", "void", "bubble", "scan", "royal", "holoring", "pulse2",
  ],
  chat_bubble: [
    "glass", "neon-outline", "sunset", "carbon", "holo", "royal-purple",
    "midnight", "ember", "mint", "violet", "gold", "ice", "toxic", "rose", "cyber", "sand",
    "ocean", "lava", "pearl", "matrix", "arcade", "noir", "prism", "teal",
  ],
  presence_flare: [
    "pulse-cyan", "pulse-gold", "pulse-rose", "ring-neon", "ring-emerald", "ring-violet",
    "spark-white", "spark-fire", "orbit-blue", "orbit-pink", "halo-soft", "halo-royal",
    "glitch-green", "glitch-void", "wave-teal", "wave-amber", "core-crimson", "core-ice",
    "beam-magenta", "beam-lime", "nova-white", "nova-gold", "pixel-cyan", "pixel-hot",
    "aurora-soft", "aurora-vivid", "steel-pulse", "toxic-ring", "moon-glow", "sun-flare",
  ],
  profile_aura: [
    "void-soft", "void-hard", "solar-bloom", "frost-veil", "ember-haze", "neon-frame",
    "mint-mist", "royal-curtain", "cyber-grid", "rose-bloom", "gold-dust", "ocean-depth",
    "plasma-field", "shadow-rim", "prism-glass", "toxic-fog", "starlight", "copper-glow",
    "ice-crystal", "lava-rim", "pearl-soft", "matrix-veil", "arcade-pop", "noir-edge",
    "aurora-wall", "sandstorm", "holo-sheet", "crimson-veil", "jade-glow", "ion-haze",
  ],
  sound_pack: [
    "soft-chime", "crystal-ping", "cyber-blip", "deep-thud", "glass-lift", "neon-zap",
    "lofi-tap", "arcade-coin", "void-whisper", "ocean-drop", "ember-crackle", "frost-ting",
    "royal-bell", "matrix-tick", "pixel-beep", "pulse-kick", "silk-swipe", "thunder-tap",
    "star-chime", "copper-clang", "holo-ping", "mint-pop", "laser-chirp", "quiet-knock",
  ],
  typing_flare: [
    "neon-pulse", "liquid-mercury", "aurora-wave", "ember-cascade", "crystal-chime", "void-signal",
    "golden-morse", "cyber-hex", "sakura-drift", "plasma-arc", "frost-breathe", "royal-ink",
    "quantum-blink", "mosaic-tap", "starfall", "holo-ribbon",
  ],
  reaction_burst: [
    "nova-pop", "glass-shatter", "confetti-storm", "ripple-ink", "ember-bloom", "frost-crack",
    "neon-stamp", "void-implode", "prism-split", "gold-rain", "pixel-burst", "petal-burst",
    "thunderclap", "soft-bloom", "holo-flash", "magnetic-pulse",
  ],
  call_overlay: [
    "midnight-ops", "neon-stadium", "glass-atrium", "ember-theater", "arctic-bridge", "void-chamber",
    "royal-lounge", "cyber-deck", "golden-hall", "aurora-dome", "carbon-cockpit", "sakura-suite",
    "plasma-arena", "ocean-bridge", "mosaic-stage", "titan-forge",
  ],
  profile_color: Object.keys(PROFILE_COLORS),
};

export const THEME_KEY_GROUPS = [
  {
    label: "shopDesk.themeGroup.classic",
    options: [
      ["midnight", "Midnight"],
      ["crimson", "Crimson"],
      ["ocean", "Ocean"],
      ["emerald", "Emerald"],
      ["sakura", "Sakura"],
      ["solar", "Solar"],
    ],
  },
  {
    label: "shopDesk.themeGroup.gradient",
    options: [
      ["aurora", "Aurora"],
      ["sunset", "Sunset Boulevard"],
      ["cottoncandy", "Cotton Candy"],
      ["peach", "Peach Fizz"],
      ["lavender", "Lavender Dream"],
      ["mint", "Mint Breeze"],
      ["rosegold", "Rose Gold"],
      ["deepspace", "Deep Space"],
      ["goldenhour", "Golden Hour"],
      ["desertbloom", "Desert Bloom"],
    ],
  },
  {
    label: "shopDesk.themeGroup.neon",
    options: [
      ["neontokyo", "Neon Tokyo"],
      ["cyberpunk", "Cyberpunk"],
      ["vaporwave", "Vaporwave"],
      ["neonjungle", "Neon Jungle"],
      ["electricviolet", "Electric Violet"],
      ["toxicgreen", "Toxic Green"],
      ["neonblaze", "Neon Blaze"],
      ["hyperdrive", "Hyperdrive"],
    ],
  },
  {
    label: "shopDesk.themeGroup.glowing",
    options: [
      ["phoenixfire", "Phoenix Fire"],
      ["frostbite", "Frostbite"],
      ["voidwalker", "Voidwalker"],
      ["starlight", "Starlight"],
      ["plasmastorm", "Plasma Storm"],
      ["moltencore", "Molten Core"],
    ],
  },
];
