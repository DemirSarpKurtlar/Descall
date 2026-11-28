"use strict";

/**
 * Static content of the official community server "Descall Topluluk" in every UI
 * language (owner pick, draft C: each reader sees the server in their app language).
 *
 * Source of truth for the seed in supabase/migrations/20261128a_server_content_l10n.sql
 * (regenerate it with `node backend/scripts/genServerL10nSeed.cjs`) and the fixture of
 * the selftests and the e2e run. Admins edit the live rows in the admin panel
 * (Topluluk çevirileri); this file is not read at runtime.
 *
 * Channel mentions are written as <#slug> here and stored as <#channel-id>: the app
 * shows each reader the channel's own name in their language. Translated text
 * channel names keep the slug style of the originals (lowercase, hyphens).
 */

const SERVER_ID = "be4b140c-f5a3-487c-b301-8b66b17086fa";
const SOURCE_LOCALE = "tr";
const LOCALES = ["tr", "en", "de", "es", "fr", "pt-BR", "ru"];

/** slug -> live channel id (server_channels). */
const CHANNELS = {
  "cat-basla": "3bda105d-e9e7-42a5-8959-76b9749728d2",
  "cat-sohbet": "2accd626-957e-4061-b124-c04cae1ceda3",
  "cat-destek": "4cecb85e-8516-419c-a0b7-78589c5238eb",
  "cat-ses": "d675a989-13d6-4f23-916a-0edce90e1f60",
  "cat-ekip": "63912efe-1020-4a45-9cab-e3738473d7bd",
  "hos-geldin": "1d8aa1d9-6e54-4442-ac21-75146c266638",
  kurallar: "681005ed-6314-4586-8a61-5df82c668102",
  duyurular: "786ff977-45c2-471b-ba12-7b17d4c222bf",
  tanisma: "c56332d1-22f4-43d3-8a14-99b670253a22",
  etkinlikler: "60d46fa3-4ab7-4b41-a6d1-a311ada3098d",
  genel: "84f0161e-0f02-493c-818b-7b1e14f8a429",
  oyun: "3f72f85a-1546-419c-b976-cc6a729942a4",
  muzik: "bb17d38b-48eb-4d1c-aa7d-0e8149f8760b",
  "ders-calisma": "9915bb32-ebe6-4162-bacd-77ed51fbedb1",
  "film-dizi-anime": "2872b721-0cde-4473-b682-ba5122411d14",
  "yazilim-teknoloji": "ef01ea44-c79e-4575-b9fd-31d4aa8e657c",
  paylasim: "8fd19fbd-016d-4a8f-ad61-5edcec18925e",
  yardim: "9b89cfb3-3744-4e5b-8ce6-5e0b03b27cf1",
  "hata-bildir": "d4579943-c892-43f1-92a1-628d83c8f8ca",
  "oneri-ve-fikir": "ea318873-1d74-422d-b320-66480708576f",
  "descall-ipuclari": "f7e8552e-8a75-4abe-b872-af794037364d",
  "ekip-sohbet": "02e56afc-a555-47c8-9ae9-15e460e65b82",
  "mod-kayitlari": "f4f4a8a4-fb14-442b-a642-79b25378bac7",
  "ekip-odasi": "4adf9f02-9766-4371-8e15-6018ce362864",
  lobi: "15631bf6-8065-46e4-a736-93e2a852dd46",
  "sohbet-odasi": "36fb2004-ba39-477a-b4e6-9f1709510b5f",
  "oyun-odasi": "767948ef-3b44-4ef1-a1e8-faa5aadbf79d",
  "muzik-odasi": "f0915cac-3bc2-4650-9f20-e4c4122ac32f",
  "ders-odasi": "281cdc0e-404a-4bed-9017-207c14a7dc32",
  "etkinlik-sahnesi": "18ffdefc-1c25-491e-b7df-c5778917e56c",
  afk: "0be60255-f680-4ba0-b002-e24262d3f233",
};

const SERVER = {
  name: {
    tr: "Descall Topluluk",
    en: "Descall Community",
    de: "Descall Community",
    es: "Comunidad Descall",
    fr: "Communauté Descall",
    "pt-BR": "Comunidade Descall",
    ru: "Сообщество Descall",
  },
  description: {
    tr: "Descall'un resmi topluluk sunucusu. Yeni gelenler burada tanışır, soru sorar, oyun ve sohbet arkadaşı bulur. Duyurular, ipuçları ve etkinlikler de burada.",
    en: "The official Descall community server. Newcomers meet people here, ask questions and find friends to play and chat with. Announcements, tips and events live here too.",
    de: "Der offizielle Community-Server von Descall. Hier lernen sich Neue kennen, stellen Fragen und finden Leute zum Zocken und Quatschen. Ankündigungen, Tipps und Events gibt es auch hier.",
    es: "El servidor oficial de la comunidad de Descall. Aquí los recién llegados conocen gente, hacen preguntas y encuentran con quién jugar y charlar. También hay anuncios, consejos y eventos.",
    fr: "Le serveur communautaire officiel de Descall. Les nouveaux venus s'y rencontrent, posent leurs questions et trouvent des amis pour jouer et discuter. Annonces, astuces et événements sont aussi ici.",
    "pt-BR": "O servidor oficial da comunidade Descall. Aqui quem está chegando conhece gente nova, tira dúvidas e encontra amigos para jogar e conversar. Anúncios, dicas e eventos também ficam aqui.",
    ru: "Официальный сервер сообщества Descall. Здесь новички знакомятся, задают вопросы и находят друзей для игр и общения. Анонсы, советы и мероприятия тоже здесь.",
  },
};

