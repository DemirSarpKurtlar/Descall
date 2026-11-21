/** Panneau d'administration › Système ("sysx.*"). Same keys in every sysx.<locale>.js. */
export const SYSX_FR = {
  "title": "Système",
  "crumb": "Santé du serveur, feature flags, interrupteurs d'urgence et maintenance sur un seul écran",
  "backupBtn": "Télécharger la sauvegarde",
  "restartBtn": "Redémarrage sûr",
  "close": "Fermer",
  "cancel": "Annuler",
  "retry": "Réessayer",
  "loading": "Chargement…",
  "saving": "Enregistrement…",
  "system": "système",
  "pct": "{n} %",
  "pctDec": "{n} %",
  "people": "{n} personnes",
  "sec": "{n} s",
  "bytes": "{n} {unit}",
  "pausedAt": "{n} % en pause",
  "ver": {
    "front": "Front-end {v}",
    "server": "Serveur {c}",
    "local": "local",
    "host": "Render · en ligne depuis {t}",
    "hostLocal": "Serveur · en ligne depuis {t}"
  },
  "time": {
    "dh": "{d} j {h} h",
    "hm": "{h} h {m} min",
    "m": "{m} min"
  },
  "ago": {
    "now": "à l'instant",
    "m": "il y a {n} min",
    "h": "il y a {n} h",
    "d": "il y a {n} j",
    "mShort": "{n} min",
    "hShort": "{n} h",
    "dShort": "{n} j"
  },
  "level": {
    "ok": "Normal",
    "warn": "Élevé",
    "bad": "Critique",
    "unknown": "Mesure en cours"
  },
  "tile": {
    "cpu": "Processeur",
    "cores": "{n} cœurs",
    "mem": "Mémoire (RSS)",
    "ofMb": "/ {n} Mo",
    "lag": "Boucle d'événements",
    "p99": "p99 {n} ms",
    "lagUnit": "ms de latence",
    "sockets": "Sockets connectés",
    "edgeN": "{n} edge",
    "live": "en direct",
    "db": "Base de données",
    "supabase": "Supabase",
    "dbDown": "Pas de réponse",
    "dbUnit": "ms de réponse",
    "uptime": "Disponibilité"
  },
  "memAlert": {
    "title": {
      "warn": "Mémoire élevée",
      "bad": "Mémoire critique",
      "peak": "Pic de mémoire aujourd'hui"
    },
    "body": {
      "warn": "Le serveur utilise {rss} / {limit} Mo ({pct} %) ; il reste à {sustained} % ou plus depuis {min} minutes.",
      "bad": "Le serveur utilise {rss} / {limit} Mo ({pct} %). Si la mémoire est pleine, le serveur redémarre et tout le monde est déconnecté.",
      "peak": "Normal pour l'instant ({pct} %), mais il a atteint {peak} % aujourd'hui."
    },
    "advice": "Passe l'Instance Type sur Render à Standard ({gb} Go).",
    "watch": "Rien à faire pour l'instant ; si cela se reproduit, envisage un plan plus grand.",
    "plan": "Ouvrir le plan Render"
  },
  "flags": {
    "title": "Feature flags",
    "count": "{n} flags",
    "history": "Historique des changements",
    "historyTitle": "Historique des flags",
    "historySub": "Chaque changement de flag, qui l'a fait et pourquoi. Cliquez sur une ligne pour ouvrir le flag.",
    "openAria": "Ouvrir les réglages de {name}",
    "toggleAria": "Activer ou désactiver {name}",
    "tipTitle": "Cliquez sur une ligne",
    "tipBody": "Plateforme, pourcentage et équipe seulement ; chaque changement est écrit dans l'historique et s'annule en un clic."
  },
  "col": {
    "flag": "Flag",
    "scope": "Portée",
    "reach": "Déploiement"
  },
  "flag": {
    "iosGlass": { "name": "iOS Liquid Glass", "desc": "app iPhone et Android", "long": "interface en verre de l'app iPhone et Android" },
    "desktopGlass": { "name": "Liquid Glass bureau", "desc": "bureau et web", "long": "interface bureau et web" },
    "presenceScoped": { "name": "Liste en ligne restreinte", "desc": "interrupteur d'urgence", "long": "le statut en ligne ne va qu'aux amis et aux serveurs communs" },
    "bootDiet": { "name": "Démarrage léger à la reconnexion", "desc": "interrupteur d'urgence", "long": "une liste d'amis inchangée n'est pas renvoyée à la reconnexion" },
    "edgeRealtime": { "name": "Edge realtime", "desc": "Cloudflare", "long": "connexions temps réel via Cloudflare" }
  },
  "reach": {
    "all": "Tout le monde",
    "staff": "Équipe",
    "partial": "Partiel",
    "off": "Désactivé"
  },
  "platform": {
    "web": "Web",
    "electron": "Bureau",
    "ios": "iOS",
    "android": "Android",
    "all": "Toutes"
  },
  "mode": {
    "off": "Désactivé",
    "staff": "Équipe seulement",
    "rollout": "Progressif",
    "all": "Tout le monde",
    "rolloutPct": "Progressif {n} %"
  },
  "drawer": {
    "status": "État",
    "platforms": "Plateformes",
    "separateFlag": "{name} · flag séparé",
    "serverWide": "Ce flag s'applique à tout le serveur : désactivé ou pour tout le monde.",
    "percent": "Pourcentage de déploiement",
    "approx": "Environ {n} / {total} utilisateurs · fixé par identifiant, ne change pas à l'actualisation",
    "staff": "Toujours actif (équipe)",
    "staffEdge": "Utilisateurs de l'équipe (sur toutes les plateformes)",
    "add": "Ajouter",
    "addStaff": "Ajouter quelqu'un à l'équipe",
    "removeStaff": "Retirer @{name}",
    "searchPh": "Rechercher un nom d'utilisateur",
    "noResults": "Personne trouvé",
    "staffChip": "Équipe",
    "reason": "Raison (écrite dans le journal d'audit)",
    "reasonPh": "Expliquez pourquoi vous le changez",
    "autoRollback": "Annuler automatiquement sous 15 min si le taux d'erreurs dépasse 2 %",
    "tryFirst": "L'essayer sur mon propre compte avant d'enregistrer",
    "tryClientOnly": "L'essai sur votre compte ne marche que pour les flags de l'app",
    "tryNow": "Essayer sur mon compte",
    "tried": "Activé seulement dans vos apps ouvertes. Vérifiez, puis publiez pour tout le monde.",
    "publishNow": "Publier maintenant",
    "save": "Enregistrer et publier",
    "guardOn": "L'annulation automatique surveille · jusqu'à {time}",
    "history": "Historique des changements",
    "historyMemory": "L'historique est en mémoire pour l'instant ; un redémarrage du serveur l'efface.",
    "emptyHistory": "Aucun changement pour l'instant",
    "now": "Actuel",
    "revert": "Revenir à ceci",
    "reverted": "annulé",
    "autoReverted": "annulé automatiquement",
    "unknownState": "Pas de détails"
  },
  "edge": {
    "title": "Edge realtime (Cloudflare)",
    "masterAria": "Interrupteur principal edge realtime",
    "bridgeOpen": "Pont connecté",
    "bridgeDown": "Pont coupé",
    "bridgeNone": "Pont non configuré",
    "stats": "{n} sockets edge · {p} % du trafic",
    "legendAll": "Tous les sockets",
    "legendEdge": "Sockets edge",
    "days": "{n} jours",
    "chartAria": "Pic de sockets connectés et de sockets edge sur les 14 derniers jours",
    "chartEmpty": "Pas encore de mesures",
    "stageLabel": "Étape de déploiement",
    "platforms": "Plateformes",
    "team": "Utilisateurs de l'équipe",
    "teamValue": "{n} personnes · sur toutes les plateformes"
  },
  "stage": {
    "shadow": "Ombre",
    "team": "Équipe",
    "p5": "5 %",
    "p25": "25 %",
    "p50": "50 %",
    "p100": "100 %"
  },
  "kill": {
    "title": "Interrupteurs d'urgence",
    "orderLabel": "Ordre",
    "order": {
      "area": "Par domaine",
      "state": "Par état"
    },
    "planned": "Prévu : {range}",
    "plannedActive": "Maintenance en cours : {range}",
    "noPlan": "Aucune maintenance prévue · page Maintenance"
  },
  "group": {
    "chat": "Discussion",
    "account": "Comptes et messages",
    "media": "Voix et vidéo",
    "maintenance": "Maintenance",
    "cut": "Désactivés maintenant",
    "normal": "Le reste"
  },
  "sw": {
    "chatFrozen": "Geler la discussion",
    "slowModeSeconds": "Mode lent",
    "slower": "Réduire le mode lent",
    "faster": "Augmenter le mode lent",
    "registrationEnabled": "Nouvelles inscriptions",
    "dmEnabled": "Messages privés",
    "groupCreationEnabled": "Création de groupes",
    "voice": "Voix",
    "video": "Vidéo",
    "screen": "Écran",
    "media": "Voix · Vidéo · Écran",
    "maintenanceMode": "Mode maintenance"
  },
  "state": {
    "on": "Activé",
    "off": "Désactivé"
  },
  "cut": {
    "apply": "Appliquer",
    "reasonPh": "Pourquoi faites-vous cela ? C'est écrit dans le journal d'audit.",
    "chatFrozen": { "title": "Geler la discussion ?", "body": "Personne ne peut envoyer de message ; les admins ne sont pas concernés. Un clic l'annule." },
    "maintenanceMode": { "title": "Activer le mode maintenance ?", "body": "Les utilisateurs voient l'écran de maintenance. Pour une intervention prévue, utilisez la page Maintenance." },
    "registrationEnabled": { "title": "Fermer les nouvelles inscriptions ?", "body": "Aucun nouveau compte n'est créé ; les comptes existants ne sont pas touchés." },
    "dmEnabled": { "title": "Désactiver les messages privés ?", "body": "Personne ne peut envoyer de nouveaux messages privés ; les salons des serveurs fonctionnent." },
    "groupCreationEnabled": { "title": "Désactiver la création de groupes ?", "body": "Aucun nouveau groupe ; les groupes existants fonctionnent." },
    "voice": { "title": "Désactiver la voix ?", "body": "Les appels et salons vocaux ne démarrent pas." },
    "video": { "title": "Désactiver la vidéo ?", "body": "Les caméras ne s'allument pas ; les appels vocaux continuent." },
    "screen": { "title": "Désactiver le partage d'écran ?", "body": "Aucun nouveau partage d'écran ne démarre." }
  },
  "lim": {
    "title": "Limites",
    "reset": "Revenir aux valeurs par défaut",
    "resetTitle": "Remettre les limites par défaut ?",
    "resetBody": "Longueur des messages 2 000, limite de requêtes désactivée, 60 messages par minute. Annulable.",
    "maxMessageLength": "Longueur des messages",
    "rateLimitGlobalMs": "Limite de requêtes",
    "maxMessagesPerMinute": "Messages par minute",
    "unit": {
      "maxMessageLength": "caractères",
      "rateLimitGlobalMs": "ms",
      "maxMessagesPerMinute": "messages"
    },
    "default": "Par défaut {n}",
    "off": "Désactivée",
    "invalid": "La valeur doit être entre {min} et {max}."
  },
  "bc": {
    "title": "Diffusion",
    "history": "Historique · {n}",
    "historyTitle": "Diffusions récentes",
    "ph": "Écrivez une annonce instantanée pour tout le monde…",
    "preview": "Aperçu",
    "send": "Envoyer",
    "last": "Dernière diffusion {date} · {n} personnes atteintes",
    "none": "Aucune diffusion pour l'instant",
    "noText": "Texte non enregistré",
    "more": "Ciblées et programmées :",
    "toAnnouncements": "Annonces",
    "toLivePopup": "Pop-up en direct",
    "previewTitle": "Voici ce que verront les utilisateurs",
    "sendTitle": "Envoyer à tout le monde ?",
    "reach": "{n} personnes sont en ligne en ce moment ; toutes le voient tout de suite.",
    "seen": "Ce que verront les utilisateurs",
    "seenNote": "Cela s'affiche dans l'app comme une notification de 8 secondes. Les personnes hors ligne ne la voient pas.",
    "desktop": "Bureau et web",
    "phone": "Téléphone",
    "notice": "Serveur : {text}",
    "sendN": "Envoyer à {n} personnes"
  },
  "bk": {
    "title": "Sauvegarde et filtre",
    "last": "Dernière sauvegarde {date}",
    "none": "Pas encore de sauvegarde · télécharger maintenant",
    "filterMoved": "Le filtre de mots est maintenant dans Modération"
  },
  "rs": {
    "title": "Redémarrer le serveur en toute sécurité ?",
    "sub": "{n} sockets connectés · {e} edge · service Render {svc} · coupure estimée {min}-{max} s",
    "subNoSvc": "{n} sockets connectés · {e} edge · coupure estimée {min}-{max} s",
    "step": {
      "stop": { "t": "Arrêter les nouvelles connexions", "d": "Le contrôle de santé Render répond 'vidage'" },
      "notify": { "t": "Prévenir les utilisateurs", "d": "L'app affiche un bandeau avec un compte à rebours de {n} s", "dSkip": "Le bandeau s'affiche sans compte à rebours" },
      "drain": { "t": "Vider les sockets", "d": "{n} → 0 · les clients edge ne passent pas sur le serveur principal" },
      "backup": { "t": "Sauvegarder la mémoire", "d": "Discussion générale, réglages, extrait d'audit · téléchargé", "dSkip": "Aucune sauvegarde téléchargée cette fois" },
      "exit": { "t": "Redémarrer le processus", "d": "Render lance un nouveau processus, les clients se reconnectent seuls" }
    },
    "time": {
      "now": "immédiat",
      "drain": "~20 s",
      "exit": "~40 s",
      "download": "téléchargé",
      "skipped": "ignoré"
    },
    "backupFirst": "Télécharger d'abord la sauvegarde",
    "notifyTeam": "Prévenir l'équipe",
    "skipCountdown": "Passer le compte à rebours",
    "reason": "Raison (obligatoire, écrite dans le journal d'audit)",
    "reasonPh": "Ex. : la mémoire a dépassé 900 Mo, fuite suspectée",
    "typeLabel": "Tapez {word} pour confirmer",
    "confirmWord": "REDÉMARRER",
    "go": "Vider et redémarrer",
    "downloading": "Téléchargement de la sauvegarde…",
    "preview": "Ce que verront les utilisateurs",
    "recent": "Redémarrages récents",
    "cause": {
      "admin": "admin",
      "deploy": "déploiement",
      "auto": "automatique",
      "first": "premier démarrage"
    },
    "deploy": "Déploiement Render {v}",
    "downtime": "{n} s de coupure",
    "noHistory": "Aucun redémarrage enregistré pour l'instant",
    "noHistoryTable": "L'historique apparaîtra une fois la table de base de données créée",
    "maintWarn": "Maintenance prévue le {date}. Si ce n'est pas urgent, attendre ce créneau dérange moins les utilisateurs.",
    "running": "Vidage en cours ; les étapes s'enchaînent.",
    "waiting": "Le serveur est arrêté, en attente du nouveau processus…",
    "back": "Le serveur est revenu · {n} s de coupure",
    "active": "en cours",
    "done": "terminé",
    "left": "encore {n}"
  },
  "strip": {
    "text": "Redémarrage en cours, on revient tout de suite",
    "reconnecting": "Reconnexion…"
  },
  "toast": {
    "undo": "Annuler",
    "undone": "Annulé",
    "saved": "Enregistré",
    "noChange": "Aucun changement",
    "flagOn": "{name} activé",
    "flagOff": "{name} désactivé",
    "flagSaved": "{name} publié",
    "restored": "{name} est revenu à l'état précédent",
    "stage": "Étape edge : {stage}",
    "switched": "{name} : {state}",
    "slow": "Mode lent : {n} s",
    "limits": "Limite enregistrée",
    "limitsReset": "Les limites sont revenues par défaut",
    "backup": "Sauvegarde téléchargée · {size}",
    "broadcast": "Envoyé à {n} personnes",
    "rollback": "Le taux d'erreurs a augmenté ; {name} a été annulé automatiquement"
  },
  "err": {
    "generic": "Une erreur s'est produite. Réessayez.",
    "load": "Impossible de charger les données du système.",
    "stepUp": "Cette action demande un code de vérification.",
    "reason": "Une raison est requise.",
    "percent": "Un déploiement progressif doit être entre 1 % et 99 %.",
    "serverWide": "Ce flag concerne tout le serveur : désactivé ou pour tout le monde.",
    "noStaff": "Ajoutez au moins une personne pour « équipe seulement ».",
    "noPlatform": "Choisissez au moins une plateforme.",
    "confirm": "Le texte de confirmation ne correspond pas.",
    "running": "Un redémarrage est déjà en cours.",
    "stale": "Ce réglage a encore changé depuis.",
    "alreadyUndone": "Ce changement a déjà été annulé.",
    "permission": "Vous n'avez pas accès à cette section.",
    "textLong": "Une annonce fait au plus 500 caractères."
  }
};
