/** Messaging phase 4 ("msg4.*"): drafts, unread jump, forwarding, link previews, Görüldü,
 * shortcuts, notification options, scheduled sending, Descall stickers. Same keys in every msg4.<locale>.js. */
export const MSG4_EN = {
  draft: {
    label: "Draft:",
  },
  unread: {
    pill: "{count, plural, one {# new message} other {# new messages}}",
    jump: "Jump to unread",
    dismiss: "Dismiss",
  },
  preview: {
    open: "Open link to {site}",
  },
  seen: {
    label: "Seen",
    at: "Seen at {time}",
    everyone: "Seen by everyone",
    by: "Seen by {names}",
    byMore: "Seen by {names} +{count}",
    section: "Messages",
    setting: "Read receipts",
    settingDesc: "If you turn this off, people will not see when you have read their messages, and you will not see theirs.",
    saveError: "Could not save. Try again in a moment.",
  },
  forward: {
    action: "Forward",
    label: "Forwarded",
    title: "Forward",
    search: "Search people, groups or channels",
    people: "People",
    groups: "Groups",
    channels: "Channels in this server",
    note: "Add a note (optional)",
    limit: "You can forward to up to {max} chats.",
    send: "Send",
    sendCount: "{count, plural, one {Send to # chat} other {Send to # chats}}",
    done: "{count, plural, one {Forwarded to # chat} other {Forwarded to # chats}}",
  },
};
