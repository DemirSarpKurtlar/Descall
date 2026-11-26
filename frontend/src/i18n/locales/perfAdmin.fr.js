/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_FR = {
  "title": "Performances",
  "crumb": "Système › Performances · mesures d’utilisateurs réels et Lighthouse CI",
  "sampling": "échantillonnage {pct}",
  "dataAgoSec": "données il y a {n} s",
  "dataAgoMin": "données il y a {n} min",
  "notReady": "Les tables de performances ne sont pas encore créées (20261124v_perf.sql). Les données arrivent dès que la migration est appliquée.",
  "retry": "Réessayer",
  "close": "Fermer",
  "cancel": "Annuler",
  "save": "Enregistrer",
  "saving": "Enregistrement…",
  "undo": "Annuler",
  "and": "et",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} s"
  },
  "tab": {
    "rum": "Utilisateurs réels",
    "rumShort": "Utilisateurs",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Alertes"
  },
  "live": {
    "long": "En direct · {n} sessions / 5 min",
    "short": "Direct · {n}",
    "waiting": "Direct · en attente",
    "title": "Chargements de page échantillonnés des 5 dernières minutes"
  },
  "export": {
    "button": "Exporter",
    "done": "{n} lignes téléchargées en CSV · consigné dans le journal",
    "failed": "Export impossible."
  },
  "rules": {
    "button": "Règles d’alerte",
    "title": "Règle d’alerte",
    "subtitle": "Prévient le salon des admins et vous quand une métrique se dégrade dans une nouvelle version.",
    "metric": "Métrique",
    "platform": "Plateforme",
    "condition": "Condition",
    "conditionText": "p75, par rapport à la version précédente",
    "threshold": "Dégradation",
    "thresholdUnit": "% ou plus",
    "minSessions": "Mesures minimum",
    "minUnit": "mesures",
    "notify": "Notifier",
    "ch": {
      "adminRoom": "Salon des admins (message système)",
      "ownerPush": "Notification au propriétaire (téléphone)",
      "email": "Résumé par e-mail",
      "errorLog": "Ouvrir une fiche dans les journaux d’erreurs"
    },
    "chSub": {
      "adminRoom": "admins avec le panneau ouvert",
      "ownerPush": "web, iOS, Android",
      "email": "une fois par jour",
      "errorLog": "une fois par alerte"
    },
    "mute": "Mettre en sourdine",
    "muteOpt": {
      "none": "Jamais",
      "release24h": "Même version 24 h",
      "7d": "7 jours"
    },
    "save": "Enregistrer la règle",
    "saved": "Règle enregistrée ; la modification figure dans le journal.",
    "previewTitle": "Aperçu · 90 derniers jours",
    "previewSome": "fois elle se serait déclenchée : chaque fois une vraie régression.",
    "previewNone": "fois : elle ne se serait pas déclenchée en 90 jours.",
    "previewInvalid": "Choisissez au moins une métrique et une plateforme.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "Aperçu dans le salon des admins",
    "roomOff": "Salon désactivé : ce message n’est pas envoyé.",
    "auditNote": "Les changements de règle vont au journal et s’y annulent."
  },
  "query": {
    "label": "Requête de performances",
    "placeholder": "Ajouter un filtre : page, plateforme, version, appareil, connexion, pays, ID utilisateur",
    "filters": "Filtres",
    "remove": "Retirer le filtre {label}",
    "suggestions": "Suggestions"
  },
  "tok": {
    "range": "derniers",
    "platform": "plateforme",
    "version": "version",
    "route": "page",
    "device": "appareil",
    "connection": "connexion",
    "country": "pays",
    "user": "utilisateur"
  },
  "range": {
    "24h": "24 heures",
    "7d": "7 jours",
    "28d": "28 jours",
    "90d": "90 jours"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Entrée de gamme",
    "mid": "Milieu de gamme",
    "high": "Haut de gamme"
  },
  "conn": {
    "wifi": "Wi-Fi",
    "ethernet": "Ethernet",
    "4g": "4G",
    "3g": "3G",
    "2g": "2G",
    "offline": "Hors ligne"
  },
  "metric": {
    "lcp": "LCP",
    "inp": "INP",
    "cls": "CLS",
    "fcp": "FCP",
    "ttfb": "TTFB",
    "msglist": "Première liste de messages",
    "voicejoin": "Rejoindre le vocal",
    "appstart": "Démarrage de l’app"
  },
  "metricSub": {
    "lcp": "Plus grand contenu",
    "inp": "Délai d’interaction",
    "cls": "Décalage de mise en page",
    "fcp": "Premier contenu",
    "ttfb": "Premier octet",
    "msglist": "à l’ouverture d’un chat",
    "voicejoin": "connexion au salon",
    "appstart": "démarrage à froid"
  },
  "dist": {
    "good": "Bon {pct}",
    "ni": "Moyen {pct}",
    "poor": "Mauvais {pct}"
  },
  "route": {
    "app_kanal": "Salon du serveur",
    "app_dm": "Messages privés",
    "app_grup": "Discussion de groupe",
    "app_ses": "Salon vocal",
    "app": "App",
    "_": "Page d’accueil",
    "_download": "Page de téléchargement",
    "_features": "Fonctionnalités",
    "_login": "Connexion",
    "_blog": "Blog"
  },
  "views": {
    "label": "Vues enregistrées",
    "all": "Tout",
    "mobileSlow": "Mobile · réseau lent",
    "desktopStart": "Démarrage bureau",
    "voice": "Salon vocal",
    "release": "{platform} {version}",
    "regression": "régression",
    "save": "Enregistrer la vue",
    "copyLink": "Copier le lien",
    "linkCopied": "Lien copié : l’admin qui l’ouvre voit les mêmes filtres.",
    "notReady": "Les vues enregistrées arrivent après la migration.",
    "menu": "Vue",
    "delete": "Supprimer la vue",
    "deleted": "« {name} » supprimée.",
    "saved": "« {name} » enregistrée.",
    "saveTitle": "Enregistrer la vue",
    "saveSubtitle": "Ces filtres reviennent en un clic.",
    "name": "Nom",
    "namePh": "ex. régression Android 4.1.4",
    "contains": "Filtres inclus",
    "shared": "Partager avec les autres admins",
    "sharedSub": "Visible par tous ceux qui ont la section Performances."
  },
  "alert": {
    "lead": "{version} : {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} mesures.",
    "mostOn": "Surtout sur",
    "also": "{n} autres alertes.",
    "firstSeen": "Vu pour la première fois le {when}.",
    "share": "La version est chez {pct} des utilisateurs.",
    "review": "Examiner",
    "errorLog": "Ouvrir une fiche d’erreur",
    "errorAgain": "Voir la fiche d’erreur",
    "errorOpened": "Fiche ouverte dans les journaux d’erreurs.",
    "errorExists": "Cette alerte a déjà une fiche d’erreur.",
    "gotoErrors": "Ouvrir dans les journaux d’erreurs",
    "hide": "Masquer",
    "hidden": "Alerte masquée (pour tous).",
    "show": "Réafficher",
    "shown": "L’alerte est réaffichée.",
    "vsPrev": "version précédente {version}",
    "hasError": "fiche d’erreur ouverte"
  },
  "alerts": {
    "open": "Alertes ouvertes",
    "hidden": "Masquées",
    "none": "Aucune alerte ouverte. Les versions qui dépassent le seuil apparaissent ici.",
    "how": "Toutes les 15 minutes, la dernière version de chaque plateforme est comparée à la précédente sur le p75 ; au-delà du seuil, une alerte s’ouvre."
  },
  "chart": {
    "title": "Tendance p75",
    "metric": "Métrique du graphique",
    "app": "App",
    "hint": "Cliquez une ligne : filtrer la plateforme",
    "aria": "Tendance p75 {metric} par plateforme",
    "goodLine": "Seuil bon · {value}",
    "tipTitle": "{when} · p75",
    "flag": "flag : {name} {pct}",
    "flagOff": "désactivé",
    "empty": "Aucune donnée sur cette période.",
    "noData": "Aucune mesure avec ces filtres."
  },
  "releases": {
    "title": "Comparaison des versions",
    "version": "Version",
    "share": "Part",
    "start": "Démarrage",
    "empty": "Pas encore de données de version.",
    "mix": "Part par plateforme",
    "sessions": "{n} sessions"
  },
  "group": {
    "route": "Page",
    "platform": "Plateforme",
    "version": "Version",
    "device": "Classe d’appareil",
    "connection": "Connexion",
    "country": "Pays"
  },
  "table": {
    "title": {
      "route": "Pages les plus lentes",
      "platform": "Plateformes",
      "version": "Versions",
      "device": "Classes d’appareils",
      "connection": "Connexions",
      "country": "Pays"
    },
    "groupBy": "Regrouper par",
    "distOf": "Répartition : {metric}",
    "sortBy": "Par {metric} p75",
    "sortLabel": "Tri",
    "platform": "Plateforme",
    "sessions": "Sessions",
    "dist": "Répartition",
    "trend": "Tendance",
    "empty": "Aucune mesure avec ces filtres.",
    "emptySub": "Élargissez les filtres ou la période.",
    "rowMenu": "Actions de ligne",
    "open": "Ouvrir le détail",
    "filterTo": "Seulement {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Résumé",
      "breakdown": "Ventilation",
      "attribution": "Attribution",
      "users": "Utilisateurs lents",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} sessions",
    "allPlatforms": "toutes plateformes",
    "copy": "Copier la valeur",
    "copied": "Copié.",
    "heatTitle": "INP p75 · plateforme × classe",
    "heatHint": "cliquez une case : filtre",
    "none": "aucun",
    "samples": "{n} mesures",
    "noData": "Pas de données.",
    "attrTitle": "Attribution · interactions les plus lentes (INP)",
    "attrEmpty": "Aucune attribution sur les {days} derniers jours.",
    "itype": {
      "keyboard": "keydown · clavier",
      "pointer": "click · appui / clic",
      "other": "interaction"
    },
    "shareOf": "{pct} des interactions",
    "lcpEl": "Élément LCP :",
    "onPages": "{pct} des chargements",
    "usersTitle": "Utilisateurs les plus lents",
    "usersHint": "ID utilisateur uniquement",
    "usersEmpty": "Aucun utilisateur connecté lent.",
    "dossier": "Dossier utilisateur",
    "userSessions": "{n} sessions de cet utilisateur",
    "userSessionsAll": "Sessions de cet utilisateur",
    "lhTitle": "Lighthouse · main",
    "lhNone": "Lighthouse CI ne mesure pas cette page.",
    "lhApp": "Lighthouse ne mesure pas les écrans de l’app, seulement les pages publiques.",
    "saveView": "Enregistrer comme vue",
    "openLh": "Ouvrir dans Lighthouse",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Système Descall",
    "badge": "SYSTÈME",
    "text": "Alerte de performances : {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} mesures.",
    "open": "Ouvrir dans le panneau"
  },
  "filters": {
    "title": "Filtres",
    "subtitle": "Plusieurs valeurs possibles ; vide signifie tout.",
    "userPh": "ID utilisateur (complet ou 8 premiers caractères)",
    "clear": "Effacer",
    "apply": "Appliquer"
  },
  "err": {
    "generic": "Un problème est survenu.",
    "load": "Chargement impossible.",
    "NO_METRIC": "Choisissez au moins une métrique.",
    "NO_PLATFORM": "Choisissez au moins une plateforme.",
    "BAD_THRESHOLD": "Le seuil doit être entre 1 et 500.",
    "BAD_MIN_SESSIONS": "Le minimum de mesures doit être d’au moins 10.",
    "NAME_REQUIRED": "Saisissez un nom.",
    "PERF_UNAVAILABLE": "Les tables de performances ne sont pas encore créées."
  },
  "lh": {
    "placeholder": "Numéro de PR, branche, auteur, page…",
    "tok": {
      "compare": "comparer",
      "state": "état",
      "text": "recherche"
    },
    "rerun": "Tout relancer",
    "rerunHint": "Ouvre le workflow Lighthouse dans GitHub Actions",
    "view": {
      "open": "PR ouvertes",
      "over": "Hors budget",
      "main": "historique de main",
      "merged": "Fusionnées récemment"
    },
    "method": "{pages} pages × 3 passes · médiane",
    "lastRun": "dernier passage {when}",
    "minAgo": "il y a {n} min",
    "hourAgo": "il y a {n} h",
    "yesterday": "hier",
    "overLead": "#{pr} dépasse le budget de performances :",
    "budget": "(budget {n}).",
    "bundle": "Bundle principal {kb} Ko (gzip).",
    "tbt": "TBT moyen {ms} ms.",
    "openPr": "Ouvrir la PR",
    "report": "Voir le rapport",
    "empty": "Pas encore de résultats Lighthouse. Ils apparaissent après la prochaine PR ou exécution sur main.",
    "cat": {
      "perf": "Performances",
      "a11y": "Accessibilité",
      "best_practices": "Bonnes pratiques",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Perf",
      "a11y": "Acc",
      "best_practices": "BP",
      "seo": "SEO"
    },
    "weekDelta": "{n} cette semaine",
    "weekFlat": "inchangé cette semaine",
    "thisWeek": "Cette semaine",
    "runs": "exécutions",
    "passed": "Réussis {n}",
    "warned": "Avertissement {n}",
    "over": "Dépassés {n}",
    "history": "historique de main",
    "historySub": "{n} dernières fusions",
    "noHistory": "Le graphique demande au moins deux exécutions sur main.",
    "budgetLbl": "Budget · {n}",
    "perPage": "Par page · main",
    "noMain": "Pas encore de résultats pour main.",
    "noindexNote": "Les pages de l’app sont volontairement noindex ; leur SEO est hors budget.",
    "prs": "Pull requests",
    "prsSub": "écart avec main · moyenne de {pages} pages",
    "author": "Auteur",
    "state": "État",
    "noPrs": "Aucune PR dans cette vue.",
    "st": {
      "over": "Budget dépassé",
      "warn": "Avertissement",
      "pass": "Réussi",
      "merged": "Fusionnée",
      "mergedWarn": "Fusionnée · avertissement"
    },
    "pr": "PR"
  },
  "new": "NOUVEAU"
};
