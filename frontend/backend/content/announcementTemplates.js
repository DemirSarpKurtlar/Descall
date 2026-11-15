"use strict";

/**
 * Duyurular built-in templates: title, text and button in the 7 app languages,
 * with typed variables ({date}, {start}, {affected}...) rendered per language by
 * lib/announcements/model.js fillTemplate. Content for members, not API messages.
 */

const COLORS = Object.freeze({ blue: "#587af5", amber: "#f2a93b", red: "#f23f43", green: "#34c77b", violet: "#9b5de5", teal: "#22c3a6" });

const T = (tr, en, de, es, fr, pt, ru) => ({ tr, en, de, es, fr, "pt-BR": pt, ru });

const AFFECTED = {
  voice_screen: T("Sesli kanallar ve ekran paylaşımı", "Voice channels and screen sharing", "Sprachkanälen und Bildschirmfreigabe", "los canales de voz y la pantalla compartida", "les salons vocaux et le partage d'écran", "canais de voz e compartilhamento de tela", "голосовые каналы и демонстрация экрана"),
  messaging: T("Mesajlaşma", "Messaging", "Nachrichten", "los mensajes", "la messagerie", "mensagens", "сообщения"),
  whole_app: T("Uygulamanın tamamı", "The whole app", "der gesamten App", "toda la aplicación", "toute l'application", "todo o aplicativo", "всё приложение"),
  login: T("Giriş ve kayıt", "Signing in and signing up", "der Anmeldung und Registrierung", "el inicio de sesión y el registro", "la connexion et l'inscription", "login e cadastro", "вход и регистрация"),
};
const THREATS = {
  fake_premium: T("sahte \"ücretsiz Descall+\" mesajları", "fake \"free Descall+\" messages", "gefälschte „kostenloses Descall+“-Nachrichten", "mensajes falsos de \"Descall+ gratis\"", "faux messages « Descall+ gratuit »", "mensagens falsas de \"Descall+ grátis\"", "поддельные сообщения о «бесплатном Descall+»"),
  phishing: T("oltalama bağlantıları", "phishing links", "Phishing-Links", "enlaces de phishing", "liens d'hameçonnage", "links de phishing", "фишинговые ссылки"),
  fake_staff: T("Descall ekibi gibi davranan hesaplar", "accounts pretending to be the Descall team", "Konten, die sich als Descall-Team ausgeben", "cuentas que se hacen pasar por el equipo de Descall", "comptes qui se font passer pour l'équipe Descall", "contas que fingem ser a equipe do Descall", "аккаунты, выдающие себя за команду Descall"),
  account_trade: T("hesap satın alma ve satma teklifleri", "offers to buy or sell accounts", "Angebote zum Kauf oder Verkauf von Konten", "ofertas para comprar o vender cuentas", "offres d'achat ou de vente de comptes", "ofertas de compra ou venda de contas", "предложения купить или продать аккаунт"),
};
const PLANS = {
  yearly: T("yıllık", "yearly", "Jahres", "anual", "annuel", "anual", "годовой"),
  monthly: T("aylık", "monthly", "Monats", "mensual", "mensuel", "mensal", "месячный"),
};

