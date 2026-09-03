/**
 * Shop-sold profile badges / title flair → lucide-react SVG icons.
 * Maps legacy emoji badge_icon values AND sku/slug keys so catalog rows
 * already in the DB keep rendering without a migration.
 */
import {
  Anchor,
  Atom,
  Award,
  Badge,
  Bird,
  Blocks,
  Bot,
  Box,
  Bug,
  Building2,
  Camera,
  Candy,
  Cat,
  CircleDashed,
  Clapperboard,
  CloudLightning,
  CloudRain,
  Clover,
  Code2,
  Coffee,
  Coins,
  Cpu,
  Crosshair,
  Crown,
  Diamond,
  Dices,
  Dog,
  Droplets,
  Earth,
  Edit3,
  Eye,
  Fan,
  Fish,
  Flame,
  Flower2,
  Footprints,
  Gamepad2,
  Gem,
  Ghost,
  Glasses,
  Globe,
  Handshake,
  Headphones,
  Heart,
  Hexagon,
  Image,
  Joystick,
  Key,
  Landmark,
  Leaf,
  Lock,
  Map,
  Medal,
  Mic,
  Mic2,
  Monitor,
  Moon,
  Mountain,
  Music,
  Orbit,
  Palette,
  PawPrint,
  PenLine,
  Pickaxe,
  Puzzle,
  Rabbit,
  Radio,
  Rainbow,
  Rocket,
  Satellite,
  Shield,
  Ship,
  Skull,
  Smartphone,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  Telescope,
  Trophy,
  User,
  Users,
  Volume2,
  Wand2,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

/** Lucide component by stable key (sku slug or admin-entered key). */
export const SHOP_ICON_BY_KEY = {
  crown: Crown,
  diamond: Diamond,
  gem: Gem,
  star: Star,
  flame: Flame,
  fire: Flame,
  skull: Skull,
  rocket: Rocket,
  trophy: Trophy,
  ghost: Ghost,
  butterfly: Flower2,
  comet: Orbit,
  phoenix: Flame,
  nebula: Sparkles,
  dragon: Flame,
  wolf: PawPrint,
  fox: PawPrint,
  owl: Bird,
  lion: PawPrint,
  eagle: Bird,
  shark: Fish,
  cobra: Bug,
  unicorn: Sparkles,
  robot: Bot,
  alien: Bug,
  wizard: Wand2,
  ninja: User,
  samurai: Swords,
  pirate: Anchor,
  astronaut: Rocket,
  crystal: Gem,
  bolt: Zap,
  heart: Heart,
  moon: Moon,
  sun: Sun,
  clover: Clover,
  music: Music,
  gamepad: Gamepad2,
  target: Target,
  medal: Medal,
  sparkles: Sparkles,
  fireworks: Sparkles,
  tornado: Wind,
  volcano: Mountain,
  rainbow: Rainbow,
  snowflake: Snowflake,
  wave: Waves,
  leaf: Leaf,
  coffee: Coffee,
  camera: Camera,
  mic: Mic,
  headphones: Headphones,
  joystick: Joystick,
  key: Key,
  lock: Lock,
  shield: Shield,
  // theme-expansion / misc
  "guardian-shield": Shield,
  guardian: Shield,
  speedrunner: Crosshair,
  "star-collector": Star,
  elite: Flame,
  legend: Zap,
  royalty: Crown,
  "night-owl": Moon,
  "diamond-hands": Diamond,
  "rocket-rider": Rocket,
  sharpshooter: Target,
  "lone-wolf": PawPrint,
  "social-butterfly": Flower2,
  "comet-chaser": Orbit,
  "apex-predator": Droplets,
  "night-architect": Building2,
  "signal-hunter": Radio,
  voidwalker: CircleDashed,
  stormcaller: CloudLightning,
  codebreaker: Puzzle,
  highroller: Dices,
  "pulse-pilot": Satellite,
  emberlord: Flame,
  frostbane: Snowflake,
  shadowdancer: Glasses,
  goldenspire: Landmark,
  "neon-ronin": Swords,
  "pixel-monarch": Bug,
  "orbit-king": Orbit,
  "deep-diver": Waves,
  skyline: Building2,
  ironwill: Blocks,
  silvertongue: Mic2,
  quietstorm: CloudRain,
  rapidfire: Zap,
  coldblood: Snowflake,
  daybreaker: Sun,
  nightshift: Moon,
  overclocked: Monitor,
  lowlatency: Radio,
  fullsend: Rocket,
  clutchgod: Target,
  maincharacter: Clapperboard,
  sidequest: Map,
  lorekeeper: PenLine,
  raidleader: Shield,
  soloqueue: User,
  partyup: Handshake,
  voicechamp: Mic,
  screensage: Monitor,
  giflord: Image,
  memearchitect: Candy,
  descoinmogul: Coins,
  firstblood: Droplets,
  laststand: Shield,
  echochamber: Volume2,
  quiettype: User,
  hotmic: Mic,
  certified: Award,
};

/** Legacy emoji strings stored in shop_items.badge_icon → Lucide. */
export const SHOP_ICON_BY_EMOJI = {
  "👑": Crown,
  "💎": Diamond,
  "💠": Gem,
  "⭐": Star,
  "🌟": Star,
  "🔥": Flame,
  "💀": Skull,
  "🚀": Rocket,
  "🏆": Trophy,
  "👻": Ghost,
  "🦋": Flower2,
  "☄️": Orbit,
  "🔥🕊️": Flame,
  "🧙": Wand2,
  "🛡️": Shield,
  "🦁": PawPrint,
  "🦅": Bird,
  "🦈": Fish,
  "🐍": Bug,
  "🦄": Sparkles,
  "🤖": Bot,
  "👽": Bug,
  "🥷": User,
  "⚔️": Swords,
  "🏴‍☠️": Anchor,
  "🧑‍🚀": Rocket,
  "🔮": Gem,
  "⚡": Zap,
  "❤️": Heart,
  "🌙": Moon,
  "☀️": Sun,
  "🍀": Clover,
  "🎵": Music,
  "🎮": Gamepad2,
  "🎯": Target,
  "🏅": Medal,
  "✨": Sparkles,
  "🎆": Sparkles,
  "🌪️": Wind,
  "🌋": Mountain,
  "🌈": Rainbow,
  "❄️": Snowflake,
  "🌊": Waves,
  "🍃": Leaf,
  "☕": Coffee,
  "📷": Camera,
  "🎙️": Mic,
  "🎧": Headphones,
  "🕹️": Joystick,
  "🔑": Key,
  "🔐": Lock,
  "🌌": Sparkles,
  "🐉": Flame,
  "🐺": PawPrint,
  "🦊": PawPrint,
  "🦉": Bird,
  "🤫": User,
  "✅": Award,
};

/** Leading emoji on profile titles → Lucide (text keeps the label). */
export const TITLE_ICON_BY_EMOJI = {
  ...SHOP_ICON_BY_EMOJI,
  "⏱️": Crosshair,
  "🩸": Droplets,
  "🏙️": Building2,
  "📡": Radio,
  "🕳️": CircleDashed,
  "⛈️": CloudLightning,
  "🧩": Puzzle,
  "🎲": Dices,
  "🛰️": Satellite,
  "🧊": Snowflake,
  "🕶️": Glasses,
  "🏛️": Landmark,
  "🗡️": Swords,
  "👾": Bug,
  "🪐": Orbit,
  "🤿": Waves,
  "🌆": Building2,
  "🧱": Blocks,
  "🗣️": Mic2,
  "🌫️": CloudRain,
  "🌅": Sun,
  "🌃": Moon,
  "🖥️": Monitor,
  "📶": Radio,
  "🎬": Clapperboard,
  "🗺️": Map,
  "📚": PenLine,
  "🧍": User,
  "🤝": Handshake,
  "🎤": Mic,
  "🖼️": Image,
  "😂": Candy,
  "🪙": Coins,
  "🔊": Volume2,
};

function normalizeKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^lucide:/, "")
    .replace(/^badge-/, "")
    .replace(/\s+/g, "-");
}

