/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_ES = {
  "signIn": {
    "button": "Iniciar sesión con llave de acceso",
    "busy": "Esperando tu llave de acceso…",
    "handoffTitle": "Continúa en tu navegador",
    "handoffLead": "Descall se abrió en tu navegador. Comprueba que el código allí sea {code} y confirma con tu llave de acceso.",
    "handoffReopen": "Abrir la página de nuevo",
    "cancel": "Cancelar",
    "autofillHint": "Toca el campo de usuario para ver también tus llaves de acceso guardadas."
  },
  "settings": {
    "title": "Llaves de acceso",
    "lead": "Tu contraseña siempre se queda. Una llave de acceso es una forma extra, más rápida y segura de iniciar sesión con tu huella, tu cara o el PIN del dispositivo.",
    "empty": "Todavía no has añadido ninguna llave de acceso.",
    "add": "Añadir llave de acceso",
    "nameLabel": "Nombre de la llave de acceso",
    "namePlaceholder": "Nombre (opcional), por ejemplo Portátil del trabajo",
    "created": "Añadida: {date}",
    "lastUsed": "Último uso: {date}",
    "neverUsed": "Aún sin usar",
    "synced": "Sincronizada",
    "thisDevice": "Un solo dispositivo",
    "suspended": "Desactivada: podría haber sido copiada. Quítala y añade una nueva.",
    "rename": "Cambiar nombre",
    "save": "Guardar",
    "cancel": "Cancelar",
    "remove": "Quitar",
    "removeTitle": "¿Quitar esta llave de acceso?",
    "removeLead": "Ya no podrás iniciar sesión con \"{name}\". Tu contraseña y tus otras llaves de acceso siguen funcionando. También puedes borrar la copia de tu dispositivo en sus ajustes de contraseñas.",
    "added": "Llave de acceso añadida.",
    "removed": "Llave de acceso quitada.",
    "renamed": "Nombre guardado.",
    "unavailableHere": "Este dispositivo o navegador no admite llaves de acceso. Puedes añadir una desde un dispositivo compatible.",
    "loadFailed": "No se pudieron cargar tus llaves de acceso.",
    "sessionMethod": "Llave de acceso",
    "retry": "Reintentar",
    "count": "{count, plural, one {# llave de acceso} other {# llaves de acceso}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Escritorio",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Otro"
    }
  },
  "reauth": {
    "title": "Primero confirma que eres tú",
    "lead": "Para añadir una llave de acceso, confirma que esta cuenta es tuya.",
    "password": "Contraseña actual",
    "code": "Código de 6 dígitos",
    "sendCode": "Enviarme un código por correo",
    "codeSent": "Se envió un código a {email}.",
    "withPasskey": "Confirmar con una llave de acceso existente",
    "totpHint": "También puedes introducir el código de tu app de autenticación.",
    "continue": "Continuar"
  },
  "err": {
    "cancelled": "Cancelado.",
    "no_credential": "No hay ninguna llave de acceso de Descall en este dispositivo. Inicia sesión con tu contraseña y luego añade una en Ajustes > Seguridad.",
    "timeout": "Se acabó el tiempo. Inténtalo de nuevo.",
    "already_registered": "Ya tienes una llave de acceso de Descall en este dispositivo.",
    "unsupported": "Este dispositivo no admite llaves de acceso.",
    "security": "Este dispositivo aún no ha verificado el dominio de Descall. Inténtalo de nuevo en un momento.",
    "busy": "Hay otra solicitud de llave de acceso abierta.",
    "aborted": "Cancelado.",
    "network": "No se puede conectar con Descall. Revisa tu conexión.",
    "server": "Algo salió mal. Inténtalo de nuevo.",
    "unknown": "La solicitud de la llave de acceso no pudo terminar. Inténtalo de nuevo.",
    "uvRequired": "Tu dispositivo no confirmó que eres tú (PIN, huella o cara). Inténtalo de nuevo o inicia sesión con tu contraseña.",
    "unknownCredential": "Esta llave de acceso ya no está en tu cuenta. Inicia sesión con tu contraseña.",
    "suspended": "Esta llave de acceso se desactivó porque podría haber sido copiada. Inicia sesión con tu contraseña y quítala en Ajustes > Seguridad.",
    "unavailable": "Las llaves de acceso no están disponibles ahora. Inicia sesión con tu contraseña.",
    "reauthRequired": "Primero confirma que eres tú.",
    "limit": "Has llegado al máximo de llaves de acceso. Quita una primero.",
    "handoffExpired": "El enlace caducó. Empieza de nuevo.",
    "badPassword": "Contraseña incorrecta.",
    "badCode": "Código incorrecto.",
    "badName": "Escribe un nombre.",
    "rateLimited": "Demasiados intentos. Espera un poco."
  },
  "desktop": {
    "title": "Llave de acceso para la app de escritorio de Descall",
    "signinLead": "Usa tu llave de acceso para iniciar sesión en la app de Descall.",
    "registerLead": "Añade una llave de acceso a @{username} desde este navegador o tu teléfono.",
    "matchLabel": "Código en la app",
    "matchHint": "Si este código no es el que ves en la app de Descall, no continúes.",
    "signinButton": "Confirmar con llave de acceso",
    "registerButton": "Crear llave de acceso",
    "doneSignin": "Listo. Puedes volver a la app de Descall.",
    "doneRegister": "Llave de acceso añadida. Puedes volver a la app de Descall.",
    "expired": "Este enlace caducó o ya se usó. Empieza de nuevo en la app de Descall.",
    "noCode": "Esta página se abre desde la app de escritorio de Descall.",
    "unsupported": "Este navegador no admite llaves de acceso. Ábrela en un Chrome, Edge, Safari o Firefox actual.",
    "loading": "Cargando…"
  },
  "login": {
    "button": {
      "passkey": "Entrar con llave de acceso",
      "face": "Entrar con Face ID",
      "finger": "Entrar con huella",
      "hello": "Entrar con Windows Hello"
    },
    "note": "Face ID, huella o Windows Hello. Tu contraseña siempre sigue funcionando."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "Huella",
      "web": "Llave de acceso"
    },
    "waitTitle": {
      "windows": "Esperando a Windows Hello",
      "ios": "Esperando a Face ID",
      "android": "Esperando la huella",
      "web": "Esperando tu llave de acceso"
    },
    "waitLead": {
      "windows": "Usa tu cara, tu huella o tu PIN en la ventana del sistema.",
      "ios": "Usa Face ID en la ventana del sistema.",
      "android": "Usa tu huella o el bloqueo de pantalla en la ventana del sistema.",
      "web": "Elige tu llave de acceso en la ventana del navegador y confirma."
    },
    "okTitle": "Hola, {name}",
    "okTitleNoName": "Bienvenido",
    "okLead": "Entraste con {method}. Cuenta como verificación en dos pasos, sin código.",
    "okProgress": "Abriendo tus servidores",
    "cancelTitle": "Inicio de sesión cancelado",
    "cancelLead": "No pasa nada. Vuelve a intentarlo o entra con tu contraseña.",
    "retry": "Reintentar",
    "password": "Usar contraseña",
    "errTitle": "No se pudo verificar la llave",
    "errLead": "Puede que esta llave se haya quitado de tu cuenta o que la solicitud caducara.",
    "errDetail": "Detalle: {detail}",
    "noneTitle": "No hay llave de acceso en este dispositivo",
    "noneLead": "Tu llave de Descall puede estar en otro dispositivo.",
    "optPhone": "Entrar con tu teléfono",
    "optPhoneSub": "Escanea el código con el teléfono que tiene la llave",
    "optKey": "Llave de seguridad",
    "optKeySub": "USB o NFC",
    "optPassword": "Entrar con contraseña",
    "optPasswordSub": "Después puedes añadir una llave a este dispositivo",
    "label": {
      "wait": "Ventana del sistema abierta",
      "ok": "Correcto",
      "cancel": "Cancelado",
      "err": "Error",
      "none": "Sin llave en este dispositivo"
    },
    "foot": {
      "windows": {
        "wait": "La ventana de Windows Hello está abierta (cara, huella o PIN).",
        "ok": "La app se abre un momento después.",
        "cancel": "Se pulsó Cancelar en la ventana de Windows.",
        "err": "El servidor no reconoció la llave o se acabó el tiempo.",
        "none": "Windows no encontró ninguna llave de Descall en este equipo."
      },
      "ios": {
        "wait": "La hoja de iOS y la animación de Face ID están abiertas.",
        "ok": "Una vibración háptica y se abren tus chats.",
        "cancel": "Se cerró la hoja del sistema.",
        "err": "El servidor no reconoció la llave o se acabó el tiempo.",
        "none": "No hay llave de Descall en el Llavero de iCloud."
      },
      "android": {
        "wait": "La hoja del Gestor de contraseñas de Google está abierta.",
        "ok": "Una vibración corta y se abren tus chats.",
        "cancel": "La hoja se cerró con el botón atrás.",
        "err": "El servidor no reconoció la llave o se acabó el tiempo.",
        "none": "No hay llave de Descall en este teléfono."
      }
    }
  },
  "os": {
    "winHeader": "Seguridad de Windows",
    "winTitle": "Inicia sesión con tu llave de acceso",
    "winText": "Usa Windows Hello para iniciar sesión en {site}.",
    "winRecognizing": "Comprobando que eres tú",
    "winMore": "Más opciones",
    "cancel": "Cancelar",
    "qrTitle": "Inicia sesión con tu teléfono",
    "qrText": "Escanea este código con la cámara del teléfono que tiene tu llave.",
    "usbTitle": "Usa tu llave de seguridad",
    "usbText": "Conecta tu llave de seguridad al puerto USB y tócala.",
    "usbWait": "Esperando la llave",
    "gpmHeader": "Gestor de contraseñas de Google",
    "gpmTitle": "Usa tu llave guardada",
    "gpmText": "Para descall.com. Confirma con el bloqueo de pantalla del equipo.",
    "webText": "Elige tu llave en {provider} y confirma.",
    "iosTitle": "Iniciar sesión",
    "iosText": "¿Quieres iniciar sesión en descall.com con tu llave guardada?",
    "iosSub": "Llavero de iCloud · Llave de acceso",
    "continue": "Continuar",
    "nfcTitle": "Llave de seguridad",
    "nfcText": "Acerca la llave a la parte superior del teléfono.",
    "nfcSub": "Por NFC",
    "nfcWait": "Esperando",
    "andText": "Para iniciar sesión en Descall",
    "andSub": "Llave de acceso · Gestor de contraseñas de Google",
    "andTouch": "Toca el sensor de huellas"
  },
  "preview": {
    "title": "Lo que verás al entrar",
    "live": "En vivo",
    "selected": "Seleccionada: {name}. La ventana que abre esta llave al entrar:",
    "desktop": "Escritorio · Windows",
    "phone": "Teléfono",
    "text": {
      "windows": "Una llave de Windows Hello solo vive en este equipo. Los teléfonos no la ven; allí usas tu contraseña o la llave propia del teléfono.",
      "ios": "Llavero de iCloud: un toque en iPhone, iPad y Mac. En Windows escaneas el código con tu iPhone y confirmas.",
      "mac": "Llavero de iCloud: un toque en Mac, iPhone y iPad. En Windows escaneas el código con tu iPhone y confirmas.",
      "android": "Gestor de contraseñas de Google: aparece en Android y en Chrome.",
      "key": "Llave de seguridad: funciona en todos los dispositivos, por USB en el equipo y NFC en el teléfono.",
      "web": "{provider}: aparece en los navegadores y teléfonos donde está instalado."
    },
    "idle": "{count, plural, one {Sin usar desde hace # día.} other {Sin usar desde hace # días.}}",
    "states": "Estados",
    "platform": "Plataforma",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Hoy {time}",
    "yesterday": "Ayer {time}",
    "yesterdayShort": "Ayer",
    "daysAgo": "{count, plural, one {hace # día} other {hace # días}}",
    "never": "Nunca usada",
    "now": "ahora"
  },
  "center": {
    "crumbLabel": "Ruta",
    "crumbSecurity": "Seguridad",
    "lead": "Entrada rápida sin contraseña. Tu contraseña sigue valiendo.",
    "kpi": {
      "count": "Llaves",
      "platforms": "{count, plural, one {en # plataforma} other {en # plataformas}}",
      "share": "Entradas con llave",
      "basis": "Según tus últimas {count} sesiones",
      "mixLabel": "Llave {passkey} %, contraseña {password} %, Google y Apple {social} %",
      "noData": "Aún no hay datos",
      "speed": "Entrada media",
      "seconds": "{s} s",
      "passwordSpeed": "Con contraseña: {s} s",
      "noMeasure": "Aún sin medir",
      "decimal": ",",
      "security": "Seguridad",
      "methods": "{count, plural, one {# método} other {# métodos}}"
    },
    "level": {
      "excellent": "Muy buena",
      "good": "Buena",
      "fair": "Regular",
      "weak": "Débil"
    },
    "check": {
      "password": "Contraseña o entrada verificada",
      "email": "Correo verificado",
      "secondFactor": "Verificación en dos pasos",
      "passkey": "Al menos una llave",
      "backup": "Segunda llave en otra plataforma",
      "fresh": "Ninguna llave sin usar o desactivada"
    },
    "chip": {
      "password": "Contraseña",
      "alwaysOn": "Siempre activa",
      "none": "No hay",
      "app": "App de autenticación",
      "email2fa": "Código por correo",
      "on": "Activada",
      "off": "Desactivada",
      "passkey": "Llave de acceso",
      "registered": "{count} guardadas"
    },
    "stale": "La llave \"{name}\" lleva {count} días sin usarse. Si ya no usas ese dispositivo, conviene quitarla.",
    "suspendedShort": "se desactivó porque pudo haberse copiado. Quítala y añade una nueva.",
    "review": "Revisar",
    "offline": "Sin conexión. Podrás hacer cambios al conectarte; la lista se actualizará entonces.",
    "col": {
      "passkey": "Llave",
      "last": "Último uso",
      "added": "Añadida",
      "usage": "30 días"
    },
    "pill": {
      "thisDevice": "Este dispositivo",
      "days": "{count} días",
      "off": "Desactivada",
      "counts2fa": "Cuenta como 2FA",
      "localOnly": "Solo este dispositivo",
      "synced": "Sincronizada",
      "noSync": "No se sincroniza"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "Llavero de iCloud",
      "mac": "Llavero de iCloud",
      "android": "Gestor de contraseñas de Google",
      "key": "Llave de seguridad",
      "web": "Llave de acceso"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Escritorio",
      "electron": "Escritorio",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Otro"
    },
    "via": {
      "web": "Web",
      "ios": "App de iPhone",
      "android": "App de Android",
      "windows": "App de escritorio",
      "electron": "App de escritorio",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Otro"
    },
    "sync": {
      "local": "Solo este dispositivo",
      "icloud": "Se sincroniza con iPhone, iPad y Mac",
      "google": "Se sincroniza con Android y Chrome",
      "key": "USB / NFC, no se sincroniza",
      "manager": "Se sincroniza con {provider}",
      "synced": "Se sincroniza entre tus dispositivos"
    },
    "drawer": {
      "sync": "Sincronización",
      "created": "Creada",
      "where": "Dónde",
      "lastUsed": "Último uso",
      "place": "Ubicación",
      "placeUnknown": "Desconocida",
      "total": "Entradas en total",
      "last30": "Últimos 30 días",
      "count30": "{count, plural, one {# entrada} other {# entradas}}",
      "info": "Al entrar con esta llave no se pide código; cuenta como verificación en dos pasos.",
      "rename": "Cambiar nombre"
    },
    "remove": {
      "title": "¿Quitar \"{name}\"?",
      "lead": "Ya no podrás entrar con esta llave. Tu contraseña y tus otras llaves no cambian.",
      "current": "Entraste con esta llave; esta sesión sigue abierta.",
      "reason": "Motivo",
      "reasons": {
        "lost": "Perdí el dispositivo",
        "unused": "Ya no la uso",
        "readd": "La volveré a añadir",
        "other": "Otro"
      },
      "endSessions": "Cerrar también las otras sesiones abiertas con esta llave",
      "sessionsEnded": "{count, plural, one {# sesión cerrada.} other {# sesiones cerradas.}}"
    },
    "added": {
      "title": "Llave añadida",
      "sub": "{provider} · este dispositivo",
      "name": "Nombre",
      "undo": "Deshacer",
      "undone": "Deshecho, la llave se quitó."
    },
    "names": {
      "home": "PC de casa",
      "work": "PC del trabajo",
      "laptop": "Portátil",
      "gaming": "PC gaming",
      "macbook": "MacBook",
      "iphone": "Mi iPhone",
      "ipad": "iPad",
      "phone": "Mi teléfono",
      "tablet": "Tableta",
      "keyMain": "Llave principal",
      "keyBackup": "Llave de reserva",
      "keyChain": "Llavero"
    },
    "add": {
      "ready": "Listo. Al continuar se abre la ventana de llaves de tu dispositivo.",
      "thisDevice": {
        "passkey": "Este dispositivo o el gestor de contraseñas del navegador",
        "face": "Este iPhone · Face ID",
        "finger": "Este teléfono · huella",
        "hello": "Este equipo · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "En tu teléfono: escanea el código y guárdala con el teléfono",
        "securityKey": "Llave de seguridad: USB o NFC"
      }
    },
    "activity": {
      "title": "Actividad reciente",
      "all": "Todo",
      "empty": "Aún no hay actividad.",
      "signin": "Entrada con {name}",
      "added": "{name} añadida",
      "renamed": "Renombrada a {name}",
      "removed": "{name} quitada",
      "new_place": "{name} usada desde un lugar nuevo",
      "suspended": "{name} desactivada",
      "report_confirmed": "{name}: respuesta \"Fui yo\"",
      "report_revoked": "{name}: \"No fui yo\", sesiones cerradas"
    },
    "backup": {
      "cap": "Consejo de respaldo",
      "title": "Añade una segunda llave",
      "lead": "Si pierdes un dispositivo, entras con el otro. Otra plataforma es lo más seguro.",
      "remoteDevice": "Añadir en tu teléfono",
      "remoteDeviceSub": "Escanea el código y guárdala con el teléfono",
      "securityKey": "Llave de seguridad",
      "securityKeySub": "USB o NFC",
      "computer": "Añadir en tu ordenador",
      "computerSub": "descall.com › Ajustes › Seguridad › Llaves de acceso"
    },
    "email": {
      "cap": "Correo de seguridad",
      "title": "Se añadió una nueva llave de acceso a tu cuenta",
      "body": "\"{name}\"{provider} se añadió el {when} desde {place}. Si no fuiste tú, quítala ya y cambia tu contraseña.",
      "somewhere": "un lugar desconocido",
      "notMe": "No fui yo",
      "itWasMe": "Fui yo",
      "lead": "Este correo llega cuando se añade una llave o se usa desde un lugar nuevo. \"No fui yo\" quita la llave y cierra todas las sesiones.",
      "noEmail": "Tu correo no está verificado, así que estos correos no te llegan. Verifícalo en Seguridad."
    },
    "alert": {
      "cap": "Uso inusual",
      "titleCity": "{name} se usó desde una ciudad nueva",
      "titleCountry": "{name} se usó desde un país nuevo",
      "signin": "Entrada: {place}",
      "before": "Antes solo {places}",
      "firstFar": "Primera vez que se usa aquí",
      "usual": "Lugar habitual",
      "me": "Fui yo",
      "revoke": "Quitar y cerrar sesiones",
      "confirmTitle": "¿Quitar la llave y cerrar las otras sesiones?",
      "confirmLead": "\"{name}\" se quita y se cierran todas las sesiones excepto este dispositivo. Después conviene cambiar la contraseña.",
      "doneMe": "Listo, cerramos el aviso.",
      "doneRevoke": "{count, plural, one {Llave quitada, # sesión cerrada.} other {Llave quitada, # sesiones cerradas.}}",
      "noneTitle": "Sin uso inusual",
      "noneLead": "Si una llave entra desde una ciudad que nunca usó, te avisamos aquí y por correo.",
      "countryOnly": "En esta conexión solo se conoce el país; el aviso llega con un país nuevo."
    },
    "empty": {
      "title": "Aún no hay llaves",
      "lead": {
        "passkey": "Añade una llave a este dispositivo; la próxima vez no escribirás contraseña ni código.",
        "face": "Añade una llave con Face ID; la próxima vez no escribirás contraseña ni código.",
        "finger": "Añade una llave con tu huella; la próxima vez no escribirás contraseña ni código.",
        "hello": "Añade una llave con Windows Hello; la próxima vez no escribirás contraseña ni código."
      }
    },
    "suggestToggle": "Sugerir una llave tras entrar con contraseña",
    "suggestToggleSub": "Solo en este dispositivo",
    "entry": {
      "title": "Llaves de acceso",
      "desc": "{count} guardadas · Seguridad {score}",
      "none": "Entrada rápida sin contraseña. Aún no hay llaves.",
      "alerts": "{count, plural, one {# aviso} other {# avisos}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "La próxima vez, entra con Windows Hello",
      "ios": "La próxima vez, entra con Face ID",
      "android": "La próxima vez, entra con tu huella",
      "web": "La próxima vez, entra con una llave de acceso"
    },
    "phoneTitle": {
      "windows": "Entra más rápido con Windows Hello",
      "ios": "Entra más rápido con Face ID",
      "android": "Entra más rápido con tu huella",
      "web": "Entra más rápido con una llave"
    },
    "lead": "Sin contraseña ni código, en unos 2 segundos.",
    "phoneLead": "La próxima vez, sin contraseña ni código. Tu contraseña sigue valiendo.",
    "c1": "Tu contraseña se queda; la llave es un camino extra y más rápido.",
    "c2": "Entrar con llave cuenta como verificación en dos pasos, sin código.",
    "c2short": "Cuenta como verificación en dos pasos.",
    "c3": "Tu cara o tu huella nunca salen de este dispositivo.",
    "c3ios": "Funciona también en tu iPad y tu Mac con el Llavero de iCloud.",
    "c3android": "Funciona también en tus otros Android con el Gestor de contraseñas de Google.",
    "later": "Recordármelo más tarde",
    "notNow": "Ahora no",
    "never": "No volver a preguntar en este dispositivo",
    "mini": "Sugerencia de llave",
    "expand": "Abrir la sugerencia de llave",
    "done": "Llave añadida. La próxima vez, entra con {method}.",
    "needsReauth": "Confirma que eres tú en Ajustes para añadirla.",
    "openSettings": "Añadir en Ajustes",
    "signedIn": {
      "password": "Entraste con contraseña",
      "2fa": "Entraste con contraseña y código",
      "google": "Entraste con Google",
      "apple": "Entraste con Apple"
    }
  },
  "report": {
    "loading": "Cargando…",
    "invalidTitle": "Enlace no válido",
    "invalid": "Este enlace no es válido o se copió incompleto. Vuelve a tocar el botón del correo.",
    "expiredTitle": "Enlace caducado",
    "expired": "Este enlace caducó. Inicia sesión y revisa Ajustes > Seguridad > Llaves de acceso.",
    "network": "No se puede conectar con Descall. Revisa tu conexión y vuelve a intentarlo.",
    "title": {
      "added": "Se añadió una nueva llave de acceso a tu cuenta",
      "newPlace": "Tu llave de acceso se usó desde un lugar nuevo"
    },
    "passkey": "Llave",
    "when": "Hora",
    "place": "Ubicación",
    "device": "Dispositivo",
    "question": "¿Fuiste tú?",
    "notMe": "No fui yo",
    "revokeLead": "\"{name}\" se quita de tu cuenta y se cierran todas las sesiones. Luego entra con tu contraseña y cámbiala.",
    "revokeLeadGone": "La llave ya se había quitado. Cerramos todas las sesiones de tu cuenta; después cambia tu contraseña.",
    "revokeButton": "Quitar y cerrar todas las sesiones",
    "itWasMe": "Fui yo",
    "confirmLead": "No cambia nada; cerramos el aviso.",
    "confirmButton": "Sí, fui yo",
    "doneRevokedTitle": "Tu cuenta está a salvo",
    "doneRevoked": "{count, plural, one {Llave quitada y # sesión cerrada. Cambia tu contraseña ahora.} other {Llave quitada y # sesiones cerradas. Cambia tu contraseña ahora.}}",
    "doneConfirmedTitle": "Gracias",
    "doneConfirmed": "Cerramos el aviso.",
    "alreadyRevoked": "Este enlace ya se usó: la llave se quitó y las sesiones se cerraron.",
    "alreadyConfirmed": "Este aviso ya se respondió: \"Fui yo\".",
    "openApp": "Ir a Descall",
    "changePassword": "Entrar y cambiar la contraseña"
  }
};
