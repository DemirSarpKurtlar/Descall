/** Messaging phase 4 ("msg4.*"): drafts, unread jump, forwarding, link previews, Görüldü,
 * shortcuts, notification options, scheduled sending, Descall stickers. Same keys in every msg4.<locale>.js. */
export const MSG4_DE = {
  draft: {
    label: "Entwurf:",
  },
  unread: {
    pill: "{count, plural, one {# neue Nachricht} other {# neue Nachrichten}}",
    jump: "Zu Ungelesenem",
    dismiss: "Ausblenden",
  },
  preview: {
    open: "Link zu {site} öffnen",
  },
  seen: {
    label: "Gesehen",
    at: "Gesehen um {time}",
    everyone: "Von allen gesehen",
    by: "Gesehen von {names}",
    byMore: "Gesehen von {names} +{count}",
    section: "Nachrichten",
    setting: "Lesebestätigungen",
    settingDesc: "Wenn du das ausschaltest, sieht niemand, wann du Nachrichten gelesen hast, und du siehst es bei anderen auch nicht.",
    saveError: "Speichern fehlgeschlagen. Versuch es gleich noch einmal.",
  },
  forward: {
    action: "Weiterleiten",
    label: "Weitergeleitet",
    title: "Weiterleiten",
    search: "Personen, Gruppen oder Kanäle suchen",
    people: "Personen",
    groups: "Gruppen",
    channels: "Kanäle auf diesem Server",
    note: "Notiz hinzufügen (optional)",
    limit: "Du kannst an bis zu {max} Chats weiterleiten.",
    send: "Senden",
    sendCount: "{count, plural, one {An # Chat senden} other {An # Chats senden}}",
    done: "{count, plural, one {An # Chat weitergeleitet} other {An # Chats weitergeleitet}}",
  },
};
