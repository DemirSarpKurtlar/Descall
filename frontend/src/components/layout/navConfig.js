import {
  RailActivity,
  RailAdd,
  RailCalls,
  RailChat,
  RailFriends,
  RailGroups,
  RailPlay,
  RailServers,
  RailSettings,
} from "./railIcons";

/** Shared primary destinations for the left vertical nav rail. */
export const MAIN_NAV_IDS = [
  "chat",
  "groups",
  "servers",
  "play",
  "friends",
  "activity",
  "calls",
];

/** Icon stroke used everywhere in primary navigation. */
export const NAV_ICON_STROKE = 1.75;
export const NAV_ICON_SIZE = 24;

export function buildMainNavItems(t) {
  return [
    { id: "chat", icon: RailChat, label: t("nav.chats"), group: "main" },
    { id: "groups", icon: RailGroups, label: t("nav.groups"), group: "main" },
    { id: "servers", icon: RailServers, label: t("nav.servers"), group: "main" },
    { id: "play", icon: RailPlay, label: t("nav.play"), group: "main" },
    { id: "friends", icon: RailFriends, label: t("nav.friends"), group: "main" },
    { id: "activity", icon: RailActivity, label: t("Activity"), group: "main" },
    { id: "calls", icon: RailCalls, label: t("nav.calls"), group: "main" },
  ];
}

export function buildToolNavItems(t) {
  return [
    { id: "add", icon: RailAdd, label: t("Add New"), group: "tools", action: "add" },
    { id: "settings", icon: RailSettings, label: t("settings.title"), group: "account", action: "settings" },
  ];
}
