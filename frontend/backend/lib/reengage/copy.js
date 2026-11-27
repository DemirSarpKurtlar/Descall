"use strict";

/**
 * Growth 3B server-side copy (pushes, desktop cards, weekly digest, day-7 / day-14
 * e-mails, default campaign templates) in the 7 app languages. Same keys and
 * placeholders in every language (copy.selftest via rules.selftest.cjs). No emoji.
 * Turkish variables ending in "Dat" carry the dative form (lib/trSuffix.trDative).
 *
 *   rt("tr", "push.voiceOne", { a: "Ece" })
 */

const { formatMessage } = require("../messageFormat");
const { pickLang } = require("../i18n");
const { trDative } = require("../trSuffix");

const L = (tr, en, de, es, fr, ptBR, ru) => Object.freeze({ tr, en, de, es, fr, "pt-BR": ptBR, ru });

const COPY = Object.freeze({
  push: {
    voiceOne: L("{a} seste", "{a} is in voice", "{a} ist im Sprachkanal", "{a} está en voz", "{a} est en vocal", "{a} está na voz", "{a} в голосовом"),
    voiceTwo: L("{a} ve {b} seste", "{a} and {b} are in voice", "{a} und {b} sind im Sprachkanal", "{a} y {b} están en voz", "{a} et {b} sont en vocal", "{a} e {b} estão na voz", "{a} и {b} в голосовом"),
    voiceThree: L("{a}, {b} ve {c} seste", "{a}, {b} and {c} are in voice", "{a}, {b} und {c} sind im Sprachkanal", "{a}, {b} y {c} están en voz", "{a}, {b} et {c} sont en vocal", "{a}, {b} e {c} estão na voz", "{a}, {b} и {c} в голосовом"),
    voiceMore: L("{a}, {b} ve {n} kişi daha seste", "{a}, {b} and {n} more are in voice", "{a}, {b} und {n} weitere sind im Sprachkanal", "{a}, {b} y {n} más están en voz", "{a}, {b} et {n} autres sont en vocal", "{a}, {b} e mais {n} estão na voz", "{a}, {b} и ещё {n} в голосовом"),
    voiceWhere: L("{server} › {channel}", "{server} › {channel}", "{server} › {channel}", "{server} › {channel}", "{server} › {channel}", "{server} › {channel}", "{server} › {channel}"),
    voiceWhereWith: L("{server} › {channel} · yanında {others}", "{server} › {channel} · with {others}", "{server} › {channel} · mit {others}", "{server} › {channel} · con {others}", "{server} › {channel} · avec {others}", "{server} › {channel} · com {others}", "{server} › {channel} · с {others}"),
    voiceGroupBody: L("{channel} kanalında konuşuyorlar. Katılmak tek dokunuş.", "Talking in {channel}. Joining is one tap.", "Sie reden in {channel}. Beitreten mit einem Tipp.", "Hablando en {channel}. Unirte es un toque.", "Ils parlent dans {channel}. Un geste pour rejoindre.", "Conversando em {channel}. Entrar é um toque.", "Общаются в {channel}. Присоединиться одним касанием."),
    join: L("Katıl", "Join", "Beitreten", "Unirme", "Rejoindre", "Entrar", "Войти"),
    quietJoin: L("Sessiz katıl", "Join muted", "Stumm beitreten", "Unirme en silencio", "Rejoindre en sourdine", "Entrar mudo", "Войти без микрофона"),
    reply: L("Yanıtla", "Reply", "Antworten", "Responder", "Répondre", "Responder", "Ответить"),
    come: L("Gel", "Join", "Komm", "Ven", "Viens", "Vem", "Зайти"),
    callTitle: L("{caller} seni çağırıyor", "{caller} is calling you back", "{caller} ruft dich zurück", "{caller} te está llamando", "{caller} t'appelle", "{caller} está te chamando", "{caller} зовёт тебя"),
    callAlsoInVoice: L("{names} da seste", "{names} are in voice too", "{names} sind auch im Sprachkanal", "{names} también están en voz", "{names} sont aussi en vocal", "{names} também estão na voz", "{names} тоже в голосовом"),
    nudgeTitle: L("{from} seni dürttü", "{from} nudged you", "{from} hat dich angestupst", "{from} te dio un toque", "{from} t'a fait un signe", "{from} te cutucou", "{from} напоминает о себе"),
    nudgeBody: L("Ortak seriniz {count}. günde. Bugün henüz yazmadın.", "Your shared streak is on day {count}. You have not written today.", "Eure gemeinsame Serie ist bei Tag {count}. Du hast heute noch nicht geschrieben.", "Vuestra racha compartida va por el día {count}. Hoy aún no has escrito.", "Votre série commune en est au jour {count}. Tu n'as pas encore écrit aujourd'hui.", "A sequência de vocês está no dia {count}. Você ainda não escreveu hoje.", "Ваша общая серия: день {count}. Сегодня ты ещё не писал."),
    streakTitle: L("{peer} seni bekliyor", "{peer} is waiting for you", "{peer} wartet auf dich", "{peer} te está esperando", "{peer} t'attend", "{peer} está esperando você", "{peer} ждёт тебя"),
    streakBody: L("Ortak seriniz {count} gün. Bugün yazarsan seri sürer.", "Your shared streak is {count} days. Write today to keep it.", "Eure gemeinsame Serie: {count} Tage. Schreib heute, damit sie hält.", "Vuestra racha compartida: {count} días. Escribe hoy para mantenerla.", "Votre série commune : {count} jours. Écris aujourd'hui pour la garder.", "A sequência de vocês: {count} dias. Escreva hoje para manter.", "Ваша общая серия: {count} дн. Напиши сегодня, чтобы сохранить."),
    tasksTitle: L("Bugünün görevlerinden {left} tane kaldı", "{left} of today's tasks left", "Noch {left} Aufgaben für heute", "Quedan {left} tareas de hoy", "Encore {left} tâches aujourd'hui", "Faltam {left} tarefas de hoje", "Осталось заданий на сегодня: {left}"),
    tasksBody: L("{peer} ile bir mesaj yeter.", "One message to {peer} is enough.", "Eine Nachricht an {peer} reicht.", "Basta un mensaje a {peer}.", "Un message à {peer} suffit.", "Uma mensagem para {peer} basta.", "Хватит одного сообщения для {peer}."),
    recalledTitle: L("Descall", "Descall", "Descall", "Descall", "Descall", "Descall", "Descall"),
    recalledBody: L("Bu bildirim geri alındı.", "This notification was withdrawn.", "Diese Benachrichtigung wurde zurückgezogen.", "Esta notificación se retiró.", "Cette notification a été retirée.", "Esta notificação foi retirada.", "Это уведомление отозвано."),
    test: L("Test · ", "Test · ", "Test · ", "Prueba · ", "Test · ", "Teste · ", "Тест · "),
  },
  mail: {
    open: L("Descall'u aç", "Open Descall", "Descall öffnen", "Abrir Descall", "Ouvrir Descall", "Abrir o Descall", "Открыть Descall"),
    sayHi: L("{peerDat} selam ver", "Say hi to {peer}", "Sag {peer} Hallo", "Saluda a {peer}", "Dis bonjour à {peer}", "Diga oi para {peer}", "Передать привет: {peer}"),
    sayHiWrite: L("{peerDat} \"selam\" yaz", "Write \"hi\" to {peer}", "Schreib {peer} \"Hallo\"", "Escribe \"hola\" a {peer}", "Écris \"salut\" à {peer}", "Escreva \"oi\" para {peer}", "Написать \"привет\": {peer}"),
    unsubscribe: L("tek tıkla abonelikten çık", "one-click unsubscribe", "mit einem Klick abmelden", "darse de baja con un clic", "se désabonner en un clic", "cancelar com um clique", "отписаться в один клик"),
    people: L("Kişileri değiştir", "Change people", "Personen ändern", "Cambiar personas", "Changer les personnes", "Mudar pessoas", "Изменить людей"),
    frequency: L("sıklık", "frequency", "Häufigkeit", "frecuencia", "fréquence", "frequência", "частота"),
    digestSubjectTwo: L("{a}: {aLine}, {b}: {bLine}", "{a}: {aLine}, {b}: {bLine}", "{a}: {aLine}, {b}: {bLine}", "{a}: {aLine}, {b}: {bLine}", "{a} : {aLine}, {b} : {bLine}", "{a}: {aLine}, {b}: {bLine}", "{a}: {aLine}, {b}: {bLine}"),
    digestSubjectOne: L("{a} bu hafta: {aLine}", "{a} this week: {aLine}", "{a} diese Woche: {aLine}", "{a} esta semana: {aLine}", "{a} cette semaine : {aLine}", "{a} esta semana: {aLine}", "{a} на этой неделе: {aLine}"),
    digestSubjectNone: L("Bu hafta Descall'da neler oldu", "What happened on Descall this week", "Was diese Woche auf Descall passiert ist", "Lo que pasó en Descall esta semana", "Ce qui s'est passé sur Descall cette semaine", "O que rolou no Descall esta semana", "Что было в Descall на этой неделе"),
    digestEyebrow: L("Haftanın insanları · {range}", "People of the week · {range}", "Menschen der Woche · {range}", "Personas de la semana · {range}", "Les personnes de la semaine · {range}", "Pessoas da semana · {range}", "Люди недели · {range}"),
    digestTitle: L("Arkadaşların bu hafta neler yaptı", "What your friends did this week", "Was deine Freunde diese Woche gemacht haben", "Lo que hicieron tus amigos esta semana", "Ce que tes amis ont fait cette semaine", "O que seus amigos fizeram esta semana", "Чем занимались твои друзья на этой неделе"),
    digestIntro: L("{people, plural, one {# önemli kişin} other {# önemli kişin}}, {mentions, plural, one {# bahsetme} other {# bahsetme}} ve bekleyen {waiting, plural, one {# şey} other {# şey}}.", "{people, plural, one {# important person} other {# important people}}, {mentions, plural, one {# mention} other {# mentions}} and {waiting, plural, one {# thing} other {# things}} waiting.", "{people, plural, one {# wichtige Person} other {# wichtige Personen}}, {mentions, plural, one {# Erwähnung} other {# Erwähnungen}} und {waiting, plural, one {# offene Sache} other {# offene Sachen}}.", "{people, plural, one {# persona importante} other {# personas importantes}}, {mentions, plural, one {# mención} other {# menciones}} y {waiting, plural, one {# cosa pendiente} other {# cosas pendientes}}.", "{people, plural, one {# personne importante} other {# personnes importantes}}, {mentions, plural, one {# mention} other {# mentions}} et {waiting, plural, one {# chose en attente} other {# choses en attente}}.", "{people, plural, one {# pessoa importante} other {# pessoas importantes}}, {mentions, plural, one {# menção} other {# menções}} e {waiting, plural, one {# coisa esperando} other {# coisas esperando}}.", "Важных людей: {people}, упоминаний: {mentions}, ждут ответа: {waiting}."),
    digestIntroSame: L("Bu hafta seninle aynı sunucularda olanlar.", "People who share your servers this week.", "Menschen, die diese Woche auf deinen Servern waren.", "Personas que comparten tus servidores esta semana.", "Les personnes de tes serveurs cette semaine.", "Pessoas que estão nos seus servidores esta semana.", "Люди с твоих серверов на этой неделе."),
    lineVoice: L("{hours} saat seste", "{hours} h in voice", "{hours} Std. im Sprachkanal", "{hours} h en voz", "{hours} h en vocal", "{hours} h na voz", "{hours} ч в голосовом"),
    lineVoiceMin: L("{minutes} dk seste", "{minutes} min in voice", "{minutes} Min. im Sprachkanal", "{minutes} min en voz", "{minutes} min en vocal", "{minutes} min na voz", "{minutes} мин в голосовом"),
    lineVoiceTop: L("en çok {server}", "mostly in {server}", "meist in {server}", "sobre todo en {server}", "surtout dans {server}", "mais em {server}", "чаще всего в {server}"),
    lineServer: L("{server} sunucusunu kurdu · {members} üye oldu", "Started {server} · {members} members", "Hat {server} gegründet · {members} Mitglieder", "Creó {server} · {members} miembros", "A créé {server} · {members} membres", "Criou {server} · {members} membros", "Создал(а) {server} · участников: {members}"),
    lineMention: L("{server} sunucusunda seni {count} kez andı", "Mentioned you {count}x in {server}", "Hat dich {count}x in {server} erwähnt", "Te mencionó {count} veces en {server}", "T'a mentionné {count} fois dans {server}", "Mencionou você {count}x em {server}", "Упомянул(а) тебя {count} раз в {server}"),
    lineMessages: L("{count} mesaj yazdı", "Wrote {count} messages", "Hat {count} Nachrichten geschrieben", "Escribió {count} mensajes", "A écrit {count} messages", "Escreveu {count} mensagens", "Написал(а) сообщений: {count}"),
    lineQuiet: L("Bu hafta sessizdi", "Quiet this week", "Diese Woche ruhig", "Tranquilo esta semana", "Calme cette semaine", "Quieto esta semana", "На этой неделе тихо"),
    waitingTitle: L("Seni bekleyenler", "Waiting for you", "Wartet auf dich", "Te esperan", "En attente", "Esperando você", "Ждут тебя"),
    waitingRequest: L("{name} arkadaşlık isteği gönderdi", "{name} sent you a friend request", "{name} hat dir eine Freundschaftsanfrage geschickt", "{name} te envió una solicitud de amistad", "{name} t'a envoyé une demande d'ami", "{name} enviou um pedido de amizade", "{name} отправил(а) запрос в друзья"),
    waitingRequestSub: L("Ortak sunucu: {server}", "Shared server: {server}", "Gemeinsamer Server: {server}", "Servidor en común: {server}", "Serveur commun : {server}", "Servidor em comum: {server}", "Общий сервер: {server}"),
    accept: L("Kabul et", "Accept", "Annehmen", "Aceptar", "Accepter", "Aceitar", "Принять"),
    reply: L("Yanıtla", "Reply", "Antworten", "Responder", "Répondre", "Responder", "Ответить"),
    streakLine: L("{peer} ile ortak seriniz {count} gün", "Your shared streak with {peer}: {count} days", "Eure gemeinsame Serie mit {peer}: {count} Tage", "Tu racha con {peer}: {count} días", "Ta série avec {peer} : {count} jours", "Sua sequência com {peer}: {count} dias", "Общая серия с {peer}: {count} дн."),
    streakBoth: L("bugün ikiniz de yazdınız", "you both wrote today", "ihr habt heute beide geschrieben", "hoy escribisteis los dos", "vous avez écrit tous les deux aujourd'hui", "vocês dois escreveram hoje", "сегодня вы оба написали"),
    streakRisk: L("bugün yazarsan sürer", "write today to keep it", "schreib heute, damit sie hält", "escribe hoy para mantenerla", "écris aujourd'hui pour la garder", "escreva hoje para manter", "напиши сегодня, чтобы сохранить"),
    digestWhy: L("Bu e-postayı haftalık özeti açık tuttuğun için aldın. Yalnız önemli kişilerini içerir.", "You get this because the weekly digest is on. It only covers your important people.", "Du bekommst das, weil die Wochenübersicht an ist. Sie enthält nur deine wichtigen Personen.", "Lo recibes porque el resumen semanal está activado. Solo incluye a tus personas importantes.", "Tu reçois ceci car le résumé hebdomadaire est activé. Il ne contient que tes personnes importantes.", "Você recebe isto porque o resumo semanal está ligado. Inclui só suas pessoas importantes.", "Ты получаешь это письмо, потому что включена еженедельная сводка. В ней только твои важные люди."),
    day14Eyebrow: L("Arkadaşların hâlâ burada", "Your friends are still here", "Deine Freunde sind noch da", "Tus amigos siguen aquí", "Tes amis sont toujours là", "Seus amigos ainda estão aqui", "Твои друзья всё ещё здесь"),
    day14Title: L("{name}, sensiz 14 gün geçti", "{name}, it has been 14 days", "{name}, 14 Tage ohne dich", "{name}, han pasado 14 días", "{name}, 14 jours sans toi", "{name}, 14 dias sem você", "{name}, прошло 14 дней"),
    day14Subject: L("{people} hâlâ {server} sunucusunda", "{people} are still in {server}", "{people} sind noch in {server}", "{people} siguen en {server}", "{people} sont toujours dans {server}", "{people} ainda estão em {server}", "{people} всё ещё в {server}"),
    day14SubjectNone: L("Descall'da seni bekleyenler var", "People on Descall are waiting for you", "Auf Descall wartet jemand auf dich", "En Descall te están esperando", "Sur Descall, on t'attend", "No Descall tem gente esperando você", "В Descall тебя ждут"),
    day14Body: L("Bu iki haftada {server} sunucusunda {count} sesli buluşma oldu.", "In these two weeks {server} had {count} voice hangouts.", "In diesen zwei Wochen gab es in {server} {count} Sprachtreffen.", "En estas dos semanas hubo {count} quedadas de voz en {server}.", "Ces deux semaines, {server} a eu {count} rencontres vocales.", "Nessas duas semanas rolaram {count} encontros de voz em {server}.", "За эти две недели в {server} было голосовых встреч: {count}."),
    day14Gift: L("{amount} DesCoin hediye", "{amount} DesCoin gift", "{amount} DesCoin Geschenk", "{amount} DesCoin de regalo", "{amount} DesCoin offerts", "{amount} DesCoin de presente", "{amount} DesCoin в подарок"),
    day14GiftSub: L("Girişte otomatik · 72 saat", "Automatic on sign-in · 72 hours", "Automatisch bei der Anmeldung · 72 Stunden", "Automático al entrar · 72 horas", "Automatique à la connexion · 72 heures", "Automático ao entrar · 72 horas", "Автоматически при входе · 72 часа"),
    day14Alt: L("Ya da sadece selam ver", "Or just say hi", "Oder sag einfach Hallo", "O solo saluda", "Ou dis juste bonjour", "Ou só diga oi", "Или просто поздоровайся"),
    day14AltSub: L("{peerDat} hazır mesajla DM aç", "Open a DM to {peer} with a ready message", "DM an {peer} mit fertiger Nachricht öffnen", "Abre un MD a {peer} con un mensaje listo", "Ouvre un MP à {peer} avec un message prêt", "Abra uma DM para {peer} com uma mensagem pronta", "Открыть ЛС с {peer} с готовым сообщением"),
    comeBack: L("Geri dön", "Come back", "Zurückkommen", "Volver", "Revenir", "Voltar", "Вернуться"),
    day14Last: L("Bu son geri kazanma mesajımız; bir daha yazmayacağız.", "This is our last message about coming back; we will not write again.", "Das ist unsere letzte Nachricht dazu; wir schreiben nicht noch einmal.", "Este es nuestro último mensaje; no volveremos a escribir.", "C'est notre dernier message ; nous n'écrirons plus.", "Esta é nossa última mensagem; não vamos escrever de novo.", "Это наше последнее письмо; больше писать не будем."),
    day14Why: L("Bir arkadaşının çağrısı ve bu e-posta, haftada en fazla iki mesaj kuralına birlikte sayılır.", "A friend's call and this e-mail count together towards our two-messages-a-week limit.", "Der Ruf eines Freundes und diese E-Mail zählen zusammen zu unserer Grenze von zwei Nachrichten pro Woche.", "La llamada de un amigo y este correo cuentan juntos en nuestro límite de dos mensajes por semana.", "L'appel d'un ami et cet e-mail comptent ensemble dans notre limite de deux messages par semaine.", "O chamado de um amigo e este e-mail contam juntos no nosso limite de duas mensagens por semana.", "Приглашение друга и это письмо вместе входят в наш лимит двух сообщений в неделю."),
    inactiveEyebrow: L("Bu hafta neler kaçırdın", "What you missed this week", "Was du diese Woche verpasst hast", "Lo que te perdiste esta semana", "Ce que tu as manqué cette semaine", "O que você perdeu esta semana", "Что ты пропустил(а) на этой неделе"),
    inactiveWhy: L("Bu e-postayı bir süredir Descall'a uğramadığın için aldın. Bu türden haftada en fazla iki mesaj göndeririz.", "You get this because you have not been on Descall for a while. We send at most two of these a week.", "Du bekommst das, weil du eine Weile nicht auf Descall warst. Höchstens zwei solche Nachrichten pro Woche.", "Lo recibes porque hace tiempo que no entras en Descall. Enviamos como máximo dos a la semana.", "Tu reçois ceci car tu n'es pas venu sur Descall depuis un moment. Deux messages par semaine au maximum.", "Você recebe isto porque faz um tempo que não entra no Descall. Enviamos no máximo duas por semana.", "Ты получаешь это, потому что давно не заходил(а) в Descall. Не больше двух таких писем в неделю."),
  },
});

