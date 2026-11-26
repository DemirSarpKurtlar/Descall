#!/usr/bin/env node
/**
 * Widgets draft B ("Yuzler"): writes the widget extension's strings for every UI language:
 *   ios/App/DescallWidgets/<lang>.lproj/Localizable.strings
 * Two kinds of keys: dotted keys the views ask for through WL.t (WidgetSupport.swift), and the
 * English literals of widget names, descriptions and configuration intents (the system looks
 * them up by that English text).
 * Run: node frontend/scripts/ios-widgets-strings.mjs         (write)
 *      node frontend/scripts/ios-widgets-strings.mjs --check (exit 1 when a file is out of date)
 * The selftest (src/lib/nativeWidgets.selftest.mjs) runs the check.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WIDGET_LOCALES = ["en", "tr", "de", "es", "fr", "pt-BR", "ru"];
const row = (en, tr, de, es, fr, pt, ru) => ({ en, tr, de, es, fr, "pt-BR": pt, ru });

export const WIDGET_STRINGS = {
  // ---- states
  "state.signedOut": row("Sign in to Descall", "Descall'a giriş yap", "Bei Descall anmelden", "Inicia sesión en Descall", "Connecte-toi à Descall", "Entre no Descall", "Войдите в Descall"),
  "state.signedOutDetail": row("Open the app and sign in to see your friends here.", "Arkadaşlarını burada görmek için uygulamayı açıp giriş yap.", "Öffne die App und melde dich an, um deine Freunde hier zu sehen.", "Abre la app e inicia sesión para ver aquí a tus amigos.", "Ouvre l'app et connecte-toi pour voir tes amis ici.", "Abra o app e entre para ver seus amigos aqui.", "Откройте приложение и войдите, чтобы видеть друзей здесь."),
  "state.signedOutShort": row("Sign in to Descall", "Descall'a giriş yap", "Bei Descall anmelden", "Inicia sesión", "Connecte-toi", "Entre no Descall", "Войдите в Descall"),
  "state.offline": row("Can't reach Descall", "Descall'a ulaşılamadı", "Descall nicht erreichbar", "No se puede conectar", "Descall injoignable", "Sem conexão com o Descall", "Нет связи с Descall"),
  "state.offlineDetail": row("It will try again on its own.", "Kendiliğinden tekrar deneyecek.", "Es wird automatisch erneut versucht.", "Lo volverá a intentar solo.", "Nouvel essai automatique.", "Vai tentar de novo sozinho.", "Повторим попытку автоматически."),
  "state.staleAt": row("Updated %@", "%@ güncellendi", "Stand %@", "Actualizado %@", "Mis à jour %@", "Atualizado %@", "Обновлено %@"),

  // ---- time
  "time.now": row("now", "şimdi", "jetzt", "ahora", "maintenant", "agora", "сейчас"),
  "time.min": row("%ld min", "%ld dk", "%ld Min.", "%ld min", "%ld min", "%ld min", "%ld мин"),
  "time.hour": row("%ld h", "%ld sa", "%ld Std.", "%ld h", "%ld h", "%ld h", "%ld ч"),
  "time.day": row("%ld d", "%ld g", "%ld T.", "%ld d", "%ld j", "%ld d", "%ld д"),
  "time.ago": row("%@ ago", "%@ önce", "vor %@", "hace %@", "il y a %@", "há %@", "%@ назад"),

  // ---- activity line under a face
  "activity.screen": row("Sharing screen", "Ekran paylaşıyor", "Teilt den Bildschirm", "Compartiendo pantalla", "Partage son écran", "Compartilhando a tela", "Показывает экран"),
  "activity.voice": row("In voice", "Seste", "Im Sprachkanal", "En voz", "En vocal", "Na voz", "В голосовом"),
  "activity.voiceIn": row("Voice · %@", "Seste · %@", "Sprache · %@", "Voz · %@", "Vocal · %@", "Voz · %@", "Голос · %@"),
  "activity.game": row("Playing %@", "%@ oynuyor", "Spielt %@", "Jugando %@", "Joue à %@", "Jogando %@", "Играет в %@"),
  "activity.music": row("Listening to %@", "%@ dinliyor", "Hört %@", "Escuchando %@", "Écoute %@", "Ouvindo %@", "Слушает %@"),
  "activity.app": row("Using %@", "%@ kullanıyor", "Nutzt %@", "Usando %@", "Utilise %@", "Usando %@", "В %@"),
  "activity.idle": row("Idle", "Boşta", "Abwesend", "Ausente", "Absent", "Ausente", "Неактивен"),
  "activity.dnd": row("Do not disturb", "Rahatsız etmeyin", "Bitte nicht stören", "No molestar", "Ne pas déranger", "Não perturbe", "Не беспокоить"),
  "activity.custom": row("%@", "%@", "%@", "%@", "%@", "%@", "%@"),
  "activity.offline": row("Offline", "Çevrimdışı", "Offline", "Desconectado", "Hors ligne", "Offline", "Не в сети"),

  // ---- friends
  "friends.online": row("Online", "Çevrimiçi", "Online", "Conectados", "En ligne", "Online", "В сети"),
  "friends.people": row("%ld online", "%ld kişi", "%ld online", "%ld conectados", "%ld en ligne", "%ld online", "В сети: %ld"),
  "friends.favorites": row("Favorite faces", "Favori yüzler", "Lieblingsgesichter", "Caras favoritas", "Visages favoris", "Rostos favoritos", "Избранные лица"),
  "friends.onlineCount": row("%ld online", "%ld çevrimiçi", "%ld online", "%ld conectados", "%ld en ligne", "%ld online", "В сети: %ld"),
  "friends.edit": row("Edit", "Düzenle", "Bearbeiten", "Editar", "Modifier", "Editar", "Изменить"),
  "friends.empty": row("Nobody online", "Kimse çevrimiçi değil", "Niemand online", "Nadie conectado", "Personne en ligne", "Ninguém online", "Никого нет в сети"),
  "friends.emptyDetail": row("Faces show up here when friends come online.", "Arkadaşların çevrimiçi olunca yüzleri burada görünür.", "Gesichter erscheinen hier, wenn Freunde online kommen.", "Las caras aparecen aquí cuando tus amigos se conectan.", "Les visages apparaissent ici quand tes amis se connectent.", "Os rostos aparecem aqui quando seus amigos ficam online.", "Лица появятся здесь, когда друзья будут в сети."),
  "friends.inline": row("%@, %@ and %ld more", "%@, %@ ve %ld kişi", "%@, %@ und %ld weitere", "%@, %@ y %ld más", "%@, %@ et %ld autres", "%@, %@ e mais %ld", "%@, %@ и ещё %ld"),
  "friends.inlineTwo": row("%@ and %@", "%@ ve %@", "%@ und %@", "%@ y %@", "%@ et %@", "%@ e %@", "%@ и %@"),
  "friends.wave": row("Wave at %@", "%@ kişisine el salla", "%@ zuwinken", "Saludar a %@", "Faire coucou à %@", "Acenar para %@", "Помахать: %@"),

  // ---- unread
  "unread.title": row("%ld new messages", "%ld yeni mesaj", "%ld neue Nachrichten", "%ld mensajes nuevos", "%ld nouveaux messages", "%ld mensagens novas", "Новых сообщений: %ld"),
  "unread.largeTitle": row("New messages", "Yeni mesajlar", "Neue Nachrichten", "Mensajes nuevos", "Nouveaux messages", "Mensagens novas", "Новые сообщения"),
  "unread.chats": row("%ld chats", "%ld sohbet", "%ld Chats", "%ld chats", "%ld discussions", "%ld conversas", "Чатов: %ld"),
  "unread.more": row("+ %ld more chats", "+ %ld sohbet daha", "+ %ld weitere Chats", "+ %ld chats más", "+ %ld autres discussions", "+ mais %ld conversas", "+ ещё чатов: %ld"),
  "unread.newCount": row("%ld new messages", "%ld yeni mesaj", "%ld neue Nachrichten", "%ld mensajes nuevos", "%ld nouveaux messages", "%ld mensagens novas", "Новых сообщений: %ld"),
  "unread.none": row("No new messages", "Yeni mesaj yok", "Keine neuen Nachrichten", "No hay mensajes nuevos", "Aucun nouveau message", "Nenhuma mensagem nova", "Новых сообщений нет"),
  "unread.noneDetail": row("You're all caught up.", "Her şeye yetiştin.", "Du bist auf dem neuesten Stand.", "Estás al día.", "Tu es à jour.", "Você está em dia.", "Вы всё прочитали."),
  "unread.reply": row("Reply", "Yanıtla", "Antworten", "Responder", "Répondre", "Responder", "Ответить"),

  // ---- voice
  "voice.title": row("Who's in voice", "Seste kimler var", "Wer ist im Sprachkanal", "Quién está en voz", "Qui est en vocal", "Quem está na voz", "Кто в голосовом"),
  "voice.people": row("%ld inside", "%ld kişi", "%ld drin", "%ld dentro", "%ld présents", "%ld dentro", "Внутри: %ld"),
  "voice.summary": row("%ld channels · %ld people", "%ld kanal · %ld kişi", "%ld Kanäle · %ld Personen", "%ld canales · %ld personas", "%ld salons · %ld personnes", "%ld canais · %ld pessoas", "Каналов: %ld · людей: %ld"),
  "voice.moreChannels": row("+%ld channels", "+%ld kanal", "+%ld Kanäle", "+%ld canales", "+%ld salons", "+%ld canais", "+%ld канала"),
  "voice.join": row("Join", "Katıl", "Beitreten", "Unirse", "Rejoindre", "Entrar", "Войти"),
  "voice.here": row("You're here", "Buradasın", "Du bist hier", "Estás aquí", "Tu es ici", "Você está aqui", "Вы здесь"),
  "voice.quiet": row("Quiet · %@", "Sessiz · %@", "Ruhig · %@", "En silencio · %@", "Calme · %@", "Em silêncio · %@", "Тихо · %@"),
  "voice.empty": row("Nobody in voice", "Seste kimse yok", "Niemand im Sprachkanal", "Nadie en voz", "Personne en vocal", "Ninguém na voz", "В голосовых никого"),
  "voice.emptyDetail": row("Channels show up here when friends join.", "Arkadaşların katılınca kanallar burada görünür.", "Kanäle erscheinen hier, wenn Freunde beitreten.", "Los canales aparecen aquí cuando entran tus amigos.", "Les salons apparaissent ici quand tes amis y entrent.", "Os canais aparecem aqui quando seus amigos entram.", "Каналы появятся здесь, когда друзья зайдут."),
  "voice.inline": row("%@, %@ and %ld more in voice", "%@, %@ ve %ld kişi seste", "%@, %@ und %ld weitere im Sprachkanal", "%@, %@ y %ld más en voz", "%@, %@ et %ld autres en vocal", "%@, %@ e mais %ld na voz", "%@, %@ и ещё %ld в голосовом"),
  "voice.inlineTwo": row("%@ and %@ in voice", "%@ ve %@ seste", "%@ und %@ im Sprachkanal", "%@ y %@ en voz", "%@ et %@ en vocal", "%@ e %@ na voz", "%@ и %@ в голосовом"),
  "voice.inlineOne": row("%@ in voice", "%@ seste", "%@ im Sprachkanal", "%@ en voz", "%@ en vocal", "%@ na voz", "%@ в голосовом"),

  // ---- call
  "call.speaking": row("%@ is speaking", "%@ konuşuyor", "%@ spricht", "%@ está hablando", "%@ parle", "%@ está falando", "%@ говорит"),
  "call.speakingShort": row("speaking", "konuşuyor", "spricht", "hablando", "parle", "falando", "говорит"),
  "call.youSpeaking": row("You're speaking", "Sen konuşuyorsun", "Du sprichst", "Estás hablando", "Tu parles", "Você está falando", "Вы говорите"),
  "call.you": row("You", "Sen", "Du", "Tú", "Toi", "Você", "Вы"),
  "call.voiceCall": row("Voice call", "Sesli arama", "Sprachanruf", "Llamada de voz", "Appel vocal", "Chamada de voz", "Голосовой звонок"),
  "call.reconnecting": row("Waiting for Descall", "Descall bekleniyor", "Warte auf Descall", "Esperando a Descall", "En attente de Descall", "Aguardando o Descall", "Ожидание Descall"),
  "call.none": row("No call right now", "Şu an arama yok", "Gerade kein Anruf", "Ninguna llamada ahora", "Aucun appel en cours", "Nenhuma chamada agora", "Сейчас нет звонка"),
  "call.noneDetail": row("Tap a face to open the chat and call.", "Sohbeti açıp aramak için bir yüze dokun.", "Tippe auf ein Gesicht, um den Chat zu öffnen und anzurufen.", "Toca una cara para abrir el chat y llamar.", "Touche un visage pour ouvrir la discussion et appeler.", "Toque em um rosto para abrir a conversa e ligar.", "Коснитесь лица, чтобы открыть чат и позвонить."),
  "call.mute": row("Mute", "Mikrofonu kapat", "Stummschalten", "Silenciar", "Couper le micro", "Silenciar", "Выключить микрофон"),
  "call.unmute": row("Unmute", "Mikrofonu aç", "Stumm aus", "Activar micrófono", "Réactiver le micro", "Ativar microfone", "Включить микрофон"),
  "call.deafen": row("Sound on or off", "Sesi kapat veya aç", "Ton an oder aus", "Sonido sí o no", "Son activé ou coupé", "Som ligado ou desligado", "Звук вкл. или выкл."),
  "call.leave": row("Leave", "Ayrıl", "Verlassen", "Salir", "Quitter", "Sair", "Выйти"),
  "call.micOn": row("Mic on", "Mikrofon açık", "Mikro an", "Micro activado", "Micro activé", "Microfone ligado", "Микрофон вкл."),
  "call.micOff": row("Mic off", "Mikrofon kapalı", "Mikro aus", "Micro silenciado", "Micro coupé", "Microfone desligado", "Микрофон выкл."),

  // ---- widget gallery and configuration (English literals in Swift)
  "Friends Online": row("Friends Online", "Çevrimiçi Arkadaşlar", "Freunde online", "Amigos conectados", "Amis en ligne", "Amigos online", "Друзья в сети"),
  "Your favourite faces and what they are doing. Tap a face to open the chat.": row(
    "Your favourite faces and what they are doing. Tap a face to open the chat.",
    "Favori yüzlerin ve şu an ne yaptıkları. Sohbeti açmak için bir yüze dokun.",
    "Deine Lieblingsgesichter und was sie gerade tun. Tippe auf ein Gesicht, um den Chat zu öffnen.",
    "Tus caras favoritas y lo que hacen. Toca una para abrir el chat.",
    "Tes visages favoris et ce qu'ils font. Touche un visage pour ouvrir la discussion.",
    "Seus rostos favoritos e o que estão fazendo. Toque em um para abrir a conversa.",
    "Избранные лица и чем они заняты. Коснитесь лица, чтобы открыть чат."),
  "Favorite Person": row("Favorite Person", "Favori Kişi", "Lieblingsperson", "Persona favorita", "Personne favorite", "Pessoa favorita", "Избранный человек"),
  "One face and their status on the lock screen.": row(
    "One face and their status on the lock screen.", "Kilit ekranında tek bir yüz ve durumu.", "Ein Gesicht und sein Status auf dem Sperrbildschirm.",
    "Una cara y su estado en la pantalla bloqueada.", "Un visage et son statut sur l'écran verrouillé.", "Um rosto e seu status na tela bloqueada.",
    "Одно лицо и его статус на экране блокировки."),
  "Unread Messages": row("Unread Messages", "Okunmamış Mesajlar", "Ungelesene Nachrichten", "Mensajes sin leer", "Messages non lus", "Mensagens não lidas", "Непрочитанные сообщения"),
  "New messages as speech bubbles with the sender's face. Tap one to open that chat.": row(
    "New messages as speech bubbles with the sender's face. Tap one to open that chat.",
    "Yeni mesajlar gönderenin yüzüyle sohbet balonu olarak. Sohbeti açmak için birine dokun.",
    "Neue Nachrichten als Sprechblasen mit dem Gesicht des Absenders. Tippe, um den Chat zu öffnen.",
    "Mensajes nuevos como bocadillos con la cara de quien escribe. Toca uno para abrir el chat.",
    "Les nouveaux messages en bulles avec le visage de l'expéditeur. Touche une bulle pour ouvrir la discussion.",
    "Mensagens novas como balões com o rosto de quem enviou. Toque em uma para abrir a conversa.",
    "Новые сообщения пузырями с лицом отправителя. Коснитесь, чтобы открыть чат."),
  "Who's in Voice": row("Who's in Voice", "Seste Kimler Var", "Wer ist im Sprachkanal", "Quién está en voz", "Qui est en vocal", "Quem está na voz", "Кто в голосовом"),
  "Voice channels as clusters of the faces inside. Join with one tap.": row(
    "Voice channels as clusters of the faces inside. Join with one tap.",
    "Ses kanalları, içindekilerin yüzlerinden kümeler olarak. Tek dokunuşla katıl.",
    "Sprachkanäle als Gruppen der Gesichter darin. Mit einem Tippen beitreten.",
    "Canales de voz como grupos de las caras de dentro. Únete con un toque.",
    "Les salons vocaux en grappes de visages. Rejoins-les d'une touche.",
    "Canais de voz como grupos dos rostos lá dentro. Entre com um toque.",
    "Голосовые каналы группами лиц внутри. Вход одним касанием."),
  "Live Call": row("Live Call", "Canlı Arama", "Laufender Anruf", "Llamada en curso", "Appel en cours", "Chamada ao vivo", "Текущий звонок"),
  "Who is speaking, with mute and leave, while you are in a call.": row(
    "Who is speaking, with mute and leave, while you are in a call.",
    "Aramadayken kimin konuştuğu, mikrofon ve ayrıl düğmeleriyle.",
    "Wer spricht, mit Stummschalten und Verlassen, während du in einem Anruf bist.",
    "Quién habla, con silenciar y salir, mientras estás en una llamada.",
    "Qui parle, avec couper le micro et quitter, pendant un appel.",
    "Quem está falando, com silenciar e sair, enquanto você está em uma chamada.",
    "Кто говорит, с кнопками микрофона и выхода, пока вы в звонке."),
  "Favorite Faces": row("Favorite Faces", "Favori Yüzler", "Lieblingsgesichter", "Caras favoritas", "Visages favoris", "Rostos favoritos", "Избранные лица"),
  "Pick up to 8 faces and their order. Empty: the favourites you chose in Descall.": row(
    "Pick up to 8 faces and their order. Empty: the favourites you chose in Descall.",
    "En fazla 8 yüz seç ve sırala. Boş bırakırsan Descall'da seçtiğin favoriler.",
    "Wähle bis zu 8 Gesichter und ihre Reihenfolge. Leer: deine Favoriten aus Descall.",
    "Elige hasta 8 caras y su orden. Vacío: los favoritos que elegiste en Descall.",
    "Choisis jusqu'à 8 visages et leur ordre. Vide : tes favoris de Descall.",
    "Escolha até 8 rostos e a ordem. Vazio: os favoritos que você escolheu no Descall.",
    "Выберите до 8 лиц и их порядок. Пусто: избранные из Descall."),
  "One face and their status on the lock screen. Empty: your first favourite.": row(
    "One face and their status on the lock screen. Empty: your first favourite.",
    "Kilit ekranında tek bir yüz ve durumu. Boş bırakırsan ilk favorin.",
    "Ein Gesicht und sein Status auf dem Sperrbildschirm. Leer: dein erster Favorit.",
    "Una cara y su estado en la pantalla bloqueada. Vacío: tu primer favorito.",
    "Un visage et son statut sur l'écran verrouillé. Vide : ton premier favori.",
    "Um rosto e seu status na tela bloqueada. Vazio: seu primeiro favorito.",
    "Одно лицо и его статус на экране блокировки. Пусто: первый из избранных."),
  "New messages as speech bubbles with the sender's face.": row(
    "New messages as speech bubbles with the sender's face.", "Yeni mesajlar gönderenin yüzüyle sohbet balonu olarak.",
    "Neue Nachrichten als Sprechblasen mit dem Gesicht des Absenders.", "Mensajes nuevos como bocadillos con la cara de quien escribe.",
    "Les nouveaux messages en bulles avec le visage de l'expéditeur.", "Mensagens novas como balões com o rosto de quem enviou.",
    "Новые сообщения пузырями с лицом отправителя."),
  "Voice channels as clusters of the faces inside.": row(
    "Voice channels as clusters of the faces inside.", "Ses kanalları, içindekilerin yüzlerinden kümeler olarak.",
    "Sprachkanäle als Gruppen der Gesichter darin.", "Canales de voz como grupos de las caras de dentro.",
    "Les salons vocaux en grappes de visages.", "Canais de voz como grupos dos rostos lá dentro.", "Голосовые каналы группами лиц внутри."),
  Faces: row("Faces", "Yüzler", "Gesichter", "Caras", "Visages", "Rostos", "Лица"),
  Friend: row("Friend", "Arkadaş", "Freund", "Amigo", "Ami", "Amigo", "Друг"),
  "Show Activity": row("Show Activity", "Etkinliği Göster", "Aktivität zeigen", "Mostrar actividad", "Afficher l'activité", "Mostrar atividade", "Показывать занятие"),
  "Wave Button": row("Wave Button", "El Sallama Düğmesi", "Winken-Taste", "Botón de saludo", "Bouton coucou", "Botão de aceno", "Кнопка «помахать»"),
  "Show Message Text": row("Show Message Text", "Mesaj Metnini Göster", "Nachrichtentext zeigen", "Mostrar el texto", "Afficher le texte", "Mostrar o texto", "Показывать текст"),
  "Pinned Channel": row("Pinned Channel", "Sabit Kanal", "Angehefteter Kanal", "Canal fijado", "Salon épinglé", "Canal fixado", "Закреплённый канал"),
  "Voice Channel": row("Voice Channel", "Ses Kanalı", "Sprachkanal", "Canal de voz", "Salon vocal", "Canal de voz", "Голосовой канал"),
  Wave: row("Wave", "El Salla", "Winken", "Saludar", "Coucou", "Acenar", "Помахать"),
  "Waves at a friend from the widget. They get a notification.": row(
    "Waves at a friend from the widget. They get a notification.", "Widget'tan arkadaşına el sallar. Ona bildirim gider.",
    "Winkt einem Freund aus dem Widget zu. Er bekommt eine Mitteilung.", "Saluda a un amigo desde el widget. Recibe una notificación.",
    "Fait coucou à un ami depuis le widget. Il reçoit une notification.", "Acena para um amigo pelo widget. Ele recebe uma notificação.",
    "Помахать другу из виджета. Он получит уведомление."),
  "Mute or Unmute": row("Mute or Unmute", "Mikrofonu Kapat veya Aç", "Stumm schalten oder aufheben", "Silenciar o activar micrófono", "Couper ou réactiver le micro", "Silenciar ou ativar microfone", "Выключить или включить микрофон"),
  "Deafen or Undeafen": row("Deafen or Undeafen", "Sesi Kapat veya Aç", "Ton aus- oder einschalten", "Desactivar o activar sonido", "Couper ou réactiver le son", "Desativar ou ativar som", "Выключить или включить звук"),
  "Leave Call": row("Leave Call", "Aramadan Çık", "Anruf verlassen", "Salir de la llamada", "Quitter l'appel", "Sair da chamada", "Выйти из звонка"),
};

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "../ios/App/DescallWidgets");

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export function buildWidgetFiles() {
  const files = {};
  for (const lang of WIDGET_LOCALES) {
    const lines = Object.entries(WIDGET_STRINGS).map(([k, v]) => `"${esc(k)}" = "${esc(v[lang])}";`);
    files[`${lang}.lproj/Localizable.strings`] =
      `/* Descall widgets (draft B). Generated by frontend/scripts/ios-widgets-strings.mjs, do not edit by hand. */\n\n${lines.join("\n")}\n`;
  }
  return files;
}

export function widgetStaleFiles() {
  return Object.entries(buildWidgetFiles())
    .filter(([rel, text]) => {
      const p = join(base, rel);
      return !existsSync(p) || readFileSync(p, "utf8") !== text;
    })
    .map(([rel]) => rel);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const stale = widgetStaleFiles();
    if (stale.length) {
      console.error(`out of date: ${stale.join(", ")}`);
      process.exit(1);
    }
    console.log("widget strings up to date");
  } else {
    const files = buildWidgetFiles();
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(dirname(join(base, rel)), { recursive: true });
      writeFileSync(join(base, rel), text);
    }
    console.log(`wrote ${Object.keys(files).length} files`);
  }
}
