"use strict";

/**
 * Market 2.0 server-side copy (lib/shop2): set theme names and the night market reminder
 * (web push + in-app notification), per app language. Keys and placeholders match in every
 * locale; the reminder body takes {minutes}.
 */

const L = (tr, en, de, es, fr, ptBR, ru) => Object.freeze({ tr, en, de, es, fr, "pt-BR": ptBR, ru });

module.exports = Object.freeze({
  themeNames: Object.freeze({
    "gece-limani": L("Gece Limanı", "Night Harbor", "Nachthafen", "Puerto Nocturno", "Port de Nuit", "Porto Noturno", "Ночная гавань"),
    "bakir-kervan": L("Bakır Kervan", "Copper Caravan", "Kupferkarawane", "Caravana de Cobre", "Caravane de Cuivre", "Caravana de Cobre", "Медный караван"),
    "orkide-sisi": L("Orkide Sisi", "Orchid Mist", "Orchideennebel", "Niebla de Orquídea", "Brume d'Orchidée", "Névoa de Orquídea", "Орхидейный туман"),
    "kor-bahcesi": L("Kor Bahçesi", "Ember Garden", "Glutgarten", "Jardín de Brasas", "Jardin de Braises", "Jardim de Brasas", "Сад углей"),
    "buzul-sessizligi": L("Buzul Sessizliği", "Glacier Hush", "Gletscherstille", "Silencio Glacial", "Silence Glaciaire", "Silêncio Glacial", "Ледниковая тишина"),
    "neon-carsi": L("Neon Çarşı", "Neon Bazaar", "Neonbasar", "Bazar Neón", "Bazar Néon", "Bazar Neon", "Неоновый базар"),
    "altin-hasat": L("Altın Hasat", "Golden Harvest", "Goldene Ernte", "Cosecha Dorada", "Moisson Dorée", "Colheita Dourada", "Золотая жатва"),
    "mor-sis": L("Mor Sis", "Violet Haze", "Violetter Dunst", "Bruma Violeta", "Brume Violette", "Névoa Violeta", "Фиолетовая дымка"),
    "gece-mercani": L("Gece Mercanı", "Night Coral", "Nachtkoralle", "Coral Nocturno", "Corail de Nuit", "Coral Noturno", "Ночной коралл"),
    "kuzey-isigi": L("Kuzey Işığı", "Polar Light", "Polarlicht", "Luz Polar", "Lumière Polaire", "Luz Polar", "Полярное сияние"),
    "zumrut-orman": L("Zümrüt Orman", "Emerald Grove", "Smaragdhain", "Arboleda Esmeralda", "Bosquet d'Émeraude", "Bosque Esmeralda", "Изумрудная роща"),
    "kum-saati": L("Kum Saati", "Hourglass", "Sanduhr", "Reloj de Arena", "Sablier", "Ampulheta", "Песочные часы"),
    "firtina-cekirdegi": L("Fırtına Çekirdeği", "Storm Core", "Sturmkern", "Núcleo de Tormenta", "Cœur de Tempête", "Núcleo da Tempestade", "Ядро бури"),
    "lav-akisi": L("Lav Akışı", "Lava Flow", "Lavastrom", "Flujo de Lava", "Coulée de Lave", "Fluxo de Lava", "Лавовый поток"),
    "inci-kiyisi": L("İnci Kıyısı", "Pearl Shore", "Perlenküste", "Costa de Perlas", "Rivage de Perles", "Costa de Pérolas", "Жемчужный берег"),
    "yildiz-tozu": L("Yıldız Tozu", "Stardust", "Sternenstaub", "Polvo de Estrellas", "Poussière d'Étoiles", "Poeira Estelar", "Звёздная пыль"),
  }),
  nightReminder: Object.freeze({
    tr: ["Gece pazarı birazdan açılıyor", "Gizli kartların {minutes} dakika sonra açılıyor."],
    en: ["The night market opens soon", "Your hidden cards open in {minutes} minutes."],
    de: ["Der Nachtmarkt öffnet gleich", "Deine verdeckten Karten öffnen in {minutes} Minuten."],
    es: ["El mercado nocturno abre pronto", "Tus cartas ocultas se abren en {minutes} minutos."],
    fr: ["Le marché de nuit ouvre bientôt", "Tes cartes cachées s'ouvrent dans {minutes} minutes."],
    "pt-BR": ["O mercado noturno abre em breve", "Suas cartas ocultas abrem em {minutes} minutos."],
    ru: ["Ночной рынок скоро откроется", "Ваши скрытые карты откроются через {minutes} мин."],
  }),
});
