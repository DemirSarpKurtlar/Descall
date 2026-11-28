/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_DE = {
  "signIn": {
    "button": "Mit Passkey anmelden",
    "busy": "Warte auf deinen Passkey…",
    "handoffTitle": "Im Browser fortfahren",
    "handoffLead": "Descall wurde in deinem Browser geöffnet. Prüfe, dass dort der Code {code} steht, und bestätige mit deinem Passkey.",
    "handoffReopen": "Seite erneut öffnen",
    "cancel": "Abbrechen",
    "autofillHint": "Tippe auf das Benutzernamenfeld, um auch deine gespeicherten Passkeys zu sehen."
  },
  "settings": {
    "title": "Passkeys",
    "lead": "Dein Passwort bleibt immer. Ein Passkey ist ein zusätzlicher, schnellerer und sicherer Weg, dich mit Fingerabdruck, Gesicht oder Geräte-PIN anzumelden.",
    "empty": "Du hast noch keinen Passkey hinzugefügt.",
    "add": "Passkey hinzufügen",
    "nameLabel": "Name des Passkeys",
    "namePlaceholder": "Name (optional), zum Beispiel Arbeitslaptop",
    "created": "Hinzugefügt: {date}",
    "lastUsed": "Zuletzt verwendet: {date}",
    "neverUsed": "Noch nicht verwendet",
    "synced": "Synchronisiert",
    "thisDevice": "Ein Gerät",
    "suspended": "Deaktiviert: er wurde möglicherweise kopiert. Entferne ihn und füge einen neuen hinzu.",
    "rename": "Umbenennen",
    "save": "Speichern",
    "cancel": "Abbrechen",
    "remove": "Entfernen",
    "removeTitle": "Diesen Passkey entfernen?",
    "removeLead": "Mit \"{name}\" kannst du dich nicht mehr anmelden. Dein Passwort und andere Passkeys funktionieren weiter. Die Kopie auf deinem Gerät kannst du auch in dessen Passworteinstellungen löschen.",
    "added": "Passkey hinzugefügt.",
    "removed": "Passkey entfernt.",
    "renamed": "Name gespeichert.",
    "unavailableHere": "Dieses Gerät oder dieser Browser unterstützt keine Passkeys. Du kannst einen von einem unterstützten Gerät aus hinzufügen.",
    "loadFailed": "Deine Passkeys konnten nicht geladen werden.",
    "sessionMethod": "Passkey",
    "retry": "Erneut versuchen",
    "count": "{count, plural, one {# Passkey} other {# Passkeys}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Andere"
    }
  },
  "reauth": {
    "title": "Bestätige zuerst, dass du es bist",
    "lead": "Bestätige, dass dieses Konto dir gehört, um einen Passkey hinzuzufügen.",
    "password": "Aktuelles Passwort",
    "code": "6-stelliger Code",
    "sendCode": "Code per E-Mail senden",
    "codeSent": "Ein Code wurde an {email} gesendet.",
    "withPasskey": "Mit vorhandenem Passkey bestätigen",
    "totpHint": "Du kannst auch den Code aus deiner Authenticator-App eingeben.",
    "continue": "Weiter"
  },
  "err": {
    "cancelled": "Abgebrochen.",
    "no_credential": "Auf diesem Gerät gibt es keinen Descall-Passkey. Melde dich mit deinem Passwort an und füge dann einen unter Einstellungen > Sicherheit hinzu.",
    "timeout": "Die Zeit ist abgelaufen. Versuche es erneut.",
    "already_registered": "Auf diesem Gerät hast du bereits einen Descall-Passkey.",
    "unsupported": "Dieses Gerät unterstützt keine Passkeys.",
    "security": "Dieses Gerät hat die Descall-Domain noch nicht bestätigt. Versuche es gleich noch einmal.",
    "busy": "Eine andere Passkey-Anfrage ist offen.",
    "aborted": "Abgebrochen.",
    "network": "Descall ist nicht erreichbar. Prüfe deine Verbindung.",
    "server": "Etwas ist schiefgelaufen. Versuche es erneut.",
    "unknown": "Die Passkey-Anfrage konnte nicht abgeschlossen werden. Versuche es erneut.",
    "uvRequired": "Dein Gerät hat nicht bestätigt, dass du es bist (PIN, Fingerabdruck oder Gesicht). Versuche es erneut oder melde dich mit deinem Passwort an.",
    "unknownCredential": "Dieser Passkey gehört nicht mehr zu deinem Konto. Melde dich mit deinem Passwort an.",
    "suspended": "Dieser Passkey wurde deaktiviert, weil er möglicherweise kopiert wurde. Melde dich mit deinem Passwort an und entferne ihn unter Einstellungen > Sicherheit.",
    "unavailable": "Passkeys sind gerade nicht verfügbar. Melde dich mit deinem Passwort an.",
    "reauthRequired": "Bestätige zuerst, dass du es bist.",
    "limit": "Du hast die maximale Anzahl an Passkeys erreicht. Entferne zuerst einen.",
    "handoffExpired": "Der Link ist abgelaufen. Starte neu.",
    "badPassword": "Falsches Passwort.",
    "badCode": "Falscher Code.",
    "badName": "Gib einen Namen ein.",
    "rateLimited": "Zu viele Versuche. Warte kurz."
  },
  "desktop": {
    "title": "Passkey für die Descall-Desktop-App",
    "signinLead": "Nutze deinen Passkey, um dich in der Descall-App anzumelden.",
    "registerLead": "Füge @{username} einen Passkey aus diesem Browser oder von deinem Handy hinzu.",
    "matchLabel": "Code in der App",
    "matchHint": "Wenn dieser Code nicht der ist, den du in der Descall-App siehst, fahre nicht fort.",
    "signinButton": "Mit Passkey bestätigen",
    "registerButton": "Passkey erstellen",
    "doneSignin": "Fertig. Du kannst zur Descall-App zurückkehren.",
    "doneRegister": "Passkey hinzugefügt. Du kannst zur Descall-App zurückkehren.",
    "expired": "Dieser Link ist abgelaufen oder wurde bereits verwendet. Starte in der Descall-App neu.",
    "noCode": "Diese Seite wird aus der Descall-Desktop-App geöffnet.",
    "unsupported": "Dieser Browser unterstützt keine Passkeys. Öffne sie in einem aktuellen Chrome, Edge, Safari oder Firefox.",
    "loading": "Wird geladen…"
  },
  "login": {
    "button": {
      "passkey": "Mit Passkey anmelden",
      "face": "Mit Face ID anmelden",
      "finger": "Mit Fingerabdruck anmelden",
      "hello": "Mit Windows Hello anmelden"
    },
    "note": "Face ID, Fingerabdruck oder Windows Hello. Dein Passwort funktioniert immer weiter."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "Fingerabdruck",
      "web": "Passkey"
    },
    "waitTitle": {
      "windows": "Warte auf Windows Hello",
      "ios": "Warte auf Face ID",
      "android": "Warte auf Fingerabdruck",
      "web": "Warte auf deinen Passkey"
    },
    "waitLead": {
      "windows": "Nutze im Systemfenster dein Gesicht, deinen Fingerabdruck oder deine PIN.",
      "ios": "Nutze Face ID im Systemfenster.",
      "android": "Nutze im Systemfenster deinen Fingerabdruck oder die Displaysperre.",
      "web": "Wähle im Browserfenster deinen Passkey und bestätige."
    },
    "okTitle": "Willkommen, {name}",
    "okTitleNoName": "Willkommen",
    "okLead": "Du hast dich mit {method} angemeldet. Das zählt als Zwei-Schritt-Bestätigung, kein Code nötig.",
    "okProgress": "Deine Server werden geöffnet",
    "cancelTitle": "Anmeldung abgebrochen",
    "cancelLead": "Kein Problem. Versuch es noch einmal oder melde dich mit deinem Passwort an.",
    "retry": "Erneut versuchen",
    "password": "Mit Passwort",
    "errTitle": "Passkey nicht bestätigt",
    "errLead": "Dieser Passkey wurde vielleicht aus deinem Konto entfernt, oder die Anfrage ist abgelaufen.",
    "errDetail": "Details: {detail}",
    "noneTitle": "Kein Passkey auf diesem Gerät",
    "noneLead": "Dein Descall-Passkey ist vielleicht auf einem anderen Gerät.",
    "optPhone": "Mit dem Handy anmelden",
    "optPhoneSub": "Code mit dem Handy scannen, auf dem der Passkey ist",
    "optKey": "Sicherheitsschlüssel",
    "optKeySub": "USB oder NFC",
    "optPassword": "Mit Passwort anmelden",
    "optPasswordSub": "Danach kannst du diesem Gerät einen Passkey hinzufügen",
    "label": {
      "wait": "Systemfenster offen",
      "ok": "Erfolgreich",
      "cancel": "Abgebrochen",
      "err": "Fehler",
      "none": "Kein Passkey auf diesem Gerät"
    },
    "foot": {
      "windows": {
        "wait": "Das Windows-Hello-Fenster ist offen (Gesicht, Fingerabdruck oder PIN).",
        "ok": "Die App öffnet sich einen Moment später.",
        "cancel": "Im Windows-Fenster wurde Abbrechen gedrückt.",
        "err": "Der Server hat den Passkey nicht erkannt, oder die Zeit ist abgelaufen.",
        "none": "Windows hat auf diesem Computer keinen Descall-Passkey gefunden."
      },
      "ios": {
        "wait": "Das iOS-Fenster und die Face-ID-Animation sind offen.",
        "ok": "Ein haptisches Signal, dann öffnen sich deine Chats.",
        "cancel": "Das Systemfenster wurde geschlossen.",
        "err": "Der Server hat den Passkey nicht erkannt, oder die Zeit ist abgelaufen.",
        "none": "Im iCloud-Schlüsselbund ist kein Descall-Passkey."
      },
      "android": {
        "wait": "Das Fenster des Google Passwortmanagers ist offen.",
        "ok": "Eine kurze Vibration, dann öffnen sich deine Chats.",
        "cancel": "Das Fenster wurde mit der Zurück-Taste geschlossen.",
        "err": "Der Server hat den Passkey nicht erkannt, oder die Zeit ist abgelaufen.",
        "none": "Auf diesem Handy ist kein Descall-Passkey."
      }
    }
  },
  "os": {
    "winHeader": "Windows-Sicherheit",
    "winTitle": "Mit deinem Passkey anmelden",
    "winText": "Verwende Windows Hello, um dich bei {site} anzumelden.",
    "winRecognizing": "Wir prüfen, ob du es bist",
    "winMore": "Weitere Optionen",
    "cancel": "Abbrechen",
    "qrTitle": "Mit dem Handy anmelden",
    "qrText": "Scanne diesen Code mit der Kamera des Handys, auf dem dein Passkey ist.",
    "usbTitle": "Sicherheitsschlüssel verwenden",
    "usbText": "Stecke deinen Sicherheitsschlüssel in den USB-Anschluss und berühre ihn.",
    "usbWait": "Warte auf den Schlüssel",
    "gpmHeader": "Google Passwortmanager",
    "gpmTitle": "Gespeicherten Passkey verwenden",
    "gpmText": "Für descall.com. Mit der Displaysperre deines Computers bestätigen.",
    "webText": "Wähle deinen Passkey in {provider} und bestätige.",
    "iosTitle": "Anmelden",
    "iosText": "Möchtest du dich mit deinem gespeicherten Passkey bei descall.com anmelden?",
    "iosSub": "iCloud-Schlüsselbund · Passkey",
    "continue": "Weiter",
    "nfcTitle": "Sicherheitsschlüssel",
    "nfcText": "Halte den Schlüssel an die Oberkante deines Handys.",
    "nfcSub": "Über NFC",
    "nfcWait": "Warte",
    "andText": "Um dich bei Descall anzumelden",
    "andSub": "Passkey · Google Passwortmanager",
    "andTouch": "Berühre den Fingerabdrucksensor"
  },
  "preview": {
    "title": "Das siehst du bei der Anmeldung",
    "live": "Live",
    "selected": "Ausgewählt: {name}. Dieses Fenster öffnet der Passkey bei der Anmeldung:",
    "desktop": "Desktop · Windows",
    "phone": "Handy",
    "text": {
      "windows": "Ein Windows-Hello-Passkey gibt es nur auf diesem Computer. Handys sehen ihn nicht; dort nutzt du dein Passwort oder den eigenen Passkey des Handys.",
      "ios": "iCloud-Schlüsselbund: ein Tippen auf iPhone, iPad und Mac. Unter Windows scannst du den Code mit deinem iPhone und bestätigst.",
      "mac": "iCloud-Schlüsselbund: ein Tippen auf Mac, iPhone und iPad. Unter Windows scannst du den Code mit deinem iPhone und bestätigst.",
      "android": "Google Passwortmanager: erscheint auf Android und in Chrome.",
      "key": "Sicherheitsschlüssel: funktioniert überall, am Computer per USB, am Handy per NFC.",
      "web": "{provider}: erscheint in den Browsern und Handys, auf denen dieser Manager installiert ist."
    },
    "idle": "{count, plural, one {Seit # Tag nicht benutzt.} other {Seit # Tagen nicht benutzt.}}",
    "states": "Zustände",
    "platform": "Plattform",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Heute {time}",
    "yesterday": "Gestern {time}",
    "yesterdayShort": "Gestern",
    "daysAgo": "{count, plural, one {vor # Tag} other {vor # Tagen}}",
    "never": "Nie benutzt",
    "now": "jetzt"
  },
  "center": {
    "crumbLabel": "Pfad",
    "crumbSecurity": "Sicherheit",
    "lead": "Schnelle Anmeldung ohne Passwort. Dein Passwort bleibt gültig.",
    "kpi": {
      "count": "Passkeys",
      "platforms": "{count, plural, one {auf # Plattform} other {auf # Plattformen}}",
      "share": "Passkey-Anmeldungen",
      "basis": "Aus deinen letzten {count} Sitzungen",
      "mixLabel": "Passkey {passkey} %, Passwort {password} %, Google und Apple {social} %",
      "noData": "Noch keine Daten",
      "speed": "Durchschnittliche Anmeldung",
      "seconds": "{s} s",
      "passwordSpeed": "Mit Passwort: {s} s",
      "noMeasure": "Noch nicht gemessen",
      "decimal": ",",
      "security": "Sicherheit",
      "methods": "{count, plural, one {# Methode} other {# Methoden}}"
    },
    "level": {
      "excellent": "Sehr gut",
      "good": "Gut",
      "fair": "Mittel",
      "weak": "Schwach"
    },
    "check": {
      "password": "Passwort oder bestätigte Anmeldung",
      "email": "Bestätigte E-Mail",
      "secondFactor": "Zwei-Schritt-Bestätigung",
      "passkey": "Mindestens ein Passkey",
      "backup": "Zweiter Passkey auf anderer Plattform",
      "fresh": "Kein unbenutzter oder deaktivierter Passkey"
    },
    "chip": {
      "password": "Passwort",
      "alwaysOn": "Immer an",
      "none": "Keins",
      "app": "Authenticator-App",
      "email2fa": "E-Mail-Code",
      "on": "An",
      "off": "Aus",
      "passkey": "Passkey",
      "registered": "{count} gespeichert"
    },
    "stale": "Der Passkey \"{name}\" wurde seit {count} Tagen nicht benutzt. Wenn du das Gerät nicht mehr nutzt, entferne ihn.",
    "suspendedShort": "wurde deaktiviert, weil er kopiert worden sein könnte. Entferne ihn und füge einen neuen hinzu.",
    "review": "Ansehen",
    "offline": "Du bist offline. Änderungen gehen wieder, sobald du verbunden bist; die Liste wird dann aktualisiert.",
    "col": {
      "passkey": "Passkey",
      "last": "Zuletzt benutzt",
      "added": "Hinzugefügt",
      "usage": "30 Tage"
    },
    "pill": {
      "thisDevice": "Dieses Gerät",
      "days": "{count} Tage",
      "off": "Aus",
      "counts2fa": "Zählt als 2FA",
      "localOnly": "Nur dieses Gerät",
      "synced": "Synchronisiert",
      "noSync": "Nicht synchronisiert"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "iCloud-Schlüsselbund",
      "mac": "iCloud-Schlüsselbund",
      "android": "Google Passwortmanager",
      "key": "Sicherheitsschlüssel",
      "web": "Passkey"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Desktop",
      "electron": "Desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Andere"
    },
    "via": {
      "web": "Web",
      "ios": "iPhone-App",
      "android": "Android-App",
      "windows": "Desktop-App",
      "electron": "Desktop-App",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Andere"
    },
    "sync": {
      "local": "Nur dieses Gerät",
      "icloud": "Synchronisiert mit iPhone, iPad und Mac",
      "google": "Synchronisiert mit Android und Chrome",
      "key": "USB / NFC, nicht synchronisiert",
      "manager": "Synchronisiert mit {provider}",
      "synced": "Synchronisiert zwischen deinen Geräten"
    },
    "drawer": {
      "sync": "Synchronisierung",
      "created": "Erstellt",
      "where": "Wo",
      "lastUsed": "Zuletzt benutzt",
      "place": "Ort",
      "placeUnknown": "Unbekannt",
      "total": "Anmeldungen gesamt",
      "last30": "Letzte 30 Tage",
      "count30": "{count, plural, one {# Anmeldung} other {# Anmeldungen}}",
      "info": "Bei der Anmeldung mit diesem Passkey wird kein Code abgefragt; sie zählt als Zwei-Schritt-Bestätigung.",
      "rename": "Umbenennen"
    },
    "remove": {
      "title": "\"{name}\" entfernen?",
      "lead": "Mit diesem Passkey kannst du dich nicht mehr anmelden. Dein Passwort und andere Passkeys bleiben unberührt.",
      "current": "Du bist mit diesem Passkey angemeldet; diese Sitzung bleibt offen.",
      "reason": "Grund",
      "reasons": {
        "lost": "Gerät verloren",
        "unused": "Nutze ich nicht mehr",
        "readd": "Füge ich neu hinzu",
        "other": "Anderes"
      },
      "endSessions": "Auch die anderen Sitzungen dieses Passkeys beenden",
      "sessionsEnded": "{count, plural, one {# Sitzung beendet.} other {# Sitzungen beendet.}}"
    },
    "added": {
      "title": "Passkey hinzugefügt",
      "sub": "{provider} · dieses Gerät",
      "name": "Name",
      "undo": "Rückgängig",
      "undone": "Rückgängig gemacht, der Passkey wurde entfernt."
    },
    "names": {
      "home": "Heimcomputer",
      "work": "Arbeitscomputer",
      "laptop": "Laptop",
      "gaming": "Gaming-PC",
      "macbook": "MacBook",
      "iphone": "Mein iPhone",
      "ipad": "iPad",
      "phone": "Mein Handy",
      "tablet": "Tablet",
      "keyMain": "Hauptschlüssel",
      "keyBackup": "Ersatzschlüssel",
      "keyChain": "Schlüsselbund"
    },
    "add": {
      "ready": "Bereit. Weiter öffnet das Passkey-Fenster deines Geräts.",
      "thisDevice": {
        "passkey": "Dieses Gerät oder der Passwortmanager deines Browsers",
        "face": "Dieses iPhone · Face ID",
        "finger": "Dieses Handy · Fingerabdruck",
        "hello": "Dieser Computer · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "Auf dem Handy: Code scannen, mit dem Handy speichern",
        "securityKey": "Sicherheitsschlüssel: USB oder NFC"
      }
    },
    "activity": {
      "title": "Letzte Aktivität",
      "all": "Alle",
      "empty": "Noch keine Aktivität.",
      "signin": "Anmeldung mit {name}",
      "added": "{name} hinzugefügt",
      "renamed": "Umbenannt in {name}",
      "removed": "{name} entfernt",
      "new_place": "{name} an neuem Ort benutzt",
      "suspended": "{name} deaktiviert",
      "report_confirmed": "{name}: Antwort \"Das war ich\"",
      "report_revoked": "{name}: \"Das war ich nicht\", Sitzungen beendet"
    },
    "backup": {
      "cap": "Ersatz-Tipp",
      "title": "Zweiten Passkey hinzufügen",
      "lead": "Verlierst du ein Gerät, meldest du dich mit dem anderen an. Eine andere Plattform ist am sichersten.",
      "remoteDevice": "Auf dem Handy hinzufügen",
      "remoteDeviceSub": "Code scannen, mit dem Handy speichern",
      "securityKey": "Sicherheitsschlüssel",
      "securityKeySub": "USB oder NFC",
      "computer": "Am Computer hinzufügen",
      "computerSub": "descall.com › Einstellungen › Sicherheit › Passkeys"
    },
    "email": {
      "cap": "Sicherheits-E-Mail",
      "title": "Deinem Konto wurde ein neuer Passkey hinzugefügt",
      "body": "\"{name}\"{provider} wurde am {when} {from} hinzugefügt. Wenn du das nicht warst, entferne ihn sofort und ändere dein Passwort.",
      "fromPlace": "von {place} aus",
      "fromSomewhere": "von einem unbekannten Ort aus",
      "notMe": "Das war ich nicht",
      "itWasMe": "Das war ich",
      "lead": "Diese E-Mail kommt, wenn ein Passkey hinzugefügt oder an einem neuen Ort benutzt wird. \"Das war ich nicht\" entfernt den Passkey und beendet alle Sitzungen.",
      "noEmail": "Deine E-Mail-Adresse ist nicht bestätigt, daher erreichen dich diese E-Mails nicht. Bestätige sie unter Sicherheit."
    },
    "alert": {
      "cap": "Ungewöhnliche Nutzung",
      "titleCity": "{name} wurde in einer neuen Stadt benutzt",
      "titleCountry": "{name} wurde in einem neuen Land benutzt",
      "signin": "Anmeldung: {place}",
      "before": "Bisher nur {places}",
      "firstFar": "Erstes Mal an diesem Ort",
      "usual": "Üblicher Ort",
      "me": "Das war ich",
      "revoke": "Entfernen und Sitzungen beenden",
      "confirmTitle": "Passkey entfernen und andere Sitzungen beenden?",
      "confirmLead": "\"{name}\" wird entfernt und alle Sitzungen außer diesem Gerät enden. Danach solltest du dein Passwort ändern.",
      "doneMe": "Erledigt, die Warnung ist geschlossen.",
      "doneRevoke": "{count, plural, one {Passkey entfernt, # Sitzung beendet.} other {Passkey entfernt, # Sitzungen beendet.}}",
      "noneTitle": "Keine ungewöhnliche Nutzung",
      "noneLead": "Meldet sich ein Passkey aus einer Stadt an, die er nie benutzt hat, warnen wir dich hier und per E-Mail.",
      "countryOnly": "Bei dieser Verbindung ist nur das Land bekannt; die Warnung kommt bei einem neuen Land."
    },
    "empty": {
      "title": "Noch keine Passkeys",
      "lead": {
        "passkey": "Füge diesem Gerät einen Passkey hinzu; beim nächsten Mal tippst du kein Passwort und keinen Code.",
        "face": "Füge einen Passkey mit Face ID hinzu; beim nächsten Mal tippst du kein Passwort und keinen Code.",
        "finger": "Füge einen Passkey mit deinem Fingerabdruck hinzu; beim nächsten Mal tippst du kein Passwort und keinen Code.",
        "hello": "Füge einen Passkey mit Windows Hello hinzu; beim nächsten Mal tippst du kein Passwort und keinen Code."
      }
    },
    "suggestToggle": "Nach Passwort-Anmeldung einen Passkey vorschlagen",
    "suggestToggleSub": "Nur für dieses Gerät",
    "entry": {
      "title": "Passkeys",
      "desc": "{count} gespeichert · Sicherheit {score}",
      "none": "Schnelle Anmeldung ohne Passwort. Noch kein Passkey.",
      "alerts": "{count, plural, one {# Warnung} other {# Warnungen}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "Melde dich nächstes Mal mit Windows Hello an",
      "ios": "Melde dich nächstes Mal mit Face ID an",
      "android": "Melde dich nächstes Mal mit deinem Fingerabdruck an",
      "web": "Melde dich nächstes Mal mit einem Passkey an"
    },
    "phoneTitle": {
      "windows": "Schneller anmelden mit Windows Hello",
      "ios": "Schneller anmelden mit Face ID",
      "android": "Schneller anmelden mit Fingerabdruck",
      "web": "Schneller anmelden mit Passkey"
    },
    "lead": "Ohne Passwort und Code, in etwa 2 Sekunden.",
    "phoneLead": "Nächstes Mal kein Passwort und kein Code. Dein Passwort bleibt gültig.",
    "c1": "Dein Passwort bleibt; ein Passkey ist ein zusätzlicher, schnellerer Weg.",
    "c2": "Eine Passkey-Anmeldung zählt als Zwei-Schritt-Bestätigung, kein Code nötig.",
    "c2short": "Zählt als Zwei-Schritt-Bestätigung.",
    "c3": "Dein Gesicht oder Fingerabdruck verlässt nie dieses Gerät.",
    "c3ios": "Funktioniert mit dem iCloud-Schlüsselbund auch auf iPad und Mac.",
    "c3android": "Funktioniert mit dem Google Passwortmanager auch auf deinen anderen Android-Geräten.",
    "later": "Später erinnern",
    "notNow": "Nicht jetzt",
    "never": "Auf diesem Gerät nicht mehr fragen",
    "mini": "Passkey-Vorschlag",
    "expand": "Passkey-Vorschlag öffnen",
    "done": "Passkey hinzugefügt. Melde dich nächstes Mal mit {method} an.",
    "needsReauth": "Bestätige in den Einstellungen, dass du es bist, um ihn hinzuzufügen.",
    "openSettings": "In Einstellungen hinzufügen",
    "signedIn": {
      "password": "Mit Passwort angemeldet",
      "2fa": "Mit Passwort und Bestätigungscode angemeldet",
      "google": "Mit Google angemeldet",
      "apple": "Mit Apple angemeldet"
    }
  },
  "report": {
    "loading": "Wird geladen…",
    "invalidTitle": "Link ungültig",
    "invalid": "Dieser Link ist ungültig oder unvollständig kopiert. Tippe noch einmal auf den Button in der E-Mail.",
    "expiredTitle": "Link abgelaufen",
    "expired": "Dieser Link ist abgelaufen. Melde dich an und prüfe Einstellungen > Sicherheit > Passkeys.",
    "network": "Descall ist nicht erreichbar. Prüfe deine Verbindung und versuch es erneut.",
    "title": {
      "added": "Deinem Konto wurde ein neuer Passkey hinzugefügt",
      "newPlace": "Dein Passkey wurde an einem neuen Ort benutzt"
    },
    "passkey": "Passkey",
    "when": "Zeit",
    "place": "Ort",
    "device": "Gerät",
    "question": "Warst du das?",
    "notMe": "Das war ich nicht",
    "revokeLead": "\"{name}\" wird aus deinem Konto entfernt und alle Sitzungen deines Kontos enden. Melde dich danach mit deinem Passwort an und ändere es.",
    "revokeLeadGone": "Der Passkey wurde bereits entfernt. Wir beenden alle Sitzungen deines Kontos; ändere danach dein Passwort.",
    "revokeButton": "Entfernen und alle Sitzungen beenden",
    "itWasMe": "Das war ich",
    "confirmLead": "Nichts ändert sich; wir schließen die Warnung.",
    "confirmButton": "Ja, das war ich",
    "doneRevokedTitle": "Dein Konto ist sicher",
    "doneRevoked": "{count, plural, one {Passkey entfernt und # Sitzung beendet. Ändere jetzt dein Passwort.} other {Passkey entfernt und # Sitzungen beendet. Ändere jetzt dein Passwort.}}",
    "doneConfirmedTitle": "Danke",
    "doneConfirmed": "Wir haben die Warnung geschlossen.",
    "alreadyRevoked": "Dieser Link wurde schon benutzt: Der Passkey wurde entfernt und die Sitzungen beendet.",
    "alreadyConfirmed": "Diese Warnung wurde schon beantwortet: \"Das war ich\".",
    "openApp": "Zu Descall",
    "changePassword": "Anmelden und Passwort ändern"
  }
};
