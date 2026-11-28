// Market 2.0 icons: the app icon set (components/ui/Icon.jsx, Phosphor Regular) plus the
// few Phosphor glyphs the market needs that Icon.jsx does not export yet, wrapped the same way.
import { createElement, forwardRef } from "react";
import {
  CoatHanger as PCoatHanger,
  Hourglass as PHourglass,
  HandPalm as PHandPalm,
  ShoppingCart as PShoppingCart,
  SquareSplitHorizontal as PSplit,
  TShirt as PTShirt,
  Tag as PTag,
  Shuffle as PShuffle,
  ArrowsDownUp as PArrowsDownUp,
  Image as PImage,
  UserCircle as PUserCircle,
  SealCheck as PSealCheck,
  TextAa as PTextAa,
  Flag as PFlag,
  Sparkle as PSparkle,
  ChatCircleDots as PChatDots,
  Waveform as PWaveform,
  Palette as PPalette,
  Monitor as PMonitor,
} from "@phosphor-icons/react/dist/ssr";

function make(Glyph, name) {
  const C = forwardRef(function Shop2Icon(props, ref) {
    const { size = 24, color = "currentColor", weight = "regular", className, ...rest } = props;
    const labelled = rest["aria-label"] || rest["aria-labelledby"] || rest.title;
    return createElement(Glyph, {
      ref,
      size,
      color,
      weight,
      className: className ? `ui-icon ${className}` : "ui-icon",
      "aria-hidden": labelled ? undefined : true,
      focusable: "false",
      ...rest,
    });
  });
  C.displayName = name;
  return C;
}

export const Cart = make(PShoppingCart, "Cart");
export const Shirt = make(PTShirt, "Shirt");
export const Hanger = make(PCoatHanger, "Hanger");
export const Hourglass = make(PHourglass, "Hourglass");
export const Hand = make(PHandPalm, "Hand");
export const Split = make(PSplit, "Split");
export const PriceTag = make(PTag, "PriceTag");
export const Shuffle = make(PShuffle, "Shuffle");
export const SortArrows = make(PArrowsDownUp, "SortArrows");

// One glyph per cosmetic type: the "art missing" tile of a set piece shows it with the name.
const CAT_GLYPHS = {
  avatar_frame: make(PUserCircle, "CatFrame"),
  banner: make(PImage, "CatBanner"),
  profile_background: make(PImage, "CatBackground"),
  profile_aura: make(PSparkle, "CatAura"),
  profile_color: make(PPalette, "CatColor"),
  theme: make(PPalette, "CatTheme"),
  profile_badge: make(PSealCheck, "CatBadge"),
  avatar_effect: make(PSparkle, "CatEffect"),
  name_effect: make(PTextAa, "CatName"),
  chat_bubble: make(PChatDots, "CatBubble"),
  voice_tile: make(PMonitor, "CatVoiceTile"),
  join_sound: make(PWaveform, "CatJoinSound"),
  sound_pack: make(PWaveform, "CatSound"),
  countries: make(PFlag, "CatFlag"),
};
/** The icon component for an item category (a generic one for unknown categories). */
export function categoryIcon(category) {
  return CAT_GLYPHS[category] || CAT_GLYPHS.avatar_effect;
}

export {
  Archive,
  ArrowRight,
  Bell,
  Bookmark,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Crown,
  Eye,
  EyeOff,
  Gift,
  Hash,
  Heart,
  History,
  Info,
  Layers,
  LayoutGrid,
  List,
  Lock,
  LockOpen,
  MessageCircle,
  Mic,
  Monitor,
  Moon,
  MoreHorizontal,
  Package,
  Palette,
  Pencil,
  Pause,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  Undo2,
  User,
  Users,
  Volume2,
  Wand2,
  Waveform,
  X,
  AlertTriangle,
  TrendingDown,
} from "../ui/Icon.jsx";
