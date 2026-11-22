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
