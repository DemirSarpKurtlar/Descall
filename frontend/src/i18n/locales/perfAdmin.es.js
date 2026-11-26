/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_ES = {
  "title": "Rendimiento",
  "crumb": "Sistema › Rendimiento · métricas de usuarios reales y Lighthouse CI",
  "sampling": "muestreo {pct}",
  "dataAgoSec": "datos hace {n} s",
  "dataAgoMin": "datos hace {n} min",
  "notReady": "Las tablas de rendimiento aún no están creadas (20261124v_perf.sql). Los datos llegarán cuando se aplique la migración.",
  "retry": "Reintentar",
  "close": "Cerrar",
  "cancel": "Cancelar",
  "save": "Guardar",
  "saving": "Guardando…",
  "undo": "Deshacer",
  "and": "y",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} s"
  },
  "tab": {
    "rum": "Usuarios reales",
    "rumShort": "Usuarios",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Alertas"
  },
  "live": {
    "long": "En vivo · {n} sesiones / 5 min",
    "short": "En vivo · {n}",
    "waiting": "En vivo · esperando",
    "title": "Cargas de página muestreadas en los últimos 5 minutos"
  },
  "export": {
    "button": "Exportar",
    "done": "{n} filas descargadas en CSV · registrado en el historial",
    "failed": "No se pudo exportar."
  },
  "rules": {
    "button": "Reglas de alerta",
    "title": "Regla de alerta",
    "subtitle": "Avisa a la sala de administradores y a ti cuando una métrica empeora en una versión nueva.",
    "metric": "Métrica",
    "platform": "Plataforma",
    "condition": "Condición",
    "conditionText": "p75, frente a la versión anterior",
    "threshold": "Empeora",
    "thresholdUnit": "% o más",
    "minSessions": "Muestras mínimas",
    "minUnit": "muestras",
    "notify": "Notificar",
    "ch": {
      "adminRoom": "Sala de administradores (mensaje del sistema)",
      "ownerPush": "Notificación al propietario (teléfono)",
      "email": "Resumen por correo",
      "errorLog": "Abrir registro en Registros de errores"
    },
    "chSub": {
      "adminRoom": "administradores con el panel abierto",
      "ownerPush": "web, iOS, Android",
      "email": "una vez al día",
      "errorLog": "una vez por alerta"
    },
    "mute": "Silenciar",
    "muteOpt": {
      "none": "Nunca",
      "release24h": "Misma versión 24 h",
      "7d": "7 días"
    },
    "save": "Guardar regla",
    "saved": "Regla guardada; el cambio está en el historial.",
    "previewTitle": "Vista previa · últimos 90 días",
    "previewSome": "veces se habría activado: cada una, una regresión real.",
    "previewNone": "veces: no se habría activado en 90 días.",
    "previewInvalid": "Elige al menos una métrica y una plataforma.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "Así se ve en la sala de administradores",
    "roomOff": "La sala está desactivada: este mensaje no se envía.",
    "auditNote": "Los cambios de reglas van al historial y se pueden deshacer allí."
  },
  "query": {
    "label": "Consulta de rendimiento",
    "placeholder": "Añadir filtro: página, plataforma, versión, dispositivo, conexión, país, ID de usuario",
    "filters": "Filtros",
    "remove": "Quitar filtro {label}",
    "suggestions": "Sugerencias"
  },
  "tok": {
    "range": "últimos",
    "platform": "plataforma",
    "version": "versión",
    "route": "página",
    "device": "dispositivo",
    "connection": "conexión",
    "country": "país",
    "user": "usuario"
  },
  "range": {
    "24h": "24 horas",
    "7d": "7 días",
    "28d": "28 días",
    "90d": "90 días"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Gama baja",
    "mid": "Gama media",
    "high": "Gama alta"
  },
  "conn": {
    "wifi": "Wi-Fi",
    "ethernet": "Ethernet",
    "4g": "4G",
    "3g": "3G",
    "2g": "2G",
    "offline": "Sin conexión"
  },
  "metric": {
    "lcp": "LCP",
    "inp": "INP",
    "cls": "CLS",
    "fcp": "FCP",
    "ttfb": "TTFB",
    "msglist": "Primera lista de mensajes",
    "voicejoin": "Unirse a voz",
    "appstart": "Inicio de la app"
  },
  "metricSub": {
    "lcp": "Mayor contenido",
    "inp": "Retraso de interacción",
    "cls": "Cambio de diseño",
    "fcp": "Primer contenido",
    "ttfb": "Primer byte",
    "msglist": "al abrir un chat",
    "voicejoin": "conectar a la sala",
    "appstart": "arranque en frío"
  },
  "dist": {
    "good": "Bueno {pct}",
    "ni": "Regular {pct}",
    "poor": "Malo {pct}"
  },
  "route": {
    "app_kanal": "Canal del servidor",
    "app_dm": "Mensajes directos",
    "app_grup": "Chat de grupo",
    "app_ses": "Sala de voz",
    "app": "App",
    "_": "Página de inicio",
    "_download": "Página de descarga",
    "_features": "Funciones",
    "_login": "Iniciar sesión",
    "_blog": "Blog",
    "app_market": "Mercado",
    "app_kesfet": "Descubrir",
    "app_ayarlar": "Ajustes"
  },
  "views": {
    "label": "Vistas guardadas",
    "all": "Todo",
    "mobileSlow": "Móvil · red lenta",
    "desktopStart": "Inicio en escritorio",
    "voice": "Sala de voz",
    "release": "{platform} {version}",
    "regression": "regresión",
    "save": "Guardar vista",
    "copyLink": "Copiar enlace",
    "linkCopied": "Enlace copiado: quien lo abra verá los mismos filtros.",
    "notReady": "Las vistas guardadas se activan tras la migración.",
    "menu": "Vista",
    "delete": "Eliminar vista",
    "deleted": "«{name}» eliminada.",
    "saved": "«{name}» guardada.",
    "saveTitle": "Guardar vista",
    "saveSubtitle": "Estos filtros vuelven con un clic.",
    "name": "Nombre",
    "namePh": "p. ej. regresión Android 4.1.4",
    "contains": "Filtros incluidos",
    "shared": "Compartir con los demás administradores",
    "sharedSub": "La ve quien tenga la sección Rendimiento."
  },
  "alert": {
    "lead": "{version}: {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} muestras.",
    "mostOn": "Sobre todo en",
    "also": "{n} alertas más.",
    "firstSeen": "Visto por primera vez {when}.",
    "share": "La versión está en el {pct} de usuarios.",
    "review": "Revisar",
    "errorLog": "Abrir registro de error",
    "errorAgain": "Ver registro de error",
    "errorOpened": "Registro abierto en Registros de errores.",
    "errorExists": "Esta alerta ya tiene un registro de error.",
    "gotoErrors": "Abrir en Registros de errores",
    "hide": "Ocultar",
    "hidden": "Alerta oculta (para todos).",
    "show": "Mostrar de nuevo",
    "shown": "La alerta vuelve a mostrarse.",
    "vsPrev": "versión anterior {version}",
    "hasError": "registro de error abierto"
  },
  "alerts": {
    "open": "Alertas abiertas",
    "hidden": "Ocultas",
    "none": "No hay alertas abiertas. Las versiones que superen el umbral aparecen aquí.",
    "how": "Cada 15 minutos se compara la versión más reciente de cada plataforma con la anterior por p75; si supera el umbral, se abre una alerta."
  },
  "chart": {
    "title": "Tendencia p75",
    "metric": "Métrica del gráfico",
    "app": "App",
    "hint": "Haz clic en una línea: filtra esa plataforma",
    "aria": "Tendencia p75 de {metric} por plataforma",
    "goodLine": "Límite bueno · {value}",
    "tipTitle": "{when} · p75",
    "flag": "flag: {name} {pct}",
    "flagOff": "apagado",
    "empty": "No hay datos en este rango.",
    "noData": "No hay muestras con estos filtros."
  },
  "releases": {
    "title": "Comparación de versiones",
    "version": "Versión",
    "share": "Cuota",
    "start": "Inicio",
    "empty": "Aún no hay datos de versiones.",
    "mix": "Cuota por plataforma",
    "sessions": "{n} sesiones"
  },
  "group": {
    "route": "Página",
    "platform": "Plataforma",
    "version": "Versión",
    "device": "Clase de dispositivo",
    "connection": "Conexión",
    "country": "País"
  },
  "table": {
    "title": {
      "route": "Páginas más lentas",
      "platform": "Plataformas",
      "version": "Versiones",
      "device": "Clases de dispositivo",
      "connection": "Conexiones",
      "country": "Países"
    },
    "groupBy": "Agrupar por",
    "distOf": "Distribución: {metric}",
    "sortBy": "Por {metric} p75",
    "sortLabel": "Orden",
    "platform": "Plataforma",
    "sessions": "Sesiones",
    "dist": "Distribución",
    "trend": "Tendencia",
    "empty": "No hay muestras con estos filtros.",
    "emptySub": "Afloja los filtros o elige un rango más largo.",
    "rowMenu": "Acciones de fila",
    "open": "Abrir detalles",
    "filterTo": "Solo {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Resumen",
      "breakdown": "Desglose",
      "attribution": "Atribución",
      "users": "Usuarios lentos",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} sesiones",
    "allPlatforms": "todas las plataformas",
    "copy": "Copiar valor",
    "copied": "Copiado.",
    "heatTitle": "INP p75 · plataforma × clase",
    "heatHint": "clic en una celda: filtro",
    "none": "sin datos",
    "samples": "{n} muestras",
    "noData": "Sin datos.",
    "attrTitle": "Atribución · interacciones más lentas (INP)",
    "attrEmpty": "No hay datos de atribución en los últimos {days} días.",
    "itype": {
      "keyboard": "keydown · teclado",
      "pointer": "click · toque / clic",
      "other": "interacción"
    },
    "shareOf": "{pct} de interacciones",
    "lcpEl": "Elemento LCP:",
    "onPages": "{pct} de cargas",
    "usersTitle": "Usuarios más lentos",
    "usersHint": "solo ID de usuario",
    "usersEmpty": "No hay usuarios lentos con sesión iniciada.",
    "dossier": "Ficha de usuario",
    "userSessions": "{n} sesiones de este usuario",
    "userSessionsAll": "Sesiones de este usuario",
    "lhTitle": "Lighthouse · main",
    "lhNone": "Lighthouse CI no mide esta página.",
    "lhApp": "Lighthouse no mide pantallas de la app, solo páginas públicas.",
    "saveView": "Guardar como vista",
    "openLh": "Abrir en Lighthouse",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Sistema Descall",
    "badge": "SISTEMA",
    "text": "Alerta de rendimiento: {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} muestras.",
    "open": "Abrir en el panel"
  },
  "filters": {
    "title": "Filtros",
    "subtitle": "Puedes elegir varios valores; vacío significa todo.",
    "userPh": "ID de usuario (completo o 8 primeros caracteres)",
    "clear": "Limpiar",
    "apply": "Aplicar"
  },
  "err": {
    "generic": "Algo salió mal.",
    "load": "No se pudo cargar.",
    "NO_METRIC": "Elige al menos una métrica.",
    "NO_PLATFORM": "Elige al menos una plataforma.",
    "BAD_THRESHOLD": "El umbral debe estar entre 1 y 500.",
    "BAD_MIN_SESSIONS": "El mínimo de muestras debe ser 10 o más.",
    "NAME_REQUIRED": "Escribe un nombre.",
    "PERF_UNAVAILABLE": "Las tablas de rendimiento aún no existen."
  },
  "lh": {
    "placeholder": "Número de PR, rama, autor, página…",
    "tok": {
      "compare": "comparar",
      "state": "estado",
      "text": "buscar"
    },
    "rerun": "Volver a ejecutar todo",
    "rerunHint": "Abre el flujo de Lighthouse en GitHub Actions",
    "view": {
      "open": "PR abiertos",
      "over": "Sobre el presupuesto",
      "main": "historial de main",
      "merged": "Fusionados recientemente"
    },
    "method": "{pages} páginas × 3 pasadas · mediana",
    "lastRun": "última ejecución {when}",
    "minAgo": "hace {n} min",
    "hourAgo": "hace {n} h",
    "yesterday": "ayer",
    "overLead": "#{pr} supera el presupuesto de rendimiento:",
    "budget": "(presupuesto {n}).",
    "bundle": "Paquete principal {kb} KB (gzip).",
    "tbt": "TBT medio {ms} ms.",
    "openPr": "Abrir PR",
    "report": "Ver informe",
    "empty": "Aún no hay resultados de Lighthouse. Aparecerán tras el próximo PR o ejecución en main.",
    "cat": {
      "perf": "Rendimiento",
      "a11y": "Accesibilidad",
      "best_practices": "Buenas prácticas",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Rend",
      "a11y": "Acc",
      "best_practices": "BP",
      "seo": "SEO"
    },
    "weekDelta": "{n} esta semana",
    "weekFlat": "sin cambios esta semana",
    "thisWeek": "Esta semana",
    "runs": "ejecuciones",
    "passed": "Aprobados {n}",
    "warned": "Aviso {n}",
    "over": "Excedidos {n}",
    "history": "historial de main",
    "historySub": "últimas {n} fusiones",
    "noHistory": "El gráfico necesita al menos dos ejecuciones en main.",
    "budgetLbl": "Presupuesto · {n}",
    "perPage": "Por página · main",
    "noMain": "Aún no hay resultados de main.",
    "noindexNote": "Las páginas de la app son noindex a propósito; su SEO no cuenta en el presupuesto.",
    "prs": "Pull requests",
    "prsSub": "diferencia con main · media de {pages} páginas",
    "author": "Autor",
    "state": "Estado",
    "noPrs": "No hay PR en esta vista.",
    "st": {
      "over": "Presupuesto superado",
      "warn": "Aviso",
      "pass": "Aprobado",
      "merged": "Fusionado",
      "mergedWarn": "Fusionado · aviso"
    },
    "pr": "PR"
  },
  "new": "NUEVO"
};
