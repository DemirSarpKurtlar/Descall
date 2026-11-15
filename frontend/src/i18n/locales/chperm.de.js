/** Channel permission notices: read-only channels, attachments, synced category rules, channel moves, user limit ("chperm.*", server audit P2 / P5). Same keys in every chperm.<locale>.js. */
export const CHPERM_DE = {
  "readOnlyChannel": "Du kannst in diesem Kanal keine Nachrichten senden.",
  "readOnlyAnnouncement": "Nur Moderatoren können in diesem Ankündigungskanal posten.",
  "noAttachments": "Du kannst in diesem Kanal keine Dateien anhängen.",
  "noVoiceMessages": "Du kannst in diesem Kanal keine Sprachnachrichten senden.",
  "syncedWith": "Mit der Kategorie {name} synchronisiert: Das sind die Regeln der Kategorie. Änderst du hier eine, bekommt der Kanal eigene Regeln.",
  "category": "Kategorie",
  "userLimit": "Nutzerlimit",
  "userLimitSub": "Wie viele Personen gleichzeitig beitreten können. 0 = kein Limit (bis 99).",
  "userLimitNone": "Kein Limit",
  "userLimitInvalid": "Gib eine Zahl von 0 bis 99 ein.",
  "fromCategory": "Aus der Kategorie",
  "moveSyncTitle": "Berechtigungen in der neuen Kategorie",
  "moveSyncMsg": "#{channel} hat eigene Berechtigungen, {category} hat andere. Welche sollen gelten?",
  "moveSyncUse": "Mit {category} synchronisieren",
  "moveSyncKeep": "Eigene Berechtigungen behalten",
  "movedKeptOwn": "#{channel} hat in {category} seine eigenen Berechtigungen behalten.",
};
