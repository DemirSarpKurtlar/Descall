/**
 * The one icon set: Phosphor Regular on a 24 px grid (approved 2026-10-19,
 * design/ai-look-2026-10-19/02-unified-icons). A selected state uses the same
 * glyph with weight="fill"; colour alone never says "selected".
 *
 * Export names follow the old lucide-react ones so call sites only changed their
 * import path. lucide-react is gone; iconSet.selftest.mjs fails on a new import.
 * Built on the SSR entry, so the same module also renders in the marketing prerender.
 */
import { forwardRef, createElement } from "react";
import {
  Anchor as PAnchor,
  Archive as PArchive,
  ArrowBendUpLeft as PArrowBendUpLeft,
  ArrowCounterClockwise as PArrowCounterClockwise,
  ArrowLeft as PArrowLeft,
  ArrowSquareOut as PArrowSquareOut,
  ArrowUUpLeft as PArrowUUpLeft,
  ArrowsClockwise as PArrowsClockwise,
  ArrowsIn as PArrowsIn,
  ArrowsLeftRight as PArrowsLeftRight,
  ArrowsOut as PArrowsOut,
  At as PAt,
  Atom as PAtom,
  Baby as PBaby,
  Bank as PBank,
  Bell as PBell,
  BellRinging as PBellRinging,
  BellSlash as PBellSlash,
  CameraRotate as PCameraRotate,
  Binoculars as PBinoculars,
  Bird as PBird,
  Bluetooth as PBluetooth,
  Boat as PBoat,
  BookOpen as PBookOpen,
  Broadcast as PBroadcast,
  Bug as PBug,
  Buildings as PBuildings,
  Cake as PCake,
  Calendar as PCalendar,
  Camera as PCamera,
  CameraSlash as PCameraSlash,
  Car as PCar,
  CaretDown as PCaretDown,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  CaretUp as PCaretUp,
  Cat as PCat,
  ChartBar as PChartBar,
  ChartPie as PChartPie,
  ChatCenteredDots as PChatCenteredDots,
  ChatCenteredText as PChatCenteredText,
  ChatCircle as PChatCircle,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  CircleDashed as PCircleDashed,
  CircleNotch as PCircleNotch,
  Clock as PClock,
  ClockCounterClockwise as PClockCounterClockwise,
  CloudLightning as PCloudLightning,
  CloudRain as PCloudRain,
  Clover as PClover,
  Club as PClub,
  Code as PCode,
  Coffee as PCoffee,
  Coins as PCoins,
  Compass as PCompass,
  Cookie as PCookie,
  Copy as PCopy,
  Cpu as PCpu,
  Crosshair as PCrosshair,
  Crown as PCrown,
  Cube as PCube,
  CurrencyDollar as PCurrencyDollar,
  Cursor as PCursor,
  Database as PDatabase,
  DeviceMobile as PDeviceMobile,
  Diamond as PDiamond,
  DiceFive as PDiceFive,
  Dog as PDog,
  DotsSixVertical as PDotsSixVertical,
  DotsThree as PDotsThree,
  DotsThreeVertical as PDotsThreeVertical,
  DownloadSimple as PDownloadSimple,
  Drop as PDrop,
  Envelope as PEnvelope,
  EnvelopeOpen as PEnvelopeOpen,
  Eraser as PEraser,
  Export as PExport,
  Eye as PEye,
  EyeSlash as PEyeSlash,
  Eyeglasses as PEyeglasses,
  Fan as PFan,
  FileArrowDown as PFileArrowDown,
  FileText as PFileText,
  FilmSlate as PFilmSlate,
  Fire as PFire,
  Fish as PFish,
  Flag as PFlag,
  FlagBanner as PFlagBanner,
  FloppyDisk as PFloppyDisk,
  Flower as PFlower,
  Folder as PFolder,
  FolderOpen as PFolderOpen,
  FolderPlus as PFolderPlus,
  FolderSimple as PFolderSimple,
  Footprints as PFootprints,
  Funnel as PFunnel,
  GameController as PGameController,
  Gauge as PGauge,
  Gavel as PGavel,
  Gear as PGear,
  GearSix as PGearSix,
  Ghost as PGhost,
  Gift as PGift,
  GitBranch as PGitBranch,
  GithubLogo as PGithubLogo,
  Globe as PGlobe,
  GlobeHemisphereWest as PGlobeHemisphereWest,
  GraduationCap as PGraduationCap,
  GridFour as PGridFour,
  Hammer as PHammer,
  HandPalm as PHandPalm,
  Handshake as PHandshake,
  HardDrive as PHardDrive,
  HardDrives as PHardDrives,
  Hash as PHash,
  Headphones as PHeadphones,
  Heart as PHeart,
  Hexagon as PHexagon,
  House as PHouse,
  IdentificationCard as PIdentificationCard,
  Image as PImage,
  ImageBroken as PImageBroken,
  ImageSquare as PImageSquare,
  Info as PInfo,
  Joystick as PJoystick,
  Key as PKey,
  Keyboard as PKeyboard,
  Layout as PLayout,
  Leaf as PLeaf,
  Lightbulb as PLightbulb,
  Lightning as PLightning,
  Link as PLink,
  LinkSimple as PLinkSimple,
  List as PList,
  ListChecks as PListChecks,
  Lock as PLock,
  LockOpen as PLockOpen,
  MagicWand as PMagicWand,
  MagnifyingGlass as PMagnifyingGlass,
  MagnifyingGlassMinus as PMagnifyingGlassMinus,
  MagnifyingGlassPlus as PMagnifyingGlassPlus,
  MapPin as PMapPin,
  MapTrifold as PMapTrifold,
  MaskHappy as PMaskHappy,
  Medal as PMedal,
  Megaphone as PMegaphone,
  Microphone as PMicrophone,
  MicrophoneSlash as PMicrophoneSlash,
  Minus as PMinus,
  Monitor as PMonitor,
  MonitorPlay as PMonitorPlay,
  Moon as PMoon,
  Mountains as PMountains,
  MusicNote as PMusicNote,
  Package as PPackage,
  Palette as PPalette,
  PaperPlaneRight as PPaperPlaneRight,
  Paperclip as PPaperclip,
  Pause as PPause,
  PawPrint as PPawPrint,
  PenNib as PPenNib,
  PencilSimple as PPencilSimple,
  PencilSimpleLine as PPencilSimpleLine,
  Phone as PPhone,
  PhoneDisconnect as PPhoneDisconnect,
  PhoneIncoming as PPhoneIncoming,
  PhoneOutgoing as PPhoneOutgoing,
  PhoneX as PPhoneX,
  Planet as PPlanet,
  Play as PPlay,
  Plus as PPlus,
  Printer as PPrinter,
  Prohibit as PProhibit,
  Pulse as PPulse,
  PushPin as PPushPin,
  PushPinSlash as PPushPinSlash,
  PuzzlePiece as PPuzzlePiece,
  Question as PQuestion,
  Rabbit as PRabbit,
  Radio as PRadio,
  RadioButton as PRadioButton,
  Rainbow as PRainbow,
  Rectangle as PRectangle,
  Robot as PRobot,
  Rocket as PRocket,
  Scales as PScales,
  Screencast as PScreencast,
  Scroll as PScroll,
  SealCheck as PSealCheck,
  ShareNetwork as PShareNetwork,
  Shield as PShield,
  ShieldCheck as PShieldCheck,
  ShieldWarning as PShieldWarning,
  UserGear as PUserGear,
  ShoppingBag as PShoppingBag,
  SignIn as PSignIn,
  SignOut as PSignOut,
  Skull as PSkull,
  SlidersHorizontal as PSlidersHorizontal,
  Smiley as PSmiley,
  Snowflake as PSnowflake,
  SortAscending as PSortAscending,
  Spade as PSpade,
  Sparkle as PSparkle,
  SpeakerHigh as PSpeakerHigh,
  SpeakerLow as PSpeakerLow,
  SpeakerSimpleHigh as PSpeakerSimpleHigh,
  SpeakerSlash as PSpeakerSlash,
  SpeakerX as PSpeakerX,
  Square as PSquare,
  SquaresFour as PSquaresFour,
  Stack as PStack,
  Star as PStar,
  StopCircle as PStopCircle,
  Storefront as PStorefront,
  Sun as PSun,
  Sword as PSword,
  Target as PTarget,
  Terminal as PTerminal,
  TextT as PTextT,
  ThumbsDown as PThumbsDown,
  ThumbsUp as PThumbsUp,
  Ticket as PTicket,
  Timer as PTimer,
  Trash as PTrash,
  TreeStructure as PTreeStructure,
  TrendDown as PTrendDown,
  TrendUp as PTrendUp,
  Trophy as PTrophy,
  UploadSimple as PUploadSimple,
  User as PUser,
  UserCheck as PUserCheck,
  UserMinus as PUserMinus,
  UserPlus as PUserPlus,
  Users as PUsers,
  VideoCamera as PVideoCamera,
  VideoCameraSlash as PVideoCameraSlash,
  Wallet as PWallet,
  Warning as PWarning,
  WarningCircle as PWarningCircle,
  Waveform as PWaveform,
  Waves as PWaves,
  WifiHigh as PWifiHigh,
  WifiSlash as PWifiSlash,
  Wind as PWind,
  Wrench as PWrench,
  X as PX,
  XCircle as PXCircle,
} from "@phosphor-icons/react/dist/ssr";

