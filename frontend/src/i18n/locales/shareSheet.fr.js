/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_FR = {
  "title": "Envoyer sur Descall",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# élément} other {# éléments}}",
  "chats": "{count, plural, one {# discussion} other {# discussions}}",
  "cancel": "Annuler",
  "close": "Fermer",
  "done": "Terminé",
  "hide": "Masquer",
  "options": "Options",
  "remove": "Retirer",
  "search": "Rechercher une personne, un groupe ou un salon",
  "clearSearch": "Effacer la recherche",
  "tabs": {
    "all": "Tout",
    "friends": "Amis",
    "groups": "Groupes",
    "servers": "Serveurs"
  },
  "sec": {
    "friends": "Amis",
    "groups": "Groupes",
    "channels": "Salons de serveur",
    "suggested": "Suggestions"
  },
  "server": {
    "channels": "{count, plural, one {# salon} other {# salons}}",
    "sendable": "Tu peux publier dans {count}",
    "none": "Aucun salon où tu peux publier"
  },
  "saved": "{percent} % plus léger",
  "presence": {
    "online": "En ligne",
    "idle": "Absent",
    "dnd": "Ne pas déranger",
    "offline": "Hors ligne"
  },
  "row": {
    "channel": "Salon de serveur",
    "slowMode": "Mode lent : {seconds} s",
    "lastShared": {
      "today": "Dernier partage par toi · aujourd'hui",
      "yesterday": "Dernier partage par toi · hier",
      "days": "Dernier partage par toi · il y a {count} jours"
    },
    "members": "{members} membres",
    "membersOnline": "{members} membres · {online} en ligne",
    "groupShared": {
      "today": "{members} membres · {count} partagés aujourd'hui",
      "yesterday": "{members} membres · {count} partagés hier",
      "days": "{members} membres · {count} partagés il y a {days} jours"
    },
    "dmShared": {
      "today": "{presence} · {count} partagés aujourd'hui",
      "yesterday": "{presence} · {count} partagés hier",
      "days": "{presence} · {count} partagés il y a {days} jours"
    }
  },
  "reason": {
    "no_permission": "Tu ne peux pas écrire ici",
    "announcement": "Réservé aux modérateurs",
    "timed_out": "Tu es en exclusion temporaire",
    "no_attach": "Tu ne peux pas envoyer de fichiers ici",
    "blocked": "Bloqué",
    "not_friends": "Vous n'êtes plus amis",
    "unknown": "Indisponible",
    "rules_required": "Accepte d'abord les règles du serveur",
    "failed": "Envoi impossible",
    "offline": "Connexion perdue",
    "upload_failed": "Échec de l'envoi du fichier",
    "timeout": "Délai dépassé",
    "too_large": "Dépasse la limite de 100 Mo",
    "type": "Ce type de fichier ne peut pas être envoyé",
    "slowmode": "Mode lent",
    "rate_limited": "Trop rapide, patiente un peu",
    "content_blocked": "Bloqué par le filtre de contenu",
    "attachment_unavailable": "Pièce jointe indisponible",
    "signed_out": "Déconnecté",
    "cancelled": "Arrêté",
    "too_many_scheduled": "Trop de messages programmés",
    "too_long": "Message trop long"
  },
  "message": "Ajouter un message (facultatif)",
  "quality": {
    "original": "Original",
    "originalDesc": "Pleine résolution, vidéo 4K conservée · {size}",
    "high": "Haute (recommandée)",
    "highDesc": "JPEG, vidéo 1080p · {size}",
    "saver": "Économie de données",
    "saverDesc": "Rapide en données mobiles · {size}",
    "chip": {
      "original": "Original",
      "high": "Haute",
      "saver": "Éco"
    },
    "title": "Qualité d'envoi"
  },
  "location": {
    "title": "Retirer la localisation",
    "desc": "GPS et infos de l'appareil des photos",
    "chipOn": "Sans position",
    "chipOff": "Avec position"
  },
  "silent": "Silencieux",
  "silentHint": "Pas de notification, reste non lu",
  "scheduleChip": "Programmer",
  "scheduleTitle": "Quand l'envoyer ?",
  "schedule": {
    "inHour": "Dans 1 heure",
    "tonight": "Ce soir 20:00",
    "tomorrow": "Demain 09:00",
    "custom": "Choisir la date et l'heure",
    "set": "Valider",
    "now": "Envoyer maintenant",
    "invalid": "Choisis au moins 1 minute plus tard"
  },
  "send": "{count, plural, one {Envoyer à # discussion} other {Envoyer à # discussions}}",
  "sendShort": "{count, plural, one {# discussion} other {# discussions}}",
  "sendScheduled": "{count, plural, one {Programmer pour # discussion} other {Programmer pour # discussions}}",
  "pick": "Choisis les destinataires",
  "when": {
    "today": "aujourd'hui",
    "yesterday": "hier",
    "days": "il y a {count} jours"
  },
  "dup": {
    "link": "Tu as envoyé ce lien à {name} {when}",
    "file": "Tu as envoyé ceci à {name} {when}",
    "body": "L'envoi partira quand même. Tu peux retirer {name}.",
    "remove": "Retirer"
  },
  "limitTargets": "Tu peux choisir jusqu'à {count} discussions",
  "limitItems": "Jusqu'à {count} éléments ; le reste a été retiré",
  "targetRemoved": "{name} retiré : {reason}",
  "errorTitle": "Impossible de charger la liste",
  "errorOffline": "Pas d'internet. L'envoi sera mis en file d'attente.",
  "retry": "Réessayer",
  "signedOutTitle": "Tu n'es pas connecté à Descall",
  "signedOutBody": "Connecte-toi d'abord dans l'app Descall.",
  "openApp": "Ouvrir Descall",
  "emptyTitle": "Personne pour l'instant",
  "emptyBody": "Ajoute des amis ou rejoins un serveur.",
  "emptySearch": "Aucun résultat pour « {query} »",
  "noItems": "Rien à partager",
  "run": {
    "title": "Envoi",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Envoi à # discussion} other {Envoi à # discussions}}",
    "stats": "{sent} / {total} · {speed}/s · environ {eta} s",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} envoyés",
    "uploading": "Envoi · {percent} %",
    "queued": "En attente · les mêmes fichiers ne sont pas renvoyés",
    "sending": "Envoi",
    "canClose": "Tu peux fermer cette fenêtre",
    "canCloseBody": "L'envoi continue en arrière-plan ; une notification suivra.",
    "background": "Continuer en arrière-plan",
    "stop": "Arrêter l'envoi"
  },
  "sent": {
    "title": "Envoyé",
    "hero": "{count, plural, one {Envoyé à # discussion} other {Envoyé à # discussions}}",
    "sub": "{items} · {size} · en {seconds} s",
    "allArrived": "Tout est arrivé",
    "delivered": "Distribué · {time}",
    "open": "Ouvrir",
    "openInApp": "Ouvrir dans Descall"
  },
  "undo": {
    "button": "Annuler l'envoi",
    "title": "Annuler",
    "body": "Retiré pour tous sous {seconds} s",
    "bodyScheduled": "La programmation peut être annulée pendant {seconds} s",
    "busy": "Annulation…"
  },
  "scheduled": {
    "title": "Programmé",
    "hero": "{count, plural, one {Programmé pour # discussion} other {Programmé pour # discussions}}",
    "sub": "Partira {when}",
    "row": "Programmé · {time}"
  },
  "slowRow": "Mode lent : le reste part dès {time}",
  "partial": {
    "title": "Envoyé en partie",
    "hero": "Envoyé à {done}/{count} discussions",
    "sub": "{name} : {reason}",
    "itemsIn": "{ok}/{count} arrivés",
    "itemsFailed": "{count, plural, one {# élément manquant : {reason}} other {# éléments manquants : {reason}}}",
    "retryOne": "Réessayer",
    "infoTitle": "Ce qui est parti est arrivé",
    "infoBody": "Réessayer n'envoie que le manquant ; rien n'est renvoyé deux fois.",
    "retryFailed": "Réessayer ce qui a échoué",
    "dropFailed": "Laisser tomber l'échec, garder le reste"
  },
  "offline": {
    "title": "Pas encore envoyé",
    "hero": "Pas de connexion internet",
    "subNone": "Rien n'a été envoyé",
    "subSome": "{done}/{count} terminées, le reste attend",
    "kept": "Gardé sur l'appareil",
    "queuedTitle": "En file d'attente",
    "queuedBody": "Dès le retour du réseau, {items} partent vers {chats}. Suis l'envoi dans la notification.",
    "row": "En attente · nouvel essai automatique",
    "retryNow": "Réessayer maintenant",
    "saveDraft": "Enregistrer comme brouillon",
    "remove": "Retirer de la file",
    "draftSaved": "Brouillon enregistré ; envoie-le depuis la notification"
  },
  "failed": {
    "title": "Non envoyé",
    "hero": "Envoi impossible"
  },
  "undone": {
    "title": "Annulé",
    "hero": "Partage annulé",
    "sub": "Les messages ont été retirés pour tous",
    "failed": "Certains messages n'ont pas pu être retirés"
  },
  "notif": {
    "channel": "Partages",
    "sending": "{count, plural, one {Envoi à # discussion} other {Envoi à # discussions}}",
    "sent": "Envoyé",
    "failedItems": "{count, plural, one {# élément non envoyé} other {# éléments non envoyés}}",
    "waiting": "En attente d'internet · en file",
    "stop": "Arrêter",
    "undo": "Annuler · {seconds} s",
    "openChat": "Ouvrir la discussion",
    "retry": "Réessayer",
    "details": "Détails",
    "sendDraft": "Envoyer",
    "draft": "Brouillon : {items} · {chats}"
  },
  "kind": {
    "photos": "Photos",
    "files": "Fichiers",
    "link": "Lien",
    "text": "Texte"
  },
  "pdf": "PDF"
};