/** Default campaign texts per language (the console can edit and approve them). */
const TEMPLATES = Object.freeze({
  new_quiet: {
    pushTitle: L("{sunucu} sunucusunda {sayi} kişi konuşuyor", "{sayi} people are talking in {sunucu}", "{sayi} Leute reden in {sunucu}", "{sayi} personas hablan en {sunucu}", "{sayi} personnes discutent dans {sunucu}", "{sayi} pessoas conversando em {sunucu}", "В {sunucu} общаются: {sayi}"),
    pushBody: L("İlk mesajını yaz; biri mutlaka yanıtlar.", "Write your first message; someone will answer.", "Schreib deine erste Nachricht; jemand antwortet bestimmt.", "Escribe tu primer mensaje; alguien responderá.", "Écris ton premier message ; quelqu'un répondra.", "Escreva sua primeira mensagem; alguém vai responder.", "Напиши первое сообщение: кто-нибудь ответит."),
    emailSubject: L("{sunucu} sunucusunda seni bekleyen bir sohbet var", "A conversation in {sunucu} is waiting for you", "In {sunucu} wartet ein Gespräch auf dich", "Una conversación en {sunucu} te espera", "Une conversation t'attend dans {sunucu}", "Uma conversa em {sunucu} está esperando você", "В {sunucu} тебя ждёт разговор"),
    emailBody: L("Bu hafta {sunucu} sunucusunda {sayi} kişi konuştu. Bir selam yeter.", "{sayi} people talked in {sunucu} this week. A hello is enough.", "{sayi} Leute haben diese Woche in {sunucu} geredet. Ein Hallo reicht.", "{sayi} personas hablaron en {sunucu} esta semana. Basta un hola.", "{sayi} personnes ont parlé dans {sunucu} cette semaine. Un bonjour suffit.", "{sayi} pessoas conversaram em {sunucu} esta semana. Um oi basta.", "На этой неделе в {sunucu} общались: {sayi}. Достаточно поздороваться."),
  },
  inactive7: {
    pushTitle: L("{sunucu} sunucusunda {sayi} arkadaşın seste", "{sayi} of your friends are in voice in {sunucu}", "{sayi} deiner Freunde sind in {sunucu} im Sprachkanal", "{sayi} amigos tuyos están en voz en {sunucu}", "{sayi} de tes amis sont en vocal dans {sunucu}", "{sayi} amigos seus estão na voz em {sunucu}", "Твои друзья в голосовом в {sunucu}: {sayi}"),
    pushBody: L("{arkadas_1} ve {arkadas_2} şu an konuşuyor. Katılmak tek dokunuş.", "{arkadas_1} and {arkadas_2} are talking now. Joining is one tap.", "{arkadas_1} und {arkadas_2} reden gerade. Beitreten mit einem Tipp.", "{arkadas_1} y {arkadas_2} están hablando. Unirte es un toque.", "{arkadas_1} et {arkadas_2} discutent. Un geste pour rejoindre.", "{arkadas_1} e {arkadas_2} estão conversando. Entrar é um toque.", "{arkadas_1} и {arkadas_2} сейчас общаются. Присоединиться одним касанием."),
    emailSubject: L("{arkadas_1} ve {arkadas_2} bu hafta {sayi} kez buluştu", "{arkadas_1} and {arkadas_2} met up {sayi} times this week", "{arkadas_1} und {arkadas_2} haben sich diese Woche {sayi} Mal getroffen", "{arkadas_1} y {arkadas_2} quedaron {sayi} veces esta semana", "{arkadas_1} et {arkadas_2} se sont retrouvés {sayi} fois cette semaine", "{arkadas_1} e {arkadas_2} se encontraram {sayi} vezes esta semana", "{arkadas_1} и {arkadas_2} встречались {sayi} раз на этой неделе"),
    emailBody: L("{sunucu} sunucusunda {sayi} sesli buluşma oldu ve {bahsetme} kez senden bahsedildi.", "{sunucu} had {sayi} voice hangouts and you were mentioned {bahsetme} times.", "In {sunucu} gab es {sayi} Sprachtreffen und du wurdest {bahsetme} Mal erwähnt.", "En {sunucu} hubo {sayi} quedadas de voz y te mencionaron {bahsetme} veces.", "{sunucu} a eu {sayi} rencontres vocales et on t'a mentionné {bahsetme} fois.", "Em {sunucu} rolaram {sayi} encontros de voz e você foi mencionado {bahsetme} vezes.", "В {sunucu} было голосовых встреч: {sayi}, тебя упомянули {bahsetme} раз."),
  },
  inactive14: {
    pushTitle: L("{arkadas_1} hâlâ {sunucu} sunucusunda", "{arkadas_1} is still in {sunucu}", "{arkadas_1} ist noch in {sunucu}", "{arkadas_1} sigue en {sunucu}", "{arkadas_1} est toujours dans {sunucu}", "{arkadas_1} ainda está em {sunucu}", "{arkadas_1} всё ещё в {sunucu}"),
    pushBody: L("Sensiz 14 gün geçti. Bir selam yeter.", "It has been 14 days. A hello is enough.", "14 Tage ohne dich. Ein Hallo reicht.", "Han pasado 14 días. Basta un hola.", "14 jours sans toi. Un bonjour suffit.", "14 dias sem você. Um oi basta.", "Прошло 14 дней. Достаточно поздороваться."),
    emailSubject: L("{arkadas_1} ve {arkadas_2} hâlâ {sunucu} sunucusunda", "{arkadas_1} and {arkadas_2} are still in {sunucu}", "{arkadas_1} und {arkadas_2} sind noch in {sunucu}", "{arkadas_1} y {arkadas_2} siguen en {sunucu}", "{arkadas_1} et {arkadas_2} sont toujours dans {sunucu}", "{arkadas_1} e {arkadas_2} ainda estão em {sunucu}", "{arkadas_1} и {arkadas_2} всё ещё в {sunucu}"),
    emailBody: L("Bu iki haftada {sunucu} sunucusunda {sayi} sesli buluşma oldu. {arkadas_1} seni {bahsetme} kez andı.", "In two weeks {sunucu} had {sayi} voice hangouts. {arkadas_1} mentioned you {bahsetme} times.", "In zwei Wochen gab es in {sunucu} {sayi} Sprachtreffen. {arkadas_1} hat dich {bahsetme} Mal erwähnt.", "En dos semanas hubo {sayi} quedadas de voz en {sunucu}. {arkadas_1} te mencionó {bahsetme} veces.", "En deux semaines, {sunucu} a eu {sayi} rencontres vocales. {arkadas_1} t'a mentionné {bahsetme} fois.", "Em duas semanas rolaram {sayi} encontros de voz em {sunucu}. {arkadas_1} mencionou você {bahsetme} vezes.", "За две недели в {sunucu} было голосовых встреч: {sayi}. {arkadas_1} упомянул(а) тебя {bahsetme} раз."),
  },
  weekly_digest: {
    pushTitle: L("Haftanın insanları", "People of the week", "Menschen der Woche", "Personas de la semana", "Les personnes de la semaine", "Pessoas da semana", "Люди недели"),
    pushBody: L("{arkadas_1} ve {arkadas_2} bu hafta neler yaptı?", "What did {arkadas_1} and {arkadas_2} do this week?", "Was haben {arkadas_1} und {arkadas_2} diese Woche gemacht?", "¿Qué hicieron {arkadas_1} y {arkadas_2} esta semana?", "Qu'ont fait {arkadas_1} et {arkadas_2} cette semaine ?", "O que {arkadas_1} e {arkadas_2} fizeram esta semana?", "Чем занимались {arkadas_1} и {arkadas_2}?"),
    emailSubject: L("{arkadas_1} ve {arkadas_2} bu hafta {sayi} kez buluştu", "{arkadas_1} and {arkadas_2} met up {sayi} times this week", "{arkadas_1} und {arkadas_2} haben sich {sayi} Mal getroffen", "{arkadas_1} y {arkadas_2} quedaron {sayi} veces", "{arkadas_1} et {arkadas_2} se sont retrouvés {sayi} fois", "{arkadas_1} e {arkadas_2} se encontraram {sayi} vezes", "{arkadas_1} и {arkadas_2} встречались {sayi} раз"),
    emailBody: L("{sunucu} sunucusunda {sayi} sesli buluşma oldu ve {bahsetme} kez senden bahsedildi.", "{sunucu} had {sayi} voice hangouts and you were mentioned {bahsetme} times.", "In {sunucu} gab es {sayi} Sprachtreffen und du wurdest {bahsetme} Mal erwähnt.", "En {sunucu} hubo {sayi} quedadas de voz y te mencionaron {bahsetme} veces.", "{sunucu} a eu {sayi} rencontres vocales et on t'a mentionné {bahsetme} fois.", "Em {sunucu} rolaram {sayi} encontros de voz e você foi mencionado {bahsetme} vezes.", "В {sunucu} было голосовых встреч: {sayi}, тебя упомянули {bahsetme} раз."),
  },
  streak_reminder: {
    pushTitle: L("{arkadas_1} seni bekliyor", "{arkadas_1} is waiting for you", "{arkadas_1} wartet auf dich", "{arkadas_1} te está esperando", "{arkadas_1} t'attend", "{arkadas_1} está esperando você", "{arkadas_1} ждёт тебя"),
    pushBody: L("Ortak seriniz {sayi} gün. Bugün yazarsan seri sürer.", "Your shared streak is {sayi} days. Write today to keep it.", "Eure gemeinsame Serie: {sayi} Tage. Schreib heute, damit sie hält.", "Vuestra racha: {sayi} días. Escribe hoy para mantenerla.", "Votre série : {sayi} jours. Écris aujourd'hui pour la garder.", "A sequência de vocês: {sayi} dias. Escreva hoje para manter.", "Ваша серия: {sayi} дн. Напиши сегодня, чтобы сохранить."),
    emailSubject: L("", "", "", "", "", "", ""),
    emailBody: L("", "", "", "", "", "", ""),
  },
  friend_call: {
    pushTitle: L("{arkadas_1} seni çağırıyor", "{arkadas_1} is calling you back", "{arkadas_1} ruft dich zurück", "{arkadas_1} te está llamando", "{arkadas_1} t'appelle", "{arkadas_1} está te chamando", "{arkadas_1} зовёт тебя"),
    pushBody: L("\"{sunucu} sunucusunda seni bekliyoruz. Gelirsen ikimize de 50 DesCoin.\"", "\"We are waiting for you in {sunucu}. Come back and we both get 50 DesCoin.\"", "\"Wir warten in {sunucu} auf dich. Kommst du, bekommen wir beide 50 DesCoin.\"", "\"Te esperamos en {sunucu}. Si vuelves, los dos ganamos 50 DesCoin.\"", "\"On t'attend dans {sunucu}. Si tu reviens, on gagne 50 DesCoin chacun.\"", "\"Estamos te esperando em {sunucu}. Se voltar, nós dois ganhamos 50 DesCoin.\"", "\"Ждём тебя в {sunucu}. Вернёшься, и мы оба получим 50 DesCoin.\""),
    emailSubject: L("", "", "", "", "", "", ""),
    emailBody: L("", "", "", "", "", "", ""),
  },
});