/** Display names: categories and voice rooms in title style, text channels as slugs. */
const CHANNEL_NAMES = {
  "cat-basla": { tr: "Başla", en: "Start Here", de: "Los geht's", es: "Empieza aquí", fr: "Pour commencer", "pt-BR": "Comece aqui", ru: "Начало" },
  "cat-sohbet": { tr: "Sohbet", en: "Chat", de: "Chat", es: "Charla", fr: "Discussion", "pt-BR": "Papo", ru: "Общение" },
  "cat-destek": { tr: "Destek", en: "Support", de: "Support", es: "Soporte", fr: "Assistance", "pt-BR": "Suporte", ru: "Поддержка" },
  "cat-ses": { tr: "Ses Odaları", en: "Voice Rooms", de: "Sprachräume", es: "Salas de voz", fr: "Salons vocaux", "pt-BR": "Salas de voz", ru: "Голосовые комнаты" },
  "cat-ekip": { tr: "Ekip", en: "Team", de: "Team", es: "Equipo", fr: "Équipe", "pt-BR": "Equipe", ru: "Команда" },
  "hos-geldin": { tr: "hos-geldin", en: "welcome", de: "willkommen", es: "bienvenida", fr: "bienvenue", "pt-BR": "boas-vindas", ru: "добро-пожаловать" },
  kurallar: { tr: "kurallar", en: "rules", de: "regeln", es: "reglas", fr: "regles", "pt-BR": "regras", ru: "правила" },
  duyurular: { tr: "duyurular", en: "announcements", de: "ankuendigungen", es: "anuncios", fr: "annonces", "pt-BR": "anuncios", ru: "объявления" },
  tanisma: { tr: "tanisma", en: "introductions", de: "vorstellung", es: "presentaciones", fr: "presentations", "pt-BR": "apresentacoes", ru: "знакомство" },
  etkinlikler: { tr: "etkinlikler", en: "events", de: "events", es: "eventos", fr: "evenements", "pt-BR": "eventos", ru: "мероприятия" },
  genel: { tr: "genel", en: "general", de: "allgemein", es: "general", fr: "general", "pt-BR": "geral", ru: "общий" },
  oyun: { tr: "oyun", en: "gaming", de: "gaming", es: "juegos", fr: "jeux", "pt-BR": "jogos", ru: "игры" },
  muzik: { tr: "muzik", en: "music", de: "musik", es: "musica", fr: "musique", "pt-BR": "musica", ru: "музыка" },
  "ders-calisma": { tr: "ders-calisma", en: "studying", de: "lernen", es: "estudio", fr: "etudes", "pt-BR": "estudos", ru: "учеба" },
  "film-dizi-anime": { tr: "film-dizi-anime", en: "movies-shows-anime", de: "filme-serien-anime", es: "cine-series-anime", fr: "films-series-anime", "pt-BR": "filmes-series-anime", ru: "кино-сериалы-аниме" },
  "yazilim-teknoloji": { tr: "yazilim-teknoloji", en: "software-tech", de: "software-technik", es: "software-tecnologia", fr: "logiciel-tech", "pt-BR": "software-tecnologia", ru: "софт-и-технологии" },
  paylasim: { tr: "paylasim", en: "showcase", de: "zeig-her", es: "comparte", fr: "partages", "pt-BR": "compartilhe", ru: "творчество" },
  yardim: { tr: "yardim", en: "help", de: "hilfe", es: "ayuda", fr: "aide", "pt-BR": "ajuda", ru: "помощь" },
  "hata-bildir": { tr: "hata-bildir", en: "bug-reports", de: "fehler-melden", es: "reportar-errores", fr: "signaler-un-bug", "pt-BR": "reportar-bugs", ru: "баг-репорты" },
  "oneri-ve-fikir": { tr: "oneri-ve-fikir", en: "suggestions", de: "vorschlaege", es: "sugerencias", fr: "suggestions", "pt-BR": "sugestoes", ru: "предложения" },
  "descall-ipuclari": { tr: "descall-ipuclari", en: "descall-tips", de: "descall-tipps", es: "consejos-descall", fr: "astuces-descall", "pt-BR": "dicas-descall", ru: "советы-descall" },
  "ekip-sohbet": { tr: "ekip-sohbet", en: "team-chat", de: "team-chat", es: "chat-del-equipo", fr: "chat-equipe", "pt-BR": "chat-da-equipe", ru: "чат-команды" },
  "mod-kayitlari": { tr: "mod-kayitlari", en: "mod-log", de: "mod-log", es: "registro-mod", fr: "journal-moderation", "pt-BR": "registro-mod", ru: "журнал-модерации" },
  "ekip-odasi": { tr: "Ekip Odası", en: "Team Room", de: "Teamraum", es: "Sala del equipo", fr: "Salon de l'équipe", "pt-BR": "Sala da equipe", ru: "Комната команды" },
  lobi: { tr: "Lobi", en: "Lobby", de: "Lobby", es: "Lobby", fr: "Lobby", "pt-BR": "Lobby", ru: "Лобби" },
  "sohbet-odasi": { tr: "Sohbet Odası", en: "Chat Room", de: "Plauderecke", es: "Sala de charla", fr: "Salon discussion", "pt-BR": "Sala de bate-papo", ru: "Комната для общения" },
  "oyun-odasi": { tr: "Oyun Odası", en: "Game Room", de: "Gaming-Raum", es: "Sala de juegos", fr: "Salon jeux", "pt-BR": "Sala de jogos", ru: "Игровая комната" },
  "muzik-odasi": { tr: "Müzik Odası", en: "Music Room", de: "Musikraum", es: "Sala de música", fr: "Salon musique", "pt-BR": "Sala de música", ru: "Музыкальная комната" },
  "ders-odasi": { tr: "Ders Çalışma (Sessiz)", en: "Study Room (Quiet)", de: "Lernraum (leise)", es: "Sala de estudio (silencio)", fr: "Salle d'étude (silence)", "pt-BR": "Sala de estudos (silêncio)", ru: "Учеба (тихо)" },
  "etkinlik-sahnesi": { tr: "Etkinlik Sahnesi", en: "Event Stage", de: "Event-Bühne", es: "Escenario de eventos", fr: "Scène des événements", "pt-BR": "Palco de eventos", ru: "Сцена мероприятий" },
  afk: { tr: "AFK", en: "AFK", de: "AFK", es: "AFK", fr: "AFK", "pt-BR": "AFK", ru: "AFK" },
};

