/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_RU = {
  "email": {
    "change": "Изменить почту",
    "newPlaceholder": "Новый адрес почты",
    "reauthLabel": "Код отправлен на {email}",
    "changeAddress": "Изменить адрес"
  },
  "tfa": {
    "disableCodeLead": "Введите код, отправленный на {email}, чтобы отключить двухэтапный вход.",
    "sendCode": "Отправить код"
  },
  "del": {
    "usernameLabel": "Введите @{username} для подтверждения",
    "passwordLabel": "Введите пароль для подтверждения"
  },
  "login": {
    "resendIn": "Отправить снова через {seconds} с",
    "codeResent": "Новый код уже в пути."
  },
  "ban": {
    "appealFineNoEmail": "Администратор рассматривает апелляции в течение 3 рабочих дней. Результат появится на этом экране при входе."
  }
};
