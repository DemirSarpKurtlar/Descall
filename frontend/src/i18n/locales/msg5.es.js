/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_ES = {
  roles: {
    section: "Roles",
    subRole: "Rol · sus miembros reciben un aviso",
    subRoleAdmin: "Rol · solo los administradores pueden mencionarlo",
    subEveryone: "Avisa a todos los que ven este canal",
    subHere: "Avisa a quienes están en línea ahora",
    unknown: "rol desconocido",
    aria: "Rol: {name}",
    popover: "Rol · {name}",
    everyoneCooldown: "Puedes volver a usar @everyone o @here en {wait} s.",
  },
  preview: {
    settingDesc: "Si lo desactivas, las notificaciones de la app, del navegador y del teléfono solo muestran «Mensaje nuevo» en lugar del texto.",
    saveError: "No se pudo guardar. Inténtalo de nuevo en un momento.",
  },
  schedule: {
    addAttachment: "Añadir archivo",
    attachmentHint: "Una foto o un archivo, hasta 100 MB",
    attachment: "Adjunto",
    attachmentKept: "El adjunto se mantiene; puedes cambiar el texto y la hora.",
    removeAttachment: "Quitar adjunto",
    errAttachment: "Este archivo no se puede programar. Elige una foto, un vídeo o un documento.",
    errTooLarge: "El archivo es demasiado grande. El máximo es 100 MB.",
    errAttachNotReady: "Programar con archivo aún no está activo en el servidor. Quita el archivo para programar solo el texto.",
    errUpload: "No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.",
  },
};