const CHANNEL_TOPICS = {
  genel: {
    tr: "Her konuda sohbet. Saygılı ol, yeni gelenlere yardım et.",
    en: "Chat about anything. Be respectful and help newcomers out.",
    de: "Quatschen über alles. Bleib respektvoll und hilf Neuen weiter.",
    es: "Charla sobre cualquier tema. Sé respetuoso y échales una mano a los recién llegados.",
    fr: "On parle de tout. Reste respectueux et aide les nouveaux.",
    "pt-BR": "Papo sobre qualquer assunto. Seja respeitoso e ajude quem está chegando.",
    ru: "Общение на любые темы. Будь вежлив и помогай новичкам.",
  },
  oyun: {
    tr: "Oyun sohbeti ve birlikte oynayacak arkadaş arama. Oyun, platform ve saat yaz, sesli odaya geç.",
    en: "Talk games and find people to play with. Post the game, platform and time, then hop into a voice room.",
    de: "Alles rund ums Zocken und Mitspieler finden. Schreib Spiel, Plattform und Uhrzeit und komm in einen Sprachraum.",
    es: "Habla de juegos y encuentra con quién jugar. Escribe el juego, la plataforma y la hora, y pásate a una sala de voz.",
    fr: "Parle de jeux et trouve des partenaires. Indique le jeu, la plateforme et l'heure, puis rejoins un salon vocal.",
    "pt-BR": "Papo sobre jogos e gente para jogar junto. Escreva o jogo, a plataforma e o horário e entre numa sala de voz.",
    ru: "Разговоры об играх и поиск напарников. Напиши игру, платформу и время, а потом заходи в голосовую комнату.",
  },
  muzik: {
    tr: "Ne dinliyorsun? Çalma listeleri, yeni şarkılar ve konser haberleri.",
    en: "What are you listening to? Playlists, new songs and concert news.",
    de: "Was hörst du gerade? Playlists, neue Songs und Konzert-News.",
    es: "¿Qué estás escuchando? Listas de reproducción, canciones nuevas y noticias de conciertos.",
    fr: "Tu écoutes quoi ? Playlists, nouveaux morceaux et actus concerts.",
    "pt-BR": "O que você está ouvindo? Playlists, músicas novas e notícias de shows.",
    ru: "Что слушаешь? Плейлисты, новые песни и новости о концертах.",
  },
  "ders-calisma": {
    tr: "YKS, LGS, üniversite ve kendi kendine öğrenme. Soru sor, kaynak paylaş, birlikte çalışma saati ayarla.",
    en: "Exams, university and learning on your own. Ask questions, share resources and set up study sessions together.",
    de: "Prüfungen, Uni und Lernen auf eigene Faust. Stell Fragen, teile Material und verabredet euch zum gemeinsamen Lernen.",
    es: "Exámenes, universidad y aprendizaje por tu cuenta. Pregunta, comparte recursos y organiza sesiones de estudio con otros.",
    fr: "Examens, études supérieures et autoformation. Pose tes questions, partage des ressources et organise des sessions d'étude à plusieurs.",
    "pt-BR": "Vestibular, ENEM, faculdade e estudo por conta própria. Tire dúvidas, compartilhe materiais e marque horários para estudar junto.",
    ru: "Экзамены, университет и самообразование. Задавай вопросы, делись материалами и договаривайся о совместных занятиях.",
  },
  "film-dizi-anime": {
    tr: "Film, dizi ve anime önerileri. Spoiler verirken uyar.",
    en: "Movie, TV show and anime recommendations. Warn people before spoilers.",
    de: "Empfehlungen für Filme, Serien und Anime. Warn vor Spoilern.",
    es: "Recomendaciones de películas, series y anime. Avisa antes de hacer spoilers.",
    fr: "Recommandations de films, séries et animes. Préviens avant de spoiler.",
    "pt-BR": "Indicações de filmes, séries e animes. Avise antes de dar spoiler.",
    ru: "Рекомендации фильмов, сериалов и аниме. Предупреждай перед спойлерами.",
  },
  "yazilim-teknoloji": {
    tr: "Kod, donanım, yapay zeka ve teknoloji haberleri.",
    en: "Code, hardware, AI and tech news.",
    de: "Code, Hardware, KI und Tech-News.",
    es: "Código, hardware, inteligencia artificial y noticias de tecnología.",
    fr: "Code, matériel, IA et actus tech.",
    "pt-BR": "Código, hardware, inteligência artificial e notícias de tecnologia.",
    ru: "Код, железо, ИИ и новости технологий.",
  },
  paylasim: {
    tr: "Fotoğraf, klip, çizim, kendi yaptıkların. Sadece paylaşım, sohbet <#genel> kanalında.",
    en: "Photos, clips, drawings, things you made. Posts only, the chat goes in <#genel>.",
    de: "Fotos, Clips, Zeichnungen, deine eigenen Werke. Nur zum Teilen, gequatscht wird in <#genel>.",
    es: "Fotos, clips, dibujos y cosas hechas por ti. Solo publicaciones; para charlar, ve a <#genel>.",
    fr: "Photos, clips, dessins, tes créations. Uniquement des partages, la discussion se fait dans <#genel>.",
    "pt-BR": "Fotos, clipes, desenhos e coisas que você fez. Só para postar, o papo fica no <#genel>.",
    ru: "Фото, клипы, рисунки и всё, что ты сделал сам. Только публикации, общение в <#genel>.",
  },
  "hos-geldin": {
    tr: "Descall Topluluk'a hoş geldin! Kuralları oku, <#tanisma> kanalında kendini tanıt, soruların için <#yardim> kanalına yaz.",
    en: "Welcome to the Descall Community! Read the rules, introduce yourself in <#tanisma> and post your questions in <#yardim>.",
    de: "Willkommen in der Descall Community! Lies die Regeln, stell dich in <#tanisma> vor und stell deine Fragen in <#yardim>.",
    es: "¡Te damos la bienvenida a la Comunidad Descall! Lee las reglas, preséntate en <#tanisma> y escribe tus dudas en <#yardim>.",
    fr: "Bienvenue dans la Communauté Descall ! Lis les règles, présente-toi dans <#tanisma> et pose tes questions dans <#yardim>.",
    "pt-BR": "Boas-vindas à Comunidade Descall! Leia as regras, se apresente em <#tanisma> e mande suas dúvidas em <#yardim>.",
    ru: "Добро пожаловать в Сообщество Descall! Прочитай правила, представься в <#tanisma> и задавай вопросы в <#yardim>.",
  },
  kurallar: {
    tr: "Topluluk kuralları. Sohbete başlamadan önce oku ve kabul et.",
    en: "Community rules. Read and accept them before you start chatting.",
    de: "Die Community-Regeln. Lies und akzeptiere sie, bevor du loslegst.",
    es: "Las reglas de la comunidad. Léelas y acéptalas antes de empezar a chatear.",
    fr: "Les règles de la communauté. Lis-les et accepte-les avant de commencer à discuter.",
    "pt-BR": "Regras da comunidade. Leia e aceite antes de começar a conversar.",
    ru: "Правила сообщества. Прочитай и прими их, прежде чем начать общаться.",
  },
  duyurular: {
    tr: "Descall'dan resmi haberler, yeni sürümler ve güncellemeler.",
    en: "Official news from Descall, new releases and updates.",
    de: "Offizielle News von Descall, neue Versionen und Updates.",
    es: "Noticias oficiales de Descall, nuevas versiones y actualizaciones.",
    fr: "Actus officielles de Descall, nouvelles versions et mises à jour.",
    "pt-BR": "Notícias oficiais do Descall, novas versões e atualizações.",
    ru: "Официальные новости Descall, новые версии и обновления.",
  },
  tanisma: {
    tr: "Kendini tanıt: adın ya da lakabın, nelerle uğraşıyorsun, hangi oyunları oynuyorsun, ne dinliyorsun. Yeni gelenlere bir selam ver.",
    en: "Introduce yourself: your name or nickname, what you're into, which games you play, what you listen to. Say hi to the newcomers.",
    de: "Stell dich vor: dein Name oder Spitzname, womit du dich beschäftigst, was du spielst und was du hörst. Sag den Neuen Hallo.",
    es: "Preséntate: tu nombre o apodo, a qué te dedicas, a qué juegas y qué escuchas. Saluda a los recién llegados.",
    fr: "Présente-toi : ton prénom ou ton pseudo, ce qui t'occupe, tes jeux, ce que tu écoutes. Dis bonjour aux nouveaux.",
    "pt-BR": "Se apresente: seu nome ou apelido, com o que você mexe, o que joga e o que ouve. Dê um oi para quem acabou de chegar.",
    ru: "Расскажи о себе: имя или ник, чем увлекаешься, во что играешь, что слушаешь. Поприветствуй новичков.",
  },
  etkinlikler: {
    tr: "Turnuvalar, izleme partileri, ders kampları ve topluluk geceleri. Haber almak için Etkinlik Bildirimi rolünü al.",
    en: "Tournaments, watch parties, study camps and community nights. Take the Etkinlik Bildirimi (event alerts) role to get notified.",
    de: "Turniere, Watchpartys, Lerncamps und Community-Abende. Hol dir die Rolle Etkinlik Bildirimi (Event-Benachrichtigung), um nichts zu verpassen.",
    es: "Torneos, sesiones para ver algo juntos, campamentos de estudio y noches de comunidad. Toma el rol Etkinlik Bildirimi (avisos de eventos) para enterarte de todo.",
    fr: "Tournois, soirées visionnage, stages de révision et soirées communauté. Prends le rôle Etkinlik Bildirimi (alertes événements) pour être prévenu.",
    "pt-BR": "Torneios, sessões para assistir junto, maratonas de estudo e noites da comunidade. Pegue o cargo Etkinlik Bildirimi (aviso de eventos) para ficar sabendo.",
    ru: "Турниры, совместные просмотры, учебные марафоны и вечера сообщества. Возьми роль Etkinlik Bildirimi (уведомления о мероприятиях), чтобы ничего не пропустить.",
  },
  yardim: {
    tr: "Descall'u kullanırken takıldığın her şey: hesap, ses, ekran paylaşımı, sunucu ayarları. Rehberler ve ekip burada yanıtlar.",
    en: "Stuck on anything in Descall? Account, voice, screen sharing, server settings. Guides and the team answer here.",
    de: "Hängst du irgendwo in Descall fest? Konto, Sprache, Bildschirmfreigabe, Servereinstellungen. Guides und das Team antworten hier.",
    es: "Todo lo que te cueste al usar Descall: cuenta, voz, compartir pantalla, ajustes del servidor. Los guías y el equipo responden aquí.",
    fr: "Tout ce qui te bloque sur Descall : compte, voix, partage d'écran, paramètres du serveur. Les guides et l'équipe répondent ici.",
    "pt-BR": "Travou em alguma coisa no Descall? Conta, voz, compartilhamento de tela, configurações do servidor. Os guias e a equipe respondem aqui.",
    ru: "Всё, с чем возникли трудности в Descall: аккаунт, голос, демонстрация экрана, настройки сервера. Здесь отвечают гиды и команда.",
  },
  "hata-bildir": {
    tr: "Bir hata mı buldun? Ne yaptığını, ne beklediğini, ne olduğunu ve cihazını yaz. Doğrulanan gerçek hatalar Bug Avcısı rozeti ve DesCoin kazandırır.",
    en: "Found a bug? Tell us what you did, what you expected, what happened and which device you use. Confirmed real bugs earn the Bug Hunter badge and DesCoin.",
    de: "Einen Fehler gefunden? Schreib, was du gemacht hast, was du erwartet hast, was passiert ist und welches Gerät du nutzt. Bestätigte echte Fehler bringen das Bug-Hunter-Abzeichen und DesCoin.",
    es: "¿Encontraste un error? Cuenta qué hiciste, qué esperabas, qué pasó y qué dispositivo usas. Los errores reales confirmados dan la insignia Bug Hunter y DesCoin.",
    fr: "Tu as trouvé un bug ? Explique ce que tu as fait, ce que tu attendais, ce qui s'est passé et ton appareil. Les vrais bugs confirmés rapportent le badge Bug Hunter et des DesCoin.",
    "pt-BR": "Achou um bug? Conte o que você fez, o que esperava, o que aconteceu e qual aparelho usa. Bugs reais confirmados dão o selo Bug Hunter e DesCoin.",
    ru: "Нашёл ошибку? Напиши, что ты сделал, чего ожидал, что произошло и какое у тебя устройство. За подтверждённые настоящие ошибки дают значок Bug Hunter и DesCoin.",
  },
  "oneri-ve-fikir": {
    tr: "Descall'da görmek istediğin özellikler ve fikirler. Beğendiğin öneriye tepki ver, ekip okuyor.",
    en: "Features and ideas you'd like to see in Descall. React to the suggestions you like, the team reads them.",
    de: "Funktionen und Ideen, die du dir für Descall wünschst. Reagier auf Vorschläge, die dir gefallen, das Team liest mit.",
    es: "Funciones e ideas que te gustaría ver en Descall. Reacciona a las sugerencias que te gusten, el equipo las lee.",
    fr: "Les fonctionnalités et idées que tu aimerais voir dans Descall. Réagis aux suggestions qui te plaisent, l'équipe les lit.",
    "pt-BR": "Recursos e ideias que você quer ver no Descall. Reaja às sugestões de que gostar, a equipe lê tudo.",
    ru: "Функции и идеи, которые ты хотел бы видеть в Descall. Ставь реакции на понравившиеся предложения, команда их читает.",
  },
  "descall-ipuclari": {
    tr: "Kısayollar, gizli özellikler, ses ve görüntü ayarları, Descall+ ve DesCoin hakkında ipuçları.",
    en: "Shortcuts, hidden features, audio and video settings, plus tips about Descall+ and DesCoin.",
    de: "Shortcuts, versteckte Funktionen, Audio- und Videoeinstellungen sowie Tipps zu Descall+ und DesCoin.",
    es: "Atajos, funciones ocultas, ajustes de audio y video, y consejos sobre Descall+ y DesCoin.",
    fr: "Raccourcis, fonctions cachées, réglages audio et vidéo, et astuces sur Descall+ et DesCoin.",
    "pt-BR": "Atalhos, recursos escondidos, configurações de áudio e vídeo e dicas sobre o Descall+ e o DesCoin.",
    ru: "Горячие клавиши, скрытые функции, настройки звука и видео, а также советы о Descall+ и DesCoin.",
  },
  "ekip-sohbet": {
    tr: "Ekip içi koordinasyon. Sadece Descall Ekibi ve moderatörler görür.",
    en: "Internal team coordination. Only the Descall Team and moderators can see it.",
    de: "Interne Abstimmung im Team. Nur das Descall-Team und die Moderatoren sehen das.",
    es: "Coordinación interna del equipo. Solo lo ven el equipo de Descall y los moderadores.",
    fr: "Coordination interne de l'équipe. Visible uniquement par l'équipe Descall et les modérateurs.",
    "pt-BR": "Coordenação interna da equipe. Só a Equipe Descall e os moderadores veem.",
    ru: "Внутренняя координация команды. Видят только команда Descall и модераторы.",
  },
  "mod-kayitlari": {
    tr: "Moderasyon notları ve vaka kayıtları.",
    en: "Moderation notes and case log.",
    de: "Moderationsnotizen und Fallprotokoll.",
    es: "Notas de moderación y registro de casos.",
    fr: "Notes de modération et journal des dossiers.",
    "pt-BR": "Notas de moderação e registro de casos.",
    ru: "Заметки модерации и журнал случаев.",
  },
};

