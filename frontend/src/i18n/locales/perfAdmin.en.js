/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_EN = {
  "title": "Performance",
  "crumb": "System › Performance · real-user metrics and Lighthouse CI",
  "sampling": "sampling {pct}",
  "dataAgoSec": "data {n} s ago",
  "dataAgoMin": "data {n} min ago",
  "notReady": "The performance tables are not set up yet (20261124v_perf.sql). Data starts flowing once the migration is applied.",
  "retry": "Retry",
  "close": "Close",
  "cancel": "Cancel",
  "save": "Save",
  "saving": "Saving…",
  "undo": "Undo",
  "and": "and",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} s"
  },
  "tab": {
    "rum": "Real users",
    "rumShort": "Users",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Alerts"
  },
  "live": {
    "long": "Live · {n} sessions / 5 min",
    "short": "Live · {n}",
    "waiting": "Live · waiting",
    "title": "Sampled page loads measured in the last 5 minutes"
  },
  "export": {
    "button": "Export",
    "done": "{n} rows downloaded as CSV · logged in the audit log",
    "failed": "Could not export."
  },
  "rules": {
    "button": "Alert rules",
    "title": "Alert rule",
    "subtitle": "Tells the admin room and you when a metric gets worse in a new release.",
    "metric": "Metric",
    "platform": "Platform",
    "condition": "Condition",
    "conditionText": "p75, against the previous release",
    "threshold": "Worse by",
    "thresholdUnit": "% or more",
    "minSessions": "Minimum samples",
    "minUnit": "samples",
    "notify": "Notify",
    "ch": {
      "adminRoom": "Admin room (system message)",
      "ownerPush": "Push to the owner (phone)",
      "email": "E-mail digest",
      "errorLog": "Open a record in Error logs"
    },
    "chSub": {
      "adminRoom": "admins with the panel open",
      "ownerPush": "web, iOS, Android",
      "email": "once a day",
      "errorLog": "once per alert"
    },
    "mute": "Mute",
    "muteOpt": {
      "none": "Never",
      "release24h": "Same release for 24 h",
      "7d": "7 days"
    },
    "save": "Save rule",
    "saved": "Rule saved; the change is in the audit log.",
    "previewTitle": "Preview · last 90 days",
    "previewSome": "times it would have fired: each one a real release regression.",
    "previewNone": "times: this rule would not have fired in the last 90 days.",
    "previewInvalid": "Pick at least one metric and platform for the preview.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "How it looks in the admin room",
    "roomOff": "Admin room is off: this message is not sent.",
    "auditNote": "Rule changes go to the audit log and can be undone from there."
  },
  "query": {
    "label": "Performance query",
    "placeholder": "Add a filter: page, platform, version, device, connection, country, user id",
    "filters": "Filters",
    "remove": "Remove filter {label}",
    "suggestions": "Suggestions"
  },
  "tok": {
    "range": "last",
    "platform": "platform",
    "version": "version",
    "route": "page",
    "device": "device",
    "connection": "connection",
    "country": "country",
    "user": "user"
  },
  "range": {
    "24h": "24 hours",
    "7d": "7 days",
    "28d": "28 days",
    "90d": "90 days"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Low-end",
    "mid": "Mid-range",
    "high": "High-end"
  },
  "conn": {
    "wifi": "Wi-Fi",
    "ethernet": "Ethernet",
    "4g": "4G",
    "3g": "3G",
    "2g": "2G",
    "offline": "Offline"
  },
  "metric": {
    "lcp": "LCP",
    "inp": "INP",
    "cls": "CLS",
    "fcp": "FCP",
    "ttfb": "TTFB",
    "msglist": "First message list",
    "voicejoin": "Voice join",
    "appstart": "App start"
  },
  "metricSub": {
    "lcp": "Largest content",
    "inp": "Interaction delay",
    "cls": "Layout shift",
    "fcp": "First content",
    "ttfb": "First byte",
    "msglist": "when a chat opens",
    "voicejoin": "connect to the room",
    "appstart": "cold start"
  },
  "dist": {
    "good": "Good {pct}",
    "ni": "Fair {pct}",
    "poor": "Poor {pct}"
  },
  "route": {
    "app_kanal": "Server channel",
    "app_dm": "Direct messages",
    "app_grup": "Group chat",
    "app_ses": "Voice room",
    "app": "App",
    "_": "Landing page",
    "_download": "Download page",
    "_features": "Features",
    "_login": "Sign in",
    "_blog": "Blog",
    "app_market": "Market",
    "app_kesfet": "Discover",
    "app_ayarlar": "Settings"
  },
  "views": {
    "label": "Saved views",
    "all": "All",
    "mobileSlow": "Mobile · slow network",
    "desktopStart": "Desktop start",
    "voice": "Voice room",
    "release": "{platform} {version}",
    "regression": "regression",
    "save": "Save view",
    "copyLink": "Copy link",
    "linkCopied": "Link copied: any admin who opens it sees the same filters.",
    "notReady": "Saved views open once the migration is applied.",
    "menu": "View",
    "delete": "Delete view",
    "deleted": "“{name}” deleted.",
    "saved": "“{name}” saved.",
    "saveTitle": "Save view",
    "saveSubtitle": "These filters come back in one click.",
    "name": "Name",
    "namePh": "e.g. Android 4.1.4 regression",
    "contains": "Filters in it",
    "shared": "Share with the other admins",
    "sharedSub": "Everyone with the Performance section sees it."
  },
  "alert": {
    "lead": "{version}: {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} samples.",
    "mostOn": "Mostly on",
    "also": "{n} more alerts.",
    "firstSeen": "First seen {when}.",
    "share": "The release is on {pct} of users now.",
    "review": "Review",
    "errorLog": "Open error record",
    "errorAgain": "See error record",
    "errorOpened": "Error record opened in Error logs.",
    "errorExists": "This alert already has an error record.",
    "gotoErrors": "Open in Error logs",
    "hide": "Hide",
    "hidden": "Alert hidden (for everyone).",
    "show": "Show again",
    "shown": "Alert is showing again.",
    "vsPrev": "previous release {version}",
    "hasError": "error record open"
  },
  "alerts": {
    "open": "Open alerts",
    "hidden": "Hidden",
    "none": "No open alerts. Releases that cross the threshold show up here.",
    "how": "Every 15 minutes the newest release on each platform is compared with the one before it on p75; crossing the rule's threshold opens an alert."
  },
  "chart": {
    "title": "p75 trend",
    "metric": "Chart metric",
    "app": "App",
    "hint": "Click a line: filter that platform",
    "aria": "{metric} p75 trend by platform",
    "goodLine": "Good limit · {value}",
    "tipTitle": "{when} · p75",
    "flag": "flag: {name} {pct}",
    "flagOff": "off",
    "empty": "No data in this range.",
    "noData": "No samples with these filters."
  },
  "releases": {
    "title": "Release comparison",
    "version": "Release",
    "share": "Share",
    "start": "Start",
    "empty": "No release data yet.",
    "mix": "Platform share",
    "sessions": "{n} sessions"
  },
  "group": {
    "route": "Page",
    "platform": "Platform",
    "version": "Version",
    "device": "Device class",
    "connection": "Connection",
    "country": "Country"
  },
  "table": {
    "title": {
      "route": "Slowest pages",
      "platform": "Platforms",
      "version": "Releases",
      "device": "Device classes",
      "connection": "Connections",
      "country": "Countries"
    },
    "groupBy": "Group by",
    "distOf": "Distribution: {metric}",
    "sortBy": "By {metric} p75",
    "sortLabel": "Sort",
    "platform": "Platform",
    "sessions": "Sessions",
    "dist": "Distribution",
    "trend": "Trend",
    "empty": "No samples with these filters.",
    "emptySub": "Loosen the filters or pick a longer range.",
    "rowMenu": "Row actions",
    "open": "Open details",
    "filterTo": "Only {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Summary",
      "breakdown": "Breakdowns",
      "attribution": "Attribution",
      "users": "Slow users",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} sessions",
    "allPlatforms": "all platforms",
    "copy": "Copy value",
    "copied": "Copied.",
    "heatTitle": "INP p75 · platform × device class",
    "heatHint": "click a cell to filter",
    "none": "none",
    "samples": "{n} samples",
    "noData": "No data.",
    "attrTitle": "Attribution · slowest interactions (INP)",
    "attrEmpty": "No attribution data in the last {days} days.",
    "itype": {
      "keyboard": "keydown · keyboard",
      "pointer": "click · tap / click",
      "other": "interaction"
    },
    "shareOf": "{pct} of interactions",
    "lcpEl": "LCP element:",
    "onPages": "{pct} of loads",
    "usersTitle": "Slowest users",
    "usersHint": "user id only",
    "usersEmpty": "No slow signed-in users.",
    "dossier": "User dossier",
    "userSessions": "This user's {n} sessions",
    "userSessionsAll": "This user's sessions",
    "lhTitle": "Lighthouse · main",
    "lhNone": "This page is not measured by Lighthouse CI.",
    "lhApp": "App screens are not measured by Lighthouse; public pages only.",
    "saveView": "Save as view",
    "openLh": "Open in Lighthouse",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Descall System",
    "badge": "SYSTEM",
    "text": "Performance alert: {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} samples.",
    "open": "Open in the panel"
  },
  "filters": {
    "title": "Filters",
    "subtitle": "Pick several values; empty means everything.",
    "userPh": "User id (full or first 8 characters)",
    "clear": "Clear",
    "apply": "Apply"
  },
  "err": {
    "generic": "Something went wrong.",
    "load": "Could not load.",
    "NO_METRIC": "Pick at least one metric.",
    "NO_PLATFORM": "Pick at least one platform.",
    "BAD_THRESHOLD": "The threshold must be between 1 and 500.",
    "BAD_MIN_SESSIONS": "Minimum samples must be 10 or more.",
    "NAME_REQUIRED": "Enter a name.",
    "PERF_UNAVAILABLE": "The performance tables are not set up yet."
  },
  "lh": {
    "placeholder": "PR number, branch, author, page…",
    "tok": {
      "compare": "compare",
      "state": "state",
      "text": "search"
    },
    "rerun": "Re-run all",
    "rerunHint": "Opens the Lighthouse workflow in GitHub Actions",
    "view": {
      "open": "Open PRs",
      "over": "Over budget",
      "main": "main history",
      "merged": "Recently merged"
    },
    "method": "{pages} pages × 3 runs · median",
    "lastRun": "last run {when}",
    "minAgo": "{n} min ago",
    "hourAgo": "{n} h ago",
    "yesterday": "yesterday",
    "overLead": "#{pr} is over the performance budget:",
    "budget": "(budget {n}).",
    "bundle": "Main bundle {kb} KB (gzip).",
    "tbt": "Average TBT {ms} ms.",
    "openPr": "Open PR",
    "report": "See report",
    "empty": "No Lighthouse results yet. They show up after the next pull request or main run.",
    "cat": {
      "perf": "Performance",
      "a11y": "Accessibility",
      "best_practices": "Best practices",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Perf",
      "a11y": "A11y",
      "best_practices": "BP",
      "seo": "SEO"
    },
    "weekDelta": "{n} this week",
    "weekFlat": "no change this week",
    "thisWeek": "This week",
    "runs": "runs",
    "passed": "Passed {n}",
    "warned": "Warning {n}",
    "over": "Over {n}",
    "history": "main history",
    "historySub": "last {n} merges",
    "noHistory": "The chart needs at least two main runs.",
    "budgetLbl": "Budget · {n}",
    "perPage": "Per page · main",
    "noMain": "No results for main yet.",
    "noindexNote": "App pages are noindex on purpose; their SEO score is not budgeted.",
    "prs": "Pull requests",
    "prsSub": "change against main · average of {pages} pages",
    "author": "Author",
    "state": "State",
    "noPrs": "No pull requests in this view.",
    "st": {
      "over": "Over budget",
      "warn": "Warning",
      "pass": "Passed",
      "merged": "Merged",
      "mergedWarn": "Merged · warning"
    },
    "pr": "PR"
  },
  "new": "NEW"
};
