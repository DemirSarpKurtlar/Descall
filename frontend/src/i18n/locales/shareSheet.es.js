/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_ES = {
  "title": "Enviar a Descall",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# elemento} other {# elementos}}",
  "chats": "{count, plural, one {# chat} other {# chats}}",
  "cancel": "Cancelar",
  "close": "Cerrar",
  "done": "Listo",
  "hide": "Ocultar",
  "options": "Opciones",
  "remove": "Quitar",
  "search": "Busca personas, grupos o canales",
  "clearSearch": "Borrar búsqueda",
  "tabs": {
    "all": "Todo",
    "friends": "Amigos",
    "groups": "Grupos",
    "servers": "Servidores"
  },
  "sec": {
    "friends": "Amigos",
    "groups": "Grupos",
    "channels": "Canales de servidor",
    "suggested": "Sugeridos"
  },
  "server": {
    "channels": "{count, plural, one {# canal} other {# canales}}",
    "sendable": "Puedes publicar en {count}",
    "none": "Ningún canal donde puedas publicar"
  },
  "saved": "{percent} % más pequeño",
  "presence": {
    "online": "En línea",
    "idle": "Ausente",
    "dnd": "No molestar",
    "offline": "Desconectado"
  },
  "row": {
    "channel": "Canal de servidor",
    "slowMode": "Modo lento: {seconds} s",
    "lastShared": {
      "today": "Lo último lo compartiste tú · hoy",
      "yesterday": "Lo último lo compartiste tú · ayer",
      "days": "Lo último lo compartiste tú · hace {count} días"
    },
    "members": "{members} miembros",
    "membersOnline": "{members} miembros · {online} en línea",
    "groupShared": {
      "today": "{members} miembros · compartiste {count} hoy",
      "yesterday": "{members} miembros · compartiste {count} ayer",
      "days": "{members} miembros · compartiste {count} hace {days} días"
    },
    "dmShared": {
      "today": "{presence} · compartiste {count} hoy",
      "yesterday": "{presence} · compartiste {count} ayer",
      "days": "{presence} · compartiste {count} hace {days} días"
    }
  },
  "reason": {
    "no_permission": "No puedes escribir aquí",
    "announcement": "Solo los moderadores pueden escribir",
    "timed_out": "Estás silenciado temporalmente",
    "no_attach": "No puedes enviar archivos aquí",
    "blocked": "Bloqueado",
    "not_friends": "Ya no sois amigos",
    "unknown": "No disponible",
    "rules_required": "Acepta primero las normas del servidor",
    "failed": "No se pudo enviar",
    "offline": "Se perdió la conexión",
    "upload_failed": "Falló la subida",
    "timeout": "Tiempo agotado",
    "too_large": "Supera el límite de 100 MB",
    "type": "Este tipo de archivo no se puede enviar",
    "slowmode": "Modo lento",
    "rate_limited": "Demasiado rápido; espera un poco",
    "content_blocked": "Bloqueado por el filtro de contenido",
    "attachment_unavailable": "Adjunto no disponible",
    "signed_out": "Sesión cerrada",
    "cancelled": "Detenido",
    "too_many_scheduled": "Demasiados mensajes programados",
    "too_long": "El mensaje es demasiado largo"
  },
  "message": "Añade un mensaje (opcional)",
  "quality": {
    "original": "Original",
    "originalDesc": "Resolución completa, vídeo 4K intacto · {size}",
    "high": "Alta (recomendada)",
    "highDesc": "JPEG, vídeo 1080p · {size}",
    "saver": "Ahorro de datos",
    "saverDesc": "Rápido con datos móviles · {size}",
    "chip": {
      "original": "Original",
      "high": "Alta",
      "saver": "Ahorro"
    },
    "title": "Calidad de envío"
  },
  "location": {
    "title": "Quitar la ubicación",
    "desc": "GPS y datos del dispositivo en las fotos",
    "chipOn": "Sin ubicación",
    "chipOff": "Con ubicación"
  },
  "silent": "Silencioso",
  "silentHint": "Sin notificación; sigue apareciendo como no leído",
  "scheduleChip": "Programar",
  "scheduleTitle": "¿Cuándo se envía?",
  "schedule": {
    "inHour": "En 1 hora",
    "tonight": "Esta noche 20:00",
    "tomorrow": "Mañana 09:00",
    "custom": "Elegir fecha y hora",
    "set": "Fijar",
    "now": "Enviar ahora",
    "invalid": "Elige al menos 1 minuto después"
  },
  "send": "{count, plural, one {Enviar a # chat} other {Enviar a # chats}}",
  "sendShort": "{count, plural, one {# chat} other {# chats}}",
  "sendScheduled": "{count, plural, one {Programar para # chat} other {Programar para # chats}}",
  "pick": "Elige destinatarios",
  "when": {
    "today": "hoy",
    "yesterday": "ayer",
    "days": "hace {count} días"
  },
  "dup": {
    "link": "Enviaste este enlace a {name} {when}",
    "file": "Enviaste esto a {name} {when}",
    "body": "Se enviará igualmente. Puedes quitar a {name} de este envío.",
    "remove": "Quitar"
  },
  "limitTargets": "Puedes elegir hasta {count} chats",
  "limitItems": "Hasta {count} elementos; el resto se quitó",
  "targetRemoved": "{name} quitado: {reason}",
  "errorTitle": "No se pudo cargar la lista",
  "errorOffline": "Sin internet. Al enviar se pondrá en cola.",
  "retry": "Reintentar",
  "signedOutTitle": "No has iniciado sesión en Descall",
  "signedOutBody": "Inicia sesión primero en la app de Descall.",
  "openApp": "Abrir Descall",
  "emptyTitle": "Todavía no hay nadie",
  "emptyBody": "Añade amigos o únete a un servidor.",
  "emptySearch": "Sin resultados para «{query}»",
  "noItems": "Nada que compartir",
  "run": {
    "title": "Enviando",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Enviando a # chat} other {Enviando a # chats}}",
    "stats": "{sent} / {total} · {speed}/s · unos {eta} s",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} subidos",
    "uploading": "Subiendo · {percent} %",
    "queued": "En cola · los mismos archivos no se suben otra vez",
    "sending": "Enviando",
    "canClose": "Puedes cerrar esta hoja",
    "canCloseBody": "Sigue en segundo plano; te avisaremos al terminar.",
    "background": "Seguir en segundo plano",
    "stop": "Detener envío"
  },
  "sent": {
    "title": "Enviado",
    "hero": "{count, plural, one {Enviado a # chat} other {Enviado a # chats}}",
    "sub": "{items} · {size} · en {seconds} s",
    "allArrived": "Todo entregado",
    "delivered": "Entregado · {time}",
    "open": "Abrir",
    "openInApp": "Abrir en Descall"
  },
  "undo": {
    "button": "Deshacer",
    "title": "Deshacer",
    "body": "Se quita para todos en {seconds} s",
    "bodyScheduled": "La programación se puede cancelar durante {seconds} s",
    "busy": "Deshaciendo…"
  },
  "scheduled": {
    "title": "Programado",
    "hero": "{count, plural, one {Programado para # chat} other {Programado para # chats}}",
    "sub": "Se enviará {when}",
    "row": "Programado · {time}"
  },
  "slowRow": "Modo lento: el resto sale desde {time}",
  "partial": {
    "title": "Enviado en parte",
    "hero": "Enviado a {done}/{count} chats",
    "sub": "{name}: {reason}",
    "itemsIn": "{ok}/{count} entregados",
    "itemsFailed": "{count, plural, one {Faltó # elemento: {reason}} other {Faltaron # elementos: {reason}}}",
    "retryOne": "Reintentar",
    "infoTitle": "Lo enviado llegó",
    "infoBody": "Al reintentar solo se envía lo que falta; los archivos no se vuelven a subir.",
    "retryFailed": "Reintentar lo fallido",
    "dropFailed": "Omitir lo fallido y dar el resto por bueno"
  },
  "offline": {
    "title": "Aún no enviado",
    "hero": "Sin conexión a internet",
    "subNone": "No se envió nada",
    "subSome": "{done}/{count} listos, el resto espera",
    "kept": "Guardado en el dispositivo",
    "queuedTitle": "En cola",
    "queuedBody": "Al volver la conexión, {items} se envían a {chats}. Síguelo en la notificación.",
    "row": "En cola · se reintentará solo",
    "retryNow": "Reintentar ahora",
    "saveDraft": "Guardar como borrador",
    "remove": "Quitar de la cola",
    "draftSaved": "Borrador guardado; envíalo desde la notificación"
  },
  "failed": {
    "title": "No enviado",
    "hero": "No se pudo enviar"
  },
  "undone": {
    "title": "Deshecho",
    "hero": "Envío deshecho",
    "sub": "Los mensajes se quitaron para todos",
    "failed": "Algunos mensajes no se pudieron quitar"
  },
  "notif": {
    "channel": "Compartidos",
    "sending": "{count, plural, one {Enviando a # chat} other {Enviando a # chats}}",
    "sent": "Enviado",
    "failedItems": "{count, plural, one {# elemento sin enviar} other {# elementos sin enviar}}",
    "waiting": "Esperando internet · en cola",
    "stop": "Detener",
    "undo": "Deshacer · {seconds} s",
    "openChat": "Abrir chat",
    "retry": "Reintentar",
    "details": "Detalles",
    "sendDraft": "Enviar",
    "draft": "Borrador: {items} · {chats}"
  },
  "kind": {
    "photos": "Fotos",
    "files": "Archivos",
    "link": "Enlace",
    "text": "Texto"
  },
  "pdf": "PDF"
};