/** The six opening messages (sender: the admin account), keyed by live message id. */
const MESSAGES = {
  // #hos-geldin (pinned)
  "401e70db-e932-4393-86be-0425a241b85a": {
    channel: "hos-geldin",
    pinned: true,
    tr: "Descall Topluluk'a hoş geldin!\n\nBurası Descall'un resmi topluluk sunucusu. Yeni insanlarla tanışabilir, sohbet ve oyun arkadaşı bulabilir, Descall ile ilgili her şeyi doğrudan ekibe sorabilirsin.\n\nBaşlamak için:\n1. <#kurallar> kanalını oku ve kabul et.\n2. <#tanisma> kanalında kendini kısaca tanıt.\n3. Sohbet etmek için <#genel>, oyun için <#oyun>, sesli takılmak için <#lobi>'ye gel.\n\nBir sorun mu var? <#yardim> kanalına yaz.\nBir hata mı buldun? <#hata-bildir> kanalına yaz. Gerçek hata bulanlara Bug Hunter rozeti veriyoruz.\nBir fikrin mi var? <#oneri-ve-fikir> kanalında bekliyoruz.\n\nİyi sohbetler!",
    en: "Welcome to the Descall Community!\n\nThis is the official Descall community server. Meet new people, find friends to chat and play with, and ask the team anything about Descall directly.\n\nTo get started:\n1. Read and accept <#kurallar>.\n2. Say a few words about yourself in <#tanisma>.\n3. Chat in <#genel>, talk games in <#oyun>, or hang out in voice in the <#lobi>.\n\nHaving trouble? Post in <#yardim>.\nFound a bug? Report it in <#hata-bildir>. Everyone who finds a real bug gets the Bug Hunter badge.\nGot an idea? We'd love to hear it in <#oneri-ve-fikir>.\n\nEnjoy your stay!",
    de: "Willkommen in der Descall Community!\n\nDas ist der offizielle Community-Server von Descall. Hier lernst du neue Leute kennen, findest Leute zum Quatschen und Zocken und kannst das Team alles rund um Descall direkt fragen.\n\nSo legst du los:\n1. Lies die Regeln in <#kurallar> und akzeptiere sie.\n2. Stell dich kurz in <#tanisma> vor.\n3. Zum Quatschen geht's in <#genel>, zum Zocken in <#oyun>, und für Voice komm in die <#lobi>.\n\nProbleme? Schreib in <#yardim>.\nEinen Fehler gefunden? Melde ihn in <#hata-bildir>. Wer einen echten Fehler findet, bekommt das Bug-Hunter-Abzeichen.\nEine Idee? Wir freuen uns darauf in <#oneri-ve-fikir>.\n\nViel Spaß!",
    es: "¡Te damos la bienvenida a la Comunidad Descall!\n\nEste es el servidor oficial de la comunidad de Descall. Aquí puedes conocer gente nueva, encontrar con quién charlar y jugar, y preguntarle al equipo cualquier cosa sobre Descall directamente.\n\nPara empezar:\n1. Lee y acepta <#kurallar>.\n2. Preséntate brevemente en <#tanisma>.\n3. Para charlar, ve a <#genel>; para jugar, a <#oyun>; y para pasar el rato por voz, entra en el <#lobi>.\n\n¿Tienes algún problema? Escribe en <#yardim>.\n¿Encontraste un error? Cuéntalo en <#hata-bildir>. A quien encuentra un error real le damos la insignia Bug Hunter.\n¿Tienes una idea? Te esperamos en <#oneri-ve-fikir>.\n\n¡Que disfrutes!",
    fr: "Bienvenue dans la Communauté Descall !\n\nC'est le serveur communautaire officiel de Descall. Tu peux y rencontrer de nouvelles personnes, trouver des amis pour discuter et jouer, et poser directement toutes tes questions sur Descall à l'équipe.\n\nPour commencer :\n1. Lis et accepte <#kurallar>.\n2. Présente-toi en quelques mots dans <#tanisma>.\n3. Pour discuter, c'est dans <#genel> ; pour jouer, dans <#oyun> ; et pour traîner en vocal, rejoins le <#lobi>.\n\nUn souci ? Écris dans <#yardim>.\nTu as trouvé un bug ? Signale-le dans <#hata-bildir>. Ceux qui trouvent un vrai bug reçoivent le badge Bug Hunter.\nUne idée ? On t'attend dans <#oneri-ve-fikir>.\n\nBonne discussion !",
    "pt-BR": "Boas-vindas à Comunidade Descall!\n\nEste é o servidor oficial da comunidade Descall. Aqui você pode conhecer gente nova, encontrar amigos para conversar e jogar e perguntar qualquer coisa sobre o Descall direto para a equipe.\n\nPara começar:\n1. Leia e aceite as <#kurallar>.\n2. Se apresente rapidinho em <#tanisma>.\n3. Para bater papo, vá para <#genel>; para jogar, <#oyun>; e para ficar no voice, entre no <#lobi>.\n\nAlgum problema? Escreva em <#yardim>.\nAchou um bug? Conte em <#hata-bildir>. Quem encontra um bug de verdade ganha o selo Bug Hunter.\nTem uma ideia? Estamos esperando em <#oneri-ve-fikir>.\n\nBoa conversa!",
    ru: "Добро пожаловать в Сообщество Descall!\n\nЭто официальный сервер сообщества Descall. Здесь можно познакомиться с новыми людьми, найти друзей для общения и игр и задать команде любой вопрос о Descall напрямую.\n\nС чего начать:\n1. Прочитай и прими <#kurallar>.\n2. Коротко расскажи о себе в <#tanisma>.\n3. Общайся в <#genel>, ищи напарников в <#oyun>, а поболтать голосом заходи в <#lobi>.\n\nЧто-то не работает? Пиши в <#yardim>.\nНашёл ошибку? Сообщи в <#hata-bildir>. Всем, кто находит настоящую ошибку, мы даём значок Bug Hunter.\nЕсть идея? Ждём её в <#oneri-ve-fikir>.\n\nПриятного общения!",
  },
  // #kurallar (pinned)
  "81d1ae52-594a-479a-a2b1-2a9a3fff5d2f": {
    channel: "kurallar",
    pinned: true,
    tr: "**Sunucu kuralları**\n\n1. Saygılı ol. Hakaret, taciz, nefret söylemi, ayrımcılık ve tehdit yasak.\n2. Spam, flood, reklam ve izinsiz davet bağlantısı paylaşma.\n3. +18, şiddet içeren veya rahatsız edici içerik paylaşma.\n4. Kişisel bilgileri (adres, telefon, şifre, fotoğraf) paylaşma, başkasınınkini hiç paylaşma.\n5. Doğru kanalı kullan: sorular <#yardim>, hatalar <#hata-bildir>, fikirler <#oneri-ve-fikir> kanalına.\n6. Ses odalarında müzik veya ses efektiyle başkalarını rahatsız etme.\n7. Descall Ekibi veya moderatör gibi davranma, kimseden şifre ya da kod isteme.\n8. Moderatörlerin uyarılarına uy. Bir karara itirazın varsa <#yardim> kanalına yaz.\n9. Descall Kullanım Koşulları burada da geçerlidir.\n\nKuralları ihlal edenler uyarılır, susturulur veya sunucudan uzaklaştırılır.",
    en: "**Server rules**\n\n1. Be respectful. Insults, harassment, hate speech, discrimination and threats are not allowed.\n2. No spam, flooding, advertising or unapproved invite links.\n3. Don't post adult (18+), violent or disturbing content.\n4. Don't share personal information (address, phone number, passwords, photos), and never share anyone else's.\n5. Use the right channel: questions go in <#yardim>, bugs in <#hata-bildir>, ideas in <#oneri-ve-fikir>.\n6. Don't disturb others in voice rooms with music or sound effects.\n7. Don't pretend to be the Descall Team or a moderator, and never ask anyone for passwords or codes.\n8. Follow the moderators' warnings. If you disagree with a decision, post in <#yardim>.\n9. The Descall Terms of Service apply here too.\n\nRule breakers get a warning, a mute or are removed from the server.",
    de: "**Serverregeln**\n\n1. Sei respektvoll. Beleidigungen, Belästigung, Hassrede, Diskriminierung und Drohungen sind verboten.\n2. Kein Spam, kein Flooding, keine Werbung und keine Einladungslinks ohne Erlaubnis.\n3. Teile keine Inhalte ab 18, keine Gewalt und nichts Verstörendes.\n4. Teile keine persönlichen Daten (Adresse, Telefonnummer, Passwörter, Fotos) und niemals die von anderen.\n5. Nutze den richtigen Kanal: Fragen in <#yardim>, Fehler in <#hata-bildir>, Ideen in <#oneri-ve-fikir>.\n6. Stör andere in den Sprachräumen nicht mit Musik oder Soundeffekten.\n7. Gib dich nicht als Descall-Team oder Moderator aus und frag niemanden nach Passwörtern oder Codes.\n8. Halte dich an die Hinweise der Moderatoren. Wenn du mit einer Entscheidung nicht einverstanden bist, schreib in <#yardim>.\n9. Die Nutzungsbedingungen von Descall gelten auch hier.\n\nWer gegen die Regeln verstößt, wird verwarnt, stummgeschaltet oder vom Server entfernt.",
    es: "**Reglas del servidor**\n\n1. Sé respetuoso. Están prohibidos los insultos, el acoso, el discurso de odio, la discriminación y las amenazas.\n2. Nada de spam, flood, publicidad ni enlaces de invitación sin permiso.\n3. No publiques contenido para mayores de 18, violento o perturbador.\n4. No compartas datos personales (dirección, teléfono, contraseñas, fotos) y nunca compartas los de otras personas.\n5. Usa el canal correcto: las preguntas van en <#yardim>, los errores en <#hata-bildir> y las ideas en <#oneri-ve-fikir>.\n6. No molestes a los demás en las salas de voz con música o efectos de sonido.\n7. No te hagas pasar por el equipo de Descall ni por un moderador, y nunca le pidas a nadie contraseñas ni códigos.\n8. Haz caso a los avisos de los moderadores. Si no estás de acuerdo con una decisión, escribe en <#yardim>.\n9. Los Términos de uso de Descall también se aplican aquí.\n\nQuien incumpla las reglas recibirá un aviso, será silenciado o expulsado del servidor.",
    fr: "**Règles du serveur**\n\n1. Sois respectueux. Insultes, harcèlement, discours haineux, discriminations et menaces sont interdits.\n2. Pas de spam, de flood, de pub ni de liens d'invitation non autorisés.\n3. Ne publie pas de contenu réservé aux adultes, violent ou choquant.\n4. Ne partage pas d'informations personnelles (adresse, téléphone, mots de passe, photos), et jamais celles des autres.\n5. Utilise le bon salon : les questions dans <#yardim>, les bugs dans <#hata-bildir>, les idées dans <#oneri-ve-fikir>.\n6. Ne dérange pas les autres dans les salons vocaux avec de la musique ou des effets sonores.\n7. Ne te fais pas passer pour l'équipe Descall ou un modérateur, et ne demande jamais de mot de passe ni de code à personne.\n8. Respecte les avertissements des modérateurs. Si tu contestes une décision, écris dans <#yardim>.\n9. Les conditions d'utilisation de Descall s'appliquent aussi ici.\n\nEn cas d'infraction : avertissement, mise en sourdine ou exclusion du serveur.",
    "pt-BR": "**Regras do servidor**\n\n1. Seja respeitoso. Ofensas, assédio, discurso de ódio, discriminação e ameaças são proibidos.\n2. Nada de spam, flood, propaganda ou links de convite sem autorização.\n3. Não poste conteúdo +18, violento ou perturbador.\n4. Não compartilhe dados pessoais (endereço, telefone, senhas, fotos) e nunca compartilhe os de outra pessoa.\n5. Use o canal certo: dúvidas em <#yardim>, bugs em <#hata-bildir> e ideias em <#oneri-ve-fikir>.\n6. Não atrapalhe ninguém nas salas de voz com música ou efeitos sonoros.\n7. Não finja ser da Equipe Descall ou moderador e nunca peça senha ou código a ninguém.\n8. Siga os avisos dos moderadores. Se discordar de uma decisão, escreva em <#yardim>.\n9. Os Termos de Uso do Descall também valem aqui.\n\nQuem desrespeitar as regras recebe um aviso, é silenciado ou removido do servidor.",
    ru: "**Правила сервера**\n\n1. Будь вежлив. Оскорбления, травля, язык вражды, дискриминация и угрозы запрещены.\n2. Никакого спама, флуда, рекламы и приглашений без разрешения.\n3. Не публикуй контент 18+, жестокость и шокирующие материалы.\n4. Не делись личными данными (адрес, телефон, пароли, фото) и никогда не публикуй чужие.\n5. Пиши в нужный канал: вопросы в <#yardim>, ошибки в <#hata-bildir>, идеи в <#oneri-ve-fikir>.\n6. Не мешай другим в голосовых комнатах музыкой или звуковыми эффектами.\n7. Не выдавай себя за команду Descall или модератора и никогда ни у кого не проси пароли или коды.\n8. Следуй предупреждениям модераторов. Если не согласен с решением, напиши в <#yardim>.\n9. Здесь тоже действуют Условия использования Descall.\n\nНарушителей ждёт предупреждение, отключение чата или удаление с сервера.",
  },
  // #duyurular (pinned)
  "b29422b8-e12d-4553-9e6a-79ab1d173e45": {
    channel: "duyurular",
    pinned: true,
    tr: "**Descall 4.2.0 yayında**\n\nYenilikler:\n- Uygulaması kapalı birini arayınca \"Bağlanıyor\"da takılan aramalar düzeldi. Arama sırasında ahizeye geçiş de artık çalışıyor.\n- iPhone'da küçültülen arama artık ekranın tepesinde küçük bir hap: hiçbir şeyin üstüne binmiyor, dokununca tam ekrana dönüyor.\n- Davet Merkezi: arkadaşlarını davet et, katıldıkça ödül ve özel kozmetik kazan.\n- Bir süredir görünmeyen arkadaşını tek dokunuşla geri çağır; dönerse ikiniz de DesCoin kazanırsınız.\n- Bildirim Merkezi: kimden ne zaman bildirim alacağını sen seç.\n- Bug Avcısı: geri bildirimde gerçek hata bulana rozet ve DesCoin.\n- iPad artık masaüstü düzeninde; mağaza setleri düzgün görünüyor.\n\nGüncellemek için: Windows ve masaüstü uygulaması kendiliğinden güncellenir. iPhone ve Android sürümleri yakında mağazalarda.",
    en: "**Descall 4.2.0 is out**\n\nWhat's new:\n- Calls to someone whose app was closed no longer get stuck on \"Connecting\". Switching to the earpiece during a call works now too.\n- On iPhone, a minimized call is now a small pill at the top of the screen: it never covers anything, and a tap brings it back to full screen.\n- Invite Center: invite your friends and earn rewards and exclusive cosmetics as they join.\n- Bring back a friend you haven't seen in a while with one tap; if they return, you both earn DesCoin.\n- Notification Center: you choose who notifies you and when.\n- Bug Hunter: find a real bug through feedback and get a badge and DesCoin.\n- iPad now uses the desktop layout, and shop sets display correctly.\n\nHow to update: the Windows and desktop apps update on their own. The iPhone and Android versions are coming to the stores soon.",
    de: "**Descall 4.2.0 ist da**\n\nNeu:\n- Anrufe bei jemandem, dessen App geschlossen war, bleiben nicht mehr bei „Verbinden“ hängen. Auch der Wechsel zur Hörmuschel während eines Anrufs klappt jetzt.\n- Auf dem iPhone ist ein minimierter Anruf jetzt eine kleine Pille oben am Bildschirm: Sie verdeckt nichts, und ein Tipp holt den Anruf zurück in den Vollbildmodus.\n- Einladungscenter: Lade Freunde ein und verdiene Belohnungen und exklusive Kosmetik, wenn sie beitreten.\n- Hol Freunde, die du länger nicht gesehen hast, mit einem Tipp zurück; kommen sie wieder, bekommt ihr beide DesCoin.\n- Benachrichtigungscenter: Du entscheidest, wer dich wann benachrichtigt.\n- Bug Hunter: Wer über das Feedback einen echten Fehler findet, bekommt ein Abzeichen und DesCoin.\n- Das iPad nutzt jetzt das Desktop-Layout, und Shop-Sets werden richtig angezeigt.\n\nSo aktualisierst du: Die Windows- und Desktop-App aktualisieren sich von selbst. Die Versionen für iPhone und Android kommen bald in die Stores.",
    es: "**Descall 4.2.0 ya está aquí**\n\nNovedades:\n- Las llamadas a alguien con la app cerrada ya no se quedan atascadas en \"Conectando\". Además, ya puedes cambiar al auricular durante una llamada.\n- En iPhone, una llamada minimizada ahora es una pequeña píldora en la parte superior de la pantalla: no tapa nada y, al tocarla, vuelve a pantalla completa.\n- Centro de invitaciones: invita a tus amigos y gana recompensas y cosméticos exclusivos a medida que se unan.\n- Recupera con un toque a un amigo que hace tiempo que no aparece; si vuelve, ambos ganan DesCoin.\n- Centro de notificaciones: tú eliges de quién y cuándo recibes notificaciones.\n- Bug Hunter: si encuentras un error real a través de los comentarios, te llevas una insignia y DesCoin.\n- El iPad ahora usa el diseño de escritorio y los sets de la tienda se ven bien.\n\nCómo actualizar: las apps de Windows y de escritorio se actualizan solas. Las versiones para iPhone y Android llegarán pronto a las tiendas.",
    fr: "**Descall 4.2.0 est disponible**\n\nNouveautés :\n- Les appels vers quelqu'un dont l'appli était fermée ne restent plus bloqués sur « Connexion ». Passer sur l'écouteur pendant un appel fonctionne aussi désormais.\n- Sur iPhone, un appel réduit devient une petite pastille en haut de l'écran : elle ne cache rien, et un toucher la remet en plein écran.\n- Centre d'invitations : invite tes amis et gagne des récompenses et des cosmétiques exclusifs à mesure qu'ils rejoignent.\n- Fais revenir en un geste un ami que tu n'as pas vu depuis longtemps ; s'il revient, vous gagnez tous les deux des DesCoin.\n- Centre de notifications : choisis qui peut te notifier et quand.\n- Bug Hunter : trouve un vrai bug via les retours et gagne un badge et des DesCoin.\n- L'iPad passe à la disposition bureau, et les packs de la boutique s'affichent correctement.\n\nPour mettre à jour : les applis Windows et bureau se mettent à jour toutes seules. Les versions iPhone et Android arrivent bientôt sur les stores.",
    "pt-BR": "**Descall 4.2.0 chegou**\n\nNovidades:\n- Ligações para alguém com o app fechado não ficam mais travadas em \"Conectando\". Trocar para o auricular durante a chamada também funciona agora.\n- No iPhone, uma chamada minimizada agora vira uma pequena pílula no topo da tela: não cobre nada e, com um toque, volta para a tela cheia.\n- Central de Convites: convide seus amigos e ganhe recompensas e cosméticos exclusivos conforme eles entram.\n- Chame de volta com um toque aquele amigo que sumiu faz tempo; se ele voltar, vocês dois ganham DesCoin.\n- Central de Notificações: você escolhe de quem e quando recebe notificações.\n- Bug Hunter: achou um bug de verdade pelo feedback? Ganha selo e DesCoin.\n- O iPad agora usa o layout de computador, e os conjuntos da loja aparecem certinho.\n\nComo atualizar: os apps para Windows e computador se atualizam sozinhos. As versões para iPhone e Android chegam em breve às lojas.",
    ru: "**Вышел Descall 4.2.0**\n\nЧто нового:\n- Звонки человеку с закрытым приложением больше не зависают на «Подключение». Переключение на разговорный динамик во время звонка теперь тоже работает.\n- На iPhone свёрнутый звонок теперь выглядит как небольшая плашка вверху экрана: она ничего не закрывает, а по нажатию звонок снова разворачивается на весь экран.\n- Центр приглашений: приглашай друзей и получай награды и эксклюзивную косметику, когда они присоединяются.\n- Верни друга, которого давно не было видно, одним нажатием: если он вернётся, вы оба получите DesCoin.\n- Центр уведомлений: ты сам выбираешь, от кого и когда получать уведомления.\n- Bug Hunter: найди настоящую ошибку через отзыв и получи значок и DesCoin.\n- На iPad теперь интерфейс как на компьютере, а наборы в магазине отображаются правильно.\n\nКак обновиться: приложения для Windows и компьютера обновляются сами. Версии для iPhone и Android скоро появятся в магазинах.",
  },
  // #descall-ipuclari
  "96103f26-5a8d-4117-82c5-ca7a967ef8fd": {
    channel: "descall-ipuclari",
    pinned: false,
    tr: "**Descall'u daha iyi kullanmak için 5 ipucu**\n\n1. Bir mesajı uzun bas (masaüstünde sağ tıkla) ve \"İlet\" ile birden fazla sohbete aynı anda gönder.\n2. Mesajı hemen göndermek istemiyorsan zamanla: \"Yarın sabah\" gibi seçenekler var.\n3. Ctrl + / ile bütün klavye kısayollarını gör.\n4. Ayarlar > Bildirimler'den yalnızca @bahsetmelerde bildirim almayı seçebilirsin.\n5. Ekranını 1080p'de ücretsiz paylaşabilirsin.",
    en: "**5 tips to get more out of Descall**\n\n1. Long-press a message (right-click on desktop) and use \"Forward\" to send it to several chats at once.\n2. Don't want to send a message right away? Schedule it, with options like \"Tomorrow morning\".\n3. Press Ctrl + / to see every keyboard shortcut.\n4. In Settings > Notifications you can choose to be notified only for @mentions.\n5. You can share your screen in 1080p for free.",
    de: "**5 Tipps, um mehr aus Descall herauszuholen**\n\n1. Halte eine Nachricht gedrückt (am Computer Rechtsklick) und schick sie mit „Weiterleiten“ an mehrere Chats gleichzeitig.\n2. Du willst eine Nachricht nicht sofort senden? Plane sie, zum Beispiel für „Morgen früh“.\n3. Mit Strg + / siehst du alle Tastenkürzel.\n4. Unter Einstellungen > Benachrichtigungen kannst du festlegen, dass du nur bei @Erwähnungen benachrichtigt wirst.\n5. Du kannst deinen Bildschirm kostenlos in 1080p teilen.",
    es: "**5 consejos para sacarle más partido a Descall**\n\n1. Mantén pulsado un mensaje (clic derecho en el escritorio) y usa \"Reenviar\" para mandarlo a varios chats a la vez.\n2. ¿No quieres enviar un mensaje ahora mismo? Prográmalo: hay opciones como \"Mañana por la mañana\".\n3. Pulsa Ctrl + / para ver todos los atajos de teclado.\n4. En Ajustes > Notificaciones puedes elegir recibir avisos solo cuando te @mencionen.\n5. Puedes compartir tu pantalla en 1080p gratis.",
    fr: "**5 astuces pour profiter au mieux de Descall**\n\n1. Appuie longuement sur un message (clic droit sur ordinateur) et utilise « Transférer » pour l'envoyer à plusieurs discussions d'un coup.\n2. Tu ne veux pas envoyer un message tout de suite ? Programme-le, avec des choix comme « Demain matin ».\n3. Appuie sur Ctrl + / pour voir tous les raccourcis clavier.\n4. Dans Paramètres > Notifications, tu peux choisir de n'être notifié que pour les @mentions.\n5. Tu peux partager ton écran en 1080p gratuitement.",
    "pt-BR": "**5 dicas para aproveitar melhor o Descall**\n\n1. Toque e segure uma mensagem (no computador, clique com o botão direito) e use \"Encaminhar\" para mandar para várias conversas ao mesmo tempo.\n2. Não quer enviar a mensagem agora? Agende: tem opções como \"Amanhã de manhã\".\n3. Aperte Ctrl + / para ver todos os atalhos de teclado.\n4. Em Configurações > Notificações, você pode escolher receber notificação só quando te @mencionarem.\n5. Dá para compartilhar a tela em 1080p de graça.",
    ru: "**5 советов, как пользоваться Descall удобнее**\n\n1. Зажми сообщение (на компьютере нажми правой кнопкой) и выбери «Переслать», чтобы отправить его сразу в несколько чатов.\n2. Не хочешь отправлять сообщение прямо сейчас? Запланируй его: есть варианты вроде «Завтра утром».\n3. Нажми Ctrl + /, чтобы увидеть все горячие клавиши.\n4. В разделе Настройки > Уведомления можно включить уведомления только об @упоминаниях.\n5. Демонстрировать экран в 1080p можно бесплатно.",
  },
  // #tanisma
  "722be690-0077-4616-ad6a-c8dd083a9367": {
    channel: "tanisma",
    pinned: false,
    tr: "Hadi tanışalım! Kendini birkaç cümleyle tanıt:\n- Adın ya da takma adın\n- Nerelisin\n- En çok ne oynuyorsun / izliyorsun / dinliyorsun\n- Descall'u nereden duydun\n\nİlk ben başlayayım: Ben Demir, Descall'u yapan ekipteyim. Burada hepinizle tanışmak ve uygulamayı birlikte geliştirmek için varım.",
    en: "Let's get to know each other! Introduce yourself in a few sentences:\n- Your name or nickname\n- Where you're from\n- What you play / watch / listen to the most\n- How you heard about Descall\n\nI'll go first: I'm Demir, and I'm on the team that builds Descall. I'm here to meet all of you and to make the app better together.",
    de: "Lernen wir uns kennen! Stell dich in ein paar Sätzen vor:\n- Dein Name oder Spitzname\n- Woher du kommst\n- Was du am meisten spielst / schaust / hörst\n- Wie du von Descall erfahren hast\n\nIch fang an: Ich bin Demir und gehöre zum Team, das Descall entwickelt. Ich bin hier, um euch alle kennenzulernen und die App gemeinsam besser zu machen.",
    es: "¡Vamos a conocernos! Preséntate en unas pocas frases:\n- Tu nombre o apodo\n- De dónde eres\n- Qué es lo que más juegas / ves / escuchas\n- Cómo te enteraste de Descall\n\nEmpiezo yo: soy Demir y formo parte del equipo que hace Descall. Estoy aquí para conocer a todo el mundo y mejorar la app entre todos.",
    fr: "Faisons connaissance ! Présente-toi en quelques phrases :\n- Ton prénom ou ton pseudo\n- D'où tu viens\n- Ce à quoi tu joues / ce que tu regardes / ce que tu écoutes le plus\n- Comment tu as connu Descall\n\nJe commence : je suis Demir, je fais partie de l'équipe qui développe Descall. Je suis là pour vous rencontrer et améliorer l'appli avec vous.",
    "pt-BR": "Bora se conhecer! Se apresente em poucas frases:\n- Seu nome ou apelido\n- De onde você é\n- O que você mais joga / assiste / ouve\n- Como ficou sabendo do Descall\n\nEu começo: sou o Demir e faço parte da equipe que cria o Descall. Estou aqui para conhecer todo mundo e melhorar o app junto com vocês.",
    ru: "Давайте знакомиться! Расскажи о себе в паре предложений:\n- Имя или ник\n- Откуда ты\n- Во что больше всего играешь / что смотришь / что слушаешь\n- Как узнал о Descall\n\nНачну с себя: я Демир, я из команды, которая делает Descall. Я здесь, чтобы познакомиться со всеми вами и вместе сделать приложение лучше.",
  },
  // #genel
  "f7abbf08-668f-4201-b7b0-96aa1ab75f6a": {
    channel: "genel",
    pinned: false,
    tr: "Hoş geldiniz! Bugün ne yapıyorsunuz, ne oynuyorsunuz? <#lobi> ses odası her zaman açık, gelin takılalım.",
    en: "Welcome, everyone! What are you up to today, what are you playing? The <#lobi> voice room is always open, come hang out.",
    de: "Willkommen zusammen! Was macht ihr heute, was zockt ihr gerade? Der Sprachraum <#lobi> ist immer offen, kommt vorbei.",
    es: "¡Hola a todos y bienvenidos! ¿Qué están haciendo hoy, a qué están jugando? La sala de voz <#lobi> siempre está abierta, vengan a pasar el rato.",
    fr: "Bienvenue à tous ! Vous faites quoi aujourd'hui, vous jouez à quoi ? Le salon vocal <#lobi> est toujours ouvert, venez traîner avec nous.",
    "pt-BR": "Sejam bem-vindos! O que vocês estão fazendo hoje, estão jogando o quê? A sala de voz <#lobi> está sempre aberta, cola com a gente.",
    ru: "Добро пожаловать! Чем занимаетесь сегодня, во что играете? Голосовая комната <#lobi> всегда открыта, заходите пообщаться.",
  },
};

