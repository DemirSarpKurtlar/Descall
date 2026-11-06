/** Messaging phase 4 ("msg4.*"): drafts, unread jump, forwarding, link previews, Görüldü,
 * shortcuts, notification options, scheduled sending, Descall stickers. Same keys in every msg4.<locale>.js. */
export const MSG4_FR = {
  draft: {
    label: "Brouillon :",
  },
  unread: {
    pill: "{count, plural, one {# nouveau message} other {# nouveaux messages}}",
    jump: "Aller aux non lus",
    dismiss: "Ignorer",
  },
  preview: {
    open: "Ouvrir le lien vers {site}",
  },
  seen: {
    label: "Vu",
    at: "Vu à {time}",
    everyone: "Vu par tout le monde",
    by: "Vu par {names}",
    byMore: "Vu par {names} +{count}",
    section: "Messages",
    setting: "Confirmations de lecture",
    settingDesc: "Si tu le désactives, personne ne verra quand tu as lu ses messages, et tu ne verras pas non plus les leurs.",
    saveError: "Impossible d'enregistrer. Réessaie dans un instant.",
  },
  forward: {
    action: "Transférer",
    label: "Transféré",
    title: "Transférer",
    search: "Rechercher des personnes, groupes ou salons",
    people: "Personnes",
    groups: "Groupes",
    channels: "Salons de ce serveur",
    note: "Ajouter une note (facultatif)",
    limit: "Tu peux transférer jusqu'à {max} discussions.",
    send: "Envoyer",
    sendCount: "{count, plural, one {Envoyer à # discussion} other {Envoyer à # discussions}}",
    done: "{count, plural, one {Transféré à # discussion} other {Transféré à # discussions}}",
  },
};
