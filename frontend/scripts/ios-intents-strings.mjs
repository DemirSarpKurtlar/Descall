#!/usr/bin/env node
/**
 * 4.2: writes the iOS App Intents strings for every UI language:
 *   ios/App/App/<lang>.lproj/AppShortcuts.strings  Siri phrases (src/i18n/voiceShortcutsCatalog.js)
 *   ios/App/App/<lang>.lproj/Localizable.strings   intent / parameter / entity names (English keys,
 *                                                  the literals in DescallAppIntents.swift)
 *   ios/App/App/<lang>.lproj/Intents.strings       spoken answers and errors (DescallIntentText keys)
 * Run: node frontend/scripts/ios-intents-strings.mjs        (write)
 *      node frontend/scripts/ios-intents-strings.mjs --check (exit 1 when a file is out of date)
 * The selftest (src/lib/nativeIntents.selftest.mjs) runs the check.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHORTCUT_LOCALES, VOICE_SHORTCUTS } from "../src/i18n/voiceShortcutsCatalog.js";

const L = SHORTCUT_LOCALES;
const row = (en, tr, de, es, fr, pt, ru) => ({ en, tr, de, es, fr, "pt-BR": pt, ru });

/** Static metadata: key = the English literal in Swift. */
export const STATIC_STRINGS = {
  Friend: row("Friend", "Arkadaş", "Freund", "Amigo", "Ami", "Amigo", "Друг"),
  Message: row("Message", "Mesaj", "Nachricht", "Mensaje", "Message", "Mensagem", "Сообщение"),
  Status: row("Status", "Durum", "Status", "Estado", "Statut", "Status", "Статус"),
  Place: row("Place", "Yer", "Ort", "Lugar", "Lieu", "Local", "Место"),
  "Voice Channel": row("Voice Channel", "Ses Kanalı", "Sprachkanal", "Canal de voz", "Salon vocal", "Canal de voz", "Голосовой канал"),
  Online: row("Online", "Çevrimiçi", "Online", "Conectado", "En ligne", "Online", "В сети"),
  Idle: row("Idle", "Boşta", "Abwesend", "Ausente", "Absent", "Ausente", "Неактивен"),
  "Do Not Disturb": row("Do Not Disturb", "Rahatsız Etmeyin", "Bitte nicht stören", "No molestar", "Ne pas déranger", "Não perturbe", "Не беспокоить"),
  Invisible: row("Invisible", "Görünmez", "Unsichtbar", "Invisible", "Invisible", "Invisível", "Невидимый"),

  "Send a Message": row("Send a Message", "Mesaj Gönder", "Nachricht senden", "Enviar un mensaje", "Envoyer un message", "Enviar mensagem", "Отправить сообщение"),
  "Set Status": row("Set Status", "Durumu Ayarla", "Status festlegen", "Cambiar estado", "Changer de statut", "Definir status", "Изменить статус"),
  "Unread Messages": row("Unread Messages", "Okunmamış Mesajlar", "Ungelesene Nachrichten", "Mensajes sin leer", "Messages non lus", "Mensagens não lidas", "Непрочитанные сообщения"),
  "Who's Online": row("Who's Online", "Kim Çevrimiçi", "Wer ist online", "Quién está conectado", "Qui est en ligne", "Quem está online", "Кто в сети"),
  "Mute or Unmute": row("Mute or Unmute", "Mikrofonu Kapat veya Aç", "Stumm schalten oder aufheben", "Silenciar o activar micrófono", "Couper ou réactiver le micro", "Silenciar ou ativar microfone", "Выключить или включить микрофон"),
  "Deafen or Undeafen": row("Deafen or Undeafen", "Sesi Kapat veya Aç", "Ton aus- oder einschalten", "Desactivar o activar sonido", "Couper ou réactiver le son", "Desativar ou ativar som", "Выключить или включить звук"),
  "Leave Call": row("Leave Call", "Aramadan Çık", "Anruf verlassen", "Salir de la llamada", "Quitter l'appel", "Sair da chamada", "Выйти из звонка"),
  "Open Conversation": row("Open Conversation", "Sohbeti Aç", "Unterhaltung öffnen", "Abrir conversación", "Ouvrir la discussion", "Abrir conversa", "Открыть переписку"),
  "Open Server or Group": row("Open Server or Group", "Sunucu veya Grup Aç", "Server oder Gruppe öffnen", "Abrir servidor o grupo", "Ouvrir un serveur ou un groupe", "Abrir servidor ou grupo", "Открыть сервер или группу"),
  "Join Voice Channel": row("Join Voice Channel", "Ses Kanalına Katıl", "Sprachkanal beitreten", "Unirse a un canal de voz", "Rejoindre un salon vocal", "Entrar no canal de voz", "Подключиться к голосовому каналу"),

  "Sends a Descall message to a friend without opening the app.": row(
    "Sends a Descall message to a friend without opening the app.",
    "Uygulamayı açmadan bir arkadaşına Descall mesajı gönderir.",
    "Sendet einem Freund eine Descall-Nachricht, ohne die App zu öffnen.",
    "Envía un mensaje de Descall a un amigo sin abrir la app.",
    "Envoie un message Descall à un ami sans ouvrir l'app.",
    "Envia uma mensagem do Descall para um amigo sem abrir o app.",
    "Отправляет сообщение другу в Descall, не открывая приложение."),
  "Changes your Descall status: online, idle, do not disturb or invisible.": row(
    "Changes your Descall status: online, idle, do not disturb or invisible.",
    "Descall durumunu değiştirir: çevrimiçi, boşta, rahatsız etmeyin veya görünmez.",
    "Ändert deinen Descall-Status: online, abwesend, bitte nicht stören oder unsichtbar.",
    "Cambia tu estado de Descall: conectado, ausente, no molestar o invisible.",
    "Change ton statut Descall : en ligne, absent, ne pas déranger ou invisible.",
    "Muda seu status no Descall: online, ausente, não perturbe ou invisível.",
    "Меняет ваш статус в Descall: в сети, неактивен, не беспокоить или невидимый."),
  "Tells you how many unread Descall messages you have and where they are.": row(
    "Tells you how many unread Descall messages you have and where they are.",
    "Kaç okunmamış Descall mesajın olduğunu ve nerede olduklarını söyler.",
    "Sagt dir, wie viele ungelesene Descall-Nachrichten du hast und wo.",
    "Te dice cuántos mensajes de Descall tienes sin leer y dónde están.",
    "Indique combien de messages Descall tu n'as pas lus et où ils sont.",
    "Diz quantas mensagens do Descall você não leu e onde elas estão.",
    "Сообщает, сколько у вас непрочитанных сообщений в Descall и где они."),
  "Lists your Descall friends who are online right now.": row(
    "Lists your Descall friends who are online right now.",
    "Şu anda çevrimiçi olan Descall arkadaşlarını listeler.",
    "Zeigt deine Descall-Freunde, die gerade online sind.",
    "Muestra tus amigos de Descall que están conectados ahora.",
    "Affiche tes amis Descall actuellement en ligne.",
    "Mostra seus amigos do Descall que estão online agora.",
    "Показывает друзей в Descall, которые сейчас в сети."),
  "Mutes or unmutes your microphone in the current Descall call or voice channel.": row(
    "Mutes or unmutes your microphone in the current Descall call or voice channel.",
    "Devam eden Descall aramasında veya ses kanalında mikrofonunu kapatır ya da açar.",
    "Schaltet dein Mikrofon im aktuellen Descall-Anruf oder Sprachkanal stumm oder wieder ein.",
    "Silencia o activa tu micrófono en la llamada o canal de voz actual de Descall.",
    "Coupe ou réactive ton micro dans l'appel ou le salon vocal Descall en cours.",
    "Silencia ou ativa seu microfone na chamada ou canal de voz atual do Descall.",
    "Выключает или включает микрофон в текущем звонке или голосовом канале Descall."),
  "Turns the sound of the current Descall call or voice channel off or back on.": row(
    "Turns the sound of the current Descall call or voice channel off or back on.",
    "Devam eden Descall aramasının veya ses kanalının sesini kapatır ya da yeniden açar.",
    "Schaltet den Ton des aktuellen Descall-Anrufs oder Sprachkanals aus oder wieder ein.",
    "Desactiva o vuelve a activar el sonido de la llamada o canal de voz actual de Descall.",
    "Coupe ou réactive le son de l'appel ou du salon vocal Descall en cours.",
    "Desativa ou reativa o som da chamada ou canal de voz atual do Descall.",
    "Выключает или снова включает звук текущего звонка или голосового канала Descall."),
  "Leaves the current Descall call or voice channel.": row(
    "Leaves the current Descall call or voice channel.",
    "Devam eden Descall aramasından veya ses kanalından çıkar.",
    "Verlässt den aktuellen Descall-Anruf oder Sprachkanal.",
    "Sale de la llamada o canal de voz actual de Descall.",
    "Quitte l'appel ou le salon vocal Descall en cours.",
    "Sai da chamada ou canal de voz atual do Descall.",
    "Выходит из текущего звонка или голосового канала Descall."),
  "Opens your direct messages with a friend in Descall.": row(
    "Opens your direct messages with a friend in Descall.",
    "Descall'da bir arkadaşınla özel mesajlarını açar.",
    "Öffnet deine Direktnachrichten mit einem Freund in Descall.",
    "Abre tus mensajes directos con un amigo en Descall.",
    "Ouvre tes messages privés avec un ami dans Descall.",
    "Abre suas mensagens diretas com um amigo no Descall.",
    "Открывает личные сообщения с другом в Descall."),
  "Opens a Descall server, channel or group.": row(
    "Opens a Descall server, channel or group.",
    "Bir Descall sunucusunu, kanalını veya grubunu açar.",
    "Öffnet einen Descall-Server, -Kanal oder eine Gruppe.",
    "Abre un servidor, canal o grupo de Descall.",
    "Ouvre un serveur, un salon ou un groupe Descall.",
    "Abre um servidor, canal ou grupo do Descall.",
    "Открывает сервер, канал или группу Descall."),
  "Opens Descall and joins a voice channel.": row(
    "Opens Descall and joins a voice channel.",
    "Descall'ı açar ve bir ses kanalına katılır.",
    "Öffnet Descall und tritt einem Sprachkanal bei.",
    "Abre Descall y se une a un canal de voz.",
    "Ouvre Descall et rejoint un salon vocal.",
    "Abre o Descall e entra em um canal de voz.",
    "Открывает Descall и подключается к голосовому каналу."),

  "Send ${message} to ${friend}": row("Send ${message} to ${friend}", "${message} mesajını ${friend} kişisine gönder", "Sende ${message} an ${friend}", "Enviar ${message} a ${friend}", "Envoyer ${message} à ${friend}", "Enviar ${message} para ${friend}", "Отправить ${message} для ${friend}"),
  "Set status to ${status}": row("Set status to ${status}", "Durumu ${status} yap", "Status auf ${status} setzen", "Poner el estado en ${status}", "Mettre le statut sur ${status}", "Definir status como ${status}", "Поставить статус ${status}"),
  "Call a Friend": row("Call a Friend", "Arkadaşını Ara", "Freund anrufen", "Llamar a un amigo", "Appeler un ami", "Ligar para um amigo", "Позвонить другу"),
  "Opens Descall and starts a voice call with a friend.": row(
    "Opens Descall and starts a voice call with a friend.",
    "Descall'ı açar ve bir arkadaşınla sesli arama başlatır.",
    "Öffnet Descall und startet einen Sprachanruf mit einem Freund.",
    "Abre Descall e inicia una llamada de voz con un amigo.",
    "Ouvre Descall et lance un appel vocal avec un ami.",
    "Abre o Descall e começa uma chamada de voz com um amigo.",
    "Открывает Descall и начинает голосовой звонок с другом."),
  "Call ${friend}": row("Call ${friend}", "${friend} kişisini ara", "${friend} anrufen", "Llamar a ${friend}", "Appeler ${friend}", "Ligar para ${friend}", "Позвонить ${friend}"),
  "Join ${room}": row("Join ${room}", "${room} kanalına katıl", "${room} beitreten", "Unirse a ${room}", "Rejoindre ${room}", "Entrar em ${room}", "Подключиться к ${room}"),

  "Send Message": row("Send Message", "Mesaj Gönder", "Nachricht senden", "Enviar mensaje", "Envoyer un message", "Enviar mensagem", "Сообщение"),
  Unread: row("Unread", "Okunmamış", "Ungelesen", "Sin leer", "Non lus", "Não lidas", "Непрочитанные"),
  Mute: row("Mute", "Mikrofon", "Stumm", "Silenciar", "Micro", "Silenciar", "Микрофон"),
  Deafen: row("Deafen", "Ses", "Ton aus", "Sonido", "Son", "Som", "Звук"),
  "Join Voice": row("Join Voice", "Sese Katıl", "Sprache beitreten", "Unirse a voz", "Rejoindre le vocal", "Entrar na voz", "Голос"),
  "Open Chat": row("Open Chat", "Sohbet Aç", "Chat öffnen", "Abrir chat", "Ouvrir un chat", "Abrir conversa", "Открыть чат"),
  "Open Server": row("Open Server", "Sunucu Aç", "Server öffnen", "Abrir servidor", "Ouvrir un serveur", "Abrir servidor", "Открыть сервер"),
};

