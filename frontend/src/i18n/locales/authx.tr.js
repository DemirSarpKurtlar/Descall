/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_TR = {
  "email": {
    "change": "E-postayı değiştir",
    "newPlaceholder": "Yeni e-posta adresi",
    "reauthLabel": "{email} adresine gönderilen kod",
    "changeAddress": "Adresi değiştir"
  },
  "tfa": {
    "disableCodeLead": "İki adımlı girişi kapatmak için {email} adresine gönderdiğimiz kodu gir.",
    "sendCode": "Kod gönder"
  },
  "del": {
    "usernameLabel": "Onaylamak için @{username} yaz",
    "passwordLabel": "Onaylamak için şifreni gir"
  },
  "login": {
    "resendIn": "{seconds} sn sonra tekrar gönder",
    "codeResent": "Yeni bir kod yolda.",
    "unreachable": "Descall'a ulaşılamıyor. İnternet bağlantını kontrol edip tekrar dene."
  },
  "ban": {
    "appealFineNoEmail": "İtirazlar 3 iş günü içinde bir yönetici tarafından incelenir. Sonucu giriş yaptığında bu ekranda görürsün."
  }
};
