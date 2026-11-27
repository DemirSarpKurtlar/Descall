/** Admin-Panel › Sicherheitszentrale ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_DE = {
  "title": "Sicherheitszentrale",
  "subtitle": "Angriffe live verfolgen, die Plattform mit einem Schritt sperren, jede Einstellungsänderung umkehrbar halten",
  "threatLevel": "Bedrohungsstufe: {level}",
  "level": { "normal": "Normal", "elevated": "Erhöht", "high": "Hoch" },
  "history": "Einstellungsverlauf",
  "alertsBtn": "Warnungen",
  "emergencyLock": "Notsperre",
  "live": "Live",
  "polling": "Alle 30 s",
  "loading": "Wird geladen…",
  "saving": "Wird gespeichert…",
  "retry": "Erneut versuchen",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "reason": "Grund",
  "reasonRequired": "Grund (Pflicht, wird im Prüfprotokoll gespeichert)",
  "memoryOnly": "Ereignisprotokoll und Einstellungsverlauf sind noch nicht dauerhaft: Bis die Datenbanktabellen existieren, gehen sie bei einem Serverneustart verloren.",
  "time": {
    "now": "jetzt",
    "nowCap": "Jetzt",
    "min": "{n} Min.",
    "hour": "{n} Std.",
    "day": "{n} T.",
    "hm": "{h} Std. {m} Min.",
    "hours": "{n, plural, one {# Stunde} other {# Stunden}}",
    "minutes": "{n, plural, one {# Minute} other {# Minuten}}",
    "today": "Heute {time}",
    "yesterday": "Gestern {time}",
    "yesterdayShort": "Gestern {time}"
  },
  "score": {
    "title": "Sicherheitswert",
    "how": "So wird er berechnet",
    "aria": "Sicherheitswert {score} von 100",
    "passed": "{passed} von {total} Prüfungen bestanden",
    "lastWeek": "Letzte Woche {n}",
    "firstWeek": "Erste Messung für den Wochenvergleich",
    "potential": "Mit {n, plural, one {# Empfehlung} other {# Empfehlungen}} wären es {score}",
    "allApplied": "Keine Empfehlungen mehr offen",
    "checks": "Sicherheitsprüfungen",
    "points": "+{n} Pkt.",
    "remind": "Erinnern",
    "remindGo": "Erinnerung senden",
    "viewLocks": "Sperren",
    "okSr": "bestanden"
  },
  "grade": { "excellent": "Sehr gut", "good": "Gut", "fair": "Mittel", "poor": "Schwach" },
  "check": {
    "humanCheck": {
      "name": "Menschenprüfung bei der Registrierung",
      "ok": "Menschenprüfung bei der Registrierung ist an (Cloudflare Turnstile)",
      "fail": "Menschenprüfung bei der Registrierung wird nicht erzwungen",
      "why": "Cloudflare Turnstile prüft bei Registrierung, Passwort-Reset und bei der Anmeldung nach wiederholt falschen Passwörtern auf Bots; die meisten sehen davon nichts. Der Schlüssel wird automatisch vom GitHub-Workflow \"Cloudflare Turnstile\" eingerichtet. Ist er eingerichtet, aber der Modus Überwachen oder Aus, macht die Empfehlung ihn wieder verpflichtend."
    },
    "admin2fa": {
      "name": "2FA für Admins",
      "ok": "Alle {total} Admins nutzen 2FA",
      "fail": "{missing} von {total} Admins ohne 2FA",
      "why": "Admins ohne 2FA können das Admin-Panel nicht öffnen. Die Erinnerung zeigt ihnen, falls sie gerade verbunden sind, einen Hinweis zum Einrichten der Authenticator-App."
    },
    "totpEnforced": {
      "name": "2FA-Pflicht für Admins",
      "ok": "Admin-Aktionen sind per Code geschützt",
      "fail": "2FA-Pflicht für Admins ist nicht aktiv",
      "why": "Solange die Authenticator-Tabellen fehlen, verlangen Admin-Aktionen keinen Code. Die Datenbankmigration muss angewendet werden."
    },
    "dmMinAge": {
      "name": "Mindestalter des Kontos für DMs",
      "ok": "Mindestalter für DMs: {hours} Std.",
      "fail": "Kein Mindestalter des Kontos für DMs",
      "why": "Ganz neue Konten können in den ersten Stunden keine Massen-DMs senden; das bremst die meisten Spam- und Phishing-Wellen. Empfohlen: 24 Stunden."
    },
    "loginLimit": {
      "name": "Limit für Anmeldeversuche",
      "ok": "Anmeldeversuche: {n} / Min.",
      "fail": "Limit für Anmeldeversuche zu hoch ({n} / Min.)",
      "why": "Falsche Passwortversuche pro Konto und Minute. Ein niedriger Wert bremst Brute-Force-Angriffe. Empfohlen: 5 / Min."
    },
    "disposableEmail": {
      "name": "Sperre für Wegwerf-E-Mails",
      "ok": "Sperre für Wegwerf-E-Mails ist an",
      "fail": "Sperre für Wegwerf-E-Mails ist aus",
      "why": "Lehnt Registrierungen mit temporären E-Mail-Diensten (tempmail, yopmail…) ab, der häufigsten Quelle für Bot-Konten."
    },
    "messageRate": {
      "name": "Nachrichtenlimit",
      "ok": "Nachrichtenlimit {n} / Min.",
      "fail": "Nachrichtenlimit außerhalb des sicheren Bereichs ({n} / Min.)",
      "why": "Nachrichten pro Person und Minute. Zwischen 1 und 120 begrenzt es Spam-Angriffe. Empfohlen: 60 / Min."
    },
    "dmRate": {
      "name": "Abstand zwischen DMs",
      "ok": "Abstand zwischen DMs {ms} ms",
      "fail": "Abstand zwischen DMs zu kurz ({ms} ms)",
      "why": "Kürzeste Zeit zwischen zwei DMs. Ist sie zu kurz, können Skripte Dutzende DMs pro Sekunde senden. Empfohlen: 200 ms."
    },
    "accessBans": {
      "name": "Zugangssperren",
      "ok": "IP- und Gerätesperren funktionieren",
      "fail": "IP- und Gerätesperren funktionieren nicht",
      "why": "Die Tabellen für Zugangssperren oder der Signaturschlüssel fehlen; IP- und Netzwerksperren stoppen derzeit niemanden."
    },
    "eventLog": {
      "name": "Sicherheitsereignisprotokoll",
      "ok": "Sicherheitsereignisse werden dauerhaft gespeichert",
      "fail": "Sicherheitsereignisse nur im Speicher",
      "why": "Bis die Ereignistabelle existiert, geht der Live-Feed bei einem Neustart verloren und es gibt keinen Wochenvergleich."
    },
    "auditLog": {
      "name": "Prüfprotokoll",
      "ok": "Prüfprotokoll ist dauerhaft",
      "fail": "Prüfprotokoll ist nicht dauerhaft",
      "why": "Die Tabelle des Prüfprotokolls fehlt; Admin-Aktionen werden nur im Speicher gehalten."
    },
    "noOpenLock": {
      "name": "Unbefristete Sperre",
      "ok": "Keine Sperre ohne Ende aktiv",
      "fail": "Unbefristete Sperre aktiv: {modes}",
      "why": "Eine Notsperre bis zum manuellen Aufheben trifft Nutzer unnötig, wenn sie vergessen wird."
    }
  },
  "explain": {
    "title": "So wird der Wert berechnet",
    "body": "Jede Prüfung hat ein Gewicht; der Wert ist der Anteil des bestandenen Gewichts am Gesamtgewicht (von 100). Er wird alle 12 Stunden gespeichert und mit der Vorwoche verglichen.",
    "grades": "Ab 90 sehr gut, ab 75 gut, ab 50 mittel, darunter schwach."
  },
  "fix": {
    "title": "Empfehlung anwenden",
    "sets": "Setzt",
    "score": "Wert",
    "apply": "Anwenden",
    "all": "Alle anwenden ({n})"
  },
  "threat": {
    "title": "Bedrohungsübersicht",
    "window": "letzte 24 Stunden",
    "spike": "{time} Brute-Force-Welle",
    "calm": "Keine Brute-Force-Welle",
    "chartAria": "Fehlgeschlagene Anmeldungen, Ratenlimits und blockierte IPs der letzten 24 Stunden"
  },
  "kpi": {
    "failed": "Fehlanmeldungen",
    "locked": "Gesperrte Konten",
    "blocked": "Blockierte IPs",
    "rate": "Limittreffer",
    "vsYesterday": "{pct} ggü. gestern",
    "flat": "wie gestern",
    "new": "gestern keine",
    "activeBans": "{n} aktive Sperren"
  },
  "legend": { "failed": "Fehlanmeldungen", "rate": "Ratenlimit", "blocked": "Blockierte IPs" },
  "locks": {
    "title": "Notsperren",
    "liftAll": "Alle aufheben",
    "permanent": "Dauerhafte Zugangseinstellungen",
    "fromSystem": "Aus System aktiv",
    "sysChatFrozen": "Chat ist eingefroren",
    "chatFrozenSub": "Niemand kann Nachrichten senden",
    "regOff": "Registrierungen sind aus",
    "regOffSub": "Es können keine neuen Konten erstellt werden",
    "openSystem": "System öffnen",
    "liftsIn": "Endet in {time}",
    "untilLifted": "Bis zum Aufheben",
    "detailAria": "Details der Sperre {name}"
  },
  "lockMode": {
    "registration": {
      "name": "Registrierungsstopp",
      "short": "Registrierungsstopp",
      "desc": "Keine neuen Konten",
      "long": "Keine neuen Konten (E-Mail, Google, Apple). Bestehende Konten können sich weiter anmelden."
    },
    "dm": {
      "name": "DM-Stopp",
      "short": "DM-Stopp",
      "desc": "Keine neuen DMs",
      "long": "Keine neuen Direktnachrichten; Server- und Gruppenchats bleiben offen."
    },
    "readOnly": {
      "name": "Nur-Lesen-Modus",
      "short": "Nur-Lesen-Modus",
      "desc": "Niemand kann Nachrichten senden",
      "long": "Nirgends Nachrichten, keine neuen Gruppen oder Server."
    }
  },
  "perm": {
    "groups": {
      "name": "Gruppen erstellen",
      "on": "Nutzer können neue Gruppen erstellen",
      "off": "Neue Gruppen sind nicht möglich",
      "offTitle": "Gruppenerstellung ausschalten?",
      "offBody": "Nutzer können keine neuen Gruppen erstellen; bestehende Gruppen laufen weiter. Admins sind nicht betroffen."
    },
    "dm": {
      "name": "Direktnachrichten",
      "on": "DMs sind an",
      "off": "DMs sind aus",
      "offTitle": "Direktnachrichten dauerhaft ausschalten?",
      "offBody": "Niemand kann neue DMs senden; das ist eine dauerhafte Einstellung und schaltet sich nicht selbst wieder ein. Für eine vorübergehende Pause den DM-Stopp nutzen."
    },
    "offGo": "Ausschalten"
  },
  "lift": {
    "title": "{name} aufheben?",
    "titleAll": "{n, plural, one {# Sperre} other {# Sperren}} aufheben?",
    "body": "Die Einstellungen kehren zum Zustand vor der Sperre zurück, das Infoband der Nutzer verschwindet und es wird protokolliert.",
    "go": "Sperre aufheben"
  },
  "lockInfo": {
    "reason": "Grund",
    "by": "Gestartet von",
    "started": "Begonnen",
    "ends": "Ende",
    "band": "Infoband",
    "extend": "Verlängern",
    "plus": "+{time}",
    "lift": "Sperre aufheben"
  },
  "lockDlg": {
    "title": "Notsperre starten",
    "sub": "Die gewählten Modi gelten sofort auf der ganzen Plattform; Admins sind nicht betroffen.",
    "modes": "Sperren",
    "alreadyOn": "Aktiv · {time}",
    "duration": "Endet automatisch",
    "reason": "Grund (Pflicht, wird im Prüfprotokoll gespeichert)",
    "reasonPh": "Was passiert? Z. B. seit 20:09 Brute-Force und eine Bot-Registrierungswelle von einer Quelle.",
    "code": "Bestätigungscode",
    "banner": "Nutzern ein Infoband zeigen",
    "pickOne": "Mindestens eine Sperre wählen",
    "starting": "Wird gestartet…",
    "confirm": {
      "15m": "{n, plural, one {Für 15 Minuten sperren} other {# Sperren für 15 Minuten starten}}",
      "1h": "{n, plural, one {Für 1 Stunde sperren} other {# Sperren für 1 Stunde starten}}",
      "6h": "{n, plural, one {Für 6 Stunden sperren} other {# Sperren für 6 Stunden starten}}",
      "24h": "{n, plural, one {Für 24 Stunden sperren} other {# Sperren für 24 Stunden starten}}",
      "manual": "{n, plural, one {Bis zum Aufheben sperren} other {# Sperren bis zum Aufheben starten}}"
    },
    "impact": "Auswirkungsvorschau",
    "online": "Nutzer online",
    "signups": "Neue Registrierungen, letzte Stunde",
    "dms": "Neue DMs, letzte Stunde",
    "autoEnd": "Endet automatisch",
    "bandTitle": "Band, das Nutzer sehen",
    "device": "Vorschaugerät",
    "desktop": "Desktop",
    "phone": "Telefon",
    "noBand": "Es wird kein Infoband angezeigt",
    "pickForBand": "Wähle eine Sperre, um das Band hier zu sehen",
    "registrationWhere": "Wer sich registrieren will, sieht das auf dem Registrierungsbildschirm.",
    "noteAuto": "Nach Ablauf kehren die Einstellungen zum Zustand vor der Sperre zurück und der Admin-Raum wird benachrichtigt.",
    "noteManual": "Die Sperre gilt, bis du sie aufhebst. Sie erscheint in den Warnungen und im Wert, damit sie nicht vergessen wird."
  },
  "duration": { "15m": "15 Min.", "1h": "1 Stunde", "6h": "6 Stunden", "24h": "24 Stunden", "manual": "Bis zum Aufheben" },
  "band": {
    "registration": "Neue Registrierungen sind vorübergehend geschlossen. {when}",
    "dm": "DMs senden ist vorübergehend aus. {when}",
    "readOnly": "Descall ist kurz im Nur-Lesen-Modus. Nachrichten können nicht gesendet werden. {when}",
    "when": {
      "15m": "Wieder da in etwa 15 Minuten.",
      "1h": "Wieder da in etwa 1 Stunde.",
      "6h": "Wieder da in etwa 6 Stunden.",
      "24h": "Wieder da in etwa 24 Stunden."
    },
    "whenManual": "So bald wie möglich wieder da."
  },
  "feed": {
    "title": "Live-Bedrohungsfeed",
    "sub": "Anmelde-, Registrierungs-, Ratenlimit- und Zugangssperren-Ereignisse",
    "openAll": "Alle zeigen",
    "collapse": "Einklappen",
    "filters": "Ereignistyp",
    "pause": "Feed pausieren",
    "resume": "Feed fortsetzen",
    "export": "Als CSV herunterladen",
    "newEvents": "{n, plural, one {# neues Ereignis · zeigen} other {# neue Ereignisse · zeigen}}",
    "emptyTitle": "Alles ruhig",
    "emptyBody": "Zuletzt keine Sicherheitsereignisse. Neue erscheinen hier live.",
    "emptyFilter": "Keine Ereignisse dieses Typs.",
    "loadMore": "Ältere Ereignisse",
    "sourceFilter": "Quelle: {ip}",
    "clearSource": "Quellenfilter entfernen"
  },
  "filter": {
    "all": "Alle",
    "bruteForce": "Brute Force",
    "failedLogin": "Fehlanmeldung",
    "blockedIp": "Blockierte IP",
    "rateLimit": "Ratenlimit",
    "signupDenied": "Registrierung abgelehnt"
  },
  "ev": {
    "unknownAccount": "ein nicht existierendes Konto",
    "brute_force": {
      "title": "Brute-Force-Angriff",
      "line": "{attempts} Versuche auf {accounts} Konten in {minutes} Min.",
      "lineUser": "{attempts} Versuche auf {accounts} Konten inkl. {user} in {minutes} Min."
    },
    "failed_login": {
      "title": "Fehlgeschlagene Anmeldung",
      "lineUser": "{user} · falsches Passwort, {n} Versuche",
      "lineUnknown": "Unbekannter Benutzername · {n} Versuche"
    },
    "account_locked": {
      "title": "Konto vorübergehend gesperrt",
      "lineMinute": "{user} · {n} Fehlanmeldungen in 1 Minute, Wartezeit",
      "lineWindow": "{user} · zu viele Versuche in 15 Minuten, {n}-mal abgelehnt"
    },
    "ip_blocked": {
      "title": "IP-Limit überschritten",
      "lineLogin": "Anmeldeversuche über dem IP-Limit · {n}-mal abgelehnt",
      "lineRegister": "Registrierungsversuche über dem IP-Limit · {n}-mal abgelehnt"
    },
    "access_ban": {
      "title": "An Zugangssperre gescheitert",
      "line": "{kind} {label} · {action}-Versuch"
    },
    "rate_limit": {
      "title": "Ratenlimit überschritten",
      "line": "{user} · Nachrichtenlimit {limit} / Min., {n} Versuche abgelehnt"
    },
    "signup_denied": {
      "title": "Registrierung abgelehnt",
      "lineDisposable": "{email} · Wegwerf-E-Mail",
      "lineClosed": "Registrierung über {method} bei geschlossenen Registrierungen · {n} Versuche",
      "lineHumanCheck": "{method}-Registrierung von der Menschenprüfung gestoppt · {n} Versuche"
    },
    "admin_step_up": {
      "title": "Admin-Bestätigung",
      "lineOk": "{user} · Code richtig",
      "lineFail": "{user} · falscher Code, {n} Versuche"
    }
  },
  "banKind": { "ip": "IP-Sperre", "network": "Netzwerksperre", "device": "Gerätesperre" },
  "banAction": { "login": "Anmelde", "register": "Registrierungs", "socket": "Verbindungs", "oauth": "Google-/Apple-Anmelde", "api": "App-Anfrage" },
  "method": { "email": "E-Mail", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "IP blockieren",
    "banNet": "Netzwerk blockieren",
    "banUser": "Sperren",
    "inspect": "Prüfen",
    "viewBan": "Sperre",
    "session": "Sitzung"
  },
  "csv": { "time": "Zeit", "type": "Typ", "count": "Anzahl", "source": "Quelle", "network": "Netzwerk", "account": "Konto", "detail": "Details" },
  "sources": {
    "title": "Häufigste Angriffsquellen",
    "ban": "Blockieren",
    "banned": "Blockiert",
    "empty": "Keine Quellen mit Versuchen in den letzten 24 Stunden.",
    "openFeed": "Ereignisse dieser Quelle zeigen",
    "unknownPlace": "Ort unbekannt"
  },
  "srcBan": {
    "title": "{ip} blockieren?",
    "sub": "Eine Zugangssperre stoppt Anmeldung, Registrierung und Verbindungen von dieser Adresse; Admins sind nicht betroffen.",
    "what": "Was blockieren",
    "ip": "Nur diese IP",
    "network": "Ganzes Netzwerk (/24)",
    "netWarn": "Eine Netzwerksperre blockiert alle im selben Netzwerk (z. B. ein Wohnheim oder Büro).",
    "duration": "Dauer",
    "reasonPh": "Z. B. 214 Versuche auf 37 Konten in 9 Minuten",
    "privacy": "Die Adresse selbst wird nie gespeichert; die Sperre nutzt den verschlüsselten Fingerabdruck des Ereignisses.",
    "goIp": "IP blockieren",
    "goNet": "Netzwerk blockieren",
    "banning": "Wird blockiert…"
  },
  "banDur": { "1d": "1 Tag", "7d": "7 Tage", "30d": "30 Tage", "90d": "90 Tage", "permanent": "Dauerhaft" },
  "evd": {
    "title": "Ereignis",
    "when": "Zeit",
    "count": "Wiederholungen",
    "countVal": "{n}-mal, zuerst {from}",
    "source": "Quelle",
    "network": "Netzwerk",
    "account": "Konto",
    "status": "Status der Quelle",
    "noSource": "Keine Adresse (in der App)",
    "noAccount": "Kein Konto",
    "sourceBanned": "Gesperrt",
    "sourceOpen": "Nicht gesperrt",
    "openUser": "Nutzerakte",
    "openBans": "Zugangssperren",
    "allFromSource": "Alle Ereignisse dieser Quelle",
    "copy": "Zusammenfassung kopieren",
    "copied": "Kopiert",
    "timeline": "Letzte Ereignisse derselben Quelle und desselben Kontos",
    "noRelated": "Keine weiteren Ereignisse."
  },
  "hist": {
    "heading": "Verlauf der Einstellungsänderungen",
    "sub": "Jede Änderung an Sicherheitseinstellungen, wer sie gemacht hat und der vorherige Wert",
    "filters": "Art der Änderung",
    "cat": { "all": "Alle", "locks": "Sperren", "rateLimits": "Ratenlimits", "signup": "Registrierungsschutz", "access": "Zugang" },
    "system": "System",
    "before": "vorher",
    "after": "nachher",
    "noReason": "Kein Grund angegeben",
    "autoExpired": "Zeit abgelaufen, die Sperre hat sich selbst aufgehoben",
    "revert": "Rückgängig",
    "reverting": "Wird rückgängig gemacht…",
    "reverted": "Rückgängig gemacht {user}",
    "isRevert": "Rücknahme",
    "expired": "Abgelaufen",
    "confirmTitle": "Diese Änderung rückgängig machen?",
    "revertOne": "{name} geht von {to} zurück auf {from}.",
    "revertMany": "{n, plural, one {# Einstellung geht} other {# Einstellungen gehen}} auf den vorherigen Wert zurück.",
    "revertLock": "Die Sperre ({modes}) wird jetzt aufgehoben.",
    "revertAudited": "Auch die Rücknahme wird protokolliert.",
    "stale": "Diese Einstellung hat sich seitdem erneut geändert; die Rücknahme überschreibt den letzten Wert.",
    "reasonPh": "Z. B. Der Angriff ist vorbei, zurück zum normalen Limit.",
    "memoryOnly": "Der Verlauf ist noch nicht dauerhaft: Bis die Tabelle existiert, geht er bei einem Neustart verloren.",
    "emptyTitle": "Noch keine Änderungen",
    "emptyBody": "Jede Änderung an Sicherheits- und Systemeinstellungen erscheint hier mit dem vorherigen Wert.",
    "loadMore": "Ältere Änderungen",
    "title": {
      "lock": "Notsperre: {modes}",
      "lockLift": "Notsperre aufgehoben: {modes}",
      "lockExpired": "Notsperre abgelaufen: {modes}",
      "lockExtend": "Ende der Notsperre geändert: {modes}",
      "settings": "Sicherheitseinstellungen ({n})",
      "recommended": "Empfohlene Einstellungen angewendet",
      "revert": "Rückgängig: {title}"
    }
  },
  "setting": {
    "turnstileMode": "Menschenprüfung (Turnstile)",
    "registrationEnabled": "Registrierungen",
    "dmEnabled": "Direktnachrichten",
    "readOnlyMode": "Nur-Lesen-Modus",
    "groupCreationEnabled": "Gruppen erstellen",
    "maxLoginAttempts": "Limit für Anmeldeversuche",
    "maxMessagesPerMinute": "Nachrichtenlimit",
    "dmRateLimitMs": "Abstand zwischen DMs",
    "dmMinAccountAgeHours": "Mindestalter des Kontos für DMs",
    "disposableEmailBlock": "Sperre für Wegwerf-E-Mails",
    "chatFrozen": "Chat einfrieren",
    "maintenanceMode": "Wartungsmodus",
    "slowModeSeconds": "Langsamer Modus",
    "rateLimitGlobalMs": "Globaler Nachrichtenabstand",
    "maxMessageLength": "Längste Nachricht"
  },
  "val": {
    "on": "an",
    "off": "aus",
    "none": "keins",
    "rule": "Rollout-Regel",
    "untilLifted": "bis zum Aufheben",
    "autoOnAt": "geht um {time} wieder an",
    "autoOffAt": "geht um {time} aus"
  },
  "unit": { "perMin": "{n} / Min.", "ms": "{n} ms", "hours": "{n} Std." },
  "alerts": {
    "title": "Warnungen",
    "none": "Gerade braucht nichts Aufmerksamkeit.",
    "desktop": "Desktop-Benachrichtigung bei einer Brute-Force-Welle",
    "desktopHint": "Solange diese Seite offen ist, in diesem Browser",
    "desktopBlocked": "Der Browser erlaubt keine Benachrichtigungen.",
    "notifyTitle": "Brute-Force-Welle",
    "notifyBody": "Anmeldeversuche auf viele Konten von {ip}",
    "burst": { "title": "Brute-Force-Welle", "body": "Von {ip}, {count} Wellen in den letzten 24 Stunden" },
    "lock": { "title": "{mode} ist aktiv", "body": "Endet von selbst in {time}" },
    "lockOpen": { "title": "{mode} ist ohne Ende aktiv", "body": "Gilt bis zum Aufheben" },
    "failedSpike": { "title": "Mehr Fehlanmeldungen", "body": "{pct}% mehr als gestern" },
    "lockedSpike": { "title": "Mehr gesperrte Konten", "body": "{n} Konten mehr gesperrt als gestern" },
    "admin2fa": { "title": "Ein Admin hat kein 2FA", "body": "{missing} von {total} Admins ohne 2FA" }
  },
  "toast": {
    "saved": "Einstellung gespeichert und im Verlauf vermerkt.",
    "applied": "Empfehlung angewendet.",
    "appliedAll": "{n, plural, one {# Empfehlung angewendet.} other {# Empfehlungen angewendet.}}",
    "locked": "{n, plural, one {Sperre gestartet.} other {# Sperren gestartet.}}",
    "lifted": "Sperre aufgehoben.",
    "extended": "Ende der Sperre aktualisiert.",
    "reverted": "Änderung rückgängig gemacht.",
    "reminded": "Erinnerung an {n} Admins gesendet, {online} haben sie jetzt gesehen.",
    "bannedIp": "IP blockiert, {kicked} Verbindungen getrennt.",
    "bannedNet": "Netzwerk blockiert, {kicked} Verbindungen getrennt.",
    "userBanned": "Nutzer gesperrt."
  },
  "err": {
    "generic": "Etwas ist schiefgelaufen. Versuch es erneut.",
    "load": "Sicherheitsdaten konnten nicht geladen werden.",
    "REASON_REQUIRED": "Gib einen Grund an.",
    "ALREADY_ON": "Diese Sperre ist bereits aktiv.",
    "BAD_DURATION": "Ungültige Dauer.",
    "NO_MODES": "Wähle mindestens eine Sperre.",
    "NOT_ON": "Diese Sperre ist nicht aktiv.",
    "LOCK_ENDED": "Diese Sperre ist bereits beendet.",
    "ALREADY_REVERTED": "Diese Änderung wurde bereits rückgängig gemacht.",
    "NOT_REVERTIBLE": "Diese Änderung kann nicht rückgängig gemacht werden.",
    "ALREADY_BANNED": "Diese Adresse ist bereits gesperrt.",
    "SOURCE_NOT_FOUND": "Diese Quelle ist nicht mehr im Sicherheitsfeed.",
    "BANS_UNAVAILABLE": "Zugangssperren sind noch nicht aktiviert.",
    "ADMIN_PERMISSION_DENIED": "Dafür fehlt dir die Berechtigung.",
    "STEP_UP_REQUIRED": "Diese Aktion braucht einen Bestätigungscode.",
    "replay": "Dieser Code wurde gerade verwendet. Warte auf den nächsten.",
    "invalid": "Falscher Code."
  },
  "notice": {
    "dm": "DMs senden ist vorübergehend aus.",
    "readOnly": "Descall ist kurz im Nur-Lesen-Modus; gerade können keine Nachrichten gesendet werden.",
    "registration": "Neue Registrierungen sind vorübergehend geschlossen.",
    "until": "Wieder da gegen {time}.",
    "soon": "So bald wie möglich wieder da.",
    "dismiss": "Band ausblenden"
  },
  "human": {
    "title": "Menschenprüfung",
    "window": "Cloudflare Turnstile · letzte 24 Stunden",
    "status": {
      "enforcing": "Erzwungen",
      "monitor": "Nur Überwachung",
      "off": "Aus",
      "notSetUp": "Nicht eingerichtet",
      "tableMissing": "Tabelle fehlt",
      "badSecret": "Schlüssel abgelehnt",
      "unknown": "Unbekannt"
    },
    "kpi": {
      "pass": "Bestanden",
      "refused": "Gestoppt",
      "fallback": "Ohne Prüfung zugelassen",
      "failOpen": "Cloudflare nicht erreichbar"
    },
    "sub": {
      "rate": "{rate} % bestanden",
      "noData": "Noch keine Prüfungen",
      "refused": "Ungültige oder fehlende Prüfung",
      "fallback": "Widget lud nicht, Ersatzregel",
      "failOpen": "Ausfall, niemand wurde blockiert"
    },
    "legend": {
      "pass": "Bestanden",
      "refused": "Gestoppt",
      "let": "Ohne Prüfung zugelassen"
    },
    "chartAria": "Ergebnisse der Menschenprüfung pro Stunde in den letzten 24 Stunden",
    "hourTip": "{time}: {pass} bestanden, {refused} gestoppt, {let} ohne Prüfung",
    "actions": "Wo gefragt wird",
    "action": {
      "register": "Registrierung",
      "social_signup": "Registrierung mit Google / Apple",
      "password_reset": "Passwort-Reset",
      "login": "Anmeldung (nach falschen Passwörtern)"
    },
    "col": {
      "pass": "Bestanden",
      "refused": "Gestoppt",
      "let": "Ohne Prüfung"
    },
    "challenged": "{n}-mal gefragt",
    "modeTitle": "Modus",
    "mode": {
      "enforce": "Erzwingen",
      "monitor": "Überwachen",
      "off": "Aus"
    },
    "modeHint": {
      "enforce": "Ungültige oder fehlende Prüfungen werden abgelehnt; ein Cloudflare-Ausfall blockiert niemanden.",
      "monitor": "Die Prüfung läuft und wird gezählt, aber niemand wird abgelehnt.",
      "off": "Die Prüfung wird nie verlangt."
    },
    "monitorTitle": "Nur noch überwachen",
    "monitorBody": "Die Prüfung läuft weiter, aber wer sie nicht besteht, kann sich trotzdem registrieren. Bots kommen wieder rein.",
    "offTitle": "Menschenprüfung ausschalten",
    "offBody": "Registrierung, Passwort-Reset und Anmeldung fragen nicht mehr nach der Prüfung. Nur vorübergehend nutzen, wenn etwas nicht stimmt.",
    "modeGo": "Übernehmen",
    "envLocked": "Die Umgebungsvariable TURNSTILE_ENFORCE auf Render legt den Modus fest.",
    "setup": "Die Einrichtung ist automatisch: GitHub › Actions › Cloudflare Turnstile › apply. Der Schlüssel wirkt innerhalb einer Minute, ohne neues Deployment.",
    "notes": {
      "noteSetup": "Kein Turnstile-Schlüssel; die Prüfung wird übersprungen, die Registrierung läuft wie bisher.",
      "noteTable": "Die Tabelle turnstile_config fehlt: Migration 20261124t_turnstile.sql anwenden.",
      "noteBadSecret": "Cloudflare lehnt den geheimen Schlüssel ab; niemand wird blockiert. Den Workflow mit rotate ausführen.",
      "noteUnreachable": "Cloudflare war in den letzten 24 Stunden zeitweise nicht erreichbar; diese Anfragen wurden zugelassen.",
      "noteEnv": "Modus per Umgebungsvariable festgelegt: {mode}.",
      "noteTestKeys": "Es werden Cloudflare-Testschlüssel verwendet; es gibt keinen echten Schutz.",
      "noteBudgetFull": "Das Limit ohne Prüfung ist in dieser Stunde aufgebraucht ({n}); wessen Widget nicht lädt, wartet eine Stunde."
    },
    "meta": {
      "sourceDb": "Quelle: GitHub-Workflow",
      "sourceEnv": "Quelle: Umgebungsvariable",
      "siteKey": "Websiteschlüssel {key}",
      "hosts": "{n, plural, one {# Hostname} other {# Hostnamen}}",
      "updated": "Aktualisiert {time}",
      "budget": "Ohne Prüfung zugelassen in dieser Stunde: {used}/{max} · {perIp} pro IP"
    },
    "saved": "Modus der Menschenprüfung gespeichert"
  }
};
