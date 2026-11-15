"use strict";

/**
 * Güvenlik Merkezi "Hatırlat": the live popup an admin without 2FA gets
 * ([title, body, button] per language; lib/securityCenter.js remindTwoFactor).
 */
module.exports = Object.freeze({
  tr: ["Yönetici hesabın için 2FA", "Yönetici Paneli'ni açabilmek için Ayarlar > Güvenlik bölümünden kimlik doğrulama uygulamasını aç.", "Ayarlar"],
  en: ["2FA for your admin account", "Turn on the authenticator app in Settings > Security to open the Admin Panel.", "Settings"],
  de: ["2FA für dein Admin-Konto", "Aktiviere die Authenticator-App unter Einstellungen > Sicherheit, um das Admin-Panel zu öffnen.", "Einstellungen"],
  es: ["2FA para tu cuenta de administrador", "Activa la app de autenticación en Ajustes > Seguridad para abrir el Panel de administración.", "Ajustes"],
  fr: ["2FA pour ton compte administrateur", "Active l'application d'authentification dans Paramètres > Sécurité pour ouvrir le panneau d'administration.", "Paramètres"],
  "pt-BR": ["2FA para sua conta de administrador", "Ative o app autenticador em Configurações > Segurança para abrir o Painel de administração.", "Configurações"],
  ru: ["2FA для аккаунта администратора", "Включите приложение-аутентификатор в Настройки > Безопасность, чтобы открыть панель администратора.", "Настройки"],
});
