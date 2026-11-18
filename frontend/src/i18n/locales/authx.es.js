/** Auth polish ("authx.*"): email change, 2FA off without a password, delete confirm, code resend, ban appeal note. Same keys in every authx.<locale>.js. */
export const AUTHX_ES = {
  "email": {
    "change": "Cambiar correo",
    "newPlaceholder": "Nuevo correo electrónico",
    "reauthLabel": "Código enviado a {email}",
    "changeAddress": "Cambiar dirección"
  },
  "tfa": {
    "disableCodeLead": "Introduce el código que enviamos a {email} para desactivar el inicio de sesión en dos pasos.",
    "sendCode": "Enviar código"
  },
  "del": {
    "usernameLabel": "Escribe @{username} para confirmar",
    "passwordLabel": "Introduce tu contraseña para confirmar"
  },
  "login": {
    "resendIn": "Reenviar en {seconds} s",
    "codeResent": "Un nuevo código está en camino.",
    "unreachable": "No se puede conectar con Descall. Revisa tu conexión a internet e inténtalo de nuevo."
  },
  "ban": {
    "appealFineNoEmail": "Un administrador revisa las apelaciones en 3 días hábiles. Verás el resultado en esta pantalla al iniciar sesión."
  }
};