/**
 * Resolve a Lucide component for a shop badge.
 * Prefers sku slug, then badge_icon key, then legacy emoji.
 */
export function resolveShopBadgeIcon(itemOrIcon, sku) {
  const item = itemOrIcon && typeof itemOrIcon === "object" ? itemOrIcon : null;
  const iconRaw = item ? item.badge_icon : itemOrIcon;
  const skuRaw = item?.sku || sku;

  if (skuRaw) {
    const slug = normalizeKey(skuRaw);
    if (SHOP_ICON_BY_KEY[slug]) return SHOP_ICON_BY_KEY[slug];
    // badge-crown → crown
    const withoutBadge = slug.replace(/^badge-/, "");
    if (SHOP_ICON_BY_KEY[withoutBadge]) return SHOP_ICON_BY_KEY[withoutBadge];
  }

  if (iconRaw != null && iconRaw !== "") {
    const asKey = normalizeKey(iconRaw);
    if (SHOP_ICON_BY_KEY[asKey]) return SHOP_ICON_BY_KEY[asKey];
    if (SHOP_ICON_BY_EMOJI[iconRaw]) return SHOP_ICON_BY_EMOJI[iconRaw];
    // Multi-codepoint / variation-selector variants
    const stripped = String(iconRaw).replace(/\uFE0F/g, "");
    if (SHOP_ICON_BY_EMOJI[stripped]) return SHOP_ICON_BY_EMOJI[stripped];
  }

  return Award;
}

