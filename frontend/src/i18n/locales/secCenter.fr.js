/** Panneau d'administration › Centre de sécurité ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_FR = {
  "title": "Centre de sécurité",
  "subtitle": "Suis les attaques en direct, verrouille la plateforme en un geste, garde chaque changement de réglage réversible",
  "threatLevel": "Niveau de menace : {level}",
  "level": { "normal": "Normal", "elevated": "Vigilance", "high": "Élevé" },
  "history": "Historique des réglages",
  "alertsBtn": "Alertes",
  "emergencyLock": "Verrou d'urgence",
  "live": "En direct",
  "polling": "Toutes les 30 s",
  "loading": "Chargement…",
  "saving": "Enregistrement…",
  "retry": "Réessayer",
  "cancel": "Annuler",
  "close": "Fermer",
  "reason": "Motif",
  "reasonRequired": "Motif (obligatoire, inscrit au journal d'audit)",
  "memoryOnly": "Le journal des événements et l'historique des réglages ne sont pas encore durables : tant que les tables n'existent pas, ils sont perdus au redémarrage du serveur.",
  "time": {
    "now": "maintenant",
    "nowCap": "Maintenant",
    "min": "{n} min",
    "hour": "{n} h",
    "day": "{n} j",
    "hm": "{h} h {m} min",
    "hours": "{n, plural, one {# heure} other {# heures}}",
    "minutes": "{n, plural, one {# minute} other {# minutes}}",
    "today": "Aujourd'hui {time}",
    "yesterday": "Hier {time}",
    "yesterdayShort": "Hier {time}"
  },
  "score": {
    "title": "Score de sécurité",
    "how": "Comment il est calculé",
    "aria": "Score de sécurité {score} sur 100",
    "passed": "{passed} contrôles réussis sur {total}",
    "lastWeek": "La semaine dernière {n}",
    "firstWeek": "Première mesure pour la comparaison hebdomadaire",
    "potential": "Avec {n, plural, one {# recommandation} other {# recommandations}}, tu atteins {score}",
    "allApplied": "Plus aucune recommandation à appliquer",
    "checks": "Contrôles de sécurité",
    "points": "+{n} pts",
    "remind": "Relancer",
    "remindGo": "Envoyer un rappel",
    "viewLocks": "Verrous",
    "okSr": "réussi"
  },
  "grade": { "excellent": "Excellent", "good": "Bon", "fair": "Moyen", "poor": "Faible" },
  "check": {
    "humanCheck": {
      "name": "Vérification humaine à l'inscription",
      "ok": "La vérification humaine à l'inscription est active",
      "fail": "La vérification humaine à l'inscription est désactivée",
      "why": "Pour arrêter les inscriptions de bots à l'entrée, il faut un service de vérification (par exemple Cloudflare Turnstile). Il n'est pas encore configuré ; en attendant, le gel des inscriptions et le blocage des e-mails jetables protègent contre les vagues de bots."
    },
    "admin2fa": {
      "name": "2FA des admins",
      "ok": "Les {total} admins utilisent la 2FA",
      "fail": "{missing} admins sur {total} sans 2FA",
      "why": "Les admins sans 2FA ne peuvent pas ouvrir le panneau. Le rappel leur affiche un avis pour activer l'application d'authentification s'ils sont connectés en ce moment."
    },
    "totpEnforced": {
      "name": "2FA obligatoire pour les admins",
      "ok": "Les actions d'administration demandent un code",
      "fail": "La 2FA obligatoire pour les admins n'est pas active",
      "why": "Tant que les tables de l'authentificateur manquent, les actions d'administration ne demandent pas de code. La migration de la base de données doit être appliquée."
    },
    "dmMinAge": {
      "name": "Ancienneté minimale du compte pour les MP",
      "ok": "Ancienneté minimale pour les MP : {hours} h",
      "fail": "Aucune ancienneté minimale du compte pour les MP",
      "why": "Les comptes tout neufs ne peuvent pas envoyer de MP en masse pendant leurs premières heures, ce qui coupe la plupart des vagues de spam et d'hameçonnage. Recommandé : 24 heures."
    },
    "loginLimit": {
      "name": "Limite de tentatives de connexion",
      "ok": "Limite de tentatives {n} / min",
      "fail": "Limite de tentatives trop élevée ({n} / min)",
      "why": "Tentatives de mot de passe erronées par compte et par minute. Une valeur basse ralentit la force brute. Recommandé : 5 / min."
    },
    "disposableEmail": {
      "name": "Blocage des e-mails jetables",
      "ok": "Le blocage des e-mails jetables est actif",
      "fail": "Le blocage des e-mails jetables est désactivé",
      "why": "Refuse les inscriptions avec des services d'e-mail temporaire (tempmail, yopmail…), la source la plus courante de comptes robots."
    },
    "messageRate": {
      "name": "Limite de messages",
      "ok": "Limite de messages {n} / min",
      "fail": "Limite de messages hors de la plage sûre ({n} / min)",
      "why": "Messages qu'une personne peut envoyer par minute. Entre 1 et 120, elle limite les raids de spam. Recommandé : 60 / min."
    },
    "dmRate": {
      "name": "Intervalle entre MP",
      "ok": "Intervalle entre MP {ms} ms",
      "fail": "Intervalle entre MP trop court ({ms} ms)",
      "why": "Délai minimal entre deux MP. Trop court, des scripts peuvent envoyer des dizaines de MP par seconde. Recommandé : 200 ms."
    },
    "accessBans": {
      "name": "Interdictions d'accès",
      "ok": "Les interdictions d'IP et d'appareil fonctionnent",
      "fail": "Les interdictions d'IP et d'appareil ne fonctionnent pas",
      "why": "Les tables d'interdictions d'accès ou la clé de signature manquent ; les interdictions d'IP et de réseau n'arrêtent personne pour l'instant."
    },
    "eventLog": {
      "name": "Journal des événements de sécurité",
      "ok": "Les événements de sécurité sont conservés durablement",
      "fail": "Les événements de sécurité sont seulement en mémoire",
      "why": "Tant que la table des événements n'existe pas, le flux en direct est perdu au redémarrage et il n'y a pas de comparaison hebdomadaire."
    },
    "auditLog": {
      "name": "Journal d'audit",
      "ok": "Le journal d'audit est durable",
      "fail": "Le journal d'audit n'est pas durable",
      "why": "La table du journal d'audit manque ; les actions d'administration ne sont gardées qu'en mémoire."
    },
    "noOpenLock": {
      "name": "Verrou sans fin",
      "ok": "Aucun verrou actif sans fin",
      "fail": "Verrou sans fin actif : {modes}",
      "why": "Un verrou d'urgence jusqu'à levée manuelle gêne les utilisateurs inutilement s'il est oublié."
    }
  },
  "explain": {
    "title": "Comment le score est calculé",
    "body": "Chaque contrôle a un poids ; le score est la part du poids réussi sur le total (sur 100). Il est enregistré toutes les 12 heures et comparé à la semaine précédente.",
    "grades": "90 et plus excellent, 75 et plus bon, 50 et plus moyen, en dessous faible."
  },
  "fix": {
    "title": "Appliquer la recommandation",
    "sets": "Réglera",
    "score": "Score",
    "apply": "Appliquer",
    "all": "Tout appliquer ({n})"
  },
  "threat": {
    "title": "Résumé des menaces",
    "window": "dernières 24 heures",
    "spike": "{time} vague de force brute",
    "calm": "Aucune vague de force brute",
    "chartAria": "Connexions échouées, limites de débit et IP bloquées sur les dernières 24 heures"
  },
  "kpi": {
    "failed": "Connexions échouées",
    "locked": "Comptes verrouillés",
    "blocked": "IP bloquées",
    "rate": "Limites atteintes",
    "vsYesterday": "{pct} par rapport à hier",
    "flat": "comme hier",
    "new": "aucun hier",
    "activeBans": "{n} interdictions actives"
  },
  "legend": { "failed": "Connexions échouées", "rate": "Limite de débit", "blocked": "IP bloquées" },
  "locks": {
    "title": "Modes de verrou d'urgence",
    "liftAll": "Tout lever",
    "permanent": "Réglages d'accès permanents",
    "fromSystem": "Actif depuis Système",
    "chatFrozenSub": "Personne ne peut envoyer de messages",
    "regOff": "Les inscriptions sont désactivées",
    "regOffSub": "Aucun nouveau compte ne peut être créé",
    "openSystem": "Ouvrir Système",
    "liftsIn": "Levé dans {time}",
    "untilLifted": "Jusqu'à levée manuelle",
    "detailAria": "Détails du verrou {name}"
  },
  "lockMode": {
    "registration": {
      "name": "Gel des inscriptions",
      "short": "gel des inscriptions",
      "desc": "Aucun nouveau compte",
      "long": "Aucun nouveau compte (e-mail, Google, Apple). Les comptes existants peuvent se connecter."
    },
    "dm": {
      "name": "Gel des MP",
      "short": "gel des MP",
      "desc": "Aucun nouveau MP",
      "long": "Aucun nouveau message privé ; les discussions de serveurs et de groupes restent ouvertes."
    },
    "readOnly": {
      "name": "Mode lecture seule",
      "short": "mode lecture seule",
      "desc": "Personne ne peut envoyer de message",
      "long": "Aucun message nulle part, aucun nouveau groupe ni serveur."
    }
  },
  "perm": {
    "groups": {
      "name": "Création de groupes",
      "on": "Les utilisateurs peuvent créer des groupes",
      "off": "Impossible de créer des groupes",
      "offTitle": "Désactiver la création de groupes ?",
      "offBody": "Les utilisateurs ne peuvent plus créer de groupes ; les groupes existants continuent. Les admins ne sont pas concernés."
    },
    "dm": {
      "name": "Messages privés",
      "on": "Les MP sont activés",
      "off": "Les MP sont désactivés",
      "offTitle": "Désactiver les messages privés de façon permanente ?",
      "offBody": "Personne ne peut envoyer de nouveaux MP ; c'est un réglage permanent qui ne se rétablit pas seul. Pour une pause temporaire, utilise le gel des MP."
    },
    "offGo": "Désactiver"
  },
  "lift": {
    "title": "Lever {name} ?",
    "titleAll": "Lever {n, plural, one {# verrou} other {# verrous}} ?",
    "body": "Les réglages reviennent à leur état d'avant le verrou, le bandeau d'information disparaît et c'est inscrit au journal d'audit.",
    "go": "Lever le verrou"
  },
  "lockInfo": {
    "reason": "Motif",
    "by": "Lancé par",
    "started": "Début",
    "ends": "Fin",
    "band": "Bandeau d'information",
    "extend": "Prolonger",
    "plus": "+{time}",
    "lift": "Lever le verrou"
  },
  "lockDlg": {
    "title": "Lancer un verrou d'urgence",
    "sub": "Les modes choisis s'appliquent immédiatement sur toute la plateforme ; les admins ne sont pas concernés.",
    "modes": "Verrouiller",
    "alreadyOn": "Actif · {time}",
    "duration": "Fin automatique",
    "reason": "Motif (obligatoire, inscrit au journal d'audit)",
    "reasonPh": "Que se passe-t-il ? Ex. : depuis 20:09, force brute et vague d'inscriptions de robots depuis une même source.",
    "code": "Code de vérification",
    "banner": "Afficher un bandeau d'information aux utilisateurs",
    "pickOne": "Choisis au moins un verrou",
    "starting": "Lancement…",
    "confirm": {
      "15m": "{n, plural, one {Verrouiller 15 minutes} other {Lancer # verrous pour 15 minutes}}",
      "1h": "{n, plural, one {Verrouiller 1 heure} other {Lancer # verrous pour 1 heure}}",
      "6h": "{n, plural, one {Verrouiller 6 heures} other {Lancer # verrous pour 6 heures}}",
      "24h": "{n, plural, one {Verrouiller 24 heures} other {Lancer # verrous pour 24 heures}}",
      "manual": "{n, plural, one {Verrouiller jusqu'à levée manuelle} other {Lancer # verrous jusqu'à levée manuelle}}"
    },
    "impact": "Aperçu de l'impact",
    "online": "Utilisateurs en ligne",
    "signups": "Nouvelles inscriptions, dernière heure",
    "dms": "Nouveaux MP, dernière heure",
    "autoEnd": "Levée automatique",
    "bandTitle": "Bandeau vu par les utilisateurs",
    "device": "Appareil de l'aperçu",
    "desktop": "Ordinateur",
    "phone": "Téléphone",
    "noBand": "Aucun bandeau d'information ne sera affiché",
    "pickForBand": "Choisis un verrou pour voir le bandeau ici",
    "registrationWhere": "Les personnes qui tentent de s'inscrire le voient sur l'écran d'inscription.",
    "noteAuto": "À l'échéance, les réglages reviennent à leur état d'avant le verrou et la salle des admins est prévenue.",
    "noteManual": "Le verrou dure jusqu'à ce que tu le lèves. Il apparaît dans les alertes et dans le score pour ne pas être oublié."
  },
  "duration": { "15m": "15 min", "1h": "1 heure", "6h": "6 heures", "24h": "24 heures", "manual": "Jusqu'à levée manuelle" },
  "band": {
    "registration": "Les nouvelles inscriptions sont temporairement fermées. {when}",
    "dm": "L'envoi de MP est temporairement désactivé. {when}",
    "readOnly": "Descall est en lecture seule pour un moment. Impossible d'envoyer des messages. {when}",
    "when": {
      "15m": "Retour dans 15 minutes environ.",
      "1h": "Retour dans 1 heure environ.",
      "6h": "Retour dans 6 heures environ.",
      "24h": "Retour dans 24 heures environ."
    },
    "whenManual": "Retour dès que possible."
  },
  "feed": {
    "title": "Flux des menaces en direct",
    "sub": "événements de connexion, d'inscription, de limite de débit et d'interdiction d'accès",
    "openAll": "Tout afficher",
    "collapse": "Réduire",
    "filters": "Type d'événement",
    "pause": "Mettre le flux en pause",
    "resume": "Reprendre le flux",
    "export": "Télécharger en CSV",
    "newEvents": "{n, plural, one {# nouvel événement · afficher} other {# nouveaux événements · afficher}}",
    "emptyTitle": "Tout est calme",
    "emptyBody": "Aucun événement de sécurité récent. Les nouveaux apparaissent ici en direct.",
    "emptyFilter": "Aucun événement de ce type.",
    "loadMore": "Événements plus anciens",
    "sourceFilter": "Source : {ip}",
    "clearSource": "Retirer le filtre de source"
  },
  "filter": {
    "all": "Tous",
    "bruteForce": "Force brute",
    "failedLogin": "Connexion échouée",
    "blockedIp": "IP bloquée",
    "rateLimit": "Limite de débit",
    "signupDenied": "Inscription refusée"
  },
  "ev": {
    "unknownAccount": "un compte inexistant",
    "brute_force": {
      "title": "Attaque par force brute",
      "line": "{attempts} tentatives sur {accounts} comptes en {minutes} min",
      "lineUser": "{attempts} tentatives sur {accounts} comptes, dont {user}, en {minutes} min"
    },
    "failed_login": {
      "title": "Connexion échouée",
      "lineUser": "{user} · mauvais mot de passe, {n} tentatives",
      "lineUnknown": "Nom d'utilisateur inconnu · {n} tentatives"
    },
    "account_locked": {
      "title": "Compte verrouillé temporairement",
      "lineMinute": "{user} · {n} connexions échouées en 1 minute, délai d'attente",
      "lineWindow": "{user} · trop de tentatives en 15 minutes, refusé {n} fois"
    },
    "ip_blocked": {
      "title": "Limite d'IP dépassée",
      "lineLogin": "Les tentatives de connexion ont dépassé la limite d'IP · refusé {n} fois",
      "lineRegister": "Les tentatives d'inscription ont dépassé la limite d'IP · refusé {n} fois"
    },
    "access_ban": {
      "title": "Arrêté par une interdiction d'accès",
      "line": "{kind} {label} · tentative de {action}"
    },
    "rate_limit": {
      "title": "Limite de débit dépassée",
      "line": "{user} · limite de messages {limit} / min, {n} tentatives refusées"
    },
    "signup_denied": {
      "title": "Inscription refusée",
      "lineDisposable": "{email} · e-mail jetable",
      "lineClosed": "Inscription via {method} pendant la fermeture · {n} tentatives"
    },
    "admin_step_up": {
      "title": "Vérification d'admin",
      "lineOk": "{user} · code correct",
      "lineFail": "{user} · mauvais code, {n} tentatives"
    }
  },
  "banKind": { "ip": "Interdiction d'IP", "network": "Interdiction de réseau", "device": "Interdiction d'appareil" },
  "banAction": { "login": "connexion", "register": "inscription", "socket": "connexion temps réel", "oauth": "connexion Google / Apple", "api": "requête de l'app" },
  "method": { "email": "e-mail", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "Bloquer l'IP",
    "banNet": "Bloquer le réseau",
    "banUser": "Bannir",
    "inspect": "Examiner",
    "viewBan": "Interdiction",
    "session": "Session"
  },
  "csv": { "time": "Heure", "type": "Type", "count": "Nombre", "source": "Source", "network": "Réseau", "account": "Compte", "detail": "Détail" },
  "sources": {
    "title": "Sources les plus actives",
    "ban": "Bloquer",
    "banned": "Bloquée",
    "empty": "Aucune source avec des tentatives ces dernières 24 heures.",
    "openFeed": "Voir les événements de cette source",
    "unknownPlace": "Lieu inconnu"
  },
  "srcBan": {
    "title": "Bloquer {ip} ?",
    "sub": "Une interdiction d'accès bloque la connexion, l'inscription et les liaisons depuis cette adresse ; les admins ne sont pas concernés.",
    "what": "Quoi bloquer",
    "ip": "Seulement cette IP",
    "network": "Tout le réseau (/24)",
    "netWarn": "Une interdiction de réseau bloque tout le monde sur le même réseau (par exemple une résidence ou un bureau).",
    "duration": "Durée",
    "reasonPh": "Ex. : 214 tentatives sur 37 comptes en 9 minutes",
    "privacy": "L'adresse elle-même n'est jamais conservée ; l'interdiction utilise l'empreinte chiffrée gardée avec l'événement.",
    "goIp": "Bloquer l'IP",
    "goNet": "Bloquer le réseau",
    "banning": "Blocage…"
  },
  "banDur": { "1d": "1 jour", "7d": "7 jours", "30d": "30 jours", "90d": "90 jours", "permanent": "Permanent" },
  "evd": {
    "title": "Événement",
    "when": "Heure",
    "count": "Répétitions",
    "countVal": "{n} fois, la première {from}",
    "source": "Source",
    "network": "Réseau",
    "account": "Compte",
    "status": "État de la source",
    "noSource": "Pas d'adresse (dans l'app)",
    "noAccount": "Aucun compte",
    "sourceBanned": "Bloquée",
    "sourceOpen": "Non bloquée",
    "openUser": "Fiche utilisateur",
    "openBans": "Interdictions d'accès",
    "allFromSource": "Tous les événements de cette source",
    "copy": "Copier le résumé",
    "copied": "Copié",
    "timeline": "Événements récents de la même source et du même compte",
    "noRelated": "Aucun autre événement."
  },
  "hist": {
    "heading": "Historique des changements de réglages",
    "sub": "Chaque changement des réglages de sécurité, son auteur et la valeur précédente",
    "filters": "Type de changement",
    "cat": { "all": "Tous", "locks": "Verrous", "rateLimits": "Limites de débit", "signup": "Protection des inscriptions", "access": "Accès" },
    "system": "système",
    "before": "avant",
    "after": "après",
    "noReason": "Aucun motif indiqué",
    "autoExpired": "Délai écoulé, le verrou s'est levé tout seul",
    "revert": "Annuler",
    "reverting": "Annulation…",
    "reverted": "Annulé {user}",
    "isRevert": "Annulation",
    "expired": "Expiré",
    "confirmTitle": "Annuler ce changement ?",
    "revertOne": "{name} passe de {to} à {from}.",
    "revertMany": "{n, plural, one {# réglage revient} other {# réglages reviennent}} à la valeur précédente.",
    "revertLock": "Le verrou ({modes}) est levé maintenant.",
    "revertAudited": "L'annulation est aussi inscrite au journal d'audit.",
    "stale": "Ce réglage a encore changé depuis ; l'annulation écrase la dernière valeur.",
    "reasonPh": "Ex. : Le raid est fini, retour à la limite normale.",
    "memoryOnly": "L'historique n'est pas encore durable : tant que la table n'existe pas, il est perdu au redémarrage.",
    "emptyTitle": "Aucun changement pour l'instant",
    "emptyBody": "Chaque changement des réglages de sécurité et du système apparaît ici avec sa valeur précédente.",
    "loadMore": "Changements plus anciens",
    "title": {
      "lock": "Verrou d'urgence : {modes}",
      "lockLift": "Verrou d'urgence levé : {modes}",
      "lockExpired": "Verrou d'urgence expiré : {modes}",
      "lockExtend": "Fin du verrou modifiée : {modes}",
      "settings": "Réglages de sécurité ({n})",
      "recommended": "Réglages recommandés appliqués",
      "revert": "Annulé : {title}"
    }
  },
  "setting": {
    "registrationEnabled": "Inscriptions",
    "dmEnabled": "Messages privés",
    "readOnlyMode": "Mode lecture seule",
    "groupCreationEnabled": "Création de groupes",
    "maxLoginAttempts": "Limite de tentatives de connexion",
    "maxMessagesPerMinute": "Limite de messages",
    "dmRateLimitMs": "Intervalle entre MP",
    "dmMinAccountAgeHours": "Ancienneté minimale pour les MP",
    "disposableEmailBlock": "Blocage des e-mails jetables",
    "chatFrozen": "Gel du chat",
    "maintenanceMode": "Mode maintenance",
    "slowModeSeconds": "Mode lent",
    "rateLimitGlobalMs": "Intervalle global des messages",
    "maxMessageLength": "Message le plus long"
  },
  "val": {
    "on": "activé",
    "off": "désactivé",
    "none": "aucun",
    "rule": "règle de déploiement",
    "untilLifted": "jusqu'à levée manuelle",
    "autoOnAt": "se réactive à {time}",
    "autoOffAt": "se désactive à {time}"
  },
  "unit": { "perMin": "{n} / min", "ms": "{n} ms", "hours": "{n} h" },
  "alerts": {
    "title": "Alertes",
    "none": "Rien ne demande ton attention pour l'instant.",
    "desktop": "Notification sur ordinateur lors d'une vague de force brute",
    "desktopHint": "Tant que cette page est ouverte, dans ce navigateur",
    "desktopBlocked": "Le navigateur n'autorise pas les notifications.",
    "notifyTitle": "Vague de force brute",
    "notifyBody": "Tentatives de connexion sur de nombreux comptes depuis {ip}",
    "burst": { "title": "Vague de force brute", "body": "Depuis {ip}, {count} vagues ces dernières 24 heures" },
    "lock": { "title": "{mode} actif", "body": "Se lève tout seul dans {time}" },
    "lockOpen": { "title": "{mode} actif sans fin", "body": "Dure jusqu'à levée manuelle" },
    "failedSpike": { "title": "Hausse des connexions échouées", "body": "{pct}% de plus qu'hier" },
    "lockedSpike": { "title": "Hausse des comptes verrouillés", "body": "{n} comptes verrouillés de plus qu'hier" },
    "admin2fa": { "title": "Un admin n'a pas de 2FA", "body": "{missing} admins sur {total} sans 2FA" }
  },
  "toast": {
    "saved": "Réglage enregistré et ajouté à l'historique.",
    "applied": "Recommandation appliquée.",
    "appliedAll": "{n, plural, one {# recommandation appliquée.} other {# recommandations appliquées.}}",
    "locked": "{n, plural, one {Verrou lancé.} other {# verrous lancés.}}",
    "lifted": "Verrou levé.",
    "extended": "Fin du verrou mise à jour.",
    "reverted": "Changement annulé.",
    "reminded": "Rappel envoyé à {n} admins, {online} l'ont vu maintenant.",
    "bannedIp": "IP bloquée, {kicked} connexions fermées.",
    "bannedNet": "Réseau bloqué, {kicked} connexions fermées.",
    "userBanned": "Utilisateur banni."
  },
  "err": {
    "generic": "Un problème est survenu. Réessaie.",
    "load": "Impossible de charger les données de sécurité.",
    "REASON_REQUIRED": "Indique un motif.",
    "ALREADY_ON": "Ce verrou est déjà actif.",
    "BAD_DURATION": "Durée non valide.",
    "NO_MODES": "Choisis au moins un verrou.",
    "NOT_ON": "Ce verrou n'est pas actif.",
    "LOCK_ENDED": "Ce verrou est déjà terminé.",
    "ALREADY_REVERTED": "Ce changement a déjà été annulé.",
    "NOT_REVERTIBLE": "Ce changement ne peut pas être annulé.",
    "ALREADY_BANNED": "Cette adresse est déjà bloquée.",
    "SOURCE_NOT_FOUND": "Cette source n'est plus dans le flux de sécurité.",
    "BANS_UNAVAILABLE": "Les interdictions d'accès ne sont pas encore actives.",
    "ADMIN_PERMISSION_DENIED": "Tu n'as pas l'autorisation pour cela.",
    "STEP_UP_REQUIRED": "Cette action demande un code de vérification.",
    "replay": "Ce code vient d'être utilisé. Attends le suivant.",
    "invalid": "Code incorrect."
  },
  "notice": {
    "dm": "L'envoi de MP est temporairement désactivé.",
    "readOnly": "Descall est en lecture seule pour un moment ; impossible d'envoyer des messages pour l'instant.",
    "registration": "Les nouvelles inscriptions sont temporairement fermées.",
    "until": "Retour vers {time}.",
    "soon": "Retour dès que possible.",
    "dismiss": "Masquer le bandeau"
  }
};
