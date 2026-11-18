/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_EN = {
  "email": {
    "change": "Change email",
    "newPlaceholder": "New email address",
    "reauthLabel": "Code sent to {email}",
    "changeAddress": "Change address"
  },
  "tfa": {
    "disableCodeLead": "Enter the code we sent to {email} to turn off two-factor sign-in.",
    "sendCode": "Send code"
  },
  "del": {
    "usernameLabel": "Type @{username} to confirm",
    "passwordLabel": "Enter your password to confirm"
  },
  "login": {
    "resendIn": "Resend in {seconds}s",
    "codeResent": "A new code is on the way.",
    "unreachable": "Can't reach Descall. Check your internet connection and try again."
  },
  "ban": {
    "appealFineNoEmail": "An admin reviews appeals within 3 business days. The result appears on this screen when you sign in."
  }
};