/** Strip a leading pictograph from title_text; return { Icon, label }. */
export function resolveShopTitle(itemOrText, sku) {
  const item = itemOrText && typeof itemOrText === "object" ? itemOrText : null;
  const text = String(item ? item.title_text : itemOrText || "").trim();
  const skuRaw = item?.sku || sku;

  let Icon = null;
  if (skuRaw) {
    const slug = normalizeKey(skuRaw).replace(/^title-/, "");
    if (SHOP_ICON_BY_KEY[slug]) Icon = SHOP_ICON_BY_KEY[slug];
  }

  if (!text) return { Icon: Icon || Badge, label: "" };

  const chars = Array.from(text);
  // Greedy match longest known emoji prefix
  let matched = null;
  const keys = Object.keys(TITLE_ICON_BY_EMOJI).sort((a, b) => b.length - a.length);
  for (const em of keys) {
    if (text.startsWith(em)) {
      matched = em;
      break;
    }
  }
  if (!matched && chars.length) {
    const first = chars[0];
    if (TITLE_ICON_BY_EMOJI[first] || SHOP_ICON_BY_EMOJI[first]) matched = first;
    else if (/\p{Extended_Pictographic}/u.test(first)) matched = first;
  }

  let label = text;
  if (matched) {
    if (!Icon) Icon = TITLE_ICON_BY_EMOJI[matched] || SHOP_ICON_BY_EMOJI[matched] || Sparkles;
    label = text.slice(matched.length).replace(/^\s+/, "");
  }

  return { Icon: Icon || Badge, label: label || text };
}

/** Inline badge next to a display name / shop card. */
export function ShopBadgeIcon({ item, icon, sku, size = 15, className = "cosmetic-badge-icon", title }) {
  const Icon = resolveShopBadgeIcon(item || icon, sku || item?.sku);
  if (!Icon) return null;
  return (
    <span className={className} title={title || item?.name || undefined} aria-hidden={false}>
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}

/** Title flair pill with Lucide leading icon (no emoji). */
export function ShopTitleTag({ item, text, sku, size = 12, className = "cosmetic-title-tag" }) {
  const { Icon, label } = resolveShopTitle(item || text, sku || item?.sku);
  if (!label && !Icon) return null;
  return (
    <span className={className}>
      {Icon ? <Icon size={size} strokeWidth={2} style={{ marginRight: 4, flexShrink: 0 }} /> : null}
      {label}
    </span>
  );
}

/** Activity / process type → Lucide (replaces emoji chrome icons). */
export const ACTIVITY_TYPE_ICON = {
  game: Gamepad2,
  music: Music,
  dev: Code2,
  creative: Palette,
  browser: Globe,
  communication: Users,
  media: Clapperboard,
  launcher: Box,
  productivity: PenLine,
  manual: Edit3,
  app: Smartphone,
};

export function ActivityTypeIcon({ type, size = 16, className }) {
  const Icon = type ? (ACTIVITY_TYPE_ICON[type] || Smartphone) : Moon;
  return <Icon size={size} className={className} strokeWidth={2} />;
}
