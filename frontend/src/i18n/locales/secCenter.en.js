/** Admin Panel › Security Center ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_EN = {
  "title": "Security center",
  "subtitle": "Watch attacks live, lock the platform in one step, keep every settings change reversible",
  "threatLevel": "Threat level: {level}",
  "level": { "normal": "Normal", "elevated": "Elevated", "high": "High" },
  "history": "Settings history",
  "alertsBtn": "Alerts",
  "emergencyLock": "Emergency lock",
  "live": "Live",
  "polling": "Every 30 s",
  "loading": "Loading…",
  "saving": "Saving…",
  "retry": "Try again",
  "cancel": "Cancel",
  "close": "Close",
  "reason": "Reason",
  "reasonRequired": "Reason (required, written to the audit log)",
  "memoryOnly": "The event log and settings history are not durable yet: until the database tables exist they are lost when the server restarts.",
  "time": {
    "now": "now",
    "nowCap": "Now",
    "min": "{n} min",
    "hour": "{n} h",
    "day": "{n} d",
    "hm": "{h} h {m} min",
    "hours": "{n, plural, one {# hour} other {# hours}}",
    "minutes": "{n, plural, one {# minute} other {# minutes}}",
    "today": "Today {time}",
    "yesterday": "Yesterday {time}",
    "yesterdayShort": "Yesterday {time}"
  },
  "score": {
    "title": "Security score",
    "how": "How it's calculated",
    "aria": "Security score {score} out of 100",
    "passed": "{passed} of {total} checks passed",
    "lastWeek": "Last week {n}",
    "firstWeek": "First measurement for the weekly comparison",
    "potential": "Apply {n, plural, one {# recommendation} other {# recommendations}} to reach {score}",
    "allApplied": "No recommendations left to apply",
    "checks": "Security checks",
    "points": "+{n} pts",
    "remind": "Remind",
    "remindGo": "Send reminder",
    "viewLocks": "Locks",
    "okSr": "passed"
  },
  "grade": { "excellent": "Excellent", "good": "Good", "fair": "Fair", "poor": "Poor" },
  "check": {
    "humanCheck": {
      "name": "Human check at sign-up",
      "ok": "Human check at sign-up is on",
      "fail": "Human check at sign-up is off",
      "why": "Stopping bot sign-ups at the door needs a human verification service (for example Cloudflare Turnstile). It is not set up yet; until then the registration freeze and the throwaway email block protect against bot waves."
    },
    "admin2fa": {
      "name": "2FA for admins",
      "ok": "All {total} admins use 2FA",
      "fail": "{missing} of {total} admins have no 2FA",
      "why": "Admins without 2FA cannot open the Admin Panel. The reminder shows them a notice to turn on the authenticator app if they are connected right now."
    },
    "totpEnforced": {
      "name": "Admin 2FA enforcement",
      "ok": "Admin actions are protected by a code",
      "fail": "Admin 2FA enforcement is not active",
      "why": "Until the authenticator tables exist, admin actions do not ask for a verification code. The database migration needs to be applied."
    },
    "dmMinAge": {
      "name": "Minimum account age for DMs",
      "ok": "Minimum account age for DMs: {hours} h",
      "fail": "No minimum account age for DMs",
      "why": "Brand-new accounts cannot mass-DM in their first hours, which cuts most spam and phishing waves. Recommended: 24 hours."
    },
    "loginLimit": {
      "name": "Login attempt limit",
      "ok": "Login attempt limit {n} / min",
      "fail": "Login attempt limit is too high ({n} / min)",
      "why": "Wrong password attempts allowed per account per minute. Keeping it low slows down brute force. Recommended: 5 / min."
    },
    "disposableEmail": {
      "name": "Throwaway email block",
      "ok": "Throwaway email block is on",
      "fail": "Throwaway email block is off",
      "why": "Refuses password sign-ups with temporary email services (tempmail, yopmail…), the most common source of bot accounts."
    },
    "messageRate": {
      "name": "Message rate limit",
      "ok": "Message rate limit {n} / min",
      "fail": "Message rate limit is outside the safe range ({n} / min)",
      "why": "Messages one person can send per minute. Keeping it between 1 and 120 limits spam raids. Recommended: 60 / min."
    },
    "dmRate": {
      "name": "DM spacing",
      "ok": "Spacing between DMs {ms} ms",
      "fail": "Spacing between DMs is too short ({ms} ms)",
      "why": "Shortest time between two DMs. Too short and scripts can send dozens of DMs a second. Recommended: 200 ms."
    },
    "accessBans": {
      "name": "Access bans",
      "ok": "IP and device bans are working",
      "fail": "IP and device bans are not working",
      "why": "The access ban tables or the signing key are missing; IP and network bans stop nobody right now."
    },
    "eventLog": {
      "name": "Security event log",
      "ok": "Security events are stored durably",
      "fail": "Security events are only in memory",
      "why": "Until the event table exists the live feed is lost on restart and there is no weekly comparison."
    },
    "auditLog": {
      "name": "Audit log",
      "ok": "Audit log is durable",
      "fail": "Audit log is not durable",
      "why": "The audit log table is missing; admin actions are only kept in memory."
    },
    "noOpenLock": {
      "name": "Open-ended lock",
      "ok": "No lock left on without an end",
      "fail": "Open-ended lock on: {modes}",
      "why": "An emergency lock that lasts until lifted affects users for no reason if it is forgotten."
    }
  },
  "explain": {
    "title": "How the score is calculated",
    "body": "Every check has a weight; the score is the passed weight as a share of the total (out of 100). It is saved every 12 hours and compared with last week.",
    "grades": "90 and up excellent, 75 and up good, 50 and up fair, below that poor."
  },
  "fix": {
    "title": "Apply recommendation",
    "sets": "Will set",
    "score": "Score",
    "apply": "Apply",
    "all": "Apply all ({n})"
  },
  "threat": {
    "title": "Threat summary",
    "window": "last 24 hours",
    "spike": "{time} brute-force wave",
    "calm": "No brute-force wave",
    "chartAria": "Failed logins, rate limits and blocked IPs over the last 24 hours"
  },
  "kpi": {
    "failed": "Failed logins",
    "locked": "Locked accounts",
    "blocked": "Blocked IPs",
    "rate": "Limit hits",
    "vsYesterday": "{pct} vs yesterday",
    "flat": "same as yesterday",
    "new": "none yesterday",
    "activeBans": "{n} active bans"
  },
  "legend": { "failed": "Failed logins", "rate": "Rate limit", "blocked": "Blocked IPs" },
  "locks": {
    "title": "Emergency lock modes",
    "liftAll": "Lift all",
    "permanent": "Permanent access settings",
    "fromSystem": "On from System",
    "sysChatFrozen": "Chat is frozen",
    "chatFrozenSub": "Nobody can send messages",
    "regOff": "Sign-ups are off",
    "regOffSub": "No new accounts can be created",
    "openSystem": "Open System",
    "liftsIn": "Lifts in {time}",
    "untilLifted": "Until lifted",
    "detailAria": "Details of the {name} lock"
  },
  "lockMode": {
    "registration": {
      "name": "Registration freeze",
      "short": "registration freeze",
      "desc": "No new accounts",
      "long": "No new accounts (email, Google, Apple). Existing accounts can still sign in."
    },
    "dm": {
      "name": "DM freeze",
      "short": "DM freeze",
      "desc": "No new DMs",
      "long": "No new direct messages; server and group chats stay open."
    },
    "readOnly": {
      "name": "Read-only mode",
      "short": "read-only mode",
      "desc": "Nobody can send messages",
      "long": "No messages anywhere, no new groups or servers."
    }
  },
  "perm": {
    "groups": {
      "name": "Group creation",
      "on": "Users can create new groups",
      "off": "New groups cannot be created",
      "offTitle": "Turn off group creation?",
      "offBody": "Users cannot create new groups; existing groups keep working. Admins are not affected."
    },
    "dm": {
      "name": "Direct messages",
      "on": "DMs are on",
      "off": "DMs are off",
      "offTitle": "Turn off direct messages permanently?",
      "offBody": "Nobody can send new DMs; this is a permanent setting and does not turn back on by itself. For a temporary stop use the DM freeze lock."
    },
    "offGo": "Turn off"
  },
  "lift": {
    "title": "Lift {name}?",
    "titleAll": "Lift {n, plural, one {# lock} other {# locks}}?",
    "body": "Settings go back to how they were before the lock, the users' info band disappears and it is written to the audit log.",
    "go": "Lift lock"
  },
  "lockInfo": {
    "reason": "Reason",
    "by": "Started by",
    "started": "Started",
    "ends": "Ends",
    "band": "Info band",
    "extend": "Extend",
    "plus": "+{time}",
    "lift": "Lift lock"
  },
  "lockDlg": {
    "title": "Start emergency lock",
    "sub": "The modes you pick take effect across the platform at once; admins are not affected.",
    "modes": "Lock",
    "alreadyOn": "On · {time}",
    "duration": "Ends automatically",
    "reason": "Reason (required, written to the audit log)",
    "reasonPh": "What is happening? E.g. brute force and a bot sign-up wave from one source since 20:09.",
    "code": "Verification code",
    "banner": "Show users an info band",
    "pickOne": "Pick at least one lock",
    "starting": "Starting…",
    "confirm": {
      "15m": "{n, plural, one {Lock for 15 minutes} other {Start # locks for 15 minutes}}",
      "1h": "{n, plural, one {Lock for 1 hour} other {Start # locks for 1 hour}}",
      "6h": "{n, plural, one {Lock for 6 hours} other {Start # locks for 6 hours}}",
      "24h": "{n, plural, one {Lock for 24 hours} other {Start # locks for 24 hours}}",
      "manual": "{n, plural, one {Lock until lifted} other {Start # locks until lifted}}"
    },
    "impact": "Impact preview",
    "online": "Users online",
    "signups": "New sign-ups, last hour",
    "dms": "New DMs, last hour",
    "autoEnd": "Lifts automatically",
    "bandTitle": "Band users will see",
    "device": "Preview device",
    "desktop": "Desktop",
    "phone": "Phone",
    "noBand": "No info band will be shown",
    "pickForBand": "Pick a lock to see the band here",
    "registrationWhere": "People trying to sign up see this on the sign-up screen.",
    "noteAuto": "When the time is up, settings go back to how they were before the lock and the admin room is notified.",
    "noteManual": "The lock lasts until you lift it. It shows in Alerts and in the score so it is not forgotten."
  },
  "duration": { "15m": "15 min", "1h": "1 hour", "6h": "6 hours", "24h": "24 hours", "manual": "Until lifted" },
  "band": {
    "registration": "New sign-ups are temporarily closed. {when}",
    "dm": "Sending DMs is temporarily off. {when}",
    "readOnly": "Descall is read-only for a short while. Messages can't be sent. {when}",
    "when": {
      "15m": "Back in about 15 minutes.",
      "1h": "Back in about 1 hour.",
      "6h": "Back in about 6 hours.",
      "24h": "Back in about 24 hours."
    },
    "whenManual": "Back as soon as possible."
  },
  "feed": {
    "title": "Live threat feed",
    "sub": "login, sign-up, rate limit and access ban events",
    "openAll": "Show all",
    "collapse": "Collapse",
    "filters": "Event type",
    "pause": "Pause feed",
    "resume": "Resume feed",
    "export": "Download CSV",
    "newEvents": "{n, plural, one {# new event · show} other {# new events · show}}",
    "emptyTitle": "All quiet",
    "emptyBody": "No security events lately. New ones appear here live.",
    "emptyFilter": "No events of this type.",
    "loadMore": "Older events",
    "sourceFilter": "Source: {ip}",
    "clearSource": "Clear the source filter"
  },
  "filter": {
    "all": "All",
    "bruteForce": "Brute force",
    "failedLogin": "Failed login",
    "blockedIp": "Blocked IP",
    "rateLimit": "Rate limit",
    "signupDenied": "Sign-up refused"
  },
  "ev": {
    "unknownAccount": "an account that doesn't exist",
    "brute_force": {
      "title": "Brute-force attack",
      "line": "{attempts} attempts on {accounts} accounts in {minutes} min",
      "lineUser": "{attempts} attempts on {accounts} accounts incl. {user} in {minutes} min"
    },
    "failed_login": {
      "title": "Failed login",
      "lineUser": "{user} · wrong password, {n} attempts",
      "lineUnknown": "Unknown username · {n} attempts"
    },
    "account_locked": {
      "title": "Account temporarily locked",
      "lineMinute": "{user} · {n} failed logins in 1 minute, waiting period",
      "lineWindow": "{user} · too many attempts in 15 minutes, refused {n} times"
    },
    "ip_blocked": {
      "title": "IP limit exceeded",
      "lineLogin": "Login attempts went over the IP limit · refused {n} times",
      "lineRegister": "Sign-up attempts went over the IP limit · refused {n} times"
    },
    "access_ban": {
      "title": "Hit an access ban",
      "line": "{kind} {label} · {action} attempt"
    },
    "rate_limit": {
      "title": "Rate limit exceeded",
      "line": "{user} · message limit {limit} / min, {n} attempts refused"
    },
    "signup_denied": {
      "title": "Sign-up refused",
      "lineDisposable": "{email} · throwaway email",
      "lineClosed": "{method} sign-up while sign-ups are closed · {n} attempts"
    },
    "admin_step_up": {
      "title": "Admin step-up check",
      "lineOk": "{user} · code correct",
      "lineFail": "{user} · wrong code, {n} attempts"
    }
  },
  "banKind": { "ip": "IP ban", "network": "Network ban", "device": "Device ban" },
  "banAction": { "login": "login", "register": "sign-up", "socket": "connection", "oauth": "Google / Apple sign-in", "api": "app request" },
  "method": { "email": "email", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "Block IP",
    "banNet": "Block network",
    "banUser": "Ban",
    "inspect": "Inspect",
    "viewBan": "Ban",
    "session": "Session"
  },
  "csv": { "time": "Time", "type": "Type", "count": "Count", "source": "Source", "network": "Network", "account": "Account", "detail": "Detail" },
  "sources": {
    "title": "Top attempt sources",
    "ban": "Block",
    "banned": "Blocked",
    "empty": "No sources with attempts in the last 24 hours.",
    "openFeed": "Show this source's events",
    "unknownPlace": "Location unknown"
  },
  "srcBan": {
    "title": "Block {ip}?",
    "sub": "An access ban stops login, sign-up and connections from this address; admins are not affected.",
    "what": "What to block",
    "ip": "Only this IP",
    "network": "The whole network (/24)",
    "netWarn": "A network ban blocks everyone on the same network (for example a dorm or an office).",
    "duration": "Duration",
    "reasonPh": "E.g. 214 attempts on 37 accounts in 9 minutes",
    "privacy": "The address itself is never stored; the ban uses the encrypted fingerprint kept with the event.",
    "goIp": "Block IP",
    "goNet": "Block network",
    "banning": "Blocking…"
  },
  "banDur": { "1d": "1 day", "7d": "7 days", "30d": "30 days", "90d": "90 days", "permanent": "Permanent" },
  "evd": {
    "title": "Event",
    "when": "Time",
    "count": "Repeats",
    "countVal": "{n} times, first {from}",
    "source": "Source",
    "network": "Network",
    "account": "Account",
    "status": "Source status",
    "noSource": "No address (in-app)",
    "noAccount": "No account",
    "sourceBanned": "Banned",
    "sourceOpen": "Not banned",
    "openUser": "User file",
    "openBans": "Access bans",
    "allFromSource": "All events from this source",
    "copy": "Copy summary",
    "copied": "Copied",
    "timeline": "Recent events from the same source and account",
    "noRelated": "No other events."
  },
  "hist": {
    "heading": "Settings change history",
    "sub": "Every change to security settings, who made it and the value before",
    "filters": "Change type",
    "cat": { "all": "All", "locks": "Locks", "rateLimits": "Rate limits", "signup": "Sign-up protection", "access": "Access" },
    "system": "system",
    "before": "before",
    "after": "after",
    "noReason": "No reason given",
    "autoExpired": "Time ran out, the lock lifted itself",
    "revert": "Undo",
    "reverting": "Undoing…",
    "reverted": "Undone {user}",
    "isRevert": "Undo",
    "expired": "Expired",
    "confirmTitle": "Undo this change?",
    "revertOne": "{name} goes from {to} back to {from}.",
    "revertMany": "{n, plural, one {# setting goes} other {# settings go}} back to the previous value.",
    "revertLock": "The lock ({modes}) is lifted now.",
    "revertAudited": "The undo is written to the audit log too.",
    "stale": "This setting changed again since; undoing overwrites the latest value.",
    "reasonPh": "E.g. The raid is over, back to the normal limit.",
    "memoryOnly": "History is not durable yet: until the table exists it is lost when the server restarts.",
    "emptyTitle": "No changes yet",
    "emptyBody": "Every change to security and system settings appears here with its previous value.",
    "loadMore": "Older changes",
    "title": {
      "lock": "Emergency lock: {modes}",
      "lockLift": "Emergency lock lifted: {modes}",
      "lockExpired": "Emergency lock expired: {modes}",
      "lockExtend": "Emergency lock end changed: {modes}",
      "settings": "Security settings ({n})",
      "recommended": "Recommended settings applied",
      "revert": "Undone: {title}"
    }
  },
  "setting": {
    "registrationEnabled": "Sign-ups",
    "dmEnabled": "Direct messages",
    "readOnlyMode": "Read-only mode",
    "groupCreationEnabled": "Group creation",
    "maxLoginAttempts": "Login attempt limit",
    "maxMessagesPerMinute": "Message rate limit",
    "dmRateLimitMs": "DM spacing",
    "dmMinAccountAgeHours": "Minimum account age for DMs",
    "disposableEmailBlock": "Throwaway email block",
    "chatFrozen": "Chat freeze",
    "maintenanceMode": "Maintenance mode",
    "slowModeSeconds": "Slow mode",
    "rateLimitGlobalMs": "Global message spacing",
    "maxMessageLength": "Longest message"
  },
  "val": {
    "on": "on",
    "off": "off",
    "none": "none",
    "rule": "rollout rule",
    "untilLifted": "until lifted",
    "autoOnAt": "turns back on at {time}",
    "autoOffAt": "turns off at {time}"
  },
  "unit": { "perMin": "{n} / min", "ms": "{n} ms", "hours": "{n} h" },
  "alerts": {
    "title": "Alerts",
    "none": "Nothing needs attention right now.",
    "desktop": "Desktop notification on a brute-force wave",
    "desktopHint": "While this page is open, in this browser",
    "desktopBlocked": "The browser doesn't allow notifications.",
    "notifyTitle": "Brute-force wave",
    "notifyBody": "Login attempts on many accounts from {ip}",
    "burst": { "title": "Brute-force wave", "body": "From {ip}, {count} waves in the last 24 hours" },
    "lock": { "title": "{mode} is on", "body": "Lifts by itself in {time}" },
    "lockOpen": { "title": "{mode} is on with no end", "body": "Lasts until lifted" },
    "failedSpike": { "title": "Failed logins are up", "body": "{pct}% more than yesterday" },
    "lockedSpike": { "title": "Locked accounts are up", "body": "{n} more accounts locked than yesterday" },
    "admin2fa": { "title": "An admin has no 2FA", "body": "{missing} of {total} admins have no 2FA" }
  },
  "toast": {
    "saved": "Setting saved and added to the history.",
    "applied": "Recommendation applied.",
    "appliedAll": "{n, plural, one {# recommendation applied.} other {# recommendations applied.}}",
    "locked": "{n, plural, one {Lock started.} other {# locks started.}}",
    "lifted": "Lock lifted.",
    "extended": "Lock end updated.",
    "reverted": "Change undone.",
    "reminded": "Reminder sent to {n} admins, {online} saw it now.",
    "bannedIp": "IP blocked, {kicked} connections closed.",
    "bannedNet": "Network blocked, {kicked} connections closed.",
    "userBanned": "User banned."
  },
  "err": {
    "generic": "Something went wrong. Try again.",
    "load": "Could not load security data.",
    "REASON_REQUIRED": "Write a reason.",
    "ALREADY_ON": "This lock is already on.",
    "BAD_DURATION": "Invalid duration.",
    "NO_MODES": "Pick at least one lock.",
    "NOT_ON": "This lock is not on.",
    "LOCK_ENDED": "This lock already ended.",
    "ALREADY_REVERTED": "This change was already undone.",
    "NOT_REVERTIBLE": "This change can't be undone.",
    "ALREADY_BANNED": "This address is already banned.",
    "SOURCE_NOT_FOUND": "This source is no longer in the security feed.",
    "BANS_UNAVAILABLE": "Access bans are not enabled yet.",
    "ADMIN_PERMISSION_DENIED": "You don't have permission for this.",
    "STEP_UP_REQUIRED": "This action needs a verification code.",
    "replay": "This code was just used. Wait for the next code.",
    "invalid": "Wrong code."
  },
  "notice": {
    "dm": "Sending DMs is temporarily off.",
    "readOnly": "Descall is read-only for a short while; messages can't be sent right now.",
    "registration": "New sign-ups are temporarily closed.",
    "until": "Back around {time}.",
    "soon": "Back as soon as possible.",
    "dismiss": "Hide this band"
  }
};
