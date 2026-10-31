"use strict";

/**
 * Spanish server-side catalog. Same key tree and {placeholders} as backend/i18n/en.js
 * (checked by backend/i18n/backendI18n.selftest.cjs). Rendered with lib/i18n.js bt(lang, key, vars).
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} es tu código de verificación de Descall",
      eyebrow: "Verificación de correo",
      title: "¡Te damos la bienvenida a Descall, {name}!",
      titleNoName: "¡Te damos la bienvenida a Descall!",
      intro: "Tu cuenta está lista. Un último paso: escribe el siguiente código en la app para verificar tu dirección de correo.",
      preheader: "Tu código: {code} · válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Si no creaste esta cuenta, puedes ignorar este correo. La dirección no queda vinculada a ninguna cuenta hasta que se verifique.",
    },
    email_verify: {
      subject: "{code} es tu código de verificación de Descall",
      eyebrow: "Verificación de correo",
      title: "Verifica tu dirección de correo",
      intro: "Escribe el siguiente código en la app para agregar esta dirección de correo a tu cuenta de Descall.",
      preheader: "Tu código: {code} · válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Si no lo solicitaste, puedes ignorar este correo. Tu dirección no se agregará a ninguna cuenta.",
    },
    "2fa_login": {
      subject: "{code} es tu código de inicio de sesión de Descall",
      eyebrow: "Código de inicio de sesión",
      codeLabel: "Tu código de inicio de sesión",
      title: "Termina de iniciar sesión",
      intro: "Escribe este código en Descall para iniciar sesión en tu cuenta.",
      preheader: "Tu código de inicio de sesión: {code} · válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Si no fuiste tú, puede que alguien conozca tu contraseña. Cámbiala ahora y activa la app de autenticación en Ajustes › Seguridad.",
    },
    email_reauth: {
      subject: "{code} es tu código de confirmación de Descall",
      eyebrow: "Seguridad de la cuenta",
      codeLabel: "Tu código de confirmación",
      title: "¿Eres tú?",
      intro: "Escribe este código para cambiar la dirección de correo de tu cuenta.",
      preheader: "Tu código de confirmación: {code} · válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Si no lo solicitaste, no compartas el código y cambia tu contraseña. Sin él, la dirección no se puede cambiar.",
    },
    password_reset: {
      subject: "{code} es tu código para restablecer la contraseña de Descall",
      eyebrow: "Restablecer contraseña",
      codeLabel: "Tu código de restablecimiento",
      title: "Restablece tu contraseña",
      intro: "Escribe este código en Descall para elegir una nueva contraseña.",
      preheader: "Tu código de restablecimiento: {code} · válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Si no pediste restablecer tu contraseña, puedes ignorar este correo; tu contraseña sigue igual.",
    },
    common: {
      hi: "Hola, {name}:",
      codeLabel: "Tu código",
      valid: "Válido durante {minutes, plural, one {# minuto} other {# minutos}}",
      copyHint: "Puedes seleccionar y copiar el código.",
      never: "El equipo de Descall nunca te pedirá tu código. No lo compartas con nadie.",
      nextTitle: "¿Y ahora qué?",
      step1Title: "Agrega a tus amigos",
      step1Body: "Búscalos por nombre de usuario o comparte tu enlace de invitación.",
      step2Title: "Únete a un servidor",
      step2Body: "Únete a una comunidad o crea la tuya en segundos.",
      step3Title: "Empieza a hablar",
      step3Body: "Mensajes, llamadas de voz y video, y compartir pantalla.",
      getApp: "Descall va contigo a todas partes",
      appWin: "Descargar para Windows",
      appIos: "Descárgalo en el App Store",
      appWeb: "Abrir en el navegador",
      help: "¿Necesitas ayuda?",
      write: "Escríbenos:",
      privacy: "Privacidad",
      terms: "Términos",
      why: "Recibiste este correo por una acción realizada en tu cuenta de Descall.",
      privacyPath: "/privacy",
      termsPath: "/terms",
      downloadPath: "/download",
      textCode: "Tu código",
      textValid: "Válido durante {minutes, plural, one {# minuto} other {# minutos}}.",
    },
  },

  // Product-update opt-in (lib/marketingOptIn.js): mail + the confirm / unsubscribe pages.
  marketing: {
    subject: "Confirma las novedades de producto de Descall",
    text: "Abre este enlace para confirmar que quieres recibir las novedades de producto de Descall. Si no lo confirmas, no te enviaremos correos.",
    htmlLead: "Abre el siguiente enlace para confirmar que quieres recibir las novedades de producto de Descall. Si no lo confirmas, no te enviaremos correos.",
    confirmLabel: "Confirmar suscripción",
    pageConfirm: "Suscripción confirmada. Puedes darte de baja cuando quieras.",
    pageGone: "Este enlace no es válido o ya se usó.",
    pageUnsub: "Te diste de baja. No te enviaremos correos sobre el producto.",
    unsubscribeAnyTime: "Date de baja cuando quieras:",
    goToSite: "Ir a descall.com",
  },

  // Native iOS alert push (lib/iosAlertPush.js) and web push (lib/webPush.js).
  push: {
    someone: "Alguien",
    newMessage: "Mensaje nuevo",
    voice: "🎤 Mensaje de voz",
    media: "📎 Envió un archivo adjunto",
    photo: "📷 Foto",
    video: "🎬 Video",
    group: "Grupo",
    mentioned: "{from} te mencionó",
    mentionedShort: "Te mencionó",
    friendTitle: "Solicitud de amistad",
    friendBody: "{from} quiere agregarte como amigo",
    calling: "{from} te está llamando",
    voiceCall: "Llamada de voz",
    videoCall: "Videollamada",
    groupCallTitle: "{groupName} — Llamada grupal",
    groupCallBody: "{from} inició una llamada grupal",
    ownerTitle: "Propiedad del servidor",
    ownerBody: "Ahora eres el propietario de {serverName}",
    ownerServerFallback: "el servidor",
    feedbackTitle: "El equipo de Descall respondió",
    feedbackBody: "Tus comentarios recibieron una respuesta",
    antibotTitle: "Alerta antibots",
    antibotBody: "{count, plural, one {# cuenta superó} other {# cuentas superaron}} el umbral de riesgo (máx. {topScore})",
    antibotWatchBody: "{count, plural, one {# alerta nueva de la lista de vigilancia} other {# alertas nuevas de la lista de vigilancia}}",
    // Web push + FCM (browser and Android notifications)
    voicePlain: "Mensaje de voz",
    attachmentPlain: "Envió un archivo adjunto",
    incomingCall: "Llamada entrante",
    incomingCallBody: "Alguien te está llamando en Descall",
    missedCallFrom: "Llamada perdida: {name}",
    answeredElsewhere: "La llamada se respondió en otro dispositivo.",
    declinedElsewhere: "La llamada se rechazó en otro dispositivo.",
    missedCallBody: "Te perdiste la llamada.",
    groupCall: "Llamada grupal",
    groupCallDefaultBody: "Alguien inició una llamada grupal en Descall",
    groupCallJoinVoice: "Únete a la llamada de voz de tu grupo.",
    groupCallJoinVideo: "Únete a la videollamada de tu grupo.",
    messageRequestTitle: "Solicitud de mensaje",
    messageRequestBody: "{from} te envió una solicitud de mensaje",
  },

  // Default titles of maintenance windows (lib/maintenance.js).
  maintenance: {
    emergencyTitle: "Mantenimiento de emergencia",
    plannedTitle: "Mantenimiento programado",
  },

  // Names written into the database when a server is created (lib/starterChannelNames.js).
  starter: {
    textCategory: "Canales de texto",
    text: "general",
    voiceCategory: "Canales de voz",
    voice: "Sala",
  },

  // Account security notice (routes/auth.js notifyAccountChange).
  security: {
    passwordChangedSubject: "Se cambió tu contraseña de Descall",
    passwordChangedBody: "Se acaba de cambiar la contraseña de tu cuenta de Descall. Si no fuiste tú, contacta con soporte.",
    emailChangeSubject: "Cambio de correo de Descall",
    emailChangeBody: "Hay una solicitud para cambiar la dirección de correo de tu cuenta de Descall. Si no fuiste tú, cambia tu contraseña ahora y contacta con soporte.",
  },

  // Personal data export file (lib/dataExport.js).
  dataExport: {
    note: "Una copia de los datos personales que Descall conserva sobre esta cuenta (art. 15 del RGPD). Incluye los mensajes que enviaste; los mensajes que otras personas te enviaron son sus datos y no se incluyen. Por seguridad, se excluyen las contraseñas, los secretos de la autenticación en dos pasos y las claves de sesión y de notificaciones push. Los registros de prevención de fraude y abuso no se divulgan para que no puedan eludirse. No se muestra quién te denunció.",
    filePrefix: "descall-mis-datos",
    accountFallback: "cuenta",
  },

  // Apple Watch previews (lib/watchApi.js).
  watch: {
    photo: "Foto",
    gif: "GIF",
    video: "Video",
    voice: "Mensaje de voz",
    file: "Archivo",
    poll: "Encuesta",
    call: "Llamada",
  },

  // Admin sign-up statistics (lib/signupStats.js).
  stats: {
    weekOf: "Semana del {date}",
    sourceDirect: "Directo",
    sourceGoogleOrganic: "Google (orgánico)",
    sourceReferral: "Invitación de un amigo",
    other: "Otro",
    unknown: "Desconocido",
    csvPeriod: "periodo",
    csvSignups: "registros",
    csvAverage: "promedio",
    csvFilePrefix: "estadisticas-de-registro",
  },

  // Server templates (lib/serverTemplates.js): written into the database in the creator's language.
  templates: {
    gaming: {
      name: "Centro gamer",
      description: "Estructura lista para tu equipo: canal para armar partidas, chats de juegos, clips, sala del staff y lobbies de voz para ranked.",
      descriptionSeed: "Una comunidad gamer: encuentra compañeros de equipo, comparte clips y entra a la voz.",
      rulesText: "1) Sé respetuoso.\n2) Nada de odio, spam ni NSFW fuera de los canales marcados.\n3) Publica búsquedas de equipo claras (juego + rango + región).\n4) Las decisiones del staff son definitivas.\n5) Diviértete y juega limpio.",
      highlights: ["Canal para armar partidas", "Canal de clips", "Roles del staff", "Sala de voz"],
      roles: ["Admin", "Moderador", "Ayudante", "VIP", "Miembro"],
      categories: [
        {
          name: "Bienvenida",
          channels: [
            { name: "anuncios", topic: "Noticias oficiales del servidor y notas de parches. Solo lectura para los miembros." },
            { name: "normas", topic: "Normas del servidor: acéptalas antes de escribir en los canales de la comunidad." },
            { name: "presentaciones", topic: "Saluda: juego, rango, región y a qué juegas." },
          ],
        },
        {
          name: "Comunidad",
          channels: [
            { name: "general", topic: "El punto de encuentro principal para todo lo gamer." },
            { name: "armar-equipo", topic: "Búsquedas de equipo: juego · rango · región · micrófono sí/no." },
            { name: "clips-y-jugadas", topic: "Comparte tus mejores clips y capturas de pantalla." },
            { name: "memes", topic: "Ambiente relajado. Nada de acoso." },
          ],
        },
        {
          name: "Salas de voz",
          channels: [
            { name: "Sala" },
            { name: "Dúo" },
            { name: "Equipo de cinco" },
            { name: "AFK / Relax" },
            { name: "Escenario de torneos", topic: "Para ver partidas juntos y reuniones de torneos." },
          ],
        },
        {
          name: "Staff",
          channels: [
            { name: "chat-del-staff", topic: "Coordinación privada del staff." },
            { name: "registro-de-moderacion", topic: "Notas de moderación y registro de casos." },
            { name: "Voz del staff" },
          ],
        },
      ],
    },
    friends: {
      name: "Rincón de amigos",
      description: "Un espacio privado y acogedor: chat de sala, planes, noches de música y salas de voz siempre abiertas.",
      descriptionSeed: "Un lugar privado para amigos: planes, memes y voz hasta tarde.",
      rulesText: "1) Deja los dramas fuera del grupo.\n2) Pregunta antes de agregar a gente nueva.\n3) No filtres chats privados.\n4) Silénciate cuando estés AFK en la voz compartida.\n5) Sé amable: este es nuestro espacio.",
      highlights: ["Chat de sala", "Tablón de planes", "Noche de música", "Voz siempre abierta"],
      roles: ["Admin", "Coanfitrión", "Mejor amigo", "Amigo"],
      categories: [
        {
          name: "Inicio",
          channels: [
            { name: "sala", topic: "Chat diario: los memes son bienvenidos." },
            { name: "planes", topic: "Salidas, noches para ver algo juntos y viajes." },
            { name: "fotos", topic: "Comparte fotos de salidas y viajes." },
            { name: "musica-y-enlaces", topic: "Playlists, TikToks y enlaces variados." },
          ],
        },
        {
          name: "Voz",
          channels: [
            { name: "Sala de estar" },
            { name: "Madrugada" },
            { name: "Noche de pelis" },
            { name: "Estudia conmigo" },
          ],
        },
        {
          name: "Privado",
          channels: [
            { name: "solo-anfitriones", topic: "Planificación de admins y coanfitriones." },
          ],
        },
      ],
    },
    community: {
      name: "Comunidad y creadores",
      description: "Comunidad lista para el público con anuncios, soporte, eventos, escenario y una jerarquía completa del staff.",
      descriptionSeed: "Una comunidad pensada para creadores: anuncios, soporte y eventos.",
      rulesText: "1) Respeta los Términos de Discord/Descall.\n2) Nada de spam, estafas ni autopromoción fuera de #promocion.\n3) Respeta a todos: cero discursos de odio.\n4) Usa el canal adecuado para cada tema.\n5) Contacta al staff en #soporte si necesitas ayuda.",
      highlights: ["Anuncios", "Mesa de soporte", "Eventos", "Escenario"],
      roles: ["Equipo propietario", "Admin", "Moderador", "Anfitrión de eventos", "Colaborador", "Miembro"],
      categories: [
        {
          name: "Empieza aquí",
          channels: [
            { name: "anuncios", topic: "Novedades oficiales. Los miembros no pueden publicar aquí." },
            { name: "normas", topic: "Normas de la comunidad." },
            { name: "bienvenida", topic: "Los miembros nuevos se presentan aquí." },
            { name: "roles", topic: "Pide roles de intereses o etiquetas de colaborador." },
          ],
        },
        {
          name: "Comunidad",
          channels: [
            { name: "general", topic: "Conversación principal." },
            { name: "soporte", topic: "¿Necesitas ayuda? El staff te responderá aquí." },
            { name: "eventos", topic: "Próximos eventos y confirmaciones de asistencia." },
            { name: "promocion", topic: "La autopromoción solo se permite aquí: una publicación al día." },
            { name: "escaparate", topic: "Comparte tus trabajos, streams y logros." },
          ],
        },
        {
          name: "Voz y escenario",
          channels: [
            { name: "Sala de la comunidad" },
            { name: "Sala de colaboración" },
            { name: "Asamblea", topic: "AMA, anuncios y eventos en vivo." },
          ],
        },
        {
          name: "Staff",
          channels: [
            { name: "chat-del-staff", topic: "Conversación interna del staff." },
            { name: "cola-de-moderacion", topic: "Denuncias y casos de moderación abiertos." },
            { name: "Voz del staff" },
          ],
        },
      ],
    },
    study: {
      name: "Estudio y campus",
      description: "Salas de concentración, canales por materia, ayuda con tareas, voz en silencio y roles de mentor para grupos del campus.",
      descriptionSeed: "Estudien juntos: sesiones de concentración, ayuda con tareas y chat del campus.",
      rulesText: "1) Mantén las salas de estudio libres de distracciones.\n2) Nada de trampas ni filtraciones de exámenes.\n3) Comparte recursos citando la fuente.\n4) Usa los canales por materia para pedir ayuda sobre el tema.\n5) Apoya a los demás: cada quien aprende a su ritmo.",
      highlights: ["Salas de concentración", "Ayuda con tareas", "Voz en silencio", "Rol de mentor"],
      roles: ["Admin", "Moderador", "Mentor", "Compañero de estudio", "Estudiante"],
      categories: [
        {
          name: "Campus",
          channels: [
            { name: "anuncios", topic: "Fechas límite, sesiones y noticias del campus." },
            { name: "normas", topic: "Normas de la comunidad de estudio." },
            { name: "presentaciones", topic: "Carrera, año y qué estás estudiando." },
          ],
        },
        {
          name: "Estudio",
          channels: [
            { name: "general", topic: "Chat del campus sobre cualquier tema." },
            { name: "ayuda-con-tareas", topic: "Haz tus preguntas y muestra lo que llevas hecho." },
            { name: "recursos", topic: "Notas, enlaces y guías de estudio." },
            { name: "compromisos", topic: "Metas diarias y seguimiento." },
          ],
        },
        {
          name: "Voz para concentrarse",
          channels: [
            { name: "Concentración en silencio" },
            { name: "Sala Pomodoro" },
            { name: "Proyecto de grupo A" },
            { name: "Proyecto de grupo B" },
            { name: "Horario de consultas", topic: "Sesiones de preguntas y respuestas con mentores." },
          ],
        },
        {
          name: "Staff",
          channels: [
            { name: "sala-de-mentores", topic: "Mentores y moderadores coordinan las sesiones de ayuda." },
          ],
        },
      ],
    },
    streaming: {
      name: "Streamer y contenido",
      description: "Avisos de directos, archivo de clips, tablón de colaboraciones, sala VIP y roles de moderador y VIP para equipos de creadores.",
      descriptionSeed: "La base del creador: avisos de directos, clips, colaboraciones y ventajas VIP.",
      rulesText: "1) Apoya al creador: no arruines los directos.\n2) Nada de spoilers en #chat-en-vivo durante los VOD.\n3) Autopromoción solo en #colaboraciones.\n4) Los VIP marcan el ambiente: no abusen de sus ventajas.\n5) Los moderadores hacen cumplir las normas del chat durante el directo.",
      highlights: ["Canal de directos", "Archivo de clips", "Sala VIP", "Equipo de moderación"],
      roles: ["Creador", "Moderador", "Editor", "VIP", "Suscriptor", "Espectador"],
      categories: [
        {
          name: "Transmisión",
          channels: [
            { name: "anuncios", topic: "Horario y grandes lanzamientos." },
            { name: "en-directo", topic: "Solo avisos de directos." },
            { name: "normas", topic: "Normas del chat para directos y VOD." },
          ],
        },
        {
          name: "Comunidad",
          channels: [
            { name: "general", topic: "Pasa el rato con la comunidad." },
            { name: "chat-en-vivo", topic: "Activo durante los directos: sin spoilers." },
            { name: "clips", topic: "Los mejores momentos de los directos." },
            { name: "colaboraciones", topic: "Solicitudes de colaboración y menciones." },
            { name: "sugerencias", topic: "Ideas de contenido para el creador." },
          ],
        },
        {
          name: "VIP",
          channels: [
            { name: "sala-vip", topic: "Chat con ventajas para VIP y suscriptores." },
            { name: "Voz VIP" },
          ],
        },
        {
          name: "Voz",
          channels: [
            { name: "Sala de espera" },
            { name: "Voz de colaboración" },
            { name: "Después del directo", topic: "Reuniones y AMA después del directo." },
          ],
        },
        {
          name: "Equipo",
          channels: [
            { name: "chat-de-moderacion", topic: "Moderación durante el directo." },
            { name: "Voz del equipo" },
          ],
        },
      ],
    },
  },
};
