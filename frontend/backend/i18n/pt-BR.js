"use strict";

/**
 * Brazilian Portuguese server-side catalog. Same key tree and {placeholders} as en.js
 * (backend/i18n/backendI18n.selftest.cjs). Addresses the user as "você".
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} é o seu código de verificação do Descall",
      eyebrow: "Verificação de e-mail",
      title: "Boas-vindas ao Descall, {name}!",
      titleNoName: "Boas-vindas ao Descall!",
      intro: "Sua conta está pronta. Falta só um passo: digite o código abaixo no app para verificar seu endereço de e-mail.",
      preheader: "Seu código: {code} · válido por {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Se você não criou esta conta, pode ignorar este e-mail. O endereço não fica vinculado a nenhuma conta até ser verificado.",
    },
    email_verify: {
      subject: "{code} é o seu código de verificação do Descall",
      eyebrow: "Verificação de e-mail",
      title: "Verifique seu endereço de e-mail",
      intro: "Digite o código abaixo no app para adicionar este endereço de e-mail à sua conta do Descall.",
      preheader: "Seu código: {code} · válido por {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Se você não fez este pedido, pode ignorar este e-mail. Seu endereço não será adicionado a nenhuma conta.",
    },
    "2fa_login": {
      subject: "{code} é o seu código de login do Descall",
      eyebrow: "Código de login",
      codeLabel: "Seu código de login",
      title: "Termine de entrar",
      intro: "Digite este código no Descall para entrar na sua conta.",
      preheader: "Seu código de login: {code} · válido por {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Se não foi você, alguém pode saber sua senha. Troque-a agora e ative o app autenticador em Configurações › Segurança.",
    },
    email_reauth: {
      subject: "{code} é o seu código de confirmação do Descall",
      eyebrow: "Segurança da conta",
      codeLabel: "Seu código de confirmação",
      title: "É você?",
      intro: "Digite este código para alterar o endereço de e-mail da sua conta.",
      preheader: "Seu código de confirmação: {code} · válido por {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Se você não pediu isso, não compartilhe o código e troque sua senha. O endereço não pode ser alterado sem ele.",
    },
    password_reset: {
      subject: "{code} é o seu código de redefinição de senha do Descall",
      eyebrow: "Redefinição de senha",
      codeLabel: "Seu código de redefinição",
      title: "Redefina sua senha",
      intro: "Digite este código no Descall para escolher uma nova senha.",
      preheader: "Seu código de redefinição: {code} · válido por {minutes, plural, one {# minuto} other {# minutos}}",
      ignore: "Se você não pediu para redefinir sua senha, pode ignorar este e-mail; sua senha continua a mesma.",
    },
    common: {
      hi: "Olá, {name},",
      codeLabel: "Seu código",
      valid: "Válido por {minutes, plural, one {# minuto} other {# minutos}}",
      copyHint: "Você pode selecionar e copiar o código.",
      never: "A equipe do Descall nunca vai pedir seu código. Não o compartilhe com ninguém.",
      nextTitle: "E agora?",
      step1Title: "Adicione seus amigos",
      step1Body: "Encontre-os pelo nome de usuário ou compartilhe seu link de convite.",
      step2Title: "Entre em um servidor",
      step2Body: "Entre em uma comunidade ou crie a sua em segundos.",
      step3Title: "Comece a conversar",
      step3Body: "Mande mensagens, faça chamadas de voz e de vídeo, compartilhe sua tela.",
      getApp: "O Descall vai aonde você for",
      appWin: "Baixar para Windows",
      appIos: "Baixar na App Store",
      appWeb: "Abrir no navegador",
      help: "Precisa de ajuda?",
      write: "Escreva para nós:",
      privacy: "Privacidade",
      terms: "Termos",
      why: "Você recebeu este e-mail por causa de uma ação na sua conta do Descall.",
      privacyPath: "/privacy",
      termsPath: "/terms",
      downloadPath: "/download",
      textCode: "Seu código",
      textValid: "Válido por {minutes, plural, one {# minuto} other {# minutos}}.",
    },
  },

  marketing: {
    subject: "Confirme as novidades do Descall",
    text: "Abra este link para confirmar que quer receber as novidades do produto do Descall. Se você não confirmar, não vamos enviar e-mails para você.",
    htmlLead: "Abra o link abaixo para confirmar que quer receber as novidades do produto do Descall. Se você não confirmar, não vamos enviar e-mails para você.",
    confirmLabel: "Confirmar inscrição",
    pageConfirm: "Inscrição confirmada. Você pode cancelar a qualquer momento.",
    pageGone: "Este link é inválido ou já foi usado.",
    pageUnsub: "Sua inscrição foi cancelada. Não vamos mais enviar e-mails sobre o produto.",
    unsubscribeAnyTime: "Cancele a inscrição quando quiser:",
    goToSite: "Ir para descall.com",
  },

  push: {
    someone: "Alguém",
    newMessage: "Nova mensagem",
    voice: "🎤 Mensagem de voz",
    media: "📎 Enviou um anexo",
    photo: "📷 Foto",
    video: "🎬 Vídeo",
    group: "Grupo",
    mentioned: "{from} mencionou você",
    mentionedShort: "Mencionou você",
    friendTitle: "Pedido de amizade",
    friendBody: "{from} quer adicionar você como amigo",
    calling: "{from} está ligando",
    voiceCall: "Chamada de voz",
    videoCall: "Chamada de vídeo",
    groupCallTitle: "{groupName} — Chamada em grupo",
    groupCallBody: "{from} iniciou uma chamada em grupo",
    ownerTitle: "Posse do servidor",
    ownerBody: "Agora o servidor {serverName} é seu",
    ownerServerFallback: "o servidor",
    feedbackTitle: "A equipe do Descall respondeu",
    feedbackBody: "Seu feedback recebeu uma resposta",
    antibotTitle: "Alerta antibot",
    antibotBody: "{count, plural, one {# conta ultrapassou} other {# contas ultrapassaram}} o limite de risco (máximo {topScore})",
    antibotWatchBody: "{count, plural, one {# novo alerta da lista de observação} other {# novos alertas da lista de observação}}",
    voicePlain: "Mensagem de voz",
    attachmentPlain: "Enviou um anexo",
    incomingCall: "Chamada recebida",
    incomingCallBody: "Alguém está ligando para você no Descall",
    missedCallFrom: "Chamada perdida: {name}",
    answeredElsewhere: "A chamada foi atendida em outro dispositivo.",
    declinedElsewhere: "A chamada foi recusada em outro dispositivo.",
    missedCallBody: "Você perdeu a chamada.",
    groupCall: "Chamada em grupo",
    groupCallDefaultBody: "Alguém iniciou uma chamada em grupo no Descall",
    groupCallJoinVoice: "Entre na chamada de voz do seu grupo.",
    groupCallJoinVideo: "Entre na chamada de vídeo do seu grupo.",
    messageRequestTitle: "Pedido de mensagem",
    messageRequestBody: "{from} enviou um pedido de mensagem para você",
  },

  maintenance: {
    emergencyTitle: "Manutenção de emergência",
    plannedTitle: "Manutenção programada",
  },

  starter: {
    textCategory: "Canais de texto",
    text: "geral",
    voiceCategory: "Canais de voz",
    voice: "Lobby",
  },

  security: {
    passwordChangedSubject: "Sua senha do Descall foi alterada",
    passwordChangedBody: "A senha da sua conta do Descall acabou de ser alterada. Se não foi você, entre em contato com o suporte.",
    emailChangeSubject: "Alteração de e-mail no Descall",
    emailChangeBody: "Há um pedido para alterar o endereço de e-mail da sua conta do Descall. Se não foi você, troque sua senha agora e entre em contato com o suporte.",
  },

  dataExport: {
    note: "Uma cópia dos dados pessoais que o Descall mantém sobre esta conta (GDPR art. 15). As mensagens que você enviou estão incluídas; as mensagens que outras pessoas enviaram para você são dados delas e não estão. Senhas, segredos de dois fatores, chaves de sessão e de push ficam de fora por segurança. Os registros de prevenção a fraudes e abusos não são divulgados para que não possam ser burlados. Quem denunciou você não é mostrado.",
    filePrefix: "descall-meus-dados",
    accountFallback: "conta",
  },

  watch: {
    photo: "Foto",
    gif: "GIF",
    video: "Vídeo",
    voice: "Mensagem de voz",
    file: "Arquivo",
    poll: "Enquete",
    call: "Chamada",
  },

  stats: {
    weekOf: "Semana de {date}",
    sourceDirect: "Direto",
    sourceGoogleOrganic: "Google (orgânico)",
    sourceReferral: "Convite de amigo",
    other: "Outro",
    unknown: "Desconhecido",
    csvPeriod: "periodo",
    csvSignups: "cadastros",
    csvAverage: "media",
    csvFilePrefix: "estatisticas-de-cadastro",
  },

  // Server templates (lib/serverTemplates.js): written into the database in the creator's language.
  templates: {
    gaming: {
      name: "Central de jogos",
      description: "Layout pronto para equipes, com canal para formar equipe, chats de jogos, clipes, operações da equipe e lobbies de voz para ranqueadas.",
      descriptionSeed: "Uma comunidade de games: encontre parceiros de time, poste clipes e entre na voz.",
      rulesText: "1) Seja respeitoso.\n2) Nada de ódio, spam ou NSFW fora dos canais marcados.\n3) Deixe claros os posts para formar equipe (jogo + rank + região).\n4) As decisões da equipe são finais.\n5) Divirta-se e jogue limpo.",
      highlights: ["Canal para formar equipe", "Canal de clipes", "Cargos da equipe", "Voz do lobby"],
      roles: ["Admin", "Moderador", "Ajudante", "VIP", "Membro"],
      categories: [
        {
          name: "Boas-vindas",
          channels: [
            { name: "avisos", topic: "Notícias oficiais do servidor e notas de atualização. Somente leitura para membros." },
            { name: "regras", topic: "Regras do servidor: aceite antes de conversar nos canais da comunidade." },
            { name: "apresentacoes", topic: "Dê um oi: jogo, rank, região e o que você joga." },
          ],
        },
        {
          name: "Comunidade",
          channels: [
            { name: "geral", topic: "O ponto de encontro principal para qualquer assunto de games." },
            { name: "formar-equipe", topic: "Posts para formar equipe: jogo · rank · região · microfone sim/não." },
            { name: "clipes-e-destaques", topic: "Poste seus melhores clipes e capturas de tela." },
            { name: "memes", topic: "Mantenha o clima leve. Nada de assédio." },
          ],
        },
        {
          name: "Lobbies de voz",
          channels: [
            { name: "Lobby" },
            { name: "Fila em Dupla" },
            { name: "Time de Cinco" },
            { name: "AFK / De Boa" },
            { name: "Palco do Torneio", topic: "Watch parties e briefings de torneios." },
          ],
        },
        {
          name: "Equipe",
          channels: [
            { name: "chat-da-equipe", topic: "Coordenação privada da equipe." },
            { name: "logs-da-moderacao", topic: "Notas de moderação e registro de casos." },
            { name: "Voz da Equipe" },
          ],
        },
      ],
    },
    friends: {
      name: "Encontro de amigos",
      description: "Configuração aconchegante de grupo privado: chat de bate-papo, planos, noites de música e salas de voz sempre ativas.",
      descriptionSeed: "Um espaço privado para amigos: planos, memes e voz até tarde da noite.",
      rulesText: "1) Deixe o drama fora do grupo.\n2) Pergunte antes de adicionar pessoas novas.\n3) Não vaze conversas privadas.\n4) Silencie o microfone quando estiver AFK na voz compartilhada.\n5) Seja gentil: este espaço é nosso.",
      highlights: ["Chat de bate-papo", "Quadro de planos", "Noite de música", "Voz sempre ativa"],
      roles: ["Admin", "Co-anfitrião", "Melhor Amigo", "Amigo"],
      categories: [
        {
          name: "Início",
          channels: [
            { name: "bate-papo", topic: "Conversa do dia a dia; memes são bem-vindos." },
            { name: "planos", topic: "Encontros, watch parties, viagens." },
            { name: "fotos", topic: "Compartilhe fotos dos encontros e das viagens." },
            { name: "musicas-e-links", topic: "Playlists, TikToks e links aleatórios." },
          ],
        },
        {
          name: "Voz",
          channels: [
            { name: "Sala de Estar" },
            { name: "Madrugada" },
            { name: "Watch Party" },
            { name: "Estude Comigo" },
          ],
        },
        {
          name: "Privado",
          channels: [
            { name: "so-anfitrioes", topic: "Planejamento de admins e co-anfitriões." },
          ],
        },
      ],
    },
    community: {
      name: "Comunidade e criadores",
      description: "Comunidade pronta para o público, com avisos, suporte, eventos, palco e uma hierarquia completa da equipe.",
      descriptionSeed: "Uma comunidade feita para criadores: avisos, suporte e eventos.",
      rulesText: "1) Siga os Termos de Serviço do Discord/Descall.\n2) Nada de spam, golpes ou autopromoção fora de #divulgacao.\n3) Respeite todos: tolerância zero a discurso de ódio.\n4) Use o canal certo para cada assunto.\n5) Fale com a equipe em #suporte se precisar de ajuda.",
      highlights: ["Avisos", "Central de suporte", "Eventos", "Palco"],
      roles: ["Equipe do Dono", "Admin", "Moderador", "Anfitrião de Eventos", "Colaborador", "Membro"],
      categories: [
        {
          name: "Comece aqui",
          channels: [
            { name: "avisos", topic: "Atualizações oficiais. Membros não podem postar aqui." },
            { name: "regras", topic: "Diretrizes da comunidade." },
            { name: "boas-vindas", topic: "Novos membros se apresentam aqui." },
            { name: "cargos", topic: "Peça cargos de interesse ou tags de colaborador." },
          ],
        },
        {
          name: "Comunidade",
          channels: [
            { name: "geral", topic: "Conversa principal." },
            { name: "suporte", topic: "Precisa de ajuda? A equipe responde aqui." },
            { name: "eventos", topic: "Próximos eventos e confirmações de presença." },
            { name: "divulgacao", topic: "Autopromoção permitida só aqui: um post por dia." },
            { name: "vitrine", topic: "Compartilhe seus trabalhos, lives e conquistas." },
          ],
        },
        {
          name: "Voz e palco",
          channels: [
            { name: "Lounge da Comunidade" },
            { name: "Sala de Collab" },
            { name: "Assembleia", topic: "AMAs, avisos e eventos ao vivo." },
          ],
        },
        {
          name: "Equipe",
          channels: [
            { name: "chat-da-equipe", topic: "Discussão interna da equipe." },
            { name: "fila-da-moderacao", topic: "Denúncias e casos de moderação em aberto." },
            { name: "Voz da Equipe" },
          ],
        },
      ],
    },
    study: {
      name: "Estudos e faculdade",
      description: "Salas de foco, canais por matéria, ajuda com a lição de casa, voz silenciosa e cargos de mentor para turmas da faculdade.",
      descriptionSeed: "Estudem juntos: sessões de foco, ajuda com a lição de casa e conversa da faculdade.",
      rulesText: "1) Mantenha as salas de estudo livres de distrações.\n2) Nada de cola nem vazamento de provas.\n3) Compartilhe materiais dando os créditos.\n4) Use os canais por matéria para ajuda dentro do tema.\n5) Apoie os outros: cada um aprende no seu ritmo.",
      highlights: ["Salas de foco", "Ajuda com a lição de casa", "Voz silenciosa", "Cargo de mentor"],
      roles: ["Admin", "Moderador", "Mentor", "Parceiro de Estudos", "Estudante"],
      categories: [
        {
          name: "Faculdade",
          channels: [
            { name: "avisos", topic: "Prazos, sessões e notícias da faculdade." },
            { name: "regras", topic: "Diretrizes da comunidade de estudos." },
            { name: "apresentacoes", topic: "Curso, ano e o que você está estudando." },
          ],
        },
        {
          name: "Estudos",
          channels: [
            { name: "geral", topic: "Conversa da faculdade sobre outros assuntos." },
            { name: "ajuda-com-licao", topic: "Faça perguntas e mostre o que você já tentou." },
            { name: "materiais", topic: "Anotações, links e guias de estudo." },
            { name: "compromissos", topic: "Metas diárias e check-ins." },
          ],
        },
        {
          name: "Voz para foco",
          channels: [
            { name: "Foco em Silêncio" },
            { name: "Sala Pomodoro" },
            { name: "Trabalho em Grupo A" },
            { name: "Trabalho em Grupo B" },
            { name: "Plantão de Dúvidas", topic: "Sessões de perguntas e respostas com mentores." },
          ],
        },
        {
          name: "Equipe",
          channels: [
            { name: "sala-dos-mentores", topic: "Mentores e mods coordenam as sessões de ajuda." },
          ],
        },
      ],
    },
    streaming: {
      name: "Streamers e conteúdo",
      description: "Alertas de live, cofre de clipes, quadro de collabs, sala VIP e cargos de mod/VIP para equipes de criadores.",
      descriptionSeed: "QG do criador: avisos de live, clipes, collabs e vantagens VIP.",
      rulesText: "1) Apoie o criador: nada de estragar as lives.\n2) Nada de spoilers em #chat-ao-vivo durante os VODs.\n3) Autopromoção só em #collabs.\n4) Os VIPs ditam o clima: não abuse das vantagens.\n5) Os mods aplicam as regras do chat durante a live.",
      highlights: ["Canal de lives", "Cofre de clipes", "Sala VIP", "Equipe de moderação"],
      roles: ["Criador", "Moderador", "Editor", "VIP", "Inscrito", "Espectador"],
      categories: [
        {
          name: "Transmissão",
          channels: [
            { name: "avisos", topic: "Agenda e grandes lançamentos." },
            { name: "ao-vivo", topic: "Somente notificações de live." },
            { name: "regras", topic: "Regras do chat para lives e VODs." },
          ],
        },
        {
          name: "Comunidade",
          channels: [
            { name: "geral", topic: "Converse com a comunidade." },
            { name: "chat-ao-vivo", topic: "Ativo durante as lives; nada de spoilers." },
            { name: "clipes", topic: "Os melhores momentos das lives." },
            { name: "collabs", topic: "Pedidos de collab e divulgações." },
            { name: "sugestoes", topic: "Ideias de conteúdo para o criador." },
          ],
        },
        {
          name: "VIP",
          channels: [
            { name: "sala-vip", topic: "Chat de vantagens para VIP / Inscrito." },
            { name: "Voz VIP" },
          ],
        },
        {
          name: "Voz",
          channels: [
            { name: "Sala de Espera" },
            { name: "Voz de Collab" },
            { name: "After Party", topic: "Encontros e AMAs depois da live." },
          ],
        },
        {
          name: "Time",
          channels: [
            { name: "chat-dos-mods", topic: "Moderação durante a live." },
            { name: "Voz do Time" },
          ],
        },
      ],
    },
  },
};
