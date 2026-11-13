/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_DE = {
  roles: {
    section: "Rollen",
    subRole: "Rolle · ihre Mitglieder werden benachrichtigt",
    subRoleAdmin: "Rolle · nur Admins können sie erwähnen",
    subEveryone: "Benachrichtigt alle, die diesen Kanal sehen",
    subHere: "Benachrichtigt alle, die gerade online sind",
    unknown: "unbekannte Rolle",
    aria: "Rolle: {name}",
    popover: "Rolle · {name}",
    everyoneCooldown: "Du kannst @everyone oder @here in {wait} s wieder verwenden.",
  },
  preview: {
    settingDesc: "Wenn aus, zeigen App-, Browser- und Handy-Benachrichtigungen statt des Texts nur „Neue Nachricht“.",
    saveError: "Speichern fehlgeschlagen. Versuch es gleich noch einmal.",
  },
  schedule: {
    addAttachment: "Datei hinzufügen",
    attachmentHint: "Ein Foto oder eine Datei, bis 100 MB",
    attachment: "Anhang",
    attachmentKept: "Der Anhang bleibt; Text und Zeit kannst du ändern.",
    removeAttachment: "Anhang entfernen",
    errAttachment: "Diese Datei kann nicht geplant werden. Wähl ein Foto, Video oder Dokument.",
    errTooLarge: "Die Datei ist zu groß. Höchstens 100 MB.",
    errAttachNotReady: "Planen mit Datei ist auf dem Server noch nicht aktiv. Entferne die Datei, um nur den Text zu planen.",
    errUpload: "Die Datei konnte nicht hochgeladen werden. Prüf deine Verbindung und versuch es noch einmal.",
  },
  reengage: {
    friendVoice: "Freund im Sprachkanal",
    friendVoiceDesc: "Eine Benachrichtigung, wenn ein Freund einem Sprachkanal beitritt, dem du beitreten kannst, während du weg bist. Höchstens ein paar am Tag, nie nachts.",
    email: "E-Mail-Benachrichtigungen",
    emailDesc: "E-Mails zu verpassten Freundschaftsanfragen und Einladungen sowie ein paar Tipps für neue Konten.",
  },
  media: {
    imageFailed: "Bild konnte nicht geladen werden",
    videoFailed: "Video konnte nicht geladen werden",
  },
};
