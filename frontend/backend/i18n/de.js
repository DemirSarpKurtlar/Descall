"use strict";

/**
 * German server-side catalog. Same key tree and {placeholders} as en.js
 * (backend/i18n/backendI18n.selftest.cjs). "du" address.
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} ist dein Descall-Bestätigungscode",
      eyebrow: "E-Mail-Bestätigung",
      title: "Willkommen bei Descall, {name}!",
      titleNoName: "Willkommen bei Descall!",
      intro: "Dein Konto ist bereit. Nur noch ein Schritt: Gib den Code unten in der App ein, um deine E-Mail-Adresse zu bestätigen.",
      preheader: "Dein Code: {code} · gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      ignore: "Wenn du dieses Konto nicht erstellt hast, kannst du diese E-Mail ignorieren. Die Adresse wird erst nach der Bestätigung mit einem Konto verknüpft.",
    },
    email_verify: {
      subject: "{code} ist dein Descall-Bestätigungscode",
      eyebrow: "E-Mail-Bestätigung",
      title: "Bestätige deine E-Mail-Adresse",
      intro: "Gib den Code unten in der App ein, um diese E-Mail-Adresse zu deinem Descall-Konto hinzuzufügen.",
      preheader: "Dein Code: {code} · gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      ignore: "Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren. Deine Adresse wird keinem Konto hinzugefügt.",
    },
    "2fa_login": {
      subject: "{code} ist dein Descall-Anmeldecode",
      eyebrow: "Anmeldecode",
      codeLabel: "Dein Anmeldecode",
      title: "Anmeldung abschließen",
      intro: "Gib diesen Code in Descall ein, um dich bei deinem Konto anzumelden.",
      preheader: "Dein Anmeldecode: {code} · gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      ignore: "Wenn du das nicht warst, kennt vielleicht jemand dein Passwort. Ändere es jetzt und aktiviere die Authenticator-App unter Einstellungen › Sicherheit.",
    },
    email_reauth: {
      subject: "{code} ist dein Descall-Bestätigungscode",
      eyebrow: "Kontosicherheit",
      codeLabel: "Dein Bestätigungscode",
      title: "Bist du das?",
      intro: "Gib diesen Code ein, um die E-Mail-Adresse deines Kontos zu ändern.",
      preheader: "Dein Bestätigungscode: {code} · gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      ignore: "Wenn du das nicht angefordert hast, gib den Code nicht weiter und ändere dein Passwort. Ohne den Code kann die Adresse nicht geändert werden.",
    },
    password_reset: {
      subject: "{code} ist dein Descall-Code zum Zurücksetzen des Passworts",
      eyebrow: "Passwort zurücksetzen",
      codeLabel: "Dein Code zum Zurücksetzen",
      title: "Setze dein Passwort zurück",
      intro: "Gib diesen Code in Descall ein, um ein neues Passwort festzulegen.",
      preheader: "Dein Code zum Zurücksetzen: {code} · gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      ignore: "Wenn du nicht darum gebeten hast, dein Passwort zurückzusetzen, kannst du diese E-Mail ignorieren; dein Passwort bleibt unverändert.",
    },
    common: {
      hi: "Hallo {name},",
      codeLabel: "Dein Code",
      valid: "Gültig für {minutes, plural, one {# Minute} other {# Minuten}}",
      copyHint: "Du kannst den Code markieren und kopieren.",
      never: "Das Descall-Team wird dich nie nach deinem Code fragen. Gib ihn an niemanden weiter.",
      nextTitle: "Wie geht es weiter?",
      step1Title: "Füge deine Freunde hinzu",
      step1Body: "Finde sie über ihren Benutzernamen oder teile deinen Einladungslink.",
      step2Title: "Tritt einem Server bei",
      step2Body: "Tritt einer Community bei oder erstelle in Sekunden deine eigene.",
      step3Title: "Leg los",
      step3Body: "Schreib Nachrichten, telefoniere per Sprach- und Videoanruf, teile deinen Bildschirm.",
      getApp: "Descall ist überall dabei",
      appWin: "Für Windows herunterladen",
      appIos: "Im App Store laden",
      appWeb: "Im Browser öffnen",
      help: "Brauchst du Hilfe?",
      write: "Schreib uns:",
      privacy: "Datenschutz",
      terms: "Nutzungsbedingungen",
      why: "Du erhältst diese E-Mail wegen einer Aktion in deinem Descall-Konto.",
      privacyPath: "/privacy",
      termsPath: "/terms",
      downloadPath: "/download",
      textCode: "Dein Code",
      textValid: "Gültig für {minutes, plural, one {# Minute} other {# Minuten}}.",
    },
  },

  // Product-update opt-in (lib/marketingOptIn.js): mail + the confirm / unsubscribe pages.
  marketing: {
    subject: "Bestätige Produkt-Updates von Descall",
    text: "Öffne diesen Link, um Produkt-Neuigkeiten von Descall zu bestätigen. Ohne Bestätigung schicken wir dir keine E-Mails.",
    htmlLead: "Öffne den Link unten, um Produkt-Neuigkeiten von Descall zu bestätigen. Ohne Bestätigung schicken wir dir keine E-Mails.",
    confirmLabel: "Abo bestätigen",
    pageConfirm: "Du bist bestätigt. Du kannst dich jederzeit abmelden.",
    pageGone: "Dieser Link ist ungültig oder wurde bereits verwendet.",
    pageUnsub: "Du bist abgemeldet. Wir schicken dir keine Produkt-E-Mails mehr.",
    unsubscribeAnyTime: "Jederzeit abmelden:",
    goToSite: "Zu descall.com",
  },

  // Native iOS alert push (lib/iosAlertPush.js) and web push (lib/webPush.js).
  push: {
    someone: "Jemand",
    newMessage: "Neue Nachricht",
    voice: "🎤 Sprachnachricht",
    media: "📎 Hat einen Anhang gesendet",
    photo: "📷 Foto",
    video: "🎬 Video",
    group: "Gruppe",
    mentioned: "{from} hat dich erwähnt",
    mentionedShort: "Hat dich erwähnt",
    friendTitle: "Freundschaftsanfrage",
    friendBody: "{from} möchte dich als Freund hinzufügen",
    calling: "{from} ruft an",
    voiceCall: "Sprachanruf",
    videoCall: "Videoanruf",
    groupCallTitle: "{groupName} — Gruppenanruf",
    groupCallBody: "{from} hat einen Gruppenanruf gestartet",
    ownerTitle: "Server-Eigentümerschaft",
    ownerBody: "Du bist jetzt Besitzer von {serverName}",
    ownerServerFallback: "dem Server",
    feedbackTitle: "Das Descall-Team hat geantwortet",
    feedbackBody: "Dein Feedback hat eine Antwort erhalten",
    antibotTitle: "Anti-Bot-Warnung",
    antibotBody: "{count, plural, one {# Konto hat} other {# Konten haben}} den Risikoschwellenwert überschritten (höchster Wert {topScore})",
    antibotWatchBody: "{count, plural, one {# neue Warnung der Beobachtungsliste} other {# neue Warnungen der Beobachtungsliste}}",
    // Web push + FCM (browser and Android notifications)
    voicePlain: "Sprachnachricht",
    attachmentPlain: "Hat einen Anhang gesendet",
    incomingCall: "Eingehender Anruf",
    incomingCallBody: "Jemand ruft dich auf Descall an",
    missedCallFrom: "Verpasster Anruf: {name}",
    answeredElsewhere: "Der Anruf wurde auf einem anderen Gerät angenommen.",
    declinedElsewhere: "Der Anruf wurde auf einem anderen Gerät abgelehnt.",
    missedCallBody: "Du hast den Anruf verpasst.",
    groupCall: "Gruppenanruf",
    groupCallDefaultBody: "Jemand hat auf Descall einen Gruppenanruf gestartet",
    groupCallJoinVoice: "Tritt dem Sprachanruf in deiner Gruppe bei.",
    groupCallJoinVideo: "Tritt dem Videoanruf in deiner Gruppe bei.",
    messageRequestTitle: "Nachrichtenanfrage",
    messageRequestBody: "{from} hat dir eine Nachrichtenanfrage gesendet",
  },

  // Default titles of maintenance windows (lib/maintenance.js).
  maintenance: {
    emergencyTitle: "Notfallwartung",
    plannedTitle: "Geplante Wartung",
  },

  // Names written into the database when a server is created (lib/starterChannelNames.js).
  starter: {
    textCategory: "Textkanäle",
    text: "allgemein",
    voiceCategory: "Sprachkanäle",
    voice: "Lobby",
  },

  // Account security notice (routes/auth.js notifyAccountChange).
  security: {
    passwordChangedSubject: "Dein Descall-Passwort wurde geändert",
    passwordChangedBody: "Das Passwort deines Descall-Kontos wurde gerade geändert. Wenn du das nicht warst, wende dich an den Support.",
    emailChangeSubject: "Änderung der E-Mail-Adresse bei Descall",
    emailChangeBody: "Es gibt eine Anfrage, die E-Mail-Adresse deines Descall-Kontos zu ändern. Wenn du das nicht warst, ändere jetzt dein Passwort und wende dich an den Support.",
  },

  // Personal data export file (lib/dataExport.js).
  dataExport: {
    note: "Eine Kopie der personenbezogenen Daten, die Descall zu diesem Konto speichert (Art. 15 DSGVO). Von dir gesendete Nachrichten sind enthalten; Nachrichten, die andere dir gesendet haben, sind deren Daten und daher nicht enthalten. Passwörter, Zwei-Faktor-Geheimnisse, Sitzungs- und Push-Schlüssel sind aus Sicherheitsgründen ausgenommen. Aufzeichnungen zur Verhinderung von Betrug und Missbrauch werden nicht offengelegt, damit sie nicht umgangen werden können. Wer dich gemeldet hat, wird nicht angezeigt.",
    filePrefix: "descall-meine-daten",
    accountFallback: "konto",
  },

  // Apple Watch previews (lib/watchApi.js).
  watch: {
    photo: "Foto",
    gif: "GIF",
    video: "Video",
    voice: "Sprachnachricht",
    file: "Datei",
    poll: "Umfrage",
    call: "Anruf",
  },

  // Admin sign-up statistics (lib/signupStats.js).
  stats: {
    weekOf: "Woche vom {date}",
    sourceDirect: "Direkt",
    sourceGoogleOrganic: "Google (organisch)",
    sourceReferral: "Einladung von Freunden",
    other: "Sonstige",
    unknown: "Unbekannt",
    csvPeriod: "zeitraum",
    csvSignups: "registrierungen",
    csvAverage: "durchschnitt",
    csvFilePrefix: "registrierungsstatistik",
  },

  // Server templates (lib/serverTemplates.js): written into the database in the creator's language.
  templates: {
    gaming: {
      name: "Gaming-Hub",
      description: "Squad-taugliches Layout mit Squad-Up-Kanal, Spiele-Chats, Clip-Drops, Team-Bereich und Sprach-Lobbys für Ranked.",
      descriptionSeed: "Eine Gaming-Community – finde Mitspieler, teile Clips und spring in den Sprachchat.",
      rulesText: "1) Sei respektvoll.\n2) Kein Hass, kein Spam und kein NSFW außerhalb markierter Kanäle.\n3) Halte Squad-Up-Posts klar (Spiel + Rang + Region).\n4) Entscheidungen des Teams sind endgültig.\n5) Hab Spaß und spiel fair.",
      highlights: ["Squad-Up-Kanal", "Clip-Kanal", "Team-Rollen", "Lobby-Sprachchat"],
      roles: ["Admin", "Moderator", "Helfer", "VIP", "Mitglied"],
      categories: [
        {
          name: "Willkommen",
          channels: [
            { name: "ankuendigungen", topic: "Offizielle Server-News und Patchnotes. Für Mitglieder schreibgeschützt." },
            { name: "regeln", topic: "Serverregeln – akzeptiere sie, bevor du in Community-Kanälen schreibst." },
            { name: "vorstellungen", topic: "Sag Hallo – Spiel, Rang, Region und was du spielst." },
          ],
        },
        {
          name: "Community",
          channels: [
            { name: "allgemein", topic: "Haupttreffpunkt für alles rund ums Gaming." },
            { name: "squad-suche", topic: "Squad-Up-Posts: Spiel · Rang · Region · Mikro ja/nein." },
            { name: "clips-und-highlights", topic: "Teile deine besten Clips und Screenshots." },
            { name: "memes", topic: "Bleib locker. Keine Belästigung." },
          ],
        },
        {
          name: "Sprach-Lobbys",
          channels: [
            { name: "Lobby" },
            { name: "Duo-Queue" },
            { name: "Fünfer-Team" },
            { name: "AFK / Chillen" },
            { name: "Turnierbühne", topic: "Watchpartys und Turnier-Briefings." },
          ],
        },
        {
          name: "Team",
          channels: [
            { name: "team-chat", topic: "Private Abstimmung im Team." },
            { name: "mod-logs", topic: "Moderationsnotizen und Fallprotokoll." },
            { name: "Team-Sprachkanal" },
          ],
        },
      ],
    },
    friends: {
      name: "Treffpunkt für Freunde",
      description: "Gemütliches Setup für private Gruppen – Lounge-Chat, Pläne, Musikabende und Sprachräume, die immer offen sind.",
      descriptionSeed: "Ein privater Treffpunkt für Freunde – Pläne, Memes und Sprachchat bis spät in die Nacht.",
      rulesText: "1) Halte Drama aus der Gruppe raus.\n2) Frag, bevor du neue Leute hinzufügst.\n3) Gib keine privaten Chats weiter.\n4) Schalte dich stumm, wenn du im gemeinsamen Sprachkanal AFK bist.\n5) Sei nett – das ist unser Ort.",
      highlights: ["Lounge-Chat", "Pläne-Board", "Musikabend", "Dauer-Sprachkanal"],
      roles: ["Admin", "Co-Host", "Bestie", "Freund"],
      categories: [
        {
          name: "Zuhause",
          channels: [
            { name: "lounge", topic: "Täglicher Chat – Memes willkommen." },
            { name: "plaene", topic: "Treffen, Watchpartys, Ausflüge." },
            { name: "fotos", topic: "Teile Bilder von Treffen und Ausflügen." },
            { name: "musik-und-links", topic: "Playlists, TikToks und zufällige Links." },
          ],
        },
        {
          name: "Sprachkanäle",
          channels: [
            { name: "Wohnzimmer" },
            { name: "Spätschicht" },
            { name: "Watchparty" },
            { name: "Lern mit mir" },
          ],
        },
        {
          name: "Privat",
          channels: [
            { name: "nur-hosts", topic: "Planung für Admins / Co-Hosts." },
          ],
        },
      ],
    },
    community: {
      name: "Community & Creator",
      description: "Öffentlich nutzbare Community mit Ankündigungen, Support, Events, Stage und vollständiger Team-Rangfolge.",
      descriptionSeed: "Eine Creator-freundliche Community – Ankündigungen, Support und Events.",
      rulesText: "1) Halte dich an die Nutzungsbedingungen von Discord/Descall.\n2) Kein Spam, kein Betrug und keine Eigenwerbung außerhalb von #werbung.\n3) Respektiere alle – null Toleranz für Hassrede.\n4) Nutze für jedes Thema den passenden Kanal.\n5) Wende dich für Hilfe in #support an das Team.",
      highlights: ["Ankündigungen", "Support-Bereich", "Events", "Stage"],
      roles: ["Besitzer-Team", "Admin", "Moderator", "Event-Host", "Mitwirkender", "Mitglied"],
      categories: [
        {
          name: "Starte hier",
          channels: [
            { name: "ankuendigungen", topic: "Offizielle Updates. Mitglieder können hier nicht posten." },
            { name: "regeln", topic: "Community-Richtlinien." },
            { name: "willkommen", topic: "Neue Mitglieder stellen sich hier vor." },
            { name: "rollen", topic: "Frag nach Interessenrollen / Mitwirkenden-Tags." },
          ],
        },
        {
          name: "Community",
          channels: [
            { name: "allgemein", topic: "Hauptunterhaltung." },
            { name: "support", topic: "Brauchst du Hilfe? Das Team antwortet hier." },
            { name: "events", topic: "Anstehende Events und Zusagen." },
            { name: "werbung", topic: "Eigenwerbung nur hier – ein Post pro Tag." },
            { name: "zeig-her", topic: "Teile deine Arbeiten, Streams und Erfolge." },
          ],
        },
        {
          name: "Sprache & Stage",
          channels: [
            { name: "Community-Lounge" },
            { name: "Collab-Raum" },
            { name: "Versammlung", topic: "AMAs, Ankündigungen und Live-Events." },
          ],
        },
        {
          name: "Team",
          channels: [
            { name: "team-chat", topic: "Interne Team-Diskussion." },
            { name: "mod-warteschlange", topic: "Meldungen und offene Moderationsfälle." },
            { name: "Team-Sprachkanal" },
          ],
        },
      ],
    },
    study: {
      name: "Lernen & Uni",
      description: "Fokusräume, Fachkanäle, Hausaufgabenhilfe, stiller Sprachkanal und Mentor-Rollen für Uni-Gruppen.",
      descriptionSeed: "Gemeinsam lernen – Fokus-Sessions, Hausaufgabenhilfe und Uni-Chat.",
      rulesText: "1) Halte Lernräume frei von Ablenkungen.\n2) Kein Schummeln / keine geleakten Prüfungen.\n3) Teile Materialien mit Quellenangabe.\n4) Nutze Fachkanäle für Hilfe zum jeweiligen Thema.\n5) Unterstütze andere – alle lernen in ihrem eigenen Tempo.",
      highlights: ["Fokusräume", "Hausaufgabenhilfe", "Stiller Sprachkanal", "Mentor-Rolle"],
      roles: ["Admin", "Moderator", "Mentor", "Lernbuddy", "Student"],
      categories: [
        {
          name: "Campus",
          channels: [
            { name: "ankuendigungen", topic: "Fristen, Sessions und Campus-News." },
            { name: "regeln", topic: "Richtlinien der Lern-Community." },
            { name: "vorstellungen", topic: "Studiengang, Semester und was du gerade lernst." },
          ],
        },
        {
          name: "Lernen",
          channels: [
            { name: "allgemein", topic: "Campus-Chat abseits der Fächer." },
            { name: "hausaufgabenhilfe", topic: "Stell Fragen – zeig deinen Lösungsweg." },
            { name: "materialien", topic: "Notizen, Links und Lernhilfen." },
            { name: "ziele", topic: "Tagesziele und Check-ins." },
          ],
        },
        {
          name: "Fokus-Sprachkanäle",
          channels: [
            { name: "Stiller Fokus" },
            { name: "Pomodoro-Raum" },
            { name: "Gruppenprojekt A" },
            { name: "Gruppenprojekt B" },
            { name: "Sprechstunde", topic: "Fragerunden mit Mentoren." },
          ],
        },
        {
          name: "Team",
          channels: [
            { name: "mentoren-raum", topic: "Mentoren + Mods koordinieren Hilfe-Sessions." },
          ],
        },
      ],
    },
    streaming: {
      name: "Streamer & Content",
      description: "Go-live-Benachrichtigungen, Clip-Tresor, Collab-Board, VIP-Lounge und Mod-/VIP-Rollen für Creator-Teams.",
      descriptionSeed: "Creator-Zentrale – Go-live-Pings, Clips, Collabs und VIP-Vorteile.",
      rulesText: "1) Unterstütze den Creator – keine Streams spoilern.\n2) Keine Spoiler in #live-chat während VODs.\n3) Eigenwerbung nur in #collabs.\n4) VIPs geben den Ton an – missbrauche deine Vorteile nicht.\n5) Mods setzen während Livestreams die Chatregeln durch.",
      highlights: ["Go-live-Kanal", "Clip-Tresor", "VIP-Lounge", "Mod-Team"],
      roles: ["Creator", "Moderator", "Cutter", "VIP", "Abonnent", "Zuschauer"],
      categories: [
        {
          name: "Übertragung",
          channels: [
            { name: "ankuendigungen", topic: "Zeitplan und große Releases." },
            { name: "go-live", topic: "Nur Live-Benachrichtigungen." },
            { name: "regeln", topic: "Chatregeln für Streams und VODs." },
          ],
        },
        {
          name: "Community",
          channels: [
            { name: "allgemein", topic: "Häng mit der Community ab." },
            { name: "live-chat", topic: "Aktiv während Streams – keine Spoiler." },
            { name: "clips", topic: "Die besten Momente aus Streams." },
            { name: "collabs", topic: "Collab-Anfragen und Shoutouts." },
            { name: "vorschlaege", topic: "Content-Ideen für den Creator." },
          ],
        },
        {
          name: "VIP",
          channels: [
            { name: "vip-lounge", topic: "Chat mit Vorteilen für VIPs / Abonnenten." },
            { name: "VIP-Sprachkanal" },
          ],
        },
        {
          name: "Sprachkanäle",
          channels: [
            { name: "Warteraum" },
            { name: "Collab-Sprachkanal" },
            { name: "Afterparty", topic: "Treffen nach dem Stream und AMAs." },
          ],
        },
        {
          name: "Team",
          channels: [
            { name: "mod-chat", topic: "Moderation während Livestreams." },
            { name: "Team-Sprachkanal" },
          ],
        },
      ],
    },
  },
};