function make(Glyph, name) {
  const C = forwardRef(function UiIcon(props, ref) {
    const {
      size = 24, color = "currentColor", weight = "regular", className,
      strokeWidth: _sw, absoluteStrokeWidth: _asw, ...rest
    } = props;
    const labelled = rest["aria-label"] || rest["aria-labelledby"] || rest.title;
    return createElement(Glyph, {
      ref, size, color, weight,
      className: className ? `ui-icon ${className}` : "ui-icon",
      "aria-hidden": labelled ? undefined : true,
      focusable: "false",
      ...rest,
    });
  });
  C.displayName = name;
  return C;
}

export const X = make(PX, "X");
export const Users = make(PUsers, "Users");
export const Check = make(PCheck, "Check");
export const Search = make(PMagnifyingGlass, "Search");
export const RefreshCw = make(PArrowsClockwise, "RefreshCw");
export const Shield = make(PShield, "Shield");
export const AlertTriangle = make(PWarning, "AlertTriangle");
export const Clock = make(PClock, "Clock");
export const Monitor = make(PMonitor, "Monitor");
export const Mic = make(PMicrophone, "Mic");
export const Bell = make(PBell, "Bell");
export const Trash2 = make(PTrash, "Trash2");
export const Sparkles = make(PSparkle, "Sparkles");
export const Flag = make(PFlag, "Flag");
export const Lock = make(PLock, "Lock");
export const Timer = make(PTimer, "Timer");
export const MicOff = make(PMicrophoneSlash, "MicOff");
export const Loader2 = make(PCircleNotch, "Loader2");
export const Video = make(PVideoCamera, "Video");
export const User = make(PUser, "User");
export const PhoneOff = make(PPhoneDisconnect, "PhoneOff");
export const EyeOff = make(PEyeSlash, "EyeOff");
export const CheckCircle2 = make(PCheckCircle, "CheckCircle2");
export const AlertCircle = make(PWarningCircle, "AlertCircle");
export const Plus = make(PPlus, "Plus");
export const MessageSquare = make(PChatCenteredText, "MessageSquare");
export const Mail = make(PEnvelope, "Mail");
export const Eye = make(PEye, "Eye");
export const ChevronDown = make(PCaretDown, "ChevronDown");
export const Ban = make(PProhibit, "Ban");
export const Volume2 = make(PSpeakerHigh, "Volume2");
export const UserX = make(PUserMinus, "UserX");
export const Settings = make(PGear, "Settings");
export const Maximize2 = make(PArrowsOut, "Maximize2");
export const Headphones = make(PHeadphones, "Headphones");
export const Crown = make(PCrown, "Crown");
export const Coins = make(PCoins, "Coins");
export const ChevronRight = make(PCaretRight, "ChevronRight");
export const BarChart3 = make(PChartBar, "BarChart3");
export const VideoOff = make(PVideoCameraSlash, "VideoOff");
export const UserPlus = make(PUserPlus, "UserPlus");
export const Smile = make(PSmiley, "Smile");
export const Send = make(PPaperPlaneRight, "Send");
export const Minus = make(PMinus, "Minus");
export const Minimize2 = make(PArrowsIn, "Minimize2");
export const Megaphone = make(PMegaphone, "Megaphone");
export const LogOut = make(PSignOut, "LogOut");
export const Download = make(PDownloadSimple, "Download");
export const Copy = make(PCopy, "Copy");
export const CheckCircle = make(PCheckCircle, "CheckCircle");
export const Zap = make(PLightning, "Zap");
export const XCircle = make(PXCircle, "XCircle");
export const Square = make(PSquare, "Square");
export const ShieldCheck = make(PShieldCheck, "ShieldCheck");
export const ShieldWarning = make(PShieldWarning, "ShieldWarning");
export const UserGear = make(PUserGear, "UserGear");
export const Pin = make(PPushPin, "Pin");
export const Phone = make(PPhone, "Phone");
export const Pencil = make(PPencilSimple, "Pencil");
export const Palette = make(PPalette, "Palette");
export const MoreHorizontal = make(PDotsThree, "MoreHorizontal");
export const LogIn = make(PSignIn, "LogIn");
export const Link2 = make(PLinkSimple, "Link2");
export const Info = make(PInfo, "Info");
export const Image = make(PImage, "Image");
export const HeadphoneOff = make(PSpeakerSlash, "HeadphoneOff");
export const Globe = make(PGlobe, "Globe");
export const Gift = make(PGift, "Gift");
export const Edit3 = make(PPencilSimpleLine, "Edit3");
export const ChevronLeft = make(PCaretLeft, "ChevronLeft");
export const Activity = make(PPulse, "Activity");
export const Star = make(PStar, "Star");
export const Smartphone = make(PDeviceMobile, "Smartphone");
export const Server = make(PHardDrives, "Server");
export const RotateCcw = make(PArrowCounterClockwise, "RotateCcw");
export const PinOff = make(PPushPinSlash, "PinOff");
export const MessageCircle = make(PChatCircle, "MessageCircle");
export const ImagePlus = make(PImageSquare, "ImagePlus");
export const History = make(PClockCounterClockwise, "History");
export const FileText = make(PFileText, "FileText");
export const ChevronUp = make(PCaretUp, "ChevronUp");
export const ZoomOut = make(PMagnifyingGlassMinus, "ZoomOut");
export const ZoomIn = make(PMagnifyingGlassPlus, "ZoomIn");
export const Wrench = make(PWrench, "Wrench");
export const Wifi = make(PWifiHigh, "Wifi");
export const VolumeX = make(PSpeakerX, "VolumeX");
export const UserRoundPlus = make(PUserPlus, "UserRoundPlus");
export const UserCheck = make(PUserCheck, "UserCheck");
export const Undo2 = make(PArrowUUpLeft, "Undo2");
export const TrendingUp = make(PTrendUp, "TrendingUp");
export const Terminal = make(PTerminal, "Terminal");
export const Sun = make(PSun, "Sun");
export const ShoppingBag = make(PShoppingBag, "ShoppingBag");
export const Share2 = make(PShareNetwork, "Share2");
export const Save = make(PFloppyDisk, "Save");
export const Pause = make(PPause, "Pause");
export const Paperclip = make(PPaperclip, "Paperclip");
export const MessageSquarePlus = make(PChatCenteredDots, "MessageSquarePlus");
export const KeyRound = make(PKey, "KeyRound");
export const ImageIcon = make(PImage, "ImageIcon");
export const Hash = make(PHash, "Hash");
export const Grid = make(PGridFour, "Grid");
export const FolderSearch = make(PFolderSimple, "FolderSearch");
export const Flame = make(PFire, "Flame");
export const Filter = make(PFunnel, "Filter");
export const Camera = make(PCamera, "Camera");
export const Calendar = make(PCalendar, "Calendar");
export const BellRing = make(PBellRinging, "BellRing");
export const ArrowLeft = make(PArrowLeft, "ArrowLeft");
export const WifiOff = make(PWifiSlash, "WifiOff");
export const Wallet = make(PWallet, "Wallet");
export const Upload = make(PUploadSimple, "Upload");
export const Type = make(PTextT, "Type");
export const SmilePlus = make(PSmiley, "SmilePlus");
export const Share = make(PExport, "Share");
export const ScrollText = make(PScroll, "ScrollText");
export const Reply = make(PArrowBendUpLeft, "Reply");
export const Moon = make(PMoon, "Moon");
export const MonitorUp = make(PScreencast, "MonitorUp");
export const Menu = make(PList, "Menu");
export const MailOpen = make(PEnvelopeOpen, "MailOpen");
export const Layers = make(PStack, "Layers");
export const IdCard = make(PIdentificationCard, "IdCard");
export const Gamepad2 = make(PGameController, "Gamepad2");
export const FlagOff = make(PFlagBanner, "FlagOff");
export const Eraser = make(PEraser, "Eraser");
export const CircleSlash = make(PProhibit, "CircleSlash");
export const CircleHelp = make(PQuestion, "CircleHelp");
export const AtSign = make(PAt, "AtSign");
export const Archive = make(PArchive, "Archive");
export const Volume1 = make(PSpeakerLow, "Volume1");
export const UsersRound = make(PUsers, "UsersRound");
export const UserMinus = make(PUserMinus, "UserMinus");
export const Unlock = make(PLockOpen, "Unlock");
export const Trophy = make(PTrophy, "Trophy");
export const TrendingDown = make(PTrendDown, "TrendingDown");
export const ThumbsUp = make(PThumbsUp, "ThumbsUp");
export const Target = make(PTarget, "Target");
export const StopCircle = make(PStopCircle, "StopCircle");
export const Spade = make(PSpade, "Spade");
export const SortAsc = make(PSortAscending, "SortAsc");
export const SlidersHorizontal = make(PSlidersHorizontal, "SlidersHorizontal");
export const Settings2 = make(PGearSix, "Settings2");
export const ScreenShare = make(PScreencast, "ScreenShare");
export const Scale = make(PScales, "Scale");
export const RectangleHorizontal = make(PRectangle, "RectangleHorizontal");
export const Printer = make(PPrinter, "Printer");
export const Play = make(PPlay, "Play");
export const PieChart = make(PChartPie, "PieChart");
export const Network = make(PTreeStructure, "Network");
export const MoreVertical = make(PDotsThreeVertical, "MoreVertical");
export const MonitorSpeaker = make(PMonitorPlay, "MonitorSpeaker");
export const Mic2 = make(PMicrophone, "Mic2");
export const MapPin = make(PMapPin, "MapPin");
export const LockOpen = make(PLockOpen, "LockOpen");
export const ListChecks = make(PListChecks, "ListChecks");
export const List = make(PList, "List");
export const Link = make(PLink, "Link");
export const Lightbulb = make(PLightbulb, "Lightbulb");
export const LayoutGrid = make(PSquaresFour, "LayoutGrid");
export const LayoutDashboard = make(PLayout, "LayoutDashboard");
export const Layers2 = make(PStack, "Layers2");
export const Keyboard = make(PKeyboard, "Keyboard");
export const Ticket = make(PTicket, "Ticket");
export const ImageOff = make(PImageBroken, "ImageOff");
export const HelpCircle = make(PQuestion, "HelpCircle");
export const Heart = make(PHeart, "Heart");
export const HandMetal = make(PHandPalm, "HandMetal");
export const GripVertical = make(PDotsSixVertical, "GripVertical");
export const GitBranch = make(PGitBranch, "GitBranch");
export const Gavel = make(PGavel, "Gavel");
export const FolderOpen = make(PFolderOpen, "FolderOpen");
export const FileDown = make(PFileArrowDown, "FileDown");
export const ExternalLink = make(PArrowSquareOut, "ExternalLink");
export const Ellipsis = make(PDotsThree, "Ellipsis");
export const DollarSign = make(PCurrencyDollar, "DollarSign");
export const Dice5 = make(PDiceFive, "Dice5");
export const Diamond = make(PDiamond, "Diamond");
export const Database = make(PDatabase, "Database");
export const Cpu = make(PCpu, "Cpu");
export const Compass = make(PCompass, "Compass");
export const Code = make(PCode, "Code");
export const CircleDot = make(PRadioButton, "CircleDot");
export const CameraOff = make(PCameraSlash, "CameraOff");
export const Cake = make(PCake, "Cake");
export const Bug = make(PBug, "Bug");
export const Box = make(PCube, "Box");
export const BookOpen = make(PBookOpen, "BookOpen");
export const BellOff = make(PBellSlash, "BellOff");
export const SwitchCamera = make(PCameraRotate, "SwitchCamera");
export const ArchiveRestore = make(PArrowCounterClockwise, "ArchiveRestore");
export const Anchor = make(PAnchor, "Anchor");
export const ArrowRightLeft = make(PArrowsLeftRight, "ArrowRightLeft");
export const Atom = make(PAtom, "Atom");
export const Award = make(PMedal, "Award");
export const Baby = make(PBaby, "Baby");
export const Badge = make(PSealCheck, "Badge");
export const Bird = make(PBird, "Bird");
export const Blocks = make(PCube, "Blocks");
export const Bluetooth = make(PBluetooth, "Bluetooth");
export const Bot = make(PRobot, "Bot");
export const Building = make(PBuildings, "Building");
export const Building2 = make(PBuildings, "Building2");
export const Candy = make(PCookie, "Candy");
export const Car = make(PCar, "Car");
export const Cast = make(PScreencast, "Cast");
export const Cat = make(PCat, "Cat");
export const CircleDashed = make(PCircleDashed, "CircleDashed");
export const Clapperboard = make(PFilmSlate, "Clapperboard");
export const CloudLightning = make(PCloudLightning, "CloudLightning");
export const CloudRain = make(PCloudRain, "CloudRain");
export const Clover = make(PClover, "Clover");
export const Club = make(PClub, "Club");
export const Code2 = make(PCode, "Code2");
export const Coffee = make(PCoffee, "Coffee");
export const Crosshair = make(PCrosshair, "Crosshair");
export const Dices = make(PDiceFive, "Dices");
export const Dog = make(PDog, "Dog");
export const Droplets = make(PDrop, "Droplets");
export const Earth = make(PGlobeHemisphereWest, "Earth");
export const Fan = make(PFan, "Fan");
export const Fish = make(PFish, "Fish");
export const Flower2 = make(PFlower, "Flower2");
export const Folder = make(PFolder, "Folder");
export const FolderPlus = make(PFolderPlus, "FolderPlus");
export const Footprints = make(PFootprints, "Footprints");
export const Gauge = make(PGauge, "Gauge");
export const Gem = make(PDiamond, "Gem");
export const Ghost = make(PGhost, "Ghost");
export const Github = make(PGithubLogo, "Github");
export const Glasses = make(PEyeglasses, "Glasses");
export const GraduationCap = make(PGraduationCap, "GraduationCap");
export const Handshake = make(PHandshake, "Handshake");
export const HardDrive = make(PHardDrive, "HardDrive");
export const Hexagon = make(PHexagon, "Hexagon");
export const Home = make(PHouse, "Home");
export const Joystick = make(PJoystick, "Joystick");
export const Key = make(PKey, "Key");
export const Landmark = make(PBank, "Landmark");
export const Layout = make(PLayout, "Layout");
export const Leaf = make(PLeaf, "Leaf");
export const Map = make(PMapTrifold, "Map");
export const Medal = make(PMedal, "Medal");
export const MonitorOff = make(PMonitor, "MonitorOff");
export const Mountain = make(PMountains, "Mountain");
export const MousePointer = make(PCursor, "MousePointer");
export const Music = make(PMusicNote, "Music");
export const Orbit = make(PPlanet, "Orbit");
export const Package = make(PPackage, "Package");
export const PawPrint = make(PPawPrint, "PawPrint");
export const PenLine = make(PPenNib, "PenLine");
export const PhoneIncoming = make(PPhoneIncoming, "PhoneIncoming");
export const PhoneMissed = make(PPhoneX, "PhoneMissed");
export const PhoneOutgoing = make(PPhoneOutgoing, "PhoneOutgoing");
export const Pickaxe = make(PHammer, "Pickaxe");
export const Puzzle = make(PPuzzlePiece, "Puzzle");
export const Rabbit = make(PRabbit, "Rabbit");
export const Radio = make(PRadio, "Radio");
export const Rainbow = make(PRainbow, "Rainbow");
export const Rocket = make(PRocket, "Rocket");
export const Satellite = make(PBroadcast, "Satellite");
export const Ship = make(PBoat, "Ship");
export const Skull = make(PSkull, "Skull");
export const Snowflake = make(PSnowflake, "Snowflake");
export const Speaker = make(PSpeakerSimpleHigh, "Speaker");
export const Store = make(PStorefront, "Store");
export const Swords = make(PSword, "Swords");
export const Telescope = make(PBinoculars, "Telescope");
export const ThumbsDown = make(PThumbsDown, "ThumbsDown");
export const UserRound = make(PUser, "UserRound");
export const Wallpaper = make(PImage, "Wallpaper");
export const Wand2 = make(PMagicWand, "Wand2");
export const Waves = make(PWaves, "Waves");
export const Wind = make(PWind, "Wind");
export const Waveform = make(PWaveform, "Waveform");
export const MaskHappy = make(PMaskHappy, "MaskHappy");

