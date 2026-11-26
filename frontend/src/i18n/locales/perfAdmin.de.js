/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_DE = {
  "title": "Performance",
  "crumb": "System › Performance · Messungen echter Nutzer und Lighthouse CI",
  "sampling": "Stichprobe {pct}",
  "dataAgoSec": "Daten vor {n} s",
  "dataAgoMin": "Daten vor {n} min",
  "notReady": "Die Performance-Tabellen sind noch nicht eingerichtet (20261124v_perf.sql). Daten kommen, sobald die Migration angewendet ist.",
  "retry": "Erneut versuchen",
  "close": "Schließen",
  "cancel": "Abbrechen",
  "save": "Speichern",
  "saving": "Wird gespeichert…",
  "undo": "Rückgängig",
  "and": "und",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} s"
  },
  "tab": {
    "rum": "Echte Nutzer",
    "rumShort": "Nutzer",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Warnungen"
  },
  "live": {
    "long": "Live · {n} Sitzungen / 5 min",
    "short": "Live · {n}",
    "waiting": "Live · wartet",
    "title": "In den letzten 5 Minuten gemessene (Stichproben-)Seitenaufrufe"
  },
  "export": {
    "button": "Exportieren",
    "done": "{n} Zeilen als CSV heruntergeladen · im Protokoll vermerkt",
    "failed": "Export fehlgeschlagen."
  },
  "rules": {
    "button": "Warnregeln",
    "title": "Warnregel",
    "subtitle": "Meldet dem Admin-Raum und dir, wenn eine Metrik in einer neuen Version schlechter wird.",
    "metric": "Metrik",
    "platform": "Plattform",
    "condition": "Bedingung",
    "conditionText": "p75, gegenüber der vorigen Version",
    "threshold": "Verschlechterung",
    "thresholdUnit": "% oder mehr",
    "minSessions": "Mindestmessungen",
    "minUnit": "Messungen",
    "notify": "Benachrichtigen",
    "ch": {
      "adminRoom": "Admin-Raum (Systemnachricht)",
      "ownerPush": "Push an den Inhaber (Telefon)",
      "email": "E-Mail-Zusammenfassung",
      "errorLog": "Eintrag in Fehlerprotokollen öffnen"
    },
    "chSub": {
      "adminRoom": "Admins mit offenem Panel",
      "ownerPush": "Web, iOS, Android",
      "email": "einmal täglich",
      "errorLog": "einmal pro Warnung"
    },
    "mute": "Stummschalten",
    "muteOpt": {
      "none": "Nie",
      "release24h": "Gleiche Version 24 h",
      "7d": "7 Tage"
    },
    "save": "Regel speichern",
    "saved": "Regel gespeichert; die Änderung steht im Protokoll.",
    "previewTitle": "Vorschau · letzte 90 Tage",
    "previewSome": "Mal hätte sie ausgelöst: jedes Mal ein echter Rückschritt.",
    "previewNone": "Mal: In den letzten 90 Tagen hätte sie nie ausgelöst.",
    "previewInvalid": "Für die Vorschau mindestens eine Metrik und Plattform wählen.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "So sieht es im Admin-Raum aus",
    "roomOff": "Admin-Raum ist aus: diese Nachricht wird nicht gesendet.",
    "auditNote": "Regeländerungen stehen im Protokoll und lassen sich dort rückgängig machen."
  },
  "query": {
    "label": "Performance-Abfrage",
    "placeholder": "Filter hinzufügen: Seite, Plattform, Version, Gerät, Verbindung, Land, Nutzer-ID",
    "filters": "Filter",
    "remove": "Filter {label} entfernen",
    "suggestions": "Vorschläge"
  },
  "tok": {
    "range": "letzte",
    "platform": "Plattform",
    "version": "Version",
    "route": "Seite",
    "device": "Gerät",
    "connection": "Verbindung",
    "country": "Land",
    "user": "Nutzer"
  },
  "range": {
    "24h": "24 Stunden",
    "7d": "7 Tage",
    "28d": "28 Tage",
    "90d": "90 Tage"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Einfach",
    "mid": "Mittel",
    "high": "Leistungsstark"
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
    "msglist": "Erste Nachrichtenliste",
    "voicejoin": "Sprachbeitritt",
    "appstart": "App-Start"
  },
  "metricSub": {
    "lcp": "Größter Inhalt",
    "inp": "Interaktionslatenz",
    "cls": "Layoutverschiebung",
    "fcp": "Erster Inhalt",
    "ttfb": "Erstes Byte",
    "msglist": "beim Öffnen eines Chats",
    "voicejoin": "Raum verbinden",
    "appstart": "Kaltstart"
  },
  "dist": {
    "good": "Gut {pct}",
    "ni": "Mittel {pct}",
    "poor": "Schlecht {pct}"
  },
  "route": {
    "app_kanal": "Serverkanal",
    "app_dm": "Direktnachrichten",
    "app_grup": "Gruppenchat",
    "app_ses": "Sprachraum",
    "app": "App",
    "_": "Startseite",
    "_download": "Download-Seite",
    "_features": "Funktionen",
    "_login": "Anmelden",
    "_blog": "Blog"
  },
  "views": {
    "label": "Gespeicherte Ansichten",
    "all": "Alle",
    "mobileSlow": "Mobil · langsames Netz",
    "desktopStart": "Desktop-Start",
    "voice": "Sprachraum",
    "release": "{platform} {version}",
    "regression": "Rückschritt",
    "save": "Ansicht speichern",
    "copyLink": "Link kopieren",
    "linkCopied": "Link kopiert: Wer ihn öffnet, sieht dieselben Filter.",
    "notReady": "Gespeicherte Ansichten gibt es nach der Migration.",
    "menu": "Ansicht",
    "delete": "Ansicht löschen",
    "deleted": "„{name}“ gelöscht.",
    "saved": "„{name}“ gespeichert.",
    "saveTitle": "Ansicht speichern",
    "saveSubtitle": "Diese Filter sind mit einem Klick zurück.",
    "name": "Name",
    "namePh": "z. B. Android 4.1.4 Rückschritt",
    "contains": "Enthaltene Filter",
    "shared": "Mit anderen Admins teilen",
    "sharedSub": "Alle mit dem Bereich Performance sehen sie."
  },
  "alert": {
    "lead": "{version}: {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} Messungen.",
    "mostOn": "Vor allem auf",
    "also": "{n} weitere Warnungen.",
    "firstSeen": "Zuerst gesehen {when}.",
    "share": "Die Version läuft bei {pct} der Nutzer.",
    "review": "Prüfen",
    "errorLog": "Fehlereintrag öffnen",
    "errorAgain": "Fehlereintrag ansehen",
    "errorOpened": "Eintrag in den Fehlerprotokollen geöffnet.",
    "errorExists": "Für diese Warnung gibt es schon einen Eintrag.",
    "gotoErrors": "In Fehlerprotokollen öffnen",
    "hide": "Ausblenden",
    "hidden": "Warnung ausgeblendet (für alle).",
    "show": "Wieder anzeigen",
    "shown": "Warnung wird wieder angezeigt.",
    "vsPrev": "vorige Version {version}",
    "hasError": "Fehlereintrag offen"
  },
  "alerts": {
    "open": "Offene Warnungen",
    "hidden": "Ausgeblendet",
    "none": "Keine offenen Warnungen. Versionen über dem Schwellwert erscheinen hier.",
    "how": "Alle 15 Minuten wird die neueste Version je Plattform per p75 mit der vorigen verglichen; über dem Schwellwert öffnet sich eine Warnung."
  },
  "chart": {
    "title": "p75-Verlauf",
    "metric": "Diagramm-Metrik",
    "app": "App",
    "hint": "Linie anklicken: Plattform filtern",
    "aria": "{metric} p75-Verlauf nach Plattform",
    "goodLine": "Gut-Grenze · {value}",
    "tipTitle": "{when} · p75",
    "flag": "Flag: {name} {pct}",
    "flagOff": "aus",
    "empty": "Keine Daten in diesem Zeitraum.",
    "noData": "Keine Messungen mit diesen Filtern."
  },
  "releases": {
    "title": "Versionsvergleich",
    "version": "Version",
    "share": "Anteil",
    "start": "Start",
    "empty": "Noch keine Versionsdaten.",
    "mix": "Plattformanteil",
    "sessions": "{n} Sitzungen"
  },
  "group": {
    "route": "Seite",
    "platform": "Plattform",
    "version": "Version",
    "device": "Geräteklasse",
    "connection": "Verbindung",
    "country": "Land"
  },
  "table": {
    "title": {
      "route": "Langsamste Seiten",
      "platform": "Plattformen",
      "version": "Versionen",
      "device": "Geräteklassen",
      "connection": "Verbindungen",
      "country": "Länder"
    },
    "groupBy": "Gruppieren nach",
    "distOf": "Verteilung: {metric}",
    "sortBy": "Nach {metric} p75",
    "sortLabel": "Sortierung",
    "platform": "Plattform",
    "sessions": "Sitzungen",
    "dist": "Verteilung",
    "trend": "Verlauf",
    "empty": "Keine Messungen mit diesen Filtern.",
    "emptySub": "Filter lockern oder längeren Zeitraum wählen.",
    "rowMenu": "Zeilenaktionen",
    "open": "Details öffnen",
    "filterTo": "Nur {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Übersicht",
      "breakdown": "Aufschlüsselung",
      "attribution": "Zuordnung",
      "users": "Langsame Nutzer",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} Sitzungen",
    "allPlatforms": "alle Plattformen",
    "copy": "Wert kopieren",
    "copied": "Kopiert.",
    "heatTitle": "INP p75 · Plattform × Geräteklasse",
    "heatHint": "Zelle anklicken: Filter",
    "none": "keine",
    "samples": "{n} Messungen",
    "noData": "Keine Daten.",
    "attrTitle": "Zuordnung · langsamste Interaktionen (INP)",
    "attrEmpty": "Keine Zuordnungsdaten der letzten {days} Tage.",
    "itype": {
      "keyboard": "keydown · Tastatur",
      "pointer": "click · Tippen / Klick",
      "other": "Interaktion"
    },
    "shareOf": "{pct} der Interaktionen",
    "lcpEl": "LCP-Element:",
    "onPages": "{pct} der Aufrufe",
    "usersTitle": "Langsamste Nutzer",
    "usersHint": "nur Nutzer-ID",
    "usersEmpty": "Keine langsamen angemeldeten Nutzer.",
    "dossier": "Nutzerakte",
    "userSessions": "{n} Sitzungen dieses Nutzers",
    "userSessionsAll": "Sitzungen dieses Nutzers",
    "lhTitle": "Lighthouse · main",
    "lhNone": "Diese Seite misst Lighthouse CI nicht.",
    "lhApp": "App-Ansichten misst Lighthouse nicht, nur öffentliche Seiten.",
    "saveView": "Als Ansicht speichern",
    "openLh": "In Lighthouse öffnen",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Descall System",
    "badge": "SYSTEM",
    "text": "Performance-Warnung: {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} Messungen.",
    "open": "Im Panel öffnen"
  },
  "filters": {
    "title": "Filter",
    "subtitle": "Mehrere Werte möglich; leer heißt alles.",
    "userPh": "Nutzer-ID (ganz oder erste 8 Zeichen)",
    "clear": "Leeren",
    "apply": "Anwenden"
  },
  "err": {
    "generic": "Etwas ist schiefgelaufen.",
    "load": "Laden fehlgeschlagen.",
    "NO_METRIC": "Mindestens eine Metrik wählen.",
    "NO_PLATFORM": "Mindestens eine Plattform wählen.",
    "BAD_THRESHOLD": "Der Schwellwert muss zwischen 1 und 500 liegen.",
    "BAD_MIN_SESSIONS": "Mindestmessungen müssen 10 oder mehr sein.",
    "NAME_REQUIRED": "Namen eingeben.",
    "PERF_UNAVAILABLE": "Die Performance-Tabellen sind noch nicht eingerichtet."
  },
  "lh": {
    "placeholder": "PR-Nummer, Branch, Autor, Seite…",
    "tok": {
      "compare": "vergleichen",
      "state": "Status",
      "text": "Suche"
    },
    "rerun": "Alle neu starten",
    "rerunHint": "Öffnet den Lighthouse-Workflow in GitHub Actions",
    "view": {
      "open": "Offene PRs",
      "over": "Über Budget",
      "main": "main-Verlauf",
      "merged": "Zuletzt gemergt"
    },
    "method": "{pages} Seiten × 3 Läufe · Median",
    "lastRun": "letzter Lauf {when}",
    "minAgo": "vor {n} min",
    "hourAgo": "vor {n} h",
    "yesterday": "gestern",
    "overLead": "#{pr} überschreitet das Performance-Budget:",
    "budget": "(Budget {n}).",
    "bundle": "Hauptbundle {kb} KB (gzip).",
    "tbt": "Durchschnittliche TBT {ms} ms.",
    "openPr": "PR öffnen",
    "report": "Bericht ansehen",
    "empty": "Noch keine Lighthouse-Ergebnisse. Sie erscheinen nach dem nächsten PR- oder main-Lauf.",
    "cat": {
      "perf": "Performance",
      "a11y": "Barrierefreiheit",
      "best_practices": "Best Practices",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Perf",
      "a11y": "BF",
      "best_practices": "BP",
      "seo": "SEO"
    },
    "weekDelta": "{n} diese Woche",
    "weekFlat": "diese Woche unverändert",
    "thisWeek": "Diese Woche",
    "runs": "Läufe",
    "passed": "Bestanden {n}",
    "warned": "Warnung {n}",
    "over": "Überschritten {n}",
    "history": "main-Verlauf",
    "historySub": "letzte {n} Merges",
    "noHistory": "Das Diagramm braucht mindestens zwei main-Läufe.",
    "budgetLbl": "Budget · {n}",
    "perPage": "Pro Seite · main",
    "noMain": "Noch keine Ergebnisse für main.",
    "noindexNote": "App-Seiten sind absichtlich noindex; ihr SEO-Wert zählt nicht zum Budget.",
    "prs": "Pull Requests",
    "prsSub": "Unterschied zu main · Mittel aus {pages} Seiten",
    "author": "Autor",
    "state": "Status",
    "noPrs": "Keine Pull Requests in dieser Ansicht.",
    "st": {
      "over": "Budget überschritten",
      "warn": "Warnung",
      "pass": "Bestanden",
      "merged": "Gemergt",
      "mergedWarn": "Gemergt · Warnung"
    },
    "pr": "PR"
  },
  "new": "NEU"
};
