/** Panel de administración › Centro de seguridad ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_ES = {
  "title": "Centro de seguridad",
  "subtitle": "Sigue los ataques en directo, bloquea la plataforma con un paso y deja cada cambio de ajustes reversible",
  "threatLevel": "Nivel de amenaza: {level}",
  "level": { "normal": "Normal", "elevated": "Atención", "high": "Alto" },
  "history": "Historial de ajustes",
  "alertsBtn": "Alertas",
  "emergencyLock": "Bloqueo de emergencia",
  "live": "En directo",
  "polling": "Cada 30 s",
  "loading": "Cargando…",
  "saving": "Guardando…",
  "retry": "Reintentar",
  "cancel": "Cancelar",
  "close": "Cerrar",
  "reason": "Motivo",
  "reasonRequired": "Motivo (obligatorio, se guarda en el registro de auditoría)",
  "memoryOnly": "El registro de eventos y el historial de ajustes aún no son permanentes: hasta que existan las tablas se pierden si el servidor se reinicia.",
  "time": {
    "now": "ahora",
    "nowCap": "Ahora",
    "min": "{n} min",
    "hour": "{n} h",
    "day": "{n} d",
    "hm": "{h} h {m} min",
    "hours": "{n, plural, one {# hora} other {# horas}}",
    "minutes": "{n, plural, one {# minuto} other {# minutos}}",
    "today": "Hoy {time}",
    "yesterday": "Ayer {time}",
    "yesterdayShort": "Ayer {time}"
  },
  "score": {
    "title": "Puntuación de seguridad",
    "how": "Cómo se calcula",
    "aria": "Puntuación de seguridad {score} de 100",
    "passed": "{passed} de {total} controles superados",
    "lastWeek": "La semana pasada {n}",
    "firstWeek": "Primera medición para la comparación semanal",
    "potential": "Con {n, plural, one {# recomendación} other {# recomendaciones}} llegarías a {score}",
    "allApplied": "No quedan recomendaciones por aplicar",
    "checks": "Controles de seguridad",
    "points": "+{n} pts",
    "remind": "Recordar",
    "remindGo": "Enviar recordatorio",
    "viewLocks": "Bloqueos",
    "okSr": "superado"
  },
  "grade": { "excellent": "Excelente", "good": "Bien", "fair": "Regular", "poor": "Débil" },
  "check": {
    "humanCheck": {
      "name": "Verificación humana en el registro",
      "ok": "La verificación humana en el registro está activa (Cloudflare Turnstile)",
      "fail": "La verificación humana en el registro no es obligatoria",
      "why": "Cloudflare Turnstile comprueba que no seas un bot en el registro, al restablecer la contraseña y al iniciar sesión tras varias contraseñas incorrectas; la mayoría no ve nada. La clave se configura sola con el flujo de GitHub \"Cloudflare Turnstile\". Si está configurada pero el modo es Supervisar o Apagado, aplicar la recomendación la vuelve obligatoria."
    },
    "admin2fa": {
      "name": "2FA en administradores",
      "ok": "Los {total} administradores usan 2FA",
      "fail": "{missing} de {total} administradores sin 2FA",
      "why": "Los administradores sin 2FA no pueden abrir el panel. El recordatorio les muestra un aviso para activar la app de autenticación si están conectados ahora."
    },
    "totpEnforced": {
      "name": "2FA obligatoria para administradores",
      "ok": "Las acciones de administración piden código",
      "fail": "La 2FA obligatoria para administradores no está activa",
      "why": "Mientras falten las tablas del autenticador, las acciones de administración no piden código. Hay que aplicar la migración de la base de datos."
    },
    "dmMinAge": {
      "name": "Antigüedad mínima de la cuenta para MD",
      "ok": "Antigüedad mínima para MD: {hours} h",
      "fail": "No hay antigüedad mínima de la cuenta para MD",
      "why": "Las cuentas recién creadas no pueden enviar MD masivos en sus primeras horas, lo que corta la mayoría de oleadas de spam y phishing. Recomendado: 24 horas."
    },
    "loginLimit": {
      "name": "Límite de intentos de inicio de sesión",
      "ok": "Límite de intentos {n} / min",
      "fail": "Límite de intentos demasiado alto ({n} / min)",
      "why": "Intentos con contraseña incorrecta por cuenta y minuto. Mantenerlo bajo frena la fuerza bruta. Recomendado: 5 / min."
    },
    "disposableEmail": {
      "name": "Bloqueo de correos temporales",
      "ok": "El bloqueo de correos temporales está activo",
      "fail": "El bloqueo de correos temporales está desactivado",
      "why": "Rechaza registros con servicios de correo temporal (tempmail, yopmail…), la fuente más común de cuentas bot."
    },
    "messageRate": {
      "name": "Límite de mensajes",
      "ok": "Límite de mensajes {n} / min",
      "fail": "Límite de mensajes fuera del rango seguro ({n} / min)",
      "why": "Mensajes que una persona puede enviar por minuto. Entre 1 y 120 limita las incursiones de spam. Recomendado: 60 / min."
    },
    "dmRate": {
      "name": "Intervalo entre MD",
      "ok": "Intervalo entre MD {ms} ms",
      "fail": "Intervalo entre MD demasiado corto ({ms} ms)",
      "why": "Tiempo mínimo entre dos MD. Si es muy corto, los scripts pueden enviar decenas de MD por segundo. Recomendado: 200 ms."
    },
    "accessBans": {
      "name": "Bloqueos de acceso",
      "ok": "Los bloqueos de IP y de dispositivo funcionan",
      "fail": "Los bloqueos de IP y de dispositivo no funcionan",
      "why": "Faltan las tablas de bloqueos de acceso o la clave de firma; ahora mismo los bloqueos de IP y de red no detienen a nadie."
    },
    "eventLog": {
      "name": "Registro de eventos de seguridad",
      "ok": "Los eventos de seguridad se guardan de forma permanente",
      "fail": "Los eventos de seguridad solo están en memoria",
      "why": "Hasta que exista la tabla de eventos, el feed en directo se pierde al reiniciar y no hay comparación semanal."
    },
    "auditLog": {
      "name": "Registro de auditoría",
      "ok": "El registro de auditoría es permanente",
      "fail": "El registro de auditoría no es permanente",
      "why": "Falta la tabla del registro de auditoría; las acciones de administración solo se guardan en memoria."
    },
    "noOpenLock": {
      "name": "Bloqueo sin fin",
      "ok": "No hay bloqueos activos sin fin",
      "fail": "Bloqueo sin fin activo: {modes}",
      "why": "Un bloqueo de emergencia hasta que se quite afecta a los usuarios sin motivo si se olvida."
    }
  },
  "explain": {
    "title": "Cómo se calcula la puntuación",
    "body": "Cada control tiene un peso; la puntuación es la parte del peso superado sobre el total (de 100). Se guarda cada 12 horas y se compara con la semana pasada.",
    "grades": "90 o más excelente, 75 o más bien, 50 o más regular, por debajo débil."
  },
  "fix": {
    "title": "Aplicar recomendación",
    "sets": "Ajustará",
    "score": "Puntuación",
    "apply": "Aplicar",
    "all": "Aplicar todas ({n})"
  },
  "threat": {
    "title": "Resumen de amenazas",
    "window": "últimas 24 horas",
    "spike": "{time} oleada de fuerza bruta",
    "calm": "Sin oleadas de fuerza bruta",
    "chartAria": "Inicios de sesión fallidos, límites de velocidad e IP bloqueadas en las últimas 24 horas"
  },
  "kpi": {
    "failed": "Inicios fallidos",
    "locked": "Cuentas bloqueadas",
    "blocked": "IP bloqueadas",
    "rate": "Límites superados",
    "vsYesterday": "{pct} frente a ayer",
    "flat": "igual que ayer",
    "new": "ayer ninguno",
    "activeBans": "{n} bloqueos activos"
  },
  "legend": { "failed": "Inicios fallidos", "rate": "Límite de velocidad", "blocked": "IP bloqueadas" },
  "locks": {
    "title": "Modos de bloqueo de emergencia",
    "liftAll": "Quitar todos",
    "permanent": "Ajustes de acceso permanentes",
    "fromSystem": "Activo desde Sistema",
    "sysChatFrozen": "El chat está congelado",
    "chatFrozenSub": "Nadie puede enviar mensajes",
    "regOff": "Los registros están desactivados",
    "regOffSub": "No se pueden crear cuentas nuevas",
    "openSystem": "Abrir Sistema",
    "liftsIn": "Se quita en {time}",
    "untilLifted": "Hasta que se quite",
    "detailAria": "Detalles del bloqueo {name}"
  },
  "lockMode": {
    "registration": {
      "name": "Congelar registros",
      "short": "congelar registros",
      "desc": "No se crean cuentas nuevas",
      "long": "No se pueden crear cuentas (correo, Google, Apple). Las cuentas existentes pueden iniciar sesión."
    },
    "dm": {
      "name": "Congelar MD",
      "short": "congelar MD",
      "desc": "No se envían MD nuevos",
      "long": "No se pueden enviar mensajes directos nuevos; los chats de servidores y grupos siguen abiertos."
    },
    "readOnly": {
      "name": "Modo solo lectura",
      "short": "modo solo lectura",
      "desc": "Nadie puede enviar mensajes",
      "long": "No se pueden enviar mensajes en ningún sitio ni crear grupos o servidores."
    }
  },
  "perm": {
    "groups": {
      "name": "Crear grupos",
      "on": "Los usuarios pueden crear grupos",
      "off": "No se pueden crear grupos",
      "offTitle": "¿Desactivar la creación de grupos?",
      "offBody": "Los usuarios no podrán crear grupos nuevos; los existentes siguen funcionando. No afecta a los administradores."
    },
    "dm": {
      "name": "Mensajes directos",
      "on": "Los MD están activos",
      "off": "Los MD están desactivados",
      "offTitle": "¿Desactivar los mensajes directos de forma permanente?",
      "offBody": "Nadie podrá enviar MD nuevos; es un ajuste permanente y no vuelve solo. Para una pausa temporal usa el bloqueo Congelar MD."
    },
    "offGo": "Desactivar"
  },
  "lift": {
    "title": "¿Quitar {name}?",
    "titleAll": "¿Quitar {n, plural, one {# bloqueo} other {# bloqueos}}?",
    "body": "Los ajustes vuelven a como estaban antes del bloqueo, desaparece la banda informativa y se guarda en el registro de auditoría.",
    "go": "Quitar bloqueo"
  },
  "lockInfo": {
    "reason": "Motivo",
    "by": "Iniciado por",
    "started": "Inicio",
    "ends": "Fin",
    "band": "Banda informativa",
    "extend": "Ampliar",
    "plus": "+{time}",
    "lift": "Quitar bloqueo"
  },
  "lockDlg": {
    "title": "Iniciar bloqueo de emergencia",
    "sub": "Los modos que elijas se aplican en toda la plataforma al instante; no afectan a los administradores.",
    "modes": "Bloquear",
    "alreadyOn": "Activo · {time}",
    "duration": "Fin automático",
    "reason": "Motivo (obligatorio, se guarda en el registro de auditoría)",
    "reasonPh": "¿Qué pasa? Ej.: desde las 20:09, fuerza bruta y oleada de registros de bots desde una misma fuente.",
    "code": "Código de verificación",
    "banner": "Mostrar una banda informativa a los usuarios",
    "pickOne": "Elige al menos un bloqueo",
    "starting": "Iniciando…",
    "confirm": {
      "15m": "{n, plural, one {Bloquear 15 minutos} other {Iniciar # bloqueos durante 15 minutos}}",
      "1h": "{n, plural, one {Bloquear 1 hora} other {Iniciar # bloqueos durante 1 hora}}",
      "6h": "{n, plural, one {Bloquear 6 horas} other {Iniciar # bloqueos durante 6 horas}}",
      "24h": "{n, plural, one {Bloquear 24 horas} other {Iniciar # bloqueos durante 24 horas}}",
      "manual": "{n, plural, one {Bloquear hasta que se quite} other {Iniciar # bloqueos hasta que se quiten}}"
    },
    "impact": "Vista previa del impacto",
    "online": "Usuarios conectados",
    "signups": "Registros nuevos, última hora",
    "dms": "MD nuevos, última hora",
    "autoEnd": "Fin automático",
    "bandTitle": "Banda que verán los usuarios",
    "device": "Dispositivo de vista previa",
    "desktop": "Escritorio",
    "phone": "Teléfono",
    "noBand": "No se mostrará banda informativa",
    "pickForBand": "Elige un bloqueo para ver la banda aquí",
    "registrationWhere": "Quien intente registrarse lo verá en la pantalla de registro.",
    "noteAuto": "Al terminar el tiempo, los ajustes vuelven a como estaban antes del bloqueo y se avisa a la sala de administración.",
    "noteManual": "El bloqueo dura hasta que lo quites. Aparece en Alertas y en la puntuación para que no se olvide."
  },
  "duration": { "15m": "15 min", "1h": "1 hora", "6h": "6 horas", "24h": "24 horas", "manual": "Hasta que se quite" },
  "band": {
    "registration": "Los registros nuevos están cerrados temporalmente. {when}",
    "dm": "El envío de MD está desactivado temporalmente. {when}",
    "readOnly": "Descall está en solo lectura por un rato. No se pueden enviar mensajes. {when}",
    "when": {
      "15m": "Vuelve en unos 15 minutos.",
      "1h": "Vuelve en aproximadamente 1 hora.",
      "6h": "Vuelve en unas 6 horas.",
      "24h": "Vuelve en unas 24 horas."
    },
    "whenManual": "Vuelve lo antes posible."
  },
  "feed": {
    "title": "Feed de amenazas en directo",
    "sub": "eventos de inicio de sesión, registro, límite de velocidad y bloqueos de acceso",
    "openAll": "Ver todo",
    "collapse": "Contraer",
    "filters": "Tipo de evento",
    "pause": "Pausar el feed",
    "resume": "Reanudar el feed",
    "export": "Descargar CSV",
    "newEvents": "{n, plural, one {# evento nuevo · ver} other {# eventos nuevos · ver}}",
    "emptyTitle": "Todo tranquilo",
    "emptyBody": "No hay eventos de seguridad recientes. Los nuevos aparecen aquí en directo.",
    "emptyFilter": "No hay eventos de este tipo.",
    "loadMore": "Eventos anteriores",
    "sourceFilter": "Origen: {ip}",
    "clearSource": "Quitar el filtro de origen"
  },
  "filter": {
    "all": "Todos",
    "bruteForce": "Fuerza bruta",
    "failedLogin": "Inicio fallido",
    "blockedIp": "IP bloqueada",
    "rateLimit": "Límite de velocidad",
    "signupDenied": "Registro rechazado"
  },
  "ev": {
    "unknownAccount": "una cuenta que no existe",
    "brute_force": {
      "title": "Ataque de fuerza bruta",
      "line": "{attempts} intentos en {accounts} cuentas en {minutes} min",
      "lineUser": "{attempts} intentos en {accounts} cuentas, incluida {user}, en {minutes} min"
    },
    "failed_login": {
      "title": "Inicio de sesión fallido",
      "lineUser": "{user} · contraseña incorrecta, {n} intentos",
      "lineUnknown": "Nombre de usuario desconocido · {n} intentos"
    },
    "account_locked": {
      "title": "Cuenta bloqueada temporalmente",
      "lineMinute": "{user} · {n} inicios fallidos en 1 minuto, tiempo de espera",
      "lineWindow": "{user} · demasiados intentos en 15 minutos, rechazado {n} veces"
    },
    "ip_blocked": {
      "title": "Límite de IP superado",
      "lineLogin": "Los intentos de inicio de sesión superaron el límite de IP · rechazado {n} veces",
      "lineRegister": "Los intentos de registro superaron el límite de IP · rechazado {n} veces"
    },
    "access_ban": {
      "title": "Frenado por un bloqueo de acceso",
      "line": "{kind} {label} · intento de {action}"
    },
    "rate_limit": {
      "title": "Límite de velocidad superado",
      "line": "{user} · límite de mensajes {limit} / min, {n} intentos rechazados"
    },
    "signup_denied": {
      "title": "Registro rechazado",
      "lineDisposable": "{email} · correo temporal",
      "lineClosed": "Registro con {method} con los registros cerrados · {n} intentos",
      "lineHumanCheck": "Registro con {method} detenido por la verificación humana · {n} intentos"
    },
    "admin_step_up": {
      "title": "Verificación de administrador",
      "lineOk": "{user} · código correcto",
      "lineFail": "{user} · código incorrecto, {n} intentos"
    }
  },
  "banKind": { "ip": "Bloqueo de IP", "network": "Bloqueo de red", "device": "Bloqueo de dispositivo" },
  "banAction": { "login": "inicio de sesión", "register": "registro", "socket": "conexión", "oauth": "acceso con Google / Apple", "api": "petición de la app" },
  "method": { "email": "correo", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "Bloquear IP",
    "banNet": "Bloquear red",
    "banUser": "Banear",
    "inspect": "Revisar",
    "viewBan": "Bloqueo",
    "session": "Sesión"
  },
  "csv": { "time": "Hora", "type": "Tipo", "count": "Cantidad", "source": "Origen", "network": "Red", "account": "Cuenta", "detail": "Detalle" },
  "sources": {
    "title": "Orígenes con más intentos",
    "ban": "Bloquear",
    "banned": "Bloqueado",
    "empty": "Ningún origen con intentos en las últimas 24 horas.",
    "openFeed": "Ver los eventos de este origen",
    "unknownPlace": "Ubicación desconocida"
  },
  "srcBan": {
    "title": "¿Bloquear {ip}?",
    "sub": "Un bloqueo de acceso impide el inicio de sesión, el registro y las conexiones desde esta dirección; no afecta a los administradores.",
    "what": "Qué bloquear",
    "ip": "Solo esta IP",
    "network": "Toda la red (/24)",
    "netWarn": "Un bloqueo de red bloquea a todos los de la misma red (por ejemplo una residencia u oficina).",
    "duration": "Duración",
    "reasonPh": "Ej.: 214 intentos en 37 cuentas en 9 minutos",
    "privacy": "La dirección nunca se guarda; el bloqueo usa la huella cifrada que se guarda con el evento.",
    "goIp": "Bloquear IP",
    "goNet": "Bloquear red",
    "banning": "Bloqueando…"
  },
  "banDur": { "1d": "1 día", "7d": "7 días", "30d": "30 días", "90d": "90 días", "permanent": "Permanente" },
  "evd": {
    "title": "Evento",
    "when": "Hora",
    "count": "Repeticiones",
    "countVal": "{n} veces, la primera {from}",
    "source": "Origen",
    "network": "Red",
    "account": "Cuenta",
    "status": "Estado del origen",
    "noSource": "Sin dirección (dentro de la app)",
    "noAccount": "Sin cuenta",
    "sourceBanned": "Bloqueado",
    "sourceOpen": "Sin bloqueo",
    "openUser": "Ficha del usuario",
    "openBans": "Bloqueos de acceso",
    "allFromSource": "Todos los eventos de este origen",
    "copy": "Copiar resumen",
    "copied": "Copiado",
    "timeline": "Eventos recientes del mismo origen y cuenta",
    "noRelated": "No hay otros eventos."
  },
  "hist": {
    "heading": "Historial de cambios de ajustes",
    "sub": "Cada cambio en los ajustes de seguridad, quién lo hizo y el valor anterior",
    "filters": "Tipo de cambio",
    "cat": { "all": "Todos", "locks": "Bloqueos", "rateLimits": "Límites de velocidad", "signup": "Protección de registro", "access": "Acceso" },
    "system": "sistema",
    "before": "antes",
    "after": "después",
    "noReason": "Sin motivo",
    "autoExpired": "Se acabó el tiempo y el bloqueo se quitó solo",
    "revert": "Deshacer",
    "reverting": "Deshaciendo…",
    "reverted": "Deshecho {user}",
    "isRevert": "Deshacer",
    "expired": "Caducado",
    "confirmTitle": "¿Deshacer este cambio?",
    "revertOne": "{name} pasa de {to} a {from}.",
    "revertMany": "{n, plural, one {# ajuste vuelve} other {# ajustes vuelven}} al valor anterior.",
    "revertLock": "El bloqueo ({modes}) se quita ahora.",
    "revertAudited": "Deshacer también queda en el registro de auditoría.",
    "stale": "Este ajuste ha vuelto a cambiar desde entonces; deshacer sobrescribe el último valor.",
    "reasonPh": "Ej.: El ataque terminó, volvemos al límite normal.",
    "memoryOnly": "El historial aún no es permanente: hasta que exista la tabla se pierde si el servidor se reinicia.",
    "emptyTitle": "Aún no hay cambios",
    "emptyBody": "Cada cambio en los ajustes de seguridad y del sistema aparece aquí con su valor anterior.",
    "loadMore": "Cambios anteriores",
    "title": {
      "lock": "Bloqueo de emergencia: {modes}",
      "lockLift": "Bloqueo de emergencia quitado: {modes}",
      "lockExpired": "Bloqueo de emergencia caducado: {modes}",
      "lockExtend": "Cambió el fin del bloqueo: {modes}",
      "settings": "Ajustes de seguridad ({n})",
      "recommended": "Ajustes recomendados aplicados",
      "revert": "Deshecho: {title}"
    }
  },
  "setting": {
    "turnstileMode": "Verificación humana (Turnstile)",
    "registrationEnabled": "Registros",
    "dmEnabled": "Mensajes directos",
    "readOnlyMode": "Modo solo lectura",
    "groupCreationEnabled": "Crear grupos",
    "maxLoginAttempts": "Límite de intentos de inicio de sesión",
    "maxMessagesPerMinute": "Límite de mensajes",
    "dmRateLimitMs": "Intervalo entre MD",
    "dmMinAccountAgeHours": "Antigüedad mínima para MD",
    "disposableEmailBlock": "Bloqueo de correos temporales",
    "chatFrozen": "Congelar el chat",
    "maintenanceMode": "Modo mantenimiento",
    "slowModeSeconds": "Modo lento",
    "rateLimitGlobalMs": "Intervalo global de mensajes",
    "maxMessageLength": "Mensaje más largo"
  },
  "val": {
    "on": "activado",
    "off": "desactivado",
    "none": "ninguno",
    "rule": "regla de despliegue",
    "untilLifted": "hasta que se quite",
    "autoOnAt": "se reactiva a las {time}",
    "autoOffAt": "se desactiva a las {time}"
  },
  "unit": { "perMin": "{n} / min", "ms": "{n} ms", "hours": "{n} h" },
  "alerts": {
    "title": "Alertas",
    "none": "Ahora mismo nada requiere atención.",
    "desktop": "Notificación de escritorio ante una oleada de fuerza bruta",
    "desktopHint": "Mientras esta página esté abierta, en este navegador",
    "desktopBlocked": "El navegador no permite notificaciones.",
    "notifyTitle": "Oleada de fuerza bruta",
    "notifyBody": "Intentos de inicio de sesión en muchas cuentas desde {ip}",
    "burst": { "title": "Oleada de fuerza bruta", "body": "Desde {ip}, {count} oleadas en las últimas 24 horas" },
    "lock": { "title": "{mode} activo", "body": "Se quita solo en {time}" },
    "lockOpen": { "title": "{mode} activo sin fin", "body": "Dura hasta que se quite" },
    "failedSpike": { "title": "Suben los inicios fallidos", "body": "{pct}% más que ayer" },
    "lockedSpike": { "title": "Suben las cuentas bloqueadas", "body": "{n} cuentas bloqueadas más que ayer" },
    "admin2fa": { "title": "Hay un administrador sin 2FA", "body": "{missing} de {total} administradores sin 2FA" }
  },
  "toast": {
    "saved": "Ajuste guardado y añadido al historial.",
    "applied": "Recomendación aplicada.",
    "appliedAll": "{n, plural, one {# recomendación aplicada.} other {# recomendaciones aplicadas.}}",
    "locked": "{n, plural, one {Bloqueo iniciado.} other {# bloqueos iniciados.}}",
    "lifted": "Bloqueo quitado.",
    "extended": "Fin del bloqueo actualizado.",
    "reverted": "Cambio deshecho.",
    "reminded": "Recordatorio enviado a {n} administradores, {online} lo vieron ahora.",
    "bannedIp": "IP bloqueada, {kicked} conexiones cerradas.",
    "bannedNet": "Red bloqueada, {kicked} conexiones cerradas.",
    "userBanned": "Usuario baneado."
  },
  "err": {
    "generic": "Algo salió mal. Inténtalo de nuevo.",
    "load": "No se pudieron cargar los datos de seguridad.",
    "REASON_REQUIRED": "Escribe un motivo.",
    "ALREADY_ON": "Este bloqueo ya está activo.",
    "BAD_DURATION": "Duración no válida.",
    "NO_MODES": "Elige al menos un bloqueo.",
    "NOT_ON": "Este bloqueo no está activo.",
    "LOCK_ENDED": "Este bloqueo ya terminó.",
    "ALREADY_REVERTED": "Este cambio ya se deshizo.",
    "NOT_REVERTIBLE": "Este cambio no se puede deshacer.",
    "ALREADY_BANNED": "Esta dirección ya está bloqueada.",
    "SOURCE_NOT_FOUND": "Este origen ya no está en el feed de seguridad.",
    "BANS_UNAVAILABLE": "Los bloqueos de acceso aún no están activos.",
    "ADMIN_PERMISSION_DENIED": "No tienes permiso para esto.",
    "STEP_UP_REQUIRED": "Esta acción necesita un código de verificación.",
    "replay": "Este código se acaba de usar. Espera al siguiente.",
    "invalid": "Código incorrecto."
  },
  "notice": {
    "dm": "El envío de MD está desactivado temporalmente.",
    "readOnly": "Descall está en solo lectura por un rato; ahora no se pueden enviar mensajes.",
    "registration": "Los registros nuevos están cerrados temporalmente.",
    "until": "Vuelve hacia las {time}.",
    "soon": "Vuelve lo antes posible.",
    "dismiss": "Ocultar la banda"
  },
  "human": {
    "title": "Verificación humana",
    "window": "Cloudflare Turnstile · últimas 24 horas",
    "status": {
      "enforcing": "Obligatoria",
      "monitor": "Solo supervisión",
      "off": "Apagada",
      "notSetUp": "Sin configurar",
      "tableMissing": "Falta la tabla",
      "badSecret": "Clave rechazada",
      "unknown": "Desconocido"
    },
    "kpi": {
      "pass": "Superadas",
      "refused": "Detenidas",
      "fallback": "Admitidas sin verificación",
      "failOpen": "Cloudflare caído"
    },
    "sub": {
      "rate": "{rate} % superadas",
      "noData": "Aún no hay verificaciones",
      "refused": "Verificación inválida o ausente",
      "fallback": "El widget no cargó, regla de reserva",
      "failOpen": "Caída, nadie fue bloqueado"
    },
    "legend": {
      "pass": "Superadas",
      "refused": "Detenidas",
      "let": "Admitidas sin verificación"
    },
    "chartAria": "Resultados de la verificación humana por hora en las últimas 24 horas",
    "hourTip": "{time}: {pass} superadas, {refused} detenidas, {let} sin verificación",
    "actions": "Dónde se pide",
    "action": {
      "register": "Registro",
      "social_signup": "Registro con Google / Apple",
      "password_reset": "Restablecer contraseña",
      "login": "Inicio de sesión (tras contraseñas incorrectas)"
    },
    "col": {
      "pass": "Superadas",
      "refused": "Detenidas",
      "let": "Sin verificación"
    },
    "challenged": "pedida {n} veces",
    "modeTitle": "Modo",
    "mode": {
      "enforce": "Obligatoria",
      "monitor": "Supervisar",
      "off": "Apagada"
    },
    "modeHint": {
      "enforce": "Se rechaza una verificación inválida o ausente; una caída de Cloudflare nunca bloquea a nadie.",
      "monitor": "La verificación se hace y se cuenta, pero no se rechaza a nadie.",
      "off": "La verificación no se pide nunca."
    },
    "monitorTitle": "Pasar a solo supervisión",
    "monitorBody": "La verificación sigue, pero quien no la supere podrá registrarse. Los bots pueden volver a entrar.",
    "offTitle": "Apagar la verificación humana",
    "offBody": "El registro, el restablecimiento de contraseña y el inicio de sesión dejan de pedirla. Úsalo un tiempo si algo falla.",
    "modeGo": "Aplicar",
    "envLocked": "La variable de entorno TURNSTILE_ENFORCE en Render fija el modo.",
    "setup": "La configuración es automática: GitHub › Actions › Cloudflare Turnstile › apply. La clave funciona en un minuto, sin volver a desplegar.",
    "notes": {
      "noteSetup": "No hay clave de Turnstile; la verificación se omite y el registro funciona como antes.",
      "noteTable": "Falta la tabla turnstile_config: aplica la migración 20261124t_turnstile.sql.",
      "noteBadSecret": "Cloudflare rechaza la clave secreta; no se bloquea a nadie. Ejecuta el flujo con rotate.",
      "noteUnreachable": "En las últimas 24 horas no se pudo contactar con Cloudflare a ratos; esas solicitudes se admitieron.",
      "noteEnv": "Modo fijado por variable de entorno: {mode}.",
      "noteTestKeys": "Se usan claves de prueba de Cloudflare; no hay protección real.",
      "noteBudgetFull": "El límite sin verificación se agotó esta hora ({n}); quien no pueda cargar el widget esperará una hora."
    },
    "meta": {
      "sourceDb": "Origen: flujo de GitHub",
      "sourceEnv": "Origen: variable de entorno",
      "siteKey": "Clave del sitio {key}",
      "hosts": "{n, plural, one {# dominio} other {# dominios}}",
      "updated": "Actualizado {time}",
      "budget": "Admitidas sin verificación esta hora: {used}/{max} · {perIp} por IP"
    },
    "saved": "Modo de verificación humana guardado"
  }
};
