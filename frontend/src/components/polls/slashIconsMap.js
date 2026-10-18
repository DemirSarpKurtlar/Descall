import {
  Ban, BarChart3, CircleHelp, Eraser, IdCard, ImageIcon, Info, Pencil, Timer, UserX,
} from "lucide-react";
import { CardsGlyph, ReelsGlyph, CoinGlyph, SendGlyph, DailyGlyph, WalletGlyph, TrophyGlyph } from "../chat/slashIcons";

/** One icon per command (menu rows, detail pane, /help card). */
export const SLASH_ICONS = {
  bj: CardsGlyph,
  slot: ReelsGlyph,
  coinflip: CoinGlyph,
  pay: SendGlyph,
  daily: DailyGlyph,
  credits: WalletGlyph,
  top: TrophyGlyph,
  help: CircleHelp,
  server: Info,
  user: IdCard,
  avatar: ImageIcon,
  nick: Pencil,
  poll: BarChart3,
  timeout: Timer,
  kick: UserX,
  ban: Ban,
  purge: Eraser,
};