const BUILTIN_TEMPLATES = Object.freeze([
  {
    key: "b:maintenance",
    category: "maintenance",
    icon: "wrench",
    color: COLORS.amber,
    priority: "important",
    ctaUrl: "/status",
    vars: [
      { id: "date", type: "date" },
      { id: "start", type: "time", default: "03:00" },
      { id: "end", type: "time", default: "04:00" },
      { id: "duration", type: "duration", default: 60, from: ["start", "end"] },
      { id: "affected", type: "choice", options: AFFECTED, default: "voice_screen" },
    ],
    text: {
      tr: { name: "Planlı bakım", title: "Planlı bakım: {date} {start}-{end}", content: "{affected} yaklaşık {duration} kesintili çalışacak. Mesajların kaybolmaz, bakım bitince her şey kendiliğinden geri gelir.", cta: "Durum sayfası" },
      en: { name: "Scheduled maintenance", title: "Scheduled maintenance: {date}, {start}-{end}", content: "{affected} may be interrupted for about {duration}. Your messages are safe, and everything comes back on its own when the work is done.", cta: "Status page" },
      de: { name: "Geplante Wartung", title: "Geplante Wartung: {date}, {start}-{end}", content: "Bei {affected} kann es etwa {duration} lang zu Unterbrechungen kommen. Deine Nachrichten gehen nicht verloren, danach läuft alles von selbst wieder.", cta: "Statusseite" },
      es: { name: "Mantenimiento programado", title: "Mantenimiento programado: {date}, {start}-{end}", content: "Puede haber cortes en {affected} durante aproximadamente {duration}. Tus mensajes no se pierden y todo volverá a funcionar solo al terminar.", cta: "Página de estado" },
      fr: { name: "Maintenance planifiée", title: "Maintenance planifiée : {date}, {start}-{end}", content: "Des interruptions sont possibles sur {affected} pendant environ {duration}. Vos messages ne seront pas perdus ; tout reviendra automatiquement à la fin de la maintenance.", cta: "Page d'état" },
      "pt-BR": { name: "Manutenção programada", title: "Manutenção programada: {date}, {start}-{end}", content: "Pode haver interrupções em {affected} por cerca de {duration}. Suas mensagens não serão perdidas e tudo volta sozinho ao fim da manutenção.", cta: "Página de status" },
      ru: { name: "Плановые работы", title: "Плановые технические работы: {date}, {start}-{end}", content: "Возможны перебои в работе: {affected}, примерно {duration}. Ваши сообщения не пропадут, после работ всё восстановится автоматически.", cta: "Страница статуса" },
    },
  },
  {
    key: "b:feature",
    category: "feature",
    icon: "party",
    color: COLORS.blue,
    priority: "normal",
    ctaUrl: "/settings",
    vars: [
      { id: "feature", type: "text", default: "" },
      { id: "details", type: "text", default: "" },
      { id: "place", type: "text", default: "" },
    ],
    text: {
      tr: { name: "Yeni özellik", title: "Yeni: {feature}", content: "{details} Denemek için: {place}.", cta: "Hemen dene" },
      en: { name: "New feature", title: "New: {feature}", content: "{details} To try it: {place}.", cta: "Try it now" },
      de: { name: "Neue Funktion", title: "Neu: {feature}", content: "{details} So probierst du es aus: {place}.", cta: "Jetzt ausprobieren" },
      es: { name: "Nueva función", title: "Nuevo: {feature}", content: "{details} Para probarlo: {place}.", cta: "Probar ahora" },
      fr: { name: "Nouvelle fonctionnalité", title: "Nouveau : {feature}", content: "{details} Pour l'essayer : {place}.", cta: "Essayer" },
      "pt-BR": { name: "Novo recurso", title: "Novidade: {feature}", content: "{details} Para testar: {place}.", cta: "Testar agora" },
      ru: { name: "Новая функция", title: "Новое: {feature}", content: "{details} Где попробовать: {place}.", cta: "Попробовать" },
    },
  },
  {
    key: "b:event",
    category: "event",
    icon: "calendar",
    color: COLORS.violet,
    priority: "normal",
    ctaUrl: "/servers",
    vars: [
      { id: "event", type: "text", default: "" },
      { id: "date", type: "date" },
      { id: "time", type: "time", default: "20:00" },
      { id: "details", type: "text", default: "" },
    ],
    text: {
      tr: { name: "Etkinlik daveti", title: "{event}: {date} {time}", content: "{details} {date} günü saat {time} buluşuyoruz, sen de gel.", cta: "Katıl" },
      en: { name: "Event invite", title: "{event}: {date}, {time}", content: "{details} We meet on {date} at {time}. Join us.", cta: "Join" },
      de: { name: "Event-Einladung", title: "{event}: {date}, {time}", content: "{details} Wir treffen uns am {date} um {time}. Sei dabei.", cta: "Mitmachen" },
      es: { name: "Invitación a evento", title: "{event}: {date}, {time}", content: "{details} Nos vemos el {date} a las {time}. Únete.", cta: "Unirme" },
      fr: { name: "Invitation à un événement", title: "{event} : {date}, {time}", content: "{details} Rendez-vous le {date} à {time}. Rejoignez-nous.", cta: "Participer" },
      "pt-BR": { name: "Convite para evento", title: "{event}: {date}, {time}", content: "{details} Nos vemos em {date}, às {time}. Participe.", cta: "Participar" },
      ru: { name: "Приглашение на событие", title: "{event}: {date}, {time}", content: "{details} Встречаемся {date} в {time}. Присоединяйтесь.", cta: "Участвовать" },
    },
  },
  {
    key: "b:security",
    category: "security",
    icon: "siren",
    color: COLORS.red,
    priority: "urgent",
    ctaUrl: "/security",
    vars: [
      { id: "threat", type: "choice", options: THREATS, default: "fake_premium" },
      { id: "extra", type: "text", default: "", optional: true },
    ],
    text: {
      tr: { name: "Güvenlik uyarısı", title: "Dikkat: {threat}", content: "Descall ekibi senden asla şifre ya da doğrulama kodu istemez. Şüpheli bir mesaj alırsan bağlantıya tıklama ve kişiyi şikayet et. {extra}", cta: "Nasıl korunurum?" },
      en: { name: "Security warning", title: "Watch out: {threat}", content: "The Descall team will never ask for your password or a verification code. If you get a suspicious message, do not open the link and report the person. {extra}", cta: "How do I stay safe?" },
      de: { name: "Sicherheitswarnung", title: "Achtung: {threat}", content: "Das Descall-Team fragt dich nie nach deinem Passwort oder einem Bestätigungscode. Wenn du eine verdächtige Nachricht bekommst, öffne den Link nicht und melde die Person. {extra}", cta: "Wie schütze ich mich?" },
      es: { name: "Aviso de seguridad", title: "Cuidado: {threat}", content: "El equipo de Descall nunca te pedirá tu contraseña ni un código de verificación. Si recibes un mensaje sospechoso, no abras el enlace y denuncia a la persona. {extra}", cta: "¿Cómo me protejo?" },
      fr: { name: "Alerte de sécurité", title: "Attention : {threat}", content: "L'équipe Descall ne vous demandera jamais votre mot de passe ni un code de vérification. Si vous recevez un message suspect, n'ouvrez pas le lien et signalez la personne. {extra}", cta: "Comment me protéger ?" },
      "pt-BR": { name: "Alerta de segurança", title: "Atenção: {threat}", content: "A equipe do Descall nunca pede sua senha nem um código de verificação. Se receber uma mensagem suspeita, não abra o link e denuncie a pessoa. {extra}", cta: "Como me proteger?" },
      ru: { name: "Предупреждение безопасности", title: "Осторожно: {threat}", content: "Команда Descall никогда не просит ваш пароль или код подтверждения. Если пришло подозрительное сообщение, не открывайте ссылку и пожалуйтесь на отправителя. {extra}", cta: "Как защититься?" },
    },
  },
  {
    key: "b:campaign",
    category: "campaign",
    icon: "star",
    color: COLORS.violet,
    priority: "normal",
    ctaUrl: "/settings/premium",
    vars: [
      { id: "plan", type: "choice", options: PLANS, default: "yearly" },
      { id: "discount", type: "percent", default: 30 },
      { id: "until", type: "date" },
    ],
    text: {
      tr: { name: "Descall+ kampanyası", title: "Descall+ kampanyası: {plan} planda {discount} indirim", content: "{until} tarihine kadar {plan} Descall+ planı {discount} indirimli. Hediye olarak da gönderebilirsin.", cta: "Planları gör" },
      en: { name: "Descall+ offer", title: "Descall+ offer: {discount} off the {plan} plan", content: "Until {until}, the {plan} Descall+ plan is {discount} off. You can send it as a gift too.", cta: "See plans" },
      de: { name: "Descall+ Aktion", title: "Descall+ Aktion: {discount} Rabatt auf das {plan}abo", content: "Bis zum {until} gibt es {discount} Rabatt auf das {plan}abo von Descall+. Du kannst es auch verschenken.", cta: "Abos ansehen" },
      es: { name: "Oferta de Descall+", title: "Oferta de Descall+: {discount} de descuento en el plan {plan}", content: "Hasta el {until}, el plan {plan} de Descall+ tiene un {discount} de descuento. También puedes regalarlo.", cta: "Ver planes" },
      fr: { name: "Offre Descall+", title: "Offre Descall+ : {discount} de réduction sur l'abonnement {plan}", content: "Jusqu'au {until}, l'abonnement {plan} Descall+ est à {discount} de réduction. Vous pouvez aussi l'offrir.", cta: "Voir les offres" },
      "pt-BR": { name: "Oferta Descall+", title: "Oferta Descall+: {discount} de desconto no plano {plan}", content: "Até {until}, o plano {plan} do Descall+ está com {discount} de desconto. Você também pode dar de presente.", cta: "Ver planos" },
      ru: { name: "Акция Descall+", title: "Акция Descall+: скидка {discount} на {plan} план", content: "До {until} {plan} план Descall+ со скидкой {discount}. Его можно подарить.", cta: "Смотреть планы" },
    },
  },
  {
    key: "b:rules",
    category: "rules",
    icon: "check",
    color: COLORS.green,
    priority: "normal",
    ctaUrl: "/terms",
    vars: [
      { id: "effective", type: "date" },
      { id: "changes", type: "text", default: "", optional: true },
    ],
    text: {
      tr: { name: "Kural güncellemesi", title: "Topluluk kuralları güncellendi", content: "{changes} Değişiklikler {effective} tarihinde yürürlüğe girer.", cta: "Kuralları oku" },
      en: { name: "Rules update", title: "Community rules updated", content: "{changes} The changes take effect on {effective}.", cta: "Read the rules" },
      de: { name: "Regel-Update", title: "Community-Regeln aktualisiert", content: "{changes} Die Änderungen gelten ab dem {effective}.", cta: "Regeln lesen" },
      es: { name: "Cambio de normas", title: "Normas de la comunidad actualizadas", content: "{changes} Los cambios entran en vigor el {effective}.", cta: "Leer las normas" },
      fr: { name: "Mise à jour des règles", title: "Règles de la communauté mises à jour", content: "{changes} Les changements s'appliquent à partir du {effective}.", cta: "Lire les règles" },
      "pt-BR": { name: "Atualização das regras", title: "Regras da comunidade atualizadas", content: "{changes} As mudanças passam a valer em {effective}.", cta: "Ler as regras" },
      ru: { name: "Обновление правил", title: "Правила сообщества обновлены", content: "{changes} Изменения вступают в силу {effective}.", cta: "Читать правила" },
    },
  },
]);


module.exports = { BUILTIN_TEMPLATES, AFFECTED, THREATS, PLANS };
