/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_DE = {
  "email": {
    "change": "E-Mail ändern",
    "newPlaceholder": "Neue E-Mail-Adresse",
    "reauthLabel": "Code an {email} gesendet",
    "changeAddress": "Adresse ändern"
  },
  "tfa": {
    "disableCodeLead": "Gib den Code ein, den wir an {email} gesendet haben, um die Zwei-Faktor-Anmeldung auszuschalten.",
    "sendCode": "Code senden"
  },
  "del": {
    "usernameLabel": "Gib zur Bestätigung @{username} ein",
    "passwordLabel": "Gib zur Bestätigung dein Passwort ein"
  },
  "login": {
    "resendIn": "Erneut senden in {seconds} s",
    "codeResent": "Ein neuer Code ist unterwegs."
  },
  "ban": {
    "appealFineNoEmail": "Ein Admin prüft Einsprüche innerhalb von 3 Werktagen. Das Ergebnis siehst du auf diesem Bildschirm, wenn du dich anmeldest."
  }
};