const LANGS = Object.freeze(["tr", "en", "de", "es", "fr", "pt-BR", "ru"]);

function langOf(lang) {
  return pickLang([lang], "tr");
}

function lookup(path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), COPY);
}

/** Render a copy key in `lang` (Turkish when the language has no entry). */
function rt(lang, key, vars = {}) {
  const l = langOf(lang);
  const entry = lookup(key);
  if (!entry) return key;
  const text = entry[l] ?? entry.tr ?? "";
  const tag = l === "pt-BR" ? "pt-BR" : l;
  const full = { ...vars };
  // Turkish dative forms for every name variable ("Ece" -> "Ece'ye").
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === "string" && !(`${k}Dat` in full)) full[`${k}Dat`] = l === "tr" ? trDative(v) || v : v;
  }
  return formatMessage(text, full, tag);
}

/** Default template of a campaign in `lang` (empty strings when none). */
function defaultTemplate(campaign, lang) {
  const t = TEMPLATES[campaign];
  const l = langOf(lang);
  if (!t) return { pushTitle: "", pushBody: "", emailSubject: "", emailBody: "" };
  const pick = (f) => (t[f] ? t[f][l] ?? t[f].tr ?? "" : "");
  return { pushTitle: pick("pushTitle"), pushBody: pick("pushBody"), emailSubject: pick("emailSubject"), emailBody: pick("emailBody") };
}

/** "Ece seste", "Ece ve Kaan seste", "Ece, Kaan ve Zeynep seste", "Ece, Kaan ve 3 kişi daha seste". */
function voiceTitle(lang, names = [], total = null) {
  const n = names.filter(Boolean);
  const count = Math.max(n.length, Number(total) || 0);
  if (count <= 1) return rt(lang, "push.voiceOne", { a: n[0] || "" });
  if (count === 2 && n.length >= 2) return rt(lang, "push.voiceTwo", { a: n[0], b: n[1] });
  if (count === 3 && n.length >= 3) return rt(lang, "push.voiceThree", { a: n[0], b: n[1], c: n[2] });
  if (n.length < 2) return rt(lang, "push.voiceOne", { a: n[0] || "" });
  return rt(lang, "push.voiceMore", { a: n[0], b: n[1], n: count - 2 });
}

module.exports = { COPY, TEMPLATES, LANGS, rt, defaultTemplate, voiceTitle, langOf };
