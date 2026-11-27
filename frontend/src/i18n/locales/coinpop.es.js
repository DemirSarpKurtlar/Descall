/** End-of-call DesCoin summary. Same keys in every coinpop.<locale>.js ("coinpop.*"). */
export const COINPOP_ES = {
  "dialogLabel": "Resumen de DesCoin al terminar la llamada",
  "close": "Cerrar",
  "kick": {
    "dm": "Llamada terminada · {name}",
    "group": "Llamada grupal terminada · {name}",
    "server": "{server} · {channel}",
    "plain": "Llamada terminada"
  },
  "ctx": {
    "dm": "Llamada directa",
    "group": "Llamada grupal",
    "server": "Canal del servidor"
  },
  "people": "{n, plural, one {# persona} other {# personas}}",
  "channelPeople": "{n, plural, one {Había # persona en el canal} other {Había # personas en el canal}}",
  "screenShared": "Pantalla compartida",
  "today": "Hoy",
  "yesterday": "Ayer",
  "timeRange": "{day} {from} – {to}",
  "unit": "DesCoin",
  "dur": {
    "hms": "{h} h {m} min {s} s",
    "hm": "{h} h {m} min",
    "ms": "{m} min {s} s",
    "s": "{s} s"
  },
  "talkMeta": "{m} min hablando",
  "spentCall": "Hablasteis {duration}",
  "spentChannel": "Estuviste {duration} en el canal",
  "legend": {
    "title": "Ganado hoy",
    "before": "Antes hoy {n}",
    "call": "Esta llamada {n}",
    "left": "Quedan {n}"
  },
  "rows": {
    "label": "Desglose",
    "voice": "Conversación",
    "voiceSub": "{n, plural, one {Hablaste activamente # minuto} other {Hablaste activamente # minutos}}",
    "screen": "Pantalla compartida",
    "screenSub": "{n, plural, one {Compartiste # minuto} other {Compartiste # minutos}}",
    "hourCap": "Llegaste al límite de esta hora, vuelves a ganar en menos de una hora"
  },
  "balance": {
    "before": "Saldo anterior",
    "after": "Saldo nuevo"
  },
  "streak": {
    "label": "Racha de llamadas",
    "days": "{n, plural, one {# día seguido} other {# días seguidos}}",
    "short": "Racha",
    "shortDays": "{n, plural, one {# día} other {# días}}"
  },
  "warn": {
    "voice": "Estás cerca del límite de conversación de hoy",
    "screenshare": "Estás cerca del límite de pantalla compartida de hoy",
    "global": "Estás cerca del límite de DesCoin de hoy",
    "voiceFull": "Alcanzaste el límite de conversación de hoy",
    "screenshareFull": "Alcanzaste el límite de pantalla compartida de hoy",
    "globalFull": "Alcanzaste el límite de DesCoin de hoy",
    "more": "Puedes ganar {n} DesCoin más",
    "none": "Hoy ya no puedes ganar más por esta vía",
    "reset": "el límite se reinicia a las {time}"
  },
  "feat": {
    "label": "Artículo destacado",
    "featured": "Destacado",
    "stockLeft": "Solo quedan {n}",
    "discount": "-{n} %",
    "endsIn": "Termina en {time}",
    "days": "{d} d {time}",
    "enough": "Te alcanza el saldo",
    "short": "Te faltan {n} DesCoin",
    "oldPrice": "Antes {n}",
    "soldOut": "Agotado"
  },
  "btn": {
    "buyNow": "Comprar ya por {n} DesCoin",
    "buyShort": "Comprar por {n}",
    "spend": "Gastar en la tienda",
    "wallet": "Historial del monedero"
  },
  "foot": {
    "receipt": "Recibo {id} · guardado en tu historial",
    "receiptShort": "Recibo {id}",
    "settings": "Ajustes del resumen",
    "never": "No volver a mostrar"
  },
  "toast": {
    "off": "Resumen al terminar la llamada desactivado",
    "undo": "Deshacer",
    "on": "El resumen vuelve a estar activado"
  },
  "wallet": {
    "title": "Historial del monedero",
    "sub": "Tus movimientos de DesCoin, los más recientes primero",
    "loading": "Cargando…",
    "empty": "Todavía no hay movimientos",
    "error": "No se pudo cargar el historial",
    "retry": "Reintentar",
    "call": "Ganancia de llamada",
    "callSub": "Conversación +{v} · Pantalla compartida +{s}",
    "callSubVoice": "Conversación +{v}",
    "callSubScreen": "Pantalla compartida +{s}",
    "balanceAfter": "Saldo {n}",
    "highlight": "Este recibo",
    "reason": {
      "voice_activity": "Conversación",
      "screenshare_activity": "Pantalla compartida",
      "message_activity": "Mensajes",
      "shop_purchase": "Compra en la tienda",
      "shop_refund": "Reembolso de la tienda",
      "daily_claim": "Recompensa diaria",
      "streak_bonus": "Bonificación por racha",
      "admin_grant": "Del equipo de Descall",
      "admin_revoke": "Corrección del equipo de Descall",
      "referral_invite": "Recompensa por invitación",
      "referral_welcome": "Recompensa de bienvenida",
      "onboarding_reward": "Premio de inicio",
      "promo": "Código promocional",
      "premium_gift": "Regalo de Descall+",
      "other": "Otros"
    },
    "shop2": {
      "gift": "Regalo enviado",
      "refresh": "Escaparate renovado",
      "giftRecall": "Regalo recuperado",
      "giftOverlap": "Diferencia del regalo reembolsada",
      "setRecall": "Set retirado, reembolso"
    }
  },
  "settings": {
    "nav": "Monedero y ganancias",
    "navHint": "Resumen de DesCoin al terminar la llamada",
    "title": "Monedero y ganancias",
    "subtitle": "Elige qué ves cuando una llamada te da DesCoin",
    "toggle": "Resumen de DesCoin al terminar la llamada",
    "toggleSub": "Al salir de una llamada muestra los DesCoin ganados, cuánto duró y tu nuevo saldo.",
    "threshold": "Mostrarlo solo si gané al menos",
    "thresholdSub": "Las llamadas cortas que ganan menos no abren el resumen; los DesCoin llegan igual al monedero.",
    "contexts": "En qué llamadas",
    "contextsSub": "Llamadas directas, llamadas grupales y canales de voz de servidores",
    "preview": "Vista previa en vivo",
    "previewSub": "Escritorio y teléfono",
    "play": "Reproducir un ejemplo",
    "limits": "Límites de ganancia de hoy",
    "limitsReset": "Se reinician a las {time}",
    "voice": "Conversación",
    "screen": "Pantalla compartida",
    "total": "Total",
    "hourly": "Límite por hora: conversación {v}, pantalla compartida {s}. El resumen te avisa cuando lo alcanzas.",
    "recent": "Ganancias recientes de llamadas",
    "all": "Todo",
    "recentEmpty": "Aún no hay ganancias de llamadas",
    "hidden": "resumen no mostrado",
    "off": "Desactivado",
    "sampleName": "Lucía Romero",
    "sampleItem": "Brillo Aurora"
  }
};
