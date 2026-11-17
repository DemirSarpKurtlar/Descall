/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_FR = {
  "email": {
    "change": "Changer d'e-mail",
    "newPlaceholder": "Nouvelle adresse e-mail",
    "reauthLabel": "Code envoyé à {email}",
    "changeAddress": "Changer d'adresse"
  },
  "tfa": {
    "disableCodeLead": "Saisis le code envoyé à {email} pour désactiver la connexion en deux étapes.",
    "sendCode": "Envoyer le code"
  },
  "del": {
    "usernameLabel": "Tape @{username} pour confirmer",
    "passwordLabel": "Saisis ton mot de passe pour confirmer"
  },
  "login": {
    "resendIn": "Renvoyer dans {seconds} s",
    "codeResent": "Un nouveau code arrive."
  },
  "ban": {
    "appealFineNoEmail": "Un administrateur examine les appels sous 3 jours ouvrés. Le résultat s'affiche sur cet écran à ta connexion."
  }
};
