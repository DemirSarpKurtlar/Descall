"use strict";

/**
 * Safe restart (admin Sistem page) server-side copy.
 * confirmWords: the phrase to type, per app language (must match sysx.restart.confirmWord).
 * teamNotice: the popup other admins get when someone restarts the server.
 */
module.exports = {
  confirmWords: Object.freeze({
    tr: "YENİDEN BAŞLAT",
    en: "RESTART",
    de: "NEUSTART",
    es: "REINICIAR",
    fr: "REDÉMARRER",
    "pt-BR": "REINICIAR",
    ru: "ПЕРЕЗАПУСК",
  }),
  teamNotice: Object.freeze({
    tr: ["Sunucu yeniden başlatılıyor", "{who} sunucuyu güvenli şekilde yeniden başlatıyor: {reason}"],
    en: ["Server restarting", "{who} is safely restarting the server: {reason}"],
  }),
};
