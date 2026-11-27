/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_EN = {
  "title": "Send to Descall",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# item} other {# items}}",
  "chats": "{count, plural, one {# chat} other {# chats}}",
  "cancel": "Cancel",
  "close": "Close",
  "done": "Done",
  "hide": "Hide",
  "options": "Options",
  "remove": "Remove",
  "search": "Search people, groups or channels",
  "clearSearch": "Clear search",
  "tabs": {
    "all": "All",
    "friends": "Friends",
    "groups": "Groups",
    "servers": "Servers"
  },
  "sec": {
    "friends": "Friends",
    "groups": "Groups",
    "channels": "Server channels",
    "suggested": "Suggested"
  },
  "server": {
    "channels": "{count, plural, one {# channel} other {# channels}}",
    "sendable": "You can post in {count}",
    "none": "No channel you can post in"
  },
  "saved": "{percent}% smaller",
  "presence": {
    "online": "Online",
    "idle": "Idle",
    "dnd": "Do not disturb",
    "offline": "Offline"
  },
  "row": {
    "channel": "Server channel",
    "slowMode": "Slow mode: {seconds}s",
    "lastShared": {
      "today": "You shared here last · today",
      "yesterday": "You shared here last · yesterday",
      "days": "You shared here last · {count} days ago"
    },
    "members": "{members} members",
    "membersOnline": "{members} members · {online} online",
    "groupShared": {
      "today": "{members} members · you shared {count} today",
      "yesterday": "{members} members · you shared {count} yesterday",
      "days": "{members} members · you shared {count} {days} days ago"
    },
    "dmShared": {
      "today": "{presence} · you shared {count} today",
      "yesterday": "{presence} · you shared {count} yesterday",
      "days": "{presence} · you shared {count} {days} days ago"
    }
  },
  "reason": {
    "no_permission": "You can't post here",
    "announcement": "You can't post here (moderators only)",
    "timed_out": "You are timed out",
    "no_attach": "You can't send files here",
    "blocked": "Blocked",
    "not_friends": "You are no longer friends",
    "unknown": "Not available",
    "rules_required": "Accept the server rules first",
    "failed": "Could not send",
    "offline": "Connection lost",
    "upload_failed": "Upload failed",
    "timeout": "Timed out",
    "too_large": "Over the 100 MB limit",
    "type": "This file type can't be sent",
    "slowmode": "Slow mode",
    "rate_limited": "Too fast; wait a moment",
    "content_blocked": "Blocked by the content filter",
    "attachment_unavailable": "Attachment unavailable",
    "signed_out": "Signed out",
    "cancelled": "Stopped",
    "too_many_scheduled": "Too many scheduled messages",
    "too_long": "Message is too long"
  },
  "message": "Add a message (optional)",
  "quality": {
    "original": "Original",
    "originalDesc": "Full resolution, 4K video kept · {size}",
    "high": "High (recommended)",
    "highDesc": "JPEG, 1080p video · {size}",
    "saver": "Data saver",
    "saverDesc": "Fast on mobile data · {size}",
    "chip": {
      "original": "Original",
      "high": "High",
      "saver": "Saver"
    },
    "title": "Send quality"
  },
  "location": {
    "title": "Remove location info",
    "desc": "GPS and device info in photos",
    "chipOn": "No location",
    "chipOff": "With location"
  },
  "silent": "Silent",
  "silentHint": "No notification; it still shows as unread",
  "scheduleChip": "Schedule",
  "scheduleTitle": "When should it go?",
  "schedule": {
    "inHour": "In 1 hour",
    "tonight": "Tonight 20:00",
    "tomorrow": "Tomorrow 09:00",
    "custom": "Pick a date and time",
    "set": "Set",
    "now": "Send now",
    "invalid": "Pick a time at least 1 minute ahead"
  },
  "send": "{count, plural, one {Send to # chat} other {Send to # chats}}",
  "sendShort": "{count, plural, one {# chat} other {# chats}}",
  "sendScheduled": "{count, plural, one {Schedule for # chat} other {Schedule for # chats}}",
  "pick": "Pick who gets it",
  "when": {
    "today": "today",
    "yesterday": "yesterday",
    "days": "{count} days ago"
  },
  "dup": {
    "link": "You sent this link to {name} {when}",
    "file": "You sent this to {name} {when}",
    "body": "It will still go. You can take {name} out of this send.",
    "remove": "Remove"
  },
  "limitTargets": "You can pick up to {count} chats",
  "limitItems": "Up to {count} items can be shared; the rest were left out",
  "targetRemoved": "{name} removed: {reason}",
  "errorTitle": "Couldn't load the list",
  "errorOffline": "No internet. Your share is queued once you send.",
  "retry": "Try again",
  "signedOutTitle": "You're not signed in to Descall",
  "signedOutBody": "Sign in in the Descall app first, then share again.",
  "openApp": "Open Descall",
  "emptyTitle": "Nobody here yet",
  "emptyBody": "Add friends or join a server and they show up here.",
  "emptySearch": "No results for “{query}”",
  "noItems": "Nothing to share",
  "run": {
    "title": "Sending",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Sending to # chat} other {Sending to # chats}}",
    "stats": "{sent} / {total} · {speed}/s · about {eta}s",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} items uploaded",
    "uploading": "Uploading · {percent}%",
    "queued": "Queued · the same files are not uploaded again",
    "sending": "Sending",
    "canClose": "You can close this sheet",
    "canCloseBody": "It keeps going in the background; you get a notification when it's done.",
    "background": "Continue in background",
    "stop": "Stop sending"
  },
  "sent": {
    "title": "Sent",
    "hero": "{count, plural, one {Sent to # chat} other {Sent to # chats}}",
    "sub": "{items} · {size} · in {seconds}s",
    "allArrived": "All delivered",
    "delivered": "Delivered · {time}",
    "open": "Open",
    "openInApp": "Open in Descall"
  },
  "undo": {
    "button": "Undo",
    "title": "Undo",
    "body": "Removed for everyone within {seconds}s",
    "bodyScheduled": "The schedule can be cancelled for {seconds}s",
    "busy": "Undoing…"
  },
  "scheduled": {
    "title": "Scheduled",
    "hero": "{count, plural, one {Scheduled for # chat} other {Scheduled for # chats}}",
    "sub": "Goes out {when}",
    "row": "Scheduled · {time}"
  },
  "slowRow": "Slow mode: the rest go from {time}",
  "partial": {
    "title": "Partly sent",
    "hero": "Sent to {done}/{count} chats",
    "sub": "{name}: {reason}",
    "itemsIn": "{ok}/{count} items arrived",
    "itemsFailed": "{count, plural, one {# item didn't go: {reason}} other {# items didn't go: {reason}}}",
    "retryOne": "Retry",
    "infoTitle": "What went through arrived",
    "infoBody": "A retry only sends what is missing; files are not uploaded again.",
    "retryFailed": "Retry what failed",
    "dropFailed": "Skip what failed, keep the rest"
  },
  "offline": {
    "title": "Not sent yet",
    "hero": "No internet connection",
    "subNone": "Nothing was sent",
    "subSome": "{done}/{count} chats done, the rest are waiting",
    "kept": "Kept on this device",
    "queuedTitle": "Queued",
    "queuedBody": "When you're back online, {items} go to {chats} by themselves. Follow it in the notification.",
    "row": "Queued · will retry by itself",
    "retryNow": "Try again now",
    "saveDraft": "Save as draft",
    "remove": "Remove from queue",
    "draftSaved": "Draft saved; send it from the notification"
  },
  "failed": {
    "title": "Not sent",
    "hero": "Couldn't send"
  },
  "undone": {
    "title": "Undone",
    "hero": "Share undone",
    "sub": "The messages were removed for everyone",
    "failed": "Some messages could not be removed"
  },
  "notif": {
    "channel": "Shares",
    "sending": "{count, plural, one {Sending to # chat} other {Sending to # chats}}",
    "sent": "Sent",
    "failedItems": "{count, plural, one {# item could not be sent} other {# items could not be sent}}",
    "waiting": "Waiting for internet · queued",
    "stop": "Stop",
    "undo": "Undo · {seconds}s",
    "openChat": "Open chat",
    "retry": "Try again",
    "details": "Details",
    "sendDraft": "Send",
    "draft": "Draft: {items} · {chats}"
  },
  "kind": {
    "photos": "Photos",
    "files": "Files",
    "link": "Link",
    "text": "Text"
  },
  "pdf": "PDF"
};
