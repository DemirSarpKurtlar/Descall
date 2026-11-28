/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_FR = {
  "signIn": {
    "button": "Se connecter avec une clé d'accès",
    "busy": "En attente de ta clé d'accès…",
    "handoffTitle": "Continue dans ton navigateur",
    "handoffLead": "Descall s'est ouvert dans ton navigateur. Vérifie que le code affiché est {code}, puis confirme avec ta clé d'accès.",
    "handoffReopen": "Rouvrir la page",
    "cancel": "Annuler",
    "autofillHint": "Touche le champ du nom d'utilisateur pour voir aussi tes clés d'accès enregistrées."
  },
  "settings": {
    "title": "Clés d'accès",
    "lead": "Ton mot de passe reste toujours. Une clé d'accès est un moyen en plus, plus rapide et plus sûr de te connecter avec ton empreinte, ton visage ou le code de ton appareil.",
    "empty": "Tu n'as pas encore ajouté de clé d'accès.",
    "add": "Ajouter une clé d'accès",
    "nameLabel": "Nom de la clé d'accès",
    "namePlaceholder": "Nom (facultatif), par exemple PC du travail",
    "created": "Ajoutée : {date}",
    "lastUsed": "Dernière utilisation : {date}",
    "neverUsed": "Pas encore utilisée",
    "synced": "Synchronisée",
    "thisDevice": "Un seul appareil",
    "suspended": "Désactivée : elle a peut-être été copiée. Supprime-la et ajoutes-en une nouvelle.",
    "rename": "Renommer",
    "save": "Enregistrer",
    "cancel": "Annuler",
    "remove": "Supprimer",
    "removeTitle": "Supprimer cette clé d'accès ?",
    "removeLead": "Tu ne pourras plus te connecter avec \"{name}\". Ton mot de passe et tes autres clés d'accès continuent de fonctionner. Tu peux aussi effacer la copie sur ton appareil dans ses réglages de mots de passe.",
    "added": "Clé d'accès ajoutée.",
    "removed": "Clé d'accès supprimée.",
    "renamed": "Nom enregistré.",
    "unavailableHere": "Cet appareil ou ce navigateur ne prend pas en charge les clés d'accès. Tu peux en ajouter une depuis un appareil compatible.",
    "loadFailed": "Impossible de charger tes clés d'accès.",
    "sessionMethod": "Clé d'accès",
    "retry": "Réessayer",
    "count": "{count, plural, one {# clé d'accès} other {# clés d'accès}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Ordinateur",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Autre"
    }
  },
  "reauth": {
    "title": "Confirme d'abord que c'est toi",
    "lead": "Pour ajouter une clé d'accès, confirme que ce compte est à toi.",
    "password": "Mot de passe actuel",
    "code": "Code à 6 chiffres",
    "sendCode": "M'envoyer un code par e-mail",
    "codeSent": "Un code a été envoyé à {email}.",
    "withPasskey": "Confirmer avec une clé d'accès existante",
    "totpHint": "Tu peux aussi saisir le code de ton application d'authentification.",
    "continue": "Continuer"
  },
  "err": {
    "cancelled": "Annulé.",
    "no_credential": "Aucune clé d'accès Descall sur cet appareil. Connecte-toi avec ton mot de passe, puis ajoutes-en une dans Paramètres > Sécurité.",
    "timeout": "Le temps est écoulé. Réessaie.",
    "already_registered": "Tu as déjà une clé d'accès Descall sur cet appareil.",
    "unsupported": "Cet appareil ne prend pas en charge les clés d'accès.",
    "security": "Cet appareil n'a pas encore vérifié le domaine Descall. Réessaie dans un instant.",
    "busy": "Une autre demande de clé d'accès est ouverte.",
    "aborted": "Annulé.",
    "network": "Impossible de joindre Descall. Vérifie ta connexion.",
    "server": "Un problème est survenu. Réessaie.",
    "unknown": "La demande de clé d'accès n'a pas pu aboutir. Réessaie.",
    "uvRequired": "Ton appareil n'a pas confirmé que c'est toi (code, empreinte ou visage). Réessaie, ou connecte-toi avec ton mot de passe.",
    "unknownCredential": "Cette clé d'accès n'est plus liée à ton compte. Connecte-toi avec ton mot de passe.",
    "suspended": "Cette clé d'accès a été désactivée car elle a peut-être été copiée. Connecte-toi avec ton mot de passe et supprime-la dans Paramètres > Sécurité.",
    "unavailable": "Les clés d'accès ne sont pas disponibles pour le moment. Connecte-toi avec ton mot de passe.",
    "reauthRequired": "Confirme d'abord que c'est toi.",
    "limit": "Tu as atteint le nombre maximal de clés d'accès. Supprimes-en une d'abord.",
    "handoffExpired": "Le lien a expiré. Recommence.",
    "badPassword": "Mot de passe incorrect.",
    "badCode": "Code incorrect.",
    "badName": "Saisis un nom.",
    "rateLimited": "Trop de tentatives. Patiente un peu."
  },
  "desktop": {
    "title": "Clé d'accès pour l'application Descall sur ordinateur",
    "signinLead": "Utilise ta clé d'accès pour te connecter à l'application Descall.",
    "registerLead": "Ajoute une clé d'accès à @{username} depuis ce navigateur ou ton téléphone.",
    "matchLabel": "Code dans l'application",
    "matchHint": "Si ce code n'est pas celui affiché dans l'application Descall, ne continue pas.",
    "signinButton": "Confirmer avec la clé d'accès",
    "registerButton": "Créer une clé d'accès",
    "doneSignin": "C'est fait. Tu peux revenir à l'application Descall.",
    "doneRegister": "Clé d'accès ajoutée. Tu peux revenir à l'application Descall.",
    "expired": "Ce lien a expiré ou a déjà été utilisé. Recommence dans l'application Descall.",
    "noCode": "Cette page s'ouvre depuis l'application Descall sur ordinateur.",
    "unsupported": "Ce navigateur ne prend pas en charge les clés d'accès. Ouvre-la dans un Chrome, Edge, Safari ou Firefox récent.",
    "loading": "Chargement…"
  },
  "login": {
    "button": {
      "passkey": "Se connecter avec une clé d'accès",
      "face": "Se connecter avec Face ID",
      "finger": "Se connecter avec l'empreinte",
      "hello": "Se connecter avec Windows Hello"
    },
    "note": "Face ID, empreinte ou Windows Hello. Ton mot de passe fonctionne toujours."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "L'empreinte",
      "web": "La clé d'accès"
    },
    "waitTitle": {
      "windows": "En attente de Windows Hello",
      "ios": "En attente de Face ID",
      "android": "En attente de l'empreinte",
      "web": "En attente de ta clé d'accès"
    },
    "waitLead": {
      "windows": "Utilise ton visage, ton empreinte ou ton code PIN dans la fenêtre du système.",
      "ios": "Utilise Face ID dans la fenêtre du système.",
      "android": "Utilise ton empreinte ou le verrouillage de l'écran dans la fenêtre du système.",
      "web": "Choisis ta clé d'accès dans la fenêtre du navigateur et confirme."
    },
    "okTitle": "Bienvenue, {name}",
    "okTitleNoName": "Bienvenue",
    "okLead": "Connexion avec {method}. Elle compte comme validation en deux étapes, sans code.",
    "okProgress": "Ouverture de tes serveurs",
    "cancelTitle": "Connexion annulée",
    "cancelLead": "Pas de souci. Réessaie ou connecte-toi avec ton mot de passe.",
    "retry": "Réessayer",
    "password": "Mot de passe",
    "errTitle": "Clé d'accès non vérifiée",
    "errLead": "Cette clé a peut-être été retirée de ton compte, ou la demande a expiré.",
    "errDetail": "Détail : {detail}",
    "noneTitle": "Aucune clé d'accès sur cet appareil",
    "noneLead": "Ta clé Descall est peut-être sur un autre appareil.",
    "optPhone": "Se connecter avec ton téléphone",
    "optPhoneSub": "Scanne le code avec le téléphone qui a la clé",
    "optKey": "Clé de sécurité",
    "optKeySub": "USB ou NFC",
    "optPassword": "Se connecter avec le mot de passe",
    "optPasswordSub": "Tu pourras ensuite ajouter une clé à cet appareil",
    "label": {
      "wait": "Fenêtre système ouverte",
      "ok": "Réussi",
      "cancel": "Annulé",
      "err": "Erreur",
      "none": "Aucune clé sur cet appareil"
    },
    "foot": {
      "windows": {
        "wait": "La fenêtre Windows Hello est ouverte (visage, empreinte ou PIN).",
        "ok": "L'app s'ouvre un instant après.",
        "cancel": "Annuler a été pressé dans la fenêtre Windows.",
        "err": "Le serveur n'a pas reconnu la clé, ou le délai est dépassé.",
        "none": "Windows n'a trouvé aucune clé Descall sur cet ordinateur."
      },
      "ios": {
        "wait": "La feuille iOS et l'animation Face ID sont ouvertes.",
        "ok": "Un retour haptique, puis tes discussions s'ouvrent.",
        "cancel": "La feuille du système a été fermée.",
        "err": "Le serveur n'a pas reconnu la clé, ou le délai est dépassé.",
        "none": "Aucune clé Descall dans le trousseau iCloud."
      },
      "android": {
        "wait": "La feuille du Gestionnaire de mots de passe Google est ouverte.",
        "ok": "Une courte vibration, puis tes discussions s'ouvrent.",
        "cancel": "La feuille a été fermée avec le bouton retour.",
        "err": "Le serveur n'a pas reconnu la clé, ou le délai est dépassé.",
        "none": "Aucune clé Descall sur ce téléphone."
      }
    }
  },
  "os": {
    "winHeader": "Sécurité Windows",
    "winTitle": "Se connecter avec ta clé d'accès",
    "winText": "Utilise Windows Hello pour te connecter à {site}.",
    "winRecognizing": "Vérification de ton identité",
    "winMore": "Plus de choix",
    "cancel": "Annuler",
    "qrTitle": "Se connecter avec ton téléphone",
    "qrText": "Scanne ce code avec l'appareil photo du téléphone qui a ta clé.",
    "usbTitle": "Utilise ta clé de sécurité",
    "usbText": "Insère ta clé de sécurité dans le port USB et touche-la.",
    "usbWait": "En attente de la clé",
    "gpmHeader": "Gestionnaire de mots de passe Google",
    "gpmTitle": "Utiliser ta clé enregistrée",
    "gpmText": "Pour descall.com. Confirme avec le verrouillage de l'écran de ton ordinateur.",
    "webText": "Choisis ta clé dans {provider} et confirme.",
    "iosTitle": "Connexion",
    "iosText": "Veux-tu te connecter à descall.com avec ta clé enregistrée ?",
    "iosSub": "Trousseau iCloud · Clé d'accès",
    "continue": "Continuer",
    "nfcTitle": "Clé de sécurité",
    "nfcText": "Approche la clé du haut de ton téléphone.",
    "nfcSub": "Par NFC",
    "nfcWait": "En attente",
    "andText": "Pour te connecter à Descall",
    "andSub": "Clé d'accès · Gestionnaire de mots de passe Google",
    "andTouch": "Touche le capteur d'empreinte"
  },
  "preview": {
    "title": "Ce que tu verras à la connexion",
    "live": "En direct",
    "selected": "Sélection : {name}. La fenêtre que cette clé ouvre à la connexion :",
    "desktop": "Bureau · Windows",
    "phone": "Téléphone",
    "text": {
      "windows": "Une clé Windows Hello ne vit que sur cet ordinateur. Les téléphones ne la voient pas ; là, tu utilises ton mot de passe ou la clé du téléphone.",
      "ios": "Trousseau iCloud : une touche sur iPhone, iPad et Mac. Sous Windows, tu scannes le code avec ton iPhone et confirmes.",
      "mac": "Trousseau iCloud : une touche sur Mac, iPhone et iPad. Sous Windows, tu scannes le code avec ton iPhone et confirmes.",
      "android": "Gestionnaire de mots de passe Google : visible sur Android et dans Chrome.",
      "key": "Clé de sécurité : marche partout, en USB sur ordinateur et en NFC sur téléphone.",
      "web": "{provider} : visible dans les navigateurs et téléphones où il est installé."
    },
    "idle": "{count, plural, one {Pas utilisée depuis # jour.} other {Pas utilisée depuis # jours.}}",
    "states": "États",
    "platform": "Plateforme",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Aujourd'hui {time}",
    "yesterday": "Hier {time}",
    "yesterdayShort": "Hier",
    "daysAgo": "{count, plural, one {il y a # jour} other {il y a # jours}}",
    "never": "Jamais utilisée",
    "now": "maintenant"
  },
  "center": {
    "crumbLabel": "Chemin",
    "crumbSecurity": "Sécurité",
    "lead": "Connexion rapide sans mot de passe. Ton mot de passe reste valable.",
    "kpi": {
      "count": "Clés d'accès",
      "platforms": "{count, plural, one {sur # plateforme} other {sur # plateformes}}",
      "share": "Connexions par clé",
      "basis": "D'après tes {count} dernières sessions",
      "mixLabel": "Clé {passkey} %, mot de passe {password} %, Google et Apple {social} %",
      "noData": "Pas encore de données",
      "speed": "Connexion moyenne",
      "seconds": "{s} s",
      "passwordSpeed": "Avec mot de passe : {s} s",
      "noMeasure": "Pas encore mesuré",
      "decimal": ",",
      "security": "Sécurité",
      "methods": "{count, plural, one {# méthode} other {# méthodes}}"
    },
    "level": {
      "excellent": "Très bonne",
      "good": "Bonne",
      "fair": "Moyenne",
      "weak": "Faible"
    },
    "check": {
      "password": "Mot de passe ou connexion vérifiée",
      "email": "E-mail vérifié",
      "secondFactor": "Validation en deux étapes",
      "passkey": "Au moins une clé",
      "backup": "Deuxième clé sur une autre plateforme",
      "fresh": "Aucune clé inutilisée ou désactivée"
    },
    "chip": {
      "password": "Mot de passe",
      "alwaysOn": "Toujours actif",
      "none": "Aucun",
      "app": "Appli d'authentification",
      "email2fa": "Code par e-mail",
      "on": "Activée",
      "off": "Désactivée",
      "passkey": "Clé d'accès",
      "registered": "{count} enregistrées"
    },
    "stale": "La clé \"{name}\" n'a pas servi depuis {count} jours. Si tu n'utilises plus cet appareil, mieux vaut la retirer.",
    "suspendedShort": "a été désactivée car elle a peut-être été copiée. Retire-la et ajoutes-en une nouvelle.",
    "review": "Voir",
    "offline": "Hors ligne. Les changements reviennent une fois connecté ; la liste se met alors à jour.",
    "col": {
      "passkey": "Clé",
      "last": "Dernière utilisation",
      "added": "Ajoutée",
      "usage": "30 jours"
    },
    "pill": {
      "thisDevice": "Cet appareil",
      "days": "{count} jours",
      "off": "Désactivée",
      "counts2fa": "Compte comme 2FA",
      "localOnly": "Cet appareil seulement",
      "synced": "Synchronisée",
      "noSync": "Non synchronisée"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "Trousseau iCloud",
      "mac": "Trousseau iCloud",
      "android": "Gestionnaire de mots de passe Google",
      "key": "Clé de sécurité",
      "web": "Clé d'accès"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Bureau",
      "electron": "Bureau",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Autre"
    },
    "via": {
      "web": "Web",
      "ios": "App iPhone",
      "android": "App Android",
      "windows": "App de bureau",
      "electron": "App de bureau",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Autre"
    },
    "sync": {
      "local": "Cet appareil seulement",
      "icloud": "Synchronisée avec iPhone, iPad et Mac",
      "google": "Synchronisée avec Android et Chrome",
      "key": "USB / NFC, non synchronisée",
      "manager": "Synchronisée avec {provider}",
      "synced": "Synchronisée entre tes appareils"
    },
    "drawer": {
      "sync": "Synchronisation",
      "created": "Créée",
      "where": "Où",
      "lastUsed": "Dernière utilisation",
      "place": "Lieu",
      "placeUnknown": "Inconnu",
      "total": "Connexions au total",
      "last30": "30 derniers jours",
      "count30": "{count, plural, one {# connexion} other {# connexions}}",
      "info": "Avec cette clé, aucun code n'est demandé ; la connexion compte comme validation en deux étapes.",
      "rename": "Renommer"
    },
    "remove": {
      "title": "Retirer \"{name}\" ?",
      "lead": "Tu ne pourras plus te connecter avec cette clé. Ton mot de passe et tes autres clés ne changent pas.",
      "current": "Tu es connecté avec cette clé ; cette session reste ouverte.",
      "reason": "Raison",
      "reasons": {
        "lost": "J'ai perdu l'appareil",
        "unused": "Je ne l'utilise plus",
        "readd": "Je vais la rajouter",
        "other": "Autre"
      },
      "endSessions": "Fermer aussi les autres sessions ouvertes avec cette clé",
      "sessionsEnded": "{count, plural, one {# session fermée.} other {# sessions fermées.}}"
    },
    "added": {
      "title": "Clé ajoutée",
      "sub": "{provider} · cet appareil",
      "name": "Nom",
      "undo": "Annuler",
      "undone": "Annulé, la clé a été retirée."
    },
    "names": {
      "home": "PC maison",
      "work": "PC du travail",
      "laptop": "Portable",
      "gaming": "PC gaming",
      "macbook": "MacBook",
      "iphone": "Mon iPhone",
      "ipad": "iPad",
      "phone": "Mon téléphone",
      "tablet": "Tablette",
      "keyMain": "Clé principale",
      "keyBackup": "Clé de secours",
      "keyChain": "Porte-clés"
    },
    "add": {
      "ready": "Prêt. Continue et la fenêtre des clés de ton appareil s'ouvre.",
      "thisDevice": {
        "passkey": "Cet appareil ou le gestionnaire de mots de passe du navigateur",
        "face": "Cet iPhone · Face ID",
        "finger": "Ce téléphone · empreinte",
        "hello": "Cet ordinateur · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "Sur ton téléphone : scanne le code, enregistre avec le téléphone",
        "securityKey": "Clé de sécurité : USB ou NFC"
      }
    },
    "activity": {
      "title": "Activité récente",
      "all": "Tout",
      "empty": "Pas encore d'activité.",
      "signin": "Connexion avec {name}",
      "added": "{name} ajoutée",
      "renamed": "Renommée en {name}",
      "removed": "{name} retirée",
      "new_place": "{name} utilisée depuis un nouveau lieu",
      "suspended": "{name} désactivée",
      "report_confirmed": "{name} : réponse \"C'était moi\"",
      "report_revoked": "{name} : \"Ce n'était pas moi\", sessions fermées"
    },
    "backup": {
      "cap": "Conseil de secours",
      "title": "Ajoute une deuxième clé",
      "lead": "Si tu perds un appareil, tu te connectes avec l'autre. Une autre plateforme est le plus sûr.",
      "remoteDevice": "Ajouter sur ton téléphone",
      "remoteDeviceSub": "Scanne le code, enregistre avec le téléphone",
      "securityKey": "Clé de sécurité",
      "securityKeySub": "USB ou NFC",
      "computer": "Ajouter sur ton ordinateur",
      "computerSub": "descall.com › Paramètres › Sécurité › Clés d'accès"
    },
    "email": {
      "cap": "E-mail de sécurité",
      "title": "Une nouvelle clé d'accès a été ajoutée à ton compte",
      "body": "\"{name}\"{provider} a été ajoutée le {when} {from}. Si ce n'était pas toi, retire-la tout de suite et change ton mot de passe.",
      "fromPlace": "depuis {place}",
      "fromSomewhere": "depuis un lieu inconnu",
      "notMe": "Ce n'était pas moi",
      "itWasMe": "C'était moi",
      "lead": "Cet e-mail arrive quand une clé est ajoutée ou utilisée depuis un nouveau lieu. \"Ce n'était pas moi\" retire la clé et ferme toutes les sessions.",
      "noEmail": "Ton e-mail n'est pas vérifié, ces e-mails ne peuvent donc pas t'arriver. Vérifie-le dans Sécurité."
    },
    "alert": {
      "cap": "Usage inhabituel",
      "titleCity": "{name} a été utilisée depuis une nouvelle ville",
      "titleCountry": "{name} a été utilisée depuis un nouveau pays",
      "signin": "Connexion : {place}",
      "before": "Avant, seulement {places}",
      "firstFar": "Première utilisation ici",
      "usual": "Lieu habituel",
      "me": "C'était moi",
      "revoke": "Retirer et fermer les sessions",
      "confirmTitle": "Retirer la clé et fermer les autres sessions ?",
      "confirmLead": "\"{name}\" est retirée et toutes les sessions sauf cet appareil sont fermées. Change ensuite ton mot de passe.",
      "doneMe": "C'est noté, l'alerte est fermée.",
      "doneRevoke": "{count, plural, one {Clé retirée, # session fermée.} other {Clé retirée, # sessions fermées.}}",
      "noneTitle": "Aucun usage inhabituel",
      "noneLead": "Si une clé se connecte depuis une ville jamais utilisée, on te prévient ici et par e-mail.",
      "countryOnly": "Sur cette connexion, seul le pays est connu ; l'alerte vient pour un nouveau pays."
    },
    "empty": {
      "title": "Pas encore de clé",
      "lead": {
        "passkey": "Ajoute une clé à cet appareil ; la prochaine fois, ni mot de passe ni code.",
        "face": "Ajoute une clé avec Face ID ; la prochaine fois, ni mot de passe ni code.",
        "finger": "Ajoute une clé avec ton empreinte ; la prochaine fois, ni mot de passe ni code.",
        "hello": "Ajoute une clé avec Windows Hello ; la prochaine fois, ni mot de passe ni code."
      }
    },
    "suggestToggle": "Proposer une clé après une connexion par mot de passe",
    "suggestToggleSub": "Pour cet appareil seulement",
    "entry": {
      "title": "Clés d'accès",
      "desc": "{count} enregistrées · Sécurité {score}",
      "none": "Connexion rapide sans mot de passe. Pas encore de clé.",
      "alerts": "{count, plural, one {# alerte} other {# alertes}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "La prochaine fois, connecte-toi avec Windows Hello",
      "ios": "La prochaine fois, connecte-toi avec Face ID",
      "android": "La prochaine fois, connecte-toi avec ton empreinte",
      "web": "La prochaine fois, connecte-toi avec une clé d'accès"
    },
    "phoneTitle": {
      "windows": "Connexion plus rapide avec Windows Hello",
      "ios": "Connexion plus rapide avec Face ID",
      "android": "Connexion plus rapide avec l'empreinte",
      "web": "Connexion plus rapide avec une clé"
    },
    "lead": "Sans mot de passe ni code, en 2 secondes environ.",
    "phoneLead": "La prochaine fois, ni mot de passe ni code. Ton mot de passe reste valable.",
    "c1": "Ton mot de passe reste ; la clé est un chemin en plus, plus rapide.",
    "c2": "Une connexion par clé compte comme validation en deux étapes, sans code.",
    "c2short": "Compte comme validation en deux étapes.",
    "c3": "Ton visage ou ton empreinte ne quittent jamais cet appareil.",
    "c3ios": "Marche aussi sur ton iPad et ton Mac avec le trousseau iCloud.",
    "c3android": "Marche aussi sur tes autres Android avec le Gestionnaire de mots de passe Google.",
    "later": "Me le rappeler plus tard",
    "notNow": "Pas maintenant",
    "never": "Ne plus demander sur cet appareil",
    "mini": "Suggestion de clé",
    "expand": "Ouvrir la suggestion de clé",
    "done": "Clé ajoutée. La prochaine fois, connecte-toi avec {method}.",
    "needsReauth": "Confirme ton identité dans Paramètres pour l'ajouter.",
    "openSettings": "Ajouter dans Paramètres",
    "signedIn": {
      "password": "Connecté avec le mot de passe",
      "2fa": "Connecté avec mot de passe et code",
      "google": "Connecté avec Google",
      "apple": "Connecté avec Apple"
    }
  },
  "report": {
    "loading": "Chargement…",
    "invalidTitle": "Lien non valide",
    "invalid": "Ce lien n'est pas valide ou a été copié incomplet. Touche à nouveau le bouton de l'e-mail.",
    "expiredTitle": "Lien expiré",
    "expired": "Ce lien a expiré. Connecte-toi et vérifie Paramètres > Sécurité > Clés d'accès.",
    "network": "Impossible de joindre Descall. Vérifie ta connexion et réessaie.",
    "title": {
      "added": "Une nouvelle clé d'accès a été ajoutée à ton compte",
      "newPlace": "Ta clé d'accès a été utilisée depuis un nouveau lieu"
    },
    "passkey": "Clé",
    "when": "Heure",
    "place": "Lieu",
    "device": "Appareil",
    "question": "C'était toi ?",
    "notMe": "Ce n'était pas moi",
    "revokeLead": "\"{name}\" est retirée de ton compte et toutes ses sessions sont fermées. Connecte-toi ensuite avec ton mot de passe et change-le.",
    "revokeLeadGone": "La clé a déjà été retirée. On ferme toutes les sessions de ton compte ; change ensuite ton mot de passe.",
    "revokeButton": "Retirer et fermer toutes les sessions",
    "itWasMe": "C'était moi",
    "confirmLead": "Rien ne change ; on ferme l'alerte.",
    "confirmButton": "Oui, c'était moi",
    "doneRevokedTitle": "Ton compte est protégé",
    "doneRevoked": "{count, plural, one {Clé retirée et # session fermée. Change ton mot de passe maintenant.} other {Clé retirée et # sessions fermées. Change ton mot de passe maintenant.}}",
    "doneConfirmedTitle": "Merci",
    "doneConfirmed": "L'alerte est fermée.",
    "alreadyRevoked": "Ce lien a déjà servi : la clé a été retirée et les sessions fermées.",
    "alreadyConfirmed": "Cette alerte a déjà reçu une réponse : \"C'était moi\".",
    "openApp": "Aller sur Descall",
    "changePassword": "Se connecter et changer le mot de passe"
  }
};
