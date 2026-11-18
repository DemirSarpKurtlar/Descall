/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_PT_BR = {
  "email": {
    "change": "Alterar e-mail",
    "newPlaceholder": "Novo endereço de e-mail",
    "reauthLabel": "Código enviado para {email}",
    "changeAddress": "Alterar endereço"
  },
  "tfa": {
    "disableCodeLead": "Digite o código que enviamos para {email} para desativar o login em duas etapas.",
    "sendCode": "Enviar código"
  },
  "del": {
    "usernameLabel": "Digite @{username} para confirmar",
    "passwordLabel": "Digite sua senha para confirmar"
  },
  "login": {
    "resendIn": "Reenviar em {seconds} s",
    "codeResent": "Um novo código está a caminho.",
    "unreachable": "Não foi possível conectar ao Descall. Verifique sua conexão com a internet e tente novamente."
  },
  "ban": {
    "appealFineNoEmail": "Um administrador analisa os recursos em até 3 dias úteis. O resultado aparece nesta tela quando você entrar."
  }
};