/** Spoken answers and errors (DescallIntentText keys). %@ = text, %ld = number. */
export const INTENT_STRINGS = {
  "error.signedOut": row("Sign in to Descall on this iPhone first.", "Önce bu iPhone'da Descall'a giriş yap.", "Melde dich zuerst auf diesem iPhone bei Descall an.", "Primero inicia sesión en Descall en este iPhone.", "Connecte-toi d'abord à Descall sur cet iPhone.", "Primeiro entre no Descall neste iPhone.", "Сначала войдите в Descall на этом iPhone."),
  "error.sessionEnded": row("Your Descall session ended. Open the app and sign in again.", "Descall oturumun sona erdi. Uygulamayı açıp yeniden giriş yap.", "Deine Descall-Sitzung ist abgelaufen. Öffne die App und melde dich erneut an.", "Tu sesión de Descall terminó. Abre la app e inicia sesión de nuevo.", "Ta session Descall a expiré. Ouvre l'app et reconnecte-toi.", "Sua sessão do Descall terminou. Abra o app e entre de novo.", "Сеанс Descall завершён. Откройте приложение и войдите снова."),
  "error.banned": row("This account can't use Descall right now.", "Bu hesap şu anda Descall'ı kullanamıyor.", "Dieses Konto kann Descall gerade nicht nutzen.", "Esta cuenta no puede usar Descall ahora.", "Ce compte ne peut pas utiliser Descall pour le moment.", "Esta conta não pode usar o Descall agora.", "Эта учётная запись сейчас не может пользоваться Descall."),
  "error.forbidden": row("You don't have permission to do that.", "Bunu yapma iznin yok.", "Dazu hast du keine Berechtigung.", "No tienes permiso para hacer eso.", "Tu n'as pas l'autorisation de faire ça.", "Você não tem permissão para fazer isso.", "У вас нет разрешения на это."),
  "error.send.forbidden": row("You can't message this person right now.", "Bu kişiye şu anda mesaj gönderemezsin.", "Du kannst dieser Person gerade nicht schreiben.", "No puedes escribir a esta persona ahora.", "Tu ne peux pas écrire à cette personne pour le moment.", "Você não pode mandar mensagem para essa pessoa agora.", "Сейчас нельзя написать этому человеку."),
  "error.notFound": row("That couldn't be found on Descall.", "Bu, Descall'da bulunamadı.", "Das wurde auf Descall nicht gefunden.", "No se encontró en Descall.", "Introuvable sur Descall.", "Isso não foi encontrado no Descall.", "Не удалось найти в Descall."),
  "error.rateLimited": row("Too many requests. Wait a minute and try again.", "Çok fazla istek yapıldı. Bir dakika bekleyip tekrar dene.", "Zu viele Anfragen. Warte eine Minute und versuche es erneut.", "Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.", "Trop de demandes. Attends une minute et réessaie.", "Muitas solicitações. Espere um minuto e tente de novo.", "Слишком много запросов. Подождите минуту и попробуйте снова."),
  "error.offline": row("You're offline. Check your connection and try again.", "Çevrimdışısın. Bağlantını kontrol edip tekrar dene.", "Du bist offline. Prüfe deine Verbindung und versuche es erneut.", "No tienes conexión. Revísala e inténtalo de nuevo.", "Tu es hors ligne. Vérifie ta connexion et réessaie.", "Você está sem conexão. Verifique e tente de novo.", "Нет подключения к интернету. Проверьте связь и попробуйте снова."),
  "error.timeout": row("Descall is taking too long to answer. Try again in a moment.", "Descall yanıt vermekte gecikiyor. Birazdan tekrar dene.", "Descall antwortet zu langsam. Versuche es gleich noch einmal.", "Descall tarda demasiado en responder. Inténtalo en un momento.", "Descall met trop de temps à répondre. Réessaie dans un instant.", "O Descall está demorando para responder. Tente de novo em instantes.", "Descall долго не отвечает. Попробуйте чуть позже."),
  "error.network": row("Couldn't reach Descall. Try again.", "Descall'a ulaşılamadı. Tekrar dene.", "Descall ist nicht erreichbar. Versuche es erneut.", "No se pudo conectar con Descall. Inténtalo de nuevo.", "Impossible de joindre Descall. Réessaie.", "Não foi possível conectar ao Descall. Tente de novo.", "Не удалось связаться с Descall. Попробуйте снова."),
  "error.server": row("Descall had a problem. Try again in a moment.", "Descall'da bir sorun oluştu. Birazdan tekrar dene.", "Bei Descall ist ein Problem aufgetreten. Versuche es gleich noch einmal.", "Descall tuvo un problema. Inténtalo en un momento.", "Descall a rencontré un problème. Réessaie dans un instant.", "O Descall teve um problema. Tente de novo em instantes.", "В Descall произошла ошибка. Попробуйте чуть позже."),
  "error.generic": row("Something went wrong. Try again.", "Bir şeyler ters gitti. Tekrar dene.", "Etwas ist schiefgelaufen. Versuche es erneut.", "Algo salió mal. Inténtalo de nuevo.", "Un problème est survenu. Réessaie.", "Algo deu errado. Tente de novo.", "Что-то пошло не так. Попробуйте снова."),
  "error.message.empty": row("The message is empty.", "Mesaj boş.", "Die Nachricht ist leer.", "El mensaje está vacío.", "Le message est vide.", "A mensagem está vazia.", "Сообщение пустое."),
  "error.message.tooLong": row("The message is too long. Keep it under 1000 characters.", "Mesaj çok uzun. 1000 karakterin altında tut.", "Die Nachricht ist zu lang. Höchstens 1000 Zeichen.", "El mensaje es demasiado largo. Máximo 1000 caracteres.", "Le message est trop long. 1000 caractères maximum.", "A mensagem é longa demais. No máximo 1000 caracteres.", "Сообщение слишком длинное. Не больше 1000 символов."),
  "error.call.none": row("You're not in a call or voice channel right now.", "Şu anda bir aramada veya ses kanalında değilsin.", "Du bist gerade in keinem Anruf und keinem Sprachkanal.", "Ahora no estás en ninguna llamada ni canal de voz.", "Tu n'es dans aucun appel ni salon vocal pour le moment.", "Você não está em nenhuma chamada ou canal de voz agora.", "Сейчас вы не в звонке и не в голосовом канале."),
  "error.call.failed": row("The call didn't respond. Open Descall and try again.", "Arama yanıt vermedi. Descall'ı açıp tekrar dene.", "Der Anruf hat nicht reagiert. Öffne Descall und versuche es erneut.", "La llamada no respondió. Abre Descall e inténtalo de nuevo.", "L'appel n'a pas répondu. Ouvre Descall et réessaie.", "A chamada não respondeu. Abra o Descall e tente de novo.", "Звонок не ответил. Откройте Descall и попробуйте снова."),
  "error.call.busy": row("You're already in a call. Leave it first.", "Zaten bir aramadasın. Önce ondan çık.", "Du bist schon in einem Anruf. Verlasse ihn zuerst.", "Ya estás en una llamada. Sal de ella primero.", "Tu es déjà en appel. Quitte-le d'abord.", "Você já está em uma chamada. Saia dela primeiro.", "Вы уже в звонке. Сначала выйдите из него."),
  "dialog.call.calling": row("Calling %@ in Descall.", "%@ Descall'da aranıyor.", "%@ wird in Descall angerufen.", "Llamando a %@ en Descall.", "Appel de %@ dans Descall.", "Ligando para %@ no Descall.", "Звоним: %@ в Descall."),
  "error.voice.failed": row("Couldn't join the voice channel. Try again in Descall.", "Ses kanalına katılınamadı. Descall'da tekrar dene.", "Beitritt zum Sprachkanal fehlgeschlagen. Versuche es in Descall erneut.", "No se pudo entrar al canal de voz. Inténtalo de nuevo en Descall.", "Impossible de rejoindre le salon vocal. Réessaie dans Descall.", "Não foi possível entrar no canal de voz. Tente de novo no Descall.", "Не удалось подключиться к голосовому каналу. Попробуйте снова в Descall."),
  "error.voice.noPermission": row("You don't have permission to join that voice channel.", "Bu ses kanalına katılma iznin yok.", "Du darfst diesem Sprachkanal nicht beitreten.", "No tienes permiso para entrar a ese canal de voz.", "Tu n'as pas l'autorisation de rejoindre ce salon vocal.", "Você não tem permissão para entrar nesse canal de voz.", "У вас нет разрешения подключаться к этому голосовому каналу."),
  "error.voice.mic": row("Descall needs microphone access to join. Allow it in Settings.", "Katılmak için Descall'ın mikrofon iznine ihtiyacı var. Ayarlar'dan izin ver.", "Descall braucht Zugriff auf das Mikrofon. Erlaube ihn in den Einstellungen.", "Descall necesita acceso al micrófono. Permítelo en Ajustes.", "Descall a besoin du micro pour rejoindre. Autorise-le dans Réglages.", "O Descall precisa do microfone para entrar. Permita em Ajustes.", "Descall нужен доступ к микрофону. Разрешите его в Настройках."),

  "confirm.send": row("Send “%@” to %@?", "“%@” mesajı %@ kişisine gönderilsin mi?", "„%@“ an %@ senden?", "¿Enviar «%@» a %@?", "Envoyer « %@ » à %@ ?", "Enviar “%@” para %@?", "Отправить «%@» для %@?"),
  "dialog.send.done": row("Sent to %@.", "%@ kişisine gönderildi.", "An %@ gesendet.", "Enviado a %@.", "Envoyé à %@.", "Enviado para %@.", "Отправлено: %@."),
  "dialog.status.done": row("Your status is now %@.", "Durumun artık %@.", "Dein Status ist jetzt %@.", "Tu estado ahora es %@.", "Ton statut est maintenant %@.", "Seu status agora é %@.", "Ваш статус теперь: %@."),
  "dialog.mute.on": row("Microphone muted.", "Mikrofon kapatıldı.", "Mikrofon stummgeschaltet.", "Micrófono silenciado.", "Micro coupé.", "Microfone silenciado.", "Микрофон выключен."),
  "dialog.mute.off": row("Microphone on.", "Mikrofon açıldı.", "Mikrofon an.", "Micrófono activado.", "Micro réactivé.", "Microfone ativado.", "Микрофон включён."),
  "dialog.deafen.on": row("Sound off. You won't hear the call.", "Ses kapatıldı. Aramayı duymayacaksın.", "Ton aus. Du hörst den Anruf nicht.", "Sonido desactivado. No oirás la llamada.", "Son coupé. Tu n'entendras plus l'appel.", "Som desativado. Você não vai ouvir a chamada.", "Звук выключен. Вы не будете слышать звонок."),
  "dialog.deafen.off": row("Sound back on.", "Ses yeniden açıldı.", "Ton wieder an.", "Sonido activado de nuevo.", "Son réactivé.", "Som ativado de novo.", "Звук снова включён."),
  "dialog.leave.done": row("You left %@.", "%@ kanalından çıktın.", "Du hast %@ verlassen.", "Saliste de %@.", "Tu as quitté %@.", "Você saiu de %@.", "Вы вышли: %@."),
  "dialog.leave.generic": row("You left the call.", "Aramadan çıktın.", "Du hast den Anruf verlassen.", "Saliste de la llamada.", "Tu as quitté l'appel.", "Você saiu da chamada.", "Вы вышли из звонка."),
  "dialog.voice.joining": row("Opening %@ in Descall.", "%@ Descall'da açılıyor.", "%@ wird in Descall geöffnet.", "Abriendo %@ en Descall.", "Ouverture de %@ dans Descall.", "Abrindo %@ no Descall.", "Открываем %@ в Descall."),
  "dialog.voice.joined": row("You're in %@.", "%@ kanalındasın.", "Du bist in %@.", "Estás en %@.", "Tu es dans %@.", "Você está em %@.", "Вы в канале %@."),
  "dialog.unread.none": row("No unread messages. You're all caught up.", "Okunmamış mesajın yok. Her şeye yetiştin.", "Keine ungelesenen Nachrichten. Du bist auf dem neuesten Stand.", "No tienes mensajes sin leer. Estás al día.", "Aucun message non lu. Tu es à jour.", "Nenhuma mensagem não lida. Você está em dia.", "Непрочитанных сообщений нет."),
  "dialog.unread.one": row("You have 1 unread message.", "1 okunmamış mesajın var.", "Du hast 1 ungelesene Nachricht.", "Tienes 1 mensaje sin leer.", "Tu as 1 message non lu.", "Você tem 1 mensagem não lida.", "У вас 1 непрочитанное сообщение."),
  "dialog.unread.many": row("You have %ld unread messages.", "%ld okunmamış mesajın var.", "Du hast %ld ungelesene Nachrichten.", "Tienes %ld mensajes sin leer.", "Tu as %ld messages non lus.", "Você tem %ld mensagens não lidas.", "Непрочитанных сообщений: %ld."),
  "dialog.unread.from": row("Most are from %@.", "Çoğu %@ tarafından.", "Die meisten von %@.", "La mayoría son de %@.", "La plupart viennent de %@.", "A maioria é de %@.", "Больше всего от: %@."),
  "dialog.online.none": row("None of your friends are online right now.", "Şu anda çevrimiçi arkadaşın yok.", "Gerade ist keiner deiner Freunde online.", "Ninguno de tus amigos está conectado ahora.", "Aucun de tes amis n'est en ligne pour le moment.", "Nenhum amigo seu está online agora.", "Сейчас никого из друзей нет в сети."),
  "dialog.online.one": row("%@ is online.", "%@ çevrimiçi.", "%@ ist online.", "%@ está conectado.", "%@ est en ligne.", "%@ está online.", "%@ в сети."),
  "dialog.online.two": row("%@ and %@ are online.", "%@ ve %@ çevrimiçi.", "%@ und %@ sind online.", "%@ y %@ están conectados.", "%@ et %@ sont en ligne.", "%@ e %@ estão online.", "%@ и %@ в сети."),
  "dialog.online.many": row("%@, %@ and %ld more are online.", "%@, %@ ve %ld kişi daha çevrimiçi.", "%@, %@ und %ld weitere sind online.", "%@, %@ y %ld más están conectados.", "%@, %@ et %ld autres sont en ligne.", "%@, %@ e mais %ld estão online.", "%@, %@ и ещё %ld в сети."),

  "status.online": row("Online", "Çevrimiçi", "Online", "Conectado", "En ligne", "Online", "В сети"),
  "status.idle": row("Idle", "Boşta", "Abwesend", "Ausente", "Absent", "Ausente", "Неактивен"),
  "status.dnd": row("Do Not Disturb", "Rahatsız Etmeyin", "Bitte nicht stören", "No molestar", "Ne pas déranger", "Não perturbe", "Не беспокоить"),
  "status.invisible": row("Invisible", "Görünmez", "Unsichtbar", "Invisible", "Invisible", "Invisível", "Невидимый"),
  "presence.online": row("Online", "Çevrimiçi", "Online", "Conectado", "En ligne", "Online", "В сети"),
  "presence.idle": row("Idle", "Boşta", "Abwesend", "Ausente", "Absent", "Ausente", "Неактивен"),
  "presence.dnd": row("Do Not Disturb", "Rahatsız Etmeyin", "Bitte nicht stören", "No molestar", "Ne pas déranger", "Não perturbe", "Не беспокоить"),
  "presence.offline": row("Offline", "Çevrimdışı", "Offline", "Desconectado", "Hors ligne", "Offline", "Не в сети"),
  "voice.people.none": row("Empty", "Boş", "Leer", "Vacío", "Vide", "Vazio", "Пусто"),
  "voice.people.count": row("%ld inside", "%ld kişi içeride", "%ld drin", "%ld dentro", "%ld présents", "%ld dentro", "Внутри: %ld"),

  "snippet.unread.title": row("Unread", "Okunmamış", "Ungelesen", "Sin leer", "Non lus", "Não lidas", "Непрочитанные"),
  "snippet.unread.dms": row("Direct messages", "Özel mesajlar", "Direktnachrichten", "Mensajes directos", "Messages privés", "Mensagens diretas", "Личные"),
  "snippet.unread.groups": row("Groups", "Gruplar", "Gruppen", "Grupos", "Groupes", "Grupos", "Группы"),
  "snippet.unread.channels": row("Channels", "Kanallar", "Kanäle", "Canales", "Salons", "Canais", "Каналы"),
  "snippet.online.title": row("Online now", "Şu an çevrimiçi", "Jetzt online", "Conectados ahora", "En ligne maintenant", "Online agora", "Сейчас в сети"),
  "snippet.online.more": row("+%ld more", "+%ld kişi daha", "+%ld weitere", "+%ld más", "+%ld autres", "+%ld outros", "Ещё %ld"),

  "tips.title": row("Voice shortcuts", "Sesli kısayollar", "Sprachkurzbefehle", "Atajos de voz", "Raccourcis vocaux", "Atalhos de voz", "Голосовые команды"),
  "tips.subtitle": row("Say these to Siri, find them in Spotlight or put one on the Action Button.", "Bunları Siri'ye söyle, Spotlight'ta bul ya da birini Eylem düğmesine ata.", "Sag sie zu Siri, finde sie in Spotlight oder lege einen auf die Aktionstaste.", "Díselos a Siri, búscalos en Spotlight o asigna uno al botón de Acción.", "Dis-les à Siri, trouve-les dans Spotlight ou attribue-en un au bouton Action.", "Diga à Siri, encontre no Spotlight ou coloque um no botão de Ação.", "Скажите их Siri, найдите в Spotlight или назначьте на кнопку действия."),
  "tips.done": row("Done", "Bitti", "Fertig", "Listo", "OK", "OK", "Готово"),
};