const BY_NAME = {
  X,
  Users,
  Check,
  Search,
  RefreshCw,
  Shield,
  AlertTriangle,
  Clock,
  Monitor,
  Mic,
  Bell,
  Trash2,
  Sparkles,
  Flag,
  Lock,
  Timer,
  MicOff,
  Loader2,
  Video,
  User,
  PhoneOff,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Plus,
  MessageSquare,
  Mail,
  Eye,
  ChevronDown,
  Ban,
  Volume2,
  UserX,
  Settings,
  Maximize2,
  Headphones,
  Crown,
  Coins,
  ChevronRight,
  BarChart3,
  VideoOff,
  UserPlus,
  Smile,
  Send,
  Minus,
  Minimize2,
  Megaphone,
  LogOut,
  Download,
  Copy,
  CheckCircle,
  Zap,
  XCircle,
  Square,
  ShieldCheck,
  Pin,
  Phone,
  Pencil,
  Palette,
  MoreHorizontal,
  LogIn,
  Link2,
  Info,
  Image,
  HeadphoneOff,
  Globe,
  Gift,
  Edit3,
  ChevronLeft,
  Activity,
  Star,
  Smartphone,
  Server,
  RotateCcw,
  PinOff,
  MessageCircle,
  ImagePlus,
  History,
  FileText,
  ChevronUp,
  ZoomOut,
  ZoomIn,
  Wrench,
  Wifi,
  VolumeX,
  UserRoundPlus,
  UserCheck,
  Undo2,
  TrendingUp,
  Terminal,
  Sun,
  ShoppingBag,
  Share2,
  Save,
  Pause,
  Paperclip,
  MessageSquarePlus,
  KeyRound,
  ImageIcon,
  Hash,
  Grid,
  FolderSearch,
  Flame,
  Filter,
  Camera,
  Calendar,
  BellRing,
  ArrowLeft,
  WifiOff,
  Wallet,
  Upload,
  Type,
  SmilePlus,
  Share,
  ScrollText,
  Reply,
  Moon,
  MonitorUp,
  Menu,
  MailOpen,
  Layers,
  IdCard,
  Gamepad2,
  FlagOff,
  Eraser,
  CircleSlash,
  CircleHelp,
  AtSign,
  Archive,
  Volume1,
  UsersRound,
  UserMinus,
  Unlock,
  Trophy,
  TrendingDown,
  ThumbsUp,
  Target,
  StopCircle,
  Spade,
  SortAsc,
  SlidersHorizontal,
  Settings2,
  ScreenShare,
  Scale,
  RectangleHorizontal,
  Printer,
  Play,
  PieChart,
  Network,
  MoreVertical,
  MonitorSpeaker,
  Mic2,
  MapPin,
  LockOpen,
  ListChecks,
  List,
  Link,
  Lightbulb,
  LayoutGrid,
  LayoutDashboard,
  Layers2,
  Keyboard,
  Ticket,
  ImageOff,
  HelpCircle,
  Heart,
  HandMetal,
  GripVertical,
  GitBranch,
  Gavel,
  FolderOpen,
  FileDown,
  ExternalLink,
  Ellipsis,
  DollarSign,
  Dice5,
  Diamond,
  Database,
  Cpu,
  Compass,
  Code,
  CircleDot,
  CameraOff,
  Cake,
  Bug,
  Box,
  BookOpen,
  BellOff,
  SwitchCamera,
  ArchiveRestore,
  Anchor,
  ArrowRightLeft,
  Atom,
  Award,
  Baby,
  Badge,
  Bird,
  Blocks,
  Bluetooth,
  Bot,
  Building,
  Building2,
  Candy,
  Car,
  Cast,
  Cat,
  CircleDashed,
  Clapperboard,
  CloudLightning,
  CloudRain,
  Clover,
  Club,
  Code2,
  Coffee,
  Crosshair,
  Dices,
  Dog,
  Droplets,
  Earth,
  Fan,
  Fish,
  Flower2,
  Folder,
  FolderPlus,
  Footprints,
  Gauge,
  Gem,
  Ghost,
  Github,
  Glasses,
  GraduationCap,
  Handshake,
  HardDrive,
  Hexagon,
  Home,
  Joystick,
  Key,
  Landmark,
  Layout,
  Leaf,
  Map,
  Medal,
  MonitorOff,
  Mountain,
  MousePointer,
  Music,
  Orbit,
  Package,
  PawPrint,
  PenLine,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Pickaxe,
  Puzzle,
  Rabbit,
  Radio,
  Rainbow,
  Rocket,
  Satellite,
  Ship,
  Skull,
  Snowflake,
  Speaker,
  Store,
  Swords,
  Telescope,
  ThumbsDown,
  UserRound,
  Wallpaper,
  Wand2,
  Waves,
  Wind,
  Waveform,
  MaskHappy,
};

/** <Icon name="Mic" weight="fill" size={20} /> */
export function Icon({ name, ...props }) {
  const C = BY_NAME[name];
  return C ? createElement(C, props) : null;
}
export default Icon;
