/** Public server page "Google'da göster" desk ("pubpage.*", UI-BRIEF draft A). Same keys in every pubpage.<locale>.js. */
export const PUBPAGE_EN = {
  "entry": {
    "title": "Show on Google",
    "sub": "Public server page, search preview and results",
    "on": "Live",
    "off": "Off",
    "open": "Open"
  },
  "crumb": "Community and Discovery",
  "title": "Show on Google",
  "chip": {
    "live": "Live",
    "off": "Off · noindex",
    "hidden": "Hidden"
  },
  "openPage": "Open page",
  "save": "Save",
  "saving": "Saving…",
  "saved": "Saved",
  "close": "Close",
  "unsaved": "You have unsaved changes",
  "discard": "Discard changes",
  "loading": "Loading…",
  "loadError": "Could not load the settings.",
  "retry": "Try again",
  "offline": "No connection. Your changes were not saved.",
  "noAccess": "Only the server owner or an administrator can change this setting.",
  "memberCount": "{n} members",
  "master": {
    "title": "Show on Google",
    "sub": "The public page can appear in search results. When off, it only opens from a link.",
    "copy": "Copy link",
    "copied": "Link copied",
    "noVanity": "First choose a descall.com/s/ address in Community and Discovery.",
    "toggle": "Show on Google"
  },
  "index": {
    "indexed": "Indexed",
    "crawled": "Crawled",
    "pending": "Waiting for a crawl",
    "off": "Not indexed",
    "crawledAgo": "Google crawled it {ago}",
    "never": "Google has not crawled it yet"
  },
  "reason": {
    "too_few_members": "The page is hidden for now: it needs at least {min} members (now {count}).",
    "moderation": "The page is hidden for now: the server is under Descall review.",
    "owner_unavailable": "The page is hidden for now: the owner account is suspended.",
    "no_vanity": "The page needs a descall.com/s/ address.",
    "unavailable": "Public pages are not ready yet. Try again a little later."
  },
  "shown": {
    "title": "On the page",
    "count": "{on} / {total} on",
    "highlights": "Highlights",
    "show": "Show {name}",
    "hide": "Hide {name}",
    "always": "Always shown",
    "items": {
      "name": "Name and icon",
      "banner": "Banner",
      "desc": "Description",
      "tags": "Category, tags, language",
      "count": "Member and online counts",
      "chan": "Channel names",
      "ev": "Upcoming events",
      "rules": "Rules at a glance",
      "pin": "Pinned note"
    },
    "subs": {
      "banner": "Uploaded",
      "bannerNone": "No banner · brand background",
      "desc": "Server description",
      "descNone": "No description yet",
      "tags": "From the directory settings",
      "count": "Live numbers",
      "chan": "{n} channels · never hidden ones",
      "ev": "{n} events",
      "evNone": "No events",
      "rules": "First 3 rules",
      "rulesNone": "No rules written",
      "pin": "Your own note",
      "pinNone": "No note yet"
    }
  },
  "channels": {
    "title": "Channel list",
    "sub": "{n} role-locked, hidden or age-restricted channels are never shown.",
    "text": "Text channels",
    "voice": "Voice channels",
    "none": "No channel is visible to everyone."
  },
  "events": {
    "title": "Events",
    "add": "Add event",
    "titlePh": "Event name",
    "start": "Starts",
    "end": "Ends",
    "place": "Place (optional)",
    "placePh": "e.g. Lobby",
    "remove": "Remove event",
    "max": "Up to {n} events",
    "google": "Can show as date rows on Google"
  },
  "pin": {
    "title": "Pinned note",
    "ph": "A short note for newcomers"
  },
  "text": {
    "title": "Search text",
    "label": "Title",
    "desc": "Description",
    "titleHint": "Google shows about {n} characters",
    "descHint": "Empty: the server description is used",
    "cut": "Google cuts it here"
  },
  "serp": {
    "title": "How it looks on Google",
    "dark": "Dark",
    "light": "Light",
    "eventsRow": "Events",
    "online": "Online"
  },
  "preview": {
    "title": "Page preview",
    "desktop": "Desktop",
    "phone": "Phone",
    "note": "The preview shows your changes before saving. Saving notifies search engines.",
    "frame": "Preview of the public page"
  },
  "results": {
    "title": "Results",
    "range": "Last {n} days",
    "views": "Views",
    "google": "Google clicks",
    "googleOwn": "From Google",
    "joins": "Joins",
    "conversion": "Conversion",
    "vsPrev": "{d} vs the previous {n} days",
    "avgPos": "Avg. position {p}",
    "fromVisits": "From page visits",
    "thisWeek": "+{n} this week",
    "convSub": "Views that became joins",
    "legendViews": "Views",
    "legendGoogle": "Google clicks",
    "empty": "No data yet. Numbers show up here once the page is live.",
    "terms": "Top searches",
    "termsUnit": "clicks",
    "termsNone": "Search terms appear once Search Console is connected.",
    "sources": "Where joins come from",
    "sourcesUnit": "{n} people",
    "visits": "Where visits come from",
    "sourcesNone": "No sources yet.",
    "src": {
      "google": "Google",
      "bing": "Bing",
      "yandex": "Yandex",
      "duckduckgo": "DuckDuckGo",
      "whatsapp": "WhatsApp",
      "telegram": "Telegram",
      "x": "X",
      "instagram": "Instagram",
      "facebook": "Facebook",
      "reddit": "Reddit",
      "discord": "Discord",
      "youtube": "YouTube",
      "tiktok": "TikTok",
      "descall": "Descall",
      "qr": "QR code",
      "direct": "Direct",
      "other": "Other"
    }
  },
  "disable": {
    "button": "Stop showing on Google",
    "title": "Stop showing on Google?",
    "body": "The page becomes noindex right away and drops out of Google results within a few days. People with the link still see the normal invite screen.",
    "reasonLabel": "Reason (written to the audit log)",
    "notePh": "Short explanation",
    "cancel": "Cancel",
    "confirm": "Turn off",
    "reasons": {
      "season_break": "Season break, for a while",
      "too_many_joins": "Too many new members",
      "raid": "Unwanted visitors / raid",
      "other": "Other"
    }
  },
  "toast": {
    "off": "No longer shown on Google",
    "offSub": "The page is noindex now · search engines were told",
    "undo": "Undo · {t}",
    "undone": "The page is live again",
    "on": "The page is live"
  },
  "auto": {
    "title": "Hides by itself",
    "body": "The page hides itself when the server drops below {min} members, while it is under Descall review, or while the owner account is suspended. It comes back by itself once the reason is gone."
  },
  "privacy": {
    "title": "Privacy shield",
    "body": "Messages and hidden, role-locked or age-restricted channels never reach the page. The member list is never shown."
  },
  "audit": {
    "title": "Audit log",
    "scope": "this feature",
    "empty": "Nothing logged yet.",
    "reason": "Reason: {r}",
    "changed": "Changed: {fields}",
    "PUBLIC_PAGE_ENABLE": "Turned on Show on Google",
    "PUBLIC_PAGE_DISABLE": "Turned off Show on Google",
    "PUBLIC_PAGE_UNDO": "Undid turning it off",
    "PUBLIC_PAGE_UPDATE": "Edited the public page",
    "PUBLIC_PAGE_AUTO_HIDE": "The page hid itself",
    "fields": {
      "title": "search title",
      "description": "search description",
      "hidden": "page sections",
      "hidden_channels": "channel list",
      "pin": "pinned note",
      "events": "events"
    }
  },
  "ago": {
    "now": "just now",
    "min": "{n} min ago",
    "hour": "{n} h ago",
    "day": "{n} days ago"
  },
  "errors": {
    "TITLE_TOO_LONG": "The title can be at most {max} characters.",
    "DESCRIPTION_TOO_LONG": "The description can be at most {max} characters.",
    "PIN_TOO_LONG": "The note can be at most {max} characters.",
    "TOO_MANY_EVENTS": "You can add at most {max} events.",
    "EVENT_TITLE_REQUIRED": "Every event needs a name.",
    "EVENT_DATE_INVALID": "Every event needs a valid start time.",
    "EVENT_IN_PAST": "An event cannot start in the past.",
    "EVENT_TOO_FAR": "An event can be at most a year ahead.",
    "EVENT_END_INVALID": "An event cannot end before it starts.",
    "NO_VANITY": "First choose a descall.com/s/ address.",
    "REASON_REQUIRED": "Choose a reason for turning it off.",
    "NOTE_REQUIRED": "Write a short explanation.",
    "UNDO_EXPIRED": "The undo window has passed.",
    "ADMIN_REQUIRED": "Only the server owner or an administrator can change this setting.",
    "PUBLIC_PAGE_UNAVAILABLE": "Public pages are not ready yet.",
    "generic": "Could not save. Try again."
  },
  "nav": {
    "settings": "Server settings",
    "server": "Server",
    "people": "People",
    "moderation": "Moderation",
    "overview": "Overview",
    "channels": "Channels",
    "community": "Community and Discovery",
    "rules": "Rules",
    "members": "Members",
    "roles": "Roles",
    "invites": "Invites",
    "bans": "Bans",
    "audit": "Audit log"
  }
};