/** "<#slug>" -> "<#channel-id>" (the stored form). Throws on an unknown slug. */
function toStored(text) {
  return String(text).replace(/<#([^>\s]+)>/g, (_, slug) => {
    const id = CHANNELS[slug];
    if (!id) throw new Error(`unknown channel slug in mention: ${slug}`);
    return `<#${id}>`;
  });
}

/**
 * Every translation row of the seed:
 * { kind, refId, locale, text } with mentions in the stored form.
 */
function seedRows() {
  const rows = [];
  for (const locale of LOCALES) {
    rows.push({ kind: "server_name", refId: SERVER_ID, locale, text: SERVER.name[locale] });
    rows.push({ kind: "server_description", refId: SERVER_ID, locale, text: SERVER.description[locale] });
    for (const [slug, names] of Object.entries(CHANNEL_NAMES)) {
      rows.push({ kind: "channel_name", refId: CHANNELS[slug], locale, text: names[locale] });
    }
    for (const [slug, topics] of Object.entries(CHANNEL_TOPICS)) {
      rows.push({ kind: "channel_topic", refId: CHANNELS[slug], locale, text: toStored(topics[locale]) });
    }
    for (const [id, msg] of Object.entries(MESSAGES)) {
      rows.push({ kind: "message", refId: id, locale, text: toStored(msg[locale]) });
    }
  }
  return rows;
}

module.exports = {
  SERVER_ID,
  SOURCE_LOCALE,
  LOCALES,
  CHANNELS,
  SERVER,
  CHANNEL_NAMES,
  CHANNEL_TOPICS,
  MESSAGES,
  toStored,
  seedRows,
};
