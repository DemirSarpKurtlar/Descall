/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_DE = {
  "title": "An Descall senden",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# Element} other {# Elemente}}",
  "chats": "{count, plural, one {# Chat} other {# Chats}}",
  "cancel": "Abbrechen",
  "close": "Schließen",
  "done": "Fertig",
  "hide": "Ausblenden",
  "options": "Optionen",
  "remove": "Entfernen",
  "search": "Personen, Gruppen oder Kanäle suchen",
  "clearSearch": "Suche löschen",
  "tabs": {
    "all": "Alle",
    "friends": "Freunde",
    "groups": "Gruppen",
    "servers": "Server"
  },
  "sec": {
    "friends": "Freunde",
    "groups": "Gruppen",
    "channels": "Serverkanäle",
    "suggested": "Vorgeschlagen"
  },
  "server": {
    "channels": "{count, plural, one {# Kanal} other {# Kanäle}}",
    "sendable": "Du kannst in {count} posten",
    "none": "Kein Kanal, in dem du posten kannst"
  },
  "saved": "{percent} % kleiner",
  "presence": {
    "online": "Online",
    "idle": "Abwesend",
    "dnd": "Bitte nicht stören",
    "offline": "Offline"
  },
  "row": {
    "channel": "Serverkanal",
    "slowMode": "Langsamer Modus: {seconds} s",
    "lastShared": {
      "today": "Zuletzt von dir geteilt · heute",
      "yesterday": "Zuletzt von dir geteilt · gestern",
      "days": "Zuletzt von dir geteilt · vor {count} Tagen"
    },
    "members": "{members} Mitglieder",
    "membersOnline": "{members} Mitglieder · {online} online",
    "groupShared": {
      "today": "{members} Mitglieder · heute {count} geteilt",
      "yesterday": "{members} Mitglieder · gestern {count} geteilt",
      "days": "{members} Mitglieder · vor {days} Tagen {count} geteilt"
    },
    "dmShared": {
      "today": "{presence} · heute {count} geteilt",
      "yesterday": "{presence} · gestern {count} geteilt",
      "days": "{presence} · vor {days} Tagen {count} geteilt"
    }
  },
  "reason": {
    "no_permission": "Du darfst hier nicht schreiben",
    "announcement": "Nur Moderatoren dürfen hier schreiben",
    "timed_out": "Du bist stummgeschaltet",
    "no_attach": "Du darfst hier keine Dateien senden",
    "blocked": "Blockiert",
    "not_friends": "Ihr seid nicht mehr befreundet",
    "unknown": "Nicht verfügbar",
    "rules_required": "Akzeptiere zuerst die Serverregeln",
    "failed": "Konnte nicht gesendet werden",
    "offline": "Verbindung verloren",
    "upload_failed": "Hochladen fehlgeschlagen",
    "timeout": "Zeitüberschreitung",
    "too_large": "Über dem Limit von 100 MB",
    "type": "Dieser Dateityp kann nicht gesendet werden",
    "slowmode": "Langsamer Modus",
    "rate_limited": "Zu schnell, warte kurz",
    "content_blocked": "Vom Inhaltsfilter blockiert",
    "attachment_unavailable": "Anhang nicht verfügbar",
    "signed_out": "Abgemeldet",
    "cancelled": "Gestoppt",
    "too_many_scheduled": "Zu viele geplante Nachrichten",
    "too_long": "Nachricht ist zu lang"
  },
  "message": "Nachricht hinzufügen (optional)",
  "quality": {
    "original": "Original",
    "originalDesc": "Volle Auflösung, 4K-Video bleibt · {size}",
    "high": "Hoch (empfohlen)",
    "highDesc": "JPEG, 1080p-Video · {size}",
    "saver": "Datensparmodus",
    "saverDesc": "Schnell mit mobilen Daten · {size}",
    "chip": {
      "original": "Original",
      "high": "Hoch",
      "saver": "Sparen"
    },
    "title": "Sendequalität"
  },
  "location": {
    "title": "Standortdaten entfernen",
    "desc": "GPS- und Gerätedaten in Fotos",
    "chipOn": "Ohne Standort",
    "chipOff": "Mit Standort"
  },
  "silent": "Lautlos",
  "silentHint": "Keine Mitteilung, bleibt aber ungelesen",
  "scheduleChip": "Planen",
  "scheduleTitle": "Wann senden?",
  "schedule": {
    "inHour": "In 1 Stunde",
    "tonight": "Heute 20:00",
    "tomorrow": "Morgen 09:00",
    "custom": "Datum und Uhrzeit wählen",
    "set": "Festlegen",
    "now": "Jetzt senden",
    "invalid": "Wähle mindestens 1 Minute später"
  },
  "send": "{count, plural, one {An # Chat senden} other {An # Chats senden}}",
  "sendShort": "{count, plural, one {# Chat} other {# Chats}}",
  "sendScheduled": "{count, plural, one {Für # Chat planen} other {Für # Chats planen}}",
  "pick": "Empfänger wählen",
  "when": {
    "today": "heute",
    "yesterday": "gestern",
    "days": "vor {count} Tagen"
  },
  "dup": {
    "link": "Du hast diesen Link {when} an {name} geschickt",
    "file": "Du hast das {when} an {name} geschickt",
    "body": "Es wird trotzdem gesendet. Du kannst {name} herausnehmen.",
    "remove": "Entfernen"
  },
  "limitTargets": "Du kannst bis zu {count} Chats wählen",
  "limitItems": "Bis zu {count} Elemente; der Rest wurde weggelassen",
  "targetRemoved": "{name} entfernt: {reason}",
  "errorTitle": "Liste konnte nicht geladen werden",
  "errorOffline": "Kein Internet. Nach dem Senden wird alles eingereiht.",
  "retry": "Erneut versuchen",
  "signedOutTitle": "Du bist bei Descall nicht angemeldet",
  "signedOutBody": "Melde dich zuerst in der Descall-App an.",
  "openApp": "Descall öffnen",
  "emptyTitle": "Noch niemand hier",
  "emptyBody": "Füge Freunde hinzu oder tritt einem Server bei.",
  "emptySearch": "Keine Ergebnisse für „{query}“",
  "noItems": "Nichts zu teilen",
  "run": {
    "title": "Wird gesendet",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Senden an # Chat} other {Senden an # Chats}}",
    "stats": "{sent} / {total} · {speed}/s · etwa {eta} s",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} hochgeladen",
    "uploading": "Wird hochgeladen · {percent} %",
    "queued": "Wartet · dieselben Dateien werden nicht erneut hochgeladen",
    "sending": "Wird gesendet",
    "canClose": "Du kannst dieses Fenster schließen",
    "canCloseBody": "Es läuft im Hintergrund weiter; danach kommt eine Mitteilung.",
    "background": "Im Hintergrund fortsetzen",
    "stop": "Senden stoppen"
  },
  "sent": {
    "title": "Gesendet",
    "hero": "{count, plural, one {An # Chat gesendet} other {An # Chats gesendet}}",
    "sub": "{items} · {size} · in {seconds} s",
    "allArrived": "Alles zugestellt",
    "delivered": "Zugestellt · {time}",
    "open": "Öffnen",
    "openInApp": "In Descall öffnen"
  },
  "undo": {
    "button": "Rückgängig",
    "title": "Rückgängig",
    "body": "Wird innerhalb von {seconds} s für alle entfernt",
    "bodyScheduled": "Planung ist {seconds} s lang abbrechbar",
    "busy": "Wird rückgängig gemacht…"
  },
  "scheduled": {
    "title": "Geplant",
    "hero": "{count, plural, one {Für # Chat geplant} other {Für # Chats geplant}}",
    "sub": "Wird {when} gesendet",
    "row": "Geplant · {time}"
  },
  "slowRow": "Langsamer Modus: der Rest ab {time}",
  "partial": {
    "title": "Teilweise gesendet",
    "hero": "An {done}/{count} Chats gesendet",
    "sub": "{name}: {reason}",
    "itemsIn": "{ok}/{count} angekommen",
    "itemsFailed": "{count, plural, one {# Element fehlt: {reason}} other {# Elemente fehlen: {reason}}}",
    "retryOne": "Erneut",
    "infoTitle": "Das Gesendete ist angekommen",
    "infoBody": "Ein neuer Versuch sendet nur das Fehlende; Dateien werden nicht neu hochgeladen.",
    "retryFailed": "Fehlgeschlagenes erneut senden",
    "dropFailed": "Fehlendes weglassen, Rest behalten"
  },
  "offline": {
    "title": "Noch nicht gesendet",
    "hero": "Keine Internetverbindung",
    "subNone": "Nichts wurde gesendet",
    "subSome": "{done}/{count} erledigt, der Rest wartet",
    "kept": "Auf dem Gerät gespeichert",
    "queuedTitle": "In der Warteschlange",
    "queuedBody": "Sobald du online bist, gehen {items} an {chats}. Verfolge es in der Mitteilung.",
    "row": "Wartet · wird automatisch versucht",
    "retryNow": "Jetzt erneut versuchen",
    "saveDraft": "Als Entwurf speichern",
    "remove": "Aus Warteschlange entfernen",
    "draftSaved": "Entwurf gespeichert; sende ihn über die Mitteilung"
  },
  "failed": {
    "title": "Nicht gesendet",
    "hero": "Senden fehlgeschlagen"
  },
  "undone": {
    "title": "Rückgängig gemacht",
    "hero": "Teilen rückgängig gemacht",
    "sub": "Die Nachrichten wurden für alle entfernt",
    "failed": "Einige Nachrichten konnten nicht entfernt werden"
  },
  "notif": {
    "channel": "Teilen",
    "sending": "{count, plural, one {Senden an # Chat} other {Senden an # Chats}}",
    "sent": "Gesendet",
    "failedItems": "{count, plural, one {# Element nicht gesendet} other {# Elemente nicht gesendet}}",
    "waiting": "Warte auf Internet · eingereiht",
    "stop": "Stopp",
    "undo": "Rückgängig · {seconds} s",
    "openChat": "Chat öffnen",
    "retry": "Erneut versuchen",
    "details": "Details",
    "sendDraft": "Senden",
    "draft": "Entwurf: {items} · {chats}"
  },
  "kind": {
    "photos": "Fotos",
    "files": "Dateien",
    "link": "Link",
    "text": "Text"
  },
  "pdf": "PDF"
};