function phraseTable() {
  const out = {};
  for (const lang of L) out[lang] = [];
  for (const s of VOICE_SHORTCUTS) {
    for (const p of s.phrases) {
      for (const lang of L) out[lang].push([p.en, p[lang]]);
    }
  }
  return out;
}

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function render(title, pairs) {
  const lines = [`/* ${title}. Generated by frontend/scripts/ios-intents-strings.mjs, do not edit by hand. */`, ""];
  for (const [k, v] of pairs) lines.push(`"${esc(k)}" = "${esc(v)}";`);
  return lines.join("\n") + "\n";
}

export function buildFiles() {
  const files = {};
  const phrases = phraseTable();
  for (const lang of L) {
    const dir = `ios/App/App/${lang}.lproj`;
    files[`${dir}/AppShortcuts.strings`] = render("Siri phrases (App Shortcuts)", phrases[lang]);
    files[`${dir}/Localizable.strings`] = render("App Intents names", Object.entries(STATIC_STRINGS).map(([k, v]) => [k, v[lang]]));
    files[`${dir}/Intents.strings`] = render("Siri answers and errors", Object.entries(INTENT_STRINGS).map(([k, v]) => [k, v[lang]]));
  }
  return files;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function staleFiles() {
  return Object.entries(buildFiles())
    .filter(([rel, text]) => !existsSync(join(root, rel)) || readFileSync(join(root, rel), "utf8") !== text)
    .map(([rel]) => rel);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const stale = staleFiles();
    if (stale.length) {
      console.error(`out of date (run node frontend/scripts/ios-intents-strings.mjs):\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("ios intents strings up to date");
  } else {
    for (const [rel, text] of Object.entries(buildFiles())) writeFileSync(join(root, rel), text);
    console.log(`wrote ${Object.keys(buildFiles()).length} files`);
  }
}
