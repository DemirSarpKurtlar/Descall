/** Painel de administração › Central de segurança ("secCenter.*"). Same keys in every secCenter.<locale>.js. */
export const SEC_CENTER_PT_BR = {
  "title": "Central de segurança",
  "subtitle": "Acompanhe ataques ao vivo, trave a plataforma com um toque e mantenha cada mudança de configuração reversível",
  "threatLevel": "Nível de ameaça: {level}",
  "level": { "normal": "Normal", "elevated": "Atenção", "high": "Alto" },
  "history": "Histórico de configurações",
  "alertsBtn": "Alertas",
  "emergencyLock": "Trava de emergência",
  "live": "Ao vivo",
  "polling": "A cada 30 s",
  "loading": "Carregando…",
  "saving": "Salvando…",
  "retry": "Tentar de novo",
  "cancel": "Cancelar",
  "close": "Fechar",
  "reason": "Motivo",
  "reasonRequired": "Motivo (obrigatório, vai para o registro de auditoria)",
  "memoryOnly": "O registro de eventos e o histórico de configurações ainda não são permanentes: até as tabelas existirem, eles se perdem quando o servidor reinicia.",
  "time": {
    "now": "agora",
    "nowCap": "Agora",
    "min": "{n} min",
    "hour": "{n} h",
    "day": "{n} d",
    "hm": "{h} h {m} min",
    "hours": "{n, plural, one {# hora} other {# horas}}",
    "minutes": "{n, plural, one {# minuto} other {# minutos}}",
    "today": "Hoje {time}",
    "yesterday": "Ontem {time}",
    "yesterdayShort": "Ontem {time}"
  },
  "score": {
    "title": "Pontuação de segurança",
    "how": "Como é calculada",
    "aria": "Pontuação de segurança {score} de 100",
    "passed": "{passed} de {total} verificações ok",
    "lastWeek": "Semana passada {n}",
    "firstWeek": "Primeira medição para a comparação semanal",
    "potential": "Com {n, plural, one {# recomendação} other {# recomendações}} você chega a {score}",
    "allApplied": "Nenhuma recomendação pendente",
    "checks": "Verificações de segurança",
    "points": "+{n} pts",
    "remind": "Lembrar",
    "remindGo": "Enviar lembrete",
    "viewLocks": "Travas",
    "okSr": "ok"
  },
  "grade": { "excellent": "Excelente", "good": "Bom", "fair": "Regular", "poor": "Fraco" },
  "check": {
    "humanCheck": {
      "name": "Verificação humana no cadastro",
      "ok": "A verificação humana no cadastro está ativa",
      "fail": "A verificação humana no cadastro está desligada",
      "why": "Para barrar cadastros de bots na entrada é preciso um serviço de verificação (por exemplo Cloudflare Turnstile). Ele ainda não está configurado; até lá, o congelamento de cadastros e o bloqueio de e-mails temporários protegem contra ondas de bots."
    },
    "admin2fa": {
      "name": "2FA dos administradores",
      "ok": "Os {total} administradores usam 2FA",
      "fail": "{missing} de {total} administradores sem 2FA",
      "why": "Administradores sem 2FA não conseguem abrir o painel. O lembrete mostra um aviso para ativarem o app autenticador, se estiverem conectados agora."
    },
    "totpEnforced": {
      "name": "2FA obrigatória para administradores",
      "ok": "Ações de administração pedem código",
      "fail": "A 2FA obrigatória para administradores não está ativa",
      "why": "Enquanto faltarem as tabelas do autenticador, as ações de administração não pedem código. É preciso aplicar a migração do banco de dados."
    },
    "dmMinAge": {
      "name": "Idade mínima da conta para DMs",
      "ok": "Idade mínima para DMs: {hours} h",
      "fail": "Sem idade mínima da conta para DMs",
      "why": "Contas recém-criadas não conseguem mandar DMs em massa nas primeiras horas, o que corta a maior parte das ondas de spam e phishing. Recomendado: 24 horas."
    },
    "loginLimit": {
      "name": "Limite de tentativas de login",
      "ok": "Limite de tentativas {n} / min",
      "fail": "Limite de tentativas alto demais ({n} / min)",
      "why": "Tentativas de senha errada por conta e por minuto. Um valor baixo freia a força bruta. Recomendado: 5 / min."
    },
    "disposableEmail": {
      "name": "Bloqueio de e-mails temporários",
      "ok": "O bloqueio de e-mails temporários está ativo",
      "fail": "O bloqueio de e-mails temporários está desligado",
      "why": "Recusa cadastros com serviços de e-mail temporário (tempmail, yopmail…), a origem mais comum de contas bot."
    },
    "messageRate": {
      "name": "Limite de mensagens",
      "ok": "Limite de mensagens {n} / min",
      "fail": "Limite de mensagens fora da faixa segura ({n} / min)",
      "why": "Mensagens que uma pessoa pode mandar por minuto. Entre 1 e 120 limita ataques de spam. Recomendado: 60 / min."
    },
    "dmRate": {
      "name": "Intervalo entre DMs",
      "ok": "Intervalo entre DMs {ms} ms",
      "fail": "Intervalo entre DMs curto demais ({ms} ms)",
      "why": "Tempo mínimo entre duas DMs. Se for curto demais, scripts conseguem mandar dezenas de DMs por segundo. Recomendado: 200 ms."
    },
    "accessBans": {
      "name": "Bloqueios de acesso",
      "ok": "Bloqueios de IP e de dispositivo funcionando",
      "fail": "Bloqueios de IP e de dispositivo não funcionam",
      "why": "Faltam as tabelas de bloqueio de acesso ou a chave de assinatura; agora os bloqueios de IP e de rede não barram ninguém."
    },
    "eventLog": {
      "name": "Registro de eventos de segurança",
      "ok": "Eventos de segurança guardados de forma permanente",
      "fail": "Eventos de segurança só na memória",
      "why": "Até a tabela de eventos existir, o feed ao vivo se perde no reinício e não há comparação semanal."
    },
    "auditLog": {
      "name": "Registro de auditoria",
      "ok": "O registro de auditoria é permanente",
      "fail": "O registro de auditoria não é permanente",
      "why": "Falta a tabela do registro de auditoria; as ações de administração ficam só na memória."
    },
    "noOpenLock": {
      "name": "Trava sem fim",
      "ok": "Nenhuma trava ativa sem fim",
      "fail": "Trava sem fim ativa: {modes}",
      "why": "Uma trava de emergência até ser removida afeta os usuários sem motivo se for esquecida."
    }
  },
  "explain": {
    "title": "Como a pontuação é calculada",
    "body": "Cada verificação tem um peso; a pontuação é a parte do peso aprovado sobre o total (de 100). Ela é salva a cada 12 horas e comparada com a semana anterior.",
    "grades": "90 ou mais excelente, 75 ou mais bom, 50 ou mais regular, abaixo disso fraco."
  },
  "fix": {
    "title": "Aplicar recomendação",
    "sets": "Vai definir",
    "score": "Pontuação",
    "apply": "Aplicar",
    "all": "Aplicar todas ({n})"
  },
  "threat": {
    "title": "Resumo de ameaças",
    "window": "últimas 24 horas",
    "spike": "{time} onda de força bruta",
    "calm": "Nenhuma onda de força bruta",
    "chartAria": "Logins falhos, limites de taxa e IPs bloqueados nas últimas 24 horas"
  },
  "kpi": {
    "failed": "Logins falhos",
    "locked": "Contas travadas",
    "blocked": "IPs bloqueados",
    "rate": "Limites atingidos",
    "vsYesterday": "{pct} em relação a ontem",
    "flat": "igual a ontem",
    "new": "nenhum ontem",
    "activeBans": "{n} bloqueios ativos"
  },
  "legend": { "failed": "Logins falhos", "rate": "Limite de taxa", "blocked": "IPs bloqueados" },
  "locks": {
    "title": "Modos de trava de emergência",
    "liftAll": "Remover todas",
    "permanent": "Configurações de acesso permanentes",
    "fromSystem": "Ativo pelo Sistema",
    "sysChatFrozen": "O chat está congelado",
    "chatFrozenSub": "Ninguém pode enviar mensagens",
    "regOff": "Cadastros desativados",
    "regOffSub": "Nenhuma conta nova pode ser criada",
    "openSystem": "Abrir Sistema",
    "liftsIn": "Sai em {time}",
    "untilLifted": "Até ser removida",
    "detailAria": "Detalhes da trava {name}"
  },
  "lockMode": {
    "registration": {
      "name": "Congelar cadastros",
      "short": "congelar cadastros",
      "desc": "Nenhuma conta nova",
      "long": "Nenhuma conta nova (e-mail, Google, Apple). Contas existentes continuam entrando."
    },
    "dm": {
      "name": "Congelar DMs",
      "short": "congelar DMs",
      "desc": "Nenhuma DM nova",
      "long": "Nenhuma mensagem direta nova; chats de servidores e grupos continuam abertos."
    },
    "readOnly": {
      "name": "Modo somente leitura",
      "short": "modo somente leitura",
      "desc": "Ninguém envia mensagens",
      "long": "Nenhuma mensagem em lugar nenhum, nenhum grupo ou servidor novo."
    }
  },
  "perm": {
    "groups": {
      "name": "Criação de grupos",
      "on": "Usuários podem criar grupos",
      "off": "Não é possível criar grupos",
      "offTitle": "Desligar a criação de grupos?",
      "offBody": "Usuários não poderão criar grupos novos; os existentes continuam funcionando. Administradores não são afetados."
    },
    "dm": {
      "name": "Mensagens diretas",
      "on": "DMs ligadas",
      "off": "DMs desligadas",
      "offTitle": "Desligar as mensagens diretas de forma permanente?",
      "offBody": "Ninguém poderá mandar DMs novas; é uma configuração permanente e não volta sozinha. Para uma pausa temporária, use a trava Congelar DMs."
    },
    "offGo": "Desligar"
  },
  "lift": {
    "title": "Remover {name}?",
    "titleAll": "Remover {n, plural, one {# trava} other {# travas}}?",
    "body": "As configurações voltam a como estavam antes da trava, a faixa de aviso some e isso vai para o registro de auditoria.",
    "go": "Remover trava"
  },
  "lockInfo": {
    "reason": "Motivo",
    "by": "Iniciada por",
    "started": "Início",
    "ends": "Fim",
    "band": "Faixa de aviso",
    "extend": "Prolongar",
    "plus": "+{time}",
    "lift": "Remover trava"
  },
  "lockDlg": {
    "title": "Iniciar trava de emergência",
    "sub": "Os modos escolhidos valem na plataforma inteira na hora; administradores não são afetados.",
    "modes": "Travar",
    "alreadyOn": "Ativa · {time}",
    "duration": "Fim automático",
    "reason": "Motivo (obrigatório, vai para o registro de auditoria)",
    "reasonPh": "O que está acontecendo? Ex.: desde 20:09, força bruta e onda de cadastros de bots de uma mesma origem.",
    "code": "Código de verificação",
    "banner": "Mostrar uma faixa de aviso aos usuários",
    "pickOne": "Escolha pelo menos uma trava",
    "starting": "Iniciando…",
    "confirm": {
      "15m": "{n, plural, one {Travar por 15 minutos} other {Iniciar # travas por 15 minutos}}",
      "1h": "{n, plural, one {Travar por 1 hora} other {Iniciar # travas por 1 hora}}",
      "6h": "{n, plural, one {Travar por 6 horas} other {Iniciar # travas por 6 horas}}",
      "24h": "{n, plural, one {Travar por 24 horas} other {Iniciar # travas por 24 horas}}",
      "manual": "{n, plural, one {Travar até ser removida} other {Iniciar # travas até serem removidas}}"
    },
    "impact": "Prévia do impacto",
    "online": "Usuários online",
    "signups": "Cadastros novos, última hora",
    "dms": "DMs novas, última hora",
    "autoEnd": "Fim automático",
    "bandTitle": "Faixa que os usuários verão",
    "device": "Dispositivo da prévia",
    "desktop": "Computador",
    "phone": "Celular",
    "noBand": "Nenhuma faixa de aviso será mostrada",
    "pickForBand": "Escolha uma trava para ver a faixa aqui",
    "registrationWhere": "Quem tentar se cadastrar vê isso na tela de cadastro.",
    "noteAuto": "Quando o tempo acabar, as configurações voltam a como estavam antes da trava e a sala dos administradores é avisada.",
    "noteManual": "A trava dura até você removê-la. Ela aparece nos Alertas e na pontuação para não ser esquecida."
  },
  "duration": { "15m": "15 min", "1h": "1 hora", "6h": "6 horas", "24h": "24 horas", "manual": "Até ser removida" },
  "band": {
    "registration": "Novos cadastros estão temporariamente fechados. {when}",
    "dm": "O envio de DMs está temporariamente desligado. {when}",
    "readOnly": "O Descall está somente leitura por um tempo. Não dá para enviar mensagens. {when}",
    "when": {
      "15m": "Volta em cerca de 15 minutos.",
      "1h": "Volta em cerca de 1 hora.",
      "6h": "Volta em cerca de 6 horas.",
      "24h": "Volta em cerca de 24 horas."
    },
    "whenManual": "Volta assim que possível."
  },
  "feed": {
    "title": "Feed de ameaças ao vivo",
    "sub": "eventos de login, cadastro, limite de taxa e bloqueio de acesso",
    "openAll": "Ver tudo",
    "collapse": "Recolher",
    "filters": "Tipo de evento",
    "pause": "Pausar o feed",
    "resume": "Retomar o feed",
    "export": "Baixar CSV",
    "newEvents": "{n, plural, one {# evento novo · mostrar} other {# eventos novos · mostrar}}",
    "emptyTitle": "Tudo tranquilo",
    "emptyBody": "Nenhum evento de segurança recente. Os novos aparecem aqui ao vivo.",
    "emptyFilter": "Nenhum evento deste tipo.",
    "loadMore": "Eventos mais antigos",
    "sourceFilter": "Origem: {ip}",
    "clearSource": "Remover o filtro de origem"
  },
  "filter": {
    "all": "Todos",
    "bruteForce": "Força bruta",
    "failedLogin": "Login falho",
    "blockedIp": "IP bloqueado",
    "rateLimit": "Limite de taxa",
    "signupDenied": "Cadastro recusado"
  },
  "ev": {
    "unknownAccount": "uma conta que não existe",
    "brute_force": {
      "title": "Ataque de força bruta",
      "line": "{attempts} tentativas em {accounts} contas em {minutes} min",
      "lineUser": "{attempts} tentativas em {accounts} contas, incluindo {user}, em {minutes} min"
    },
    "failed_login": {
      "title": "Login falho",
      "lineUser": "{user} · senha errada, {n} tentativas",
      "lineUnknown": "Nome de usuário desconhecido · {n} tentativas"
    },
    "account_locked": {
      "title": "Conta travada temporariamente",
      "lineMinute": "{user} · {n} logins falhos em 1 minuto, tempo de espera",
      "lineWindow": "{user} · tentativas demais em 15 minutos, recusado {n} vezes"
    },
    "ip_blocked": {
      "title": "Limite de IP excedido",
      "lineLogin": "Tentativas de login passaram do limite de IP · recusado {n} vezes",
      "lineRegister": "Tentativas de cadastro passaram do limite de IP · recusado {n} vezes"
    },
    "access_ban": {
      "title": "Barrado por bloqueio de acesso",
      "line": "{kind} {label} · tentativa de {action}"
    },
    "rate_limit": {
      "title": "Limite de taxa excedido",
      "line": "{user} · limite de mensagens {limit} / min, {n} tentativas recusadas"
    },
    "signup_denied": {
      "title": "Cadastro recusado",
      "lineDisposable": "{email} · e-mail temporário",
      "lineClosed": "Cadastro via {method} com cadastros fechados · {n} tentativas"
    },
    "admin_step_up": {
      "title": "Verificação de administrador",
      "lineOk": "{user} · código correto",
      "lineFail": "{user} · código errado, {n} tentativas"
    }
  },
  "banKind": { "ip": "Bloqueio de IP", "network": "Bloqueio de rede", "device": "Bloqueio de dispositivo" },
  "banAction": { "login": "login", "register": "cadastro", "socket": "conexão", "oauth": "login com Google / Apple", "api": "requisição do app" },
  "method": { "email": "e-mail", "google": "Google", "apple": "Apple" },
  "act": {
    "banIp": "Bloquear IP",
    "banNet": "Bloquear rede",
    "banUser": "Banir",
    "inspect": "Analisar",
    "viewBan": "Bloqueio",
    "session": "Sessão"
  },
  "csv": { "time": "Hora", "type": "Tipo", "count": "Quantidade", "source": "Origem", "network": "Rede", "account": "Conta", "detail": "Detalhe" },
  "sources": {
    "title": "Origens com mais tentativas",
    "ban": "Bloquear",
    "banned": "Bloqueada",
    "empty": "Nenhuma origem com tentativas nas últimas 24 horas.",
    "openFeed": "Ver os eventos desta origem",
    "unknownPlace": "Local desconhecido"
  },
  "srcBan": {
    "title": "Bloquear {ip}?",
    "sub": "Um bloqueio de acesso impede login, cadastro e conexões a partir deste endereço; administradores não são afetados.",
    "what": "O que bloquear",
    "ip": "Só este IP",
    "network": "A rede inteira (/24)",
    "netWarn": "Um bloqueio de rede barra todo mundo na mesma rede (por exemplo uma república ou escritório).",
    "duration": "Duração",
    "reasonPh": "Ex.: 214 tentativas em 37 contas em 9 minutos",
    "privacy": "O endereço em si nunca é guardado; o bloqueio usa a impressão digital criptografada guardada com o evento.",
    "goIp": "Bloquear IP",
    "goNet": "Bloquear rede",
    "banning": "Bloqueando…"
  },
  "banDur": { "1d": "1 dia", "7d": "7 dias", "30d": "30 dias", "90d": "90 dias", "permanent": "Permanente" },
  "evd": {
    "title": "Evento",
    "when": "Hora",
    "count": "Repetições",
    "countVal": "{n} vezes, a primeira {from}",
    "source": "Origem",
    "network": "Rede",
    "account": "Conta",
    "status": "Situação da origem",
    "noSource": "Sem endereço (dentro do app)",
    "noAccount": "Sem conta",
    "sourceBanned": "Bloqueada",
    "sourceOpen": "Sem bloqueio",
    "openUser": "Ficha do usuário",
    "openBans": "Bloqueios de acesso",
    "allFromSource": "Todos os eventos desta origem",
    "copy": "Copiar resumo",
    "copied": "Copiado",
    "timeline": "Eventos recentes da mesma origem e conta",
    "noRelated": "Nenhum outro evento."
  },
  "hist": {
    "heading": "Histórico de mudanças de configuração",
    "sub": "Cada mudança nas configurações de segurança, quem fez e o valor anterior",
    "filters": "Tipo de mudança",
    "cat": { "all": "Todas", "locks": "Travas", "rateLimits": "Limites de taxa", "signup": "Proteção de cadastro", "access": "Acesso" },
    "system": "sistema",
    "before": "antes",
    "after": "depois",
    "noReason": "Sem motivo informado",
    "autoExpired": "O tempo acabou e a trava saiu sozinha",
    "revert": "Desfazer",
    "reverting": "Desfazendo…",
    "reverted": "Desfeito {user}",
    "isRevert": "Desfazer",
    "expired": "Expirada",
    "confirmTitle": "Desfazer esta mudança?",
    "revertOne": "{name} passa de {to} para {from}.",
    "revertMany": "{n, plural, one {# configuração volta} other {# configurações voltam}} ao valor anterior.",
    "revertLock": "A trava ({modes}) é removida agora.",
    "revertAudited": "Desfazer também vai para o registro de auditoria.",
    "stale": "Esta configuração mudou de novo desde então; desfazer sobrescreve o valor mais recente.",
    "reasonPh": "Ex.: O ataque acabou, voltando ao limite normal.",
    "memoryOnly": "O histórico ainda não é permanente: até a tabela existir, ele se perde no reinício do servidor.",
    "emptyTitle": "Nenhuma mudança ainda",
    "emptyBody": "Cada mudança nas configurações de segurança e do sistema aparece aqui com o valor anterior.",
    "loadMore": "Mudanças mais antigas",
    "title": {
      "lock": "Trava de emergência: {modes}",
      "lockLift": "Trava de emergência removida: {modes}",
      "lockExpired": "Trava de emergência expirou: {modes}",
      "lockExtend": "Fim da trava alterado: {modes}",
      "settings": "Configurações de segurança ({n})",
      "recommended": "Configurações recomendadas aplicadas",
      "revert": "Desfeito: {title}"
    }
  },
  "setting": {
    "registrationEnabled": "Cadastros",
    "dmEnabled": "Mensagens diretas",
    "readOnlyMode": "Modo somente leitura",
    "groupCreationEnabled": "Criação de grupos",
    "maxLoginAttempts": "Limite de tentativas de login",
    "maxMessagesPerMinute": "Limite de mensagens",
    "dmRateLimitMs": "Intervalo entre DMs",
    "dmMinAccountAgeHours": "Idade mínima para DMs",
    "disposableEmailBlock": "Bloqueio de e-mails temporários",
    "chatFrozen": "Congelar o chat",
    "maintenanceMode": "Modo de manutenção",
    "slowModeSeconds": "Modo lento",
    "rateLimitGlobalMs": "Intervalo global de mensagens",
    "maxMessageLength": "Mensagem mais longa"
  },
  "val": {
    "on": "ligado",
    "off": "desligado",
    "none": "nenhum",
    "rule": "regra de liberação",
    "untilLifted": "até ser removida",
    "autoOnAt": "volta a ligar às {time}",
    "autoOffAt": "desliga às {time}"
  },
  "unit": { "perMin": "{n} / min", "ms": "{n} ms", "hours": "{n} h" },
  "alerts": {
    "title": "Alertas",
    "none": "Nada precisa de atenção agora.",
    "desktop": "Notificação no computador em uma onda de força bruta",
    "desktopHint": "Enquanto esta página estiver aberta, neste navegador",
    "desktopBlocked": "O navegador não permite notificações.",
    "notifyTitle": "Onda de força bruta",
    "notifyBody": "Tentativas de login em muitas contas a partir de {ip}",
    "burst": { "title": "Onda de força bruta", "body": "De {ip}, {count} ondas nas últimas 24 horas" },
    "lock": { "title": "{mode} ativa", "body": "Sai sozinha em {time}" },
    "lockOpen": { "title": "{mode} ativa sem fim", "body": "Dura até ser removida" },
    "failedSpike": { "title": "Logins falhos em alta", "body": "{pct}% a mais que ontem" },
    "lockedSpike": { "title": "Contas travadas em alta", "body": "{n} contas travadas a mais que ontem" },
    "admin2fa": { "title": "Há um administrador sem 2FA", "body": "{missing} de {total} administradores sem 2FA" }
  },
  "toast": {
    "saved": "Configuração salva e registrada no histórico.",
    "applied": "Recomendação aplicada.",
    "appliedAll": "{n, plural, one {# recomendação aplicada.} other {# recomendações aplicadas.}}",
    "locked": "{n, plural, one {Trava iniciada.} other {# travas iniciadas.}}",
    "lifted": "Trava removida.",
    "extended": "Fim da trava atualizado.",
    "reverted": "Mudança desfeita.",
    "reminded": "Lembrete enviado a {n} administradores, {online} viram agora.",
    "bannedIp": "IP bloqueado, {kicked} conexões encerradas.",
    "bannedNet": "Rede bloqueada, {kicked} conexões encerradas.",
    "userBanned": "Usuário banido."
  },
  "err": {
    "generic": "Algo deu errado. Tente de novo.",
    "load": "Não foi possível carregar os dados de segurança.",
    "REASON_REQUIRED": "Escreva um motivo.",
    "ALREADY_ON": "Esta trava já está ativa.",
    "BAD_DURATION": "Duração inválida.",
    "NO_MODES": "Escolha pelo menos uma trava.",
    "NOT_ON": "Esta trava não está ativa.",
    "LOCK_ENDED": "Esta trava já terminou.",
    "ALREADY_REVERTED": "Esta mudança já foi desfeita.",
    "NOT_REVERTIBLE": "Esta mudança não pode ser desfeita.",
    "ALREADY_BANNED": "Este endereço já está bloqueado.",
    "SOURCE_NOT_FOUND": "Esta origem não está mais no feed de segurança.",
    "BANS_UNAVAILABLE": "Os bloqueios de acesso ainda não estão ativos.",
    "ADMIN_PERMISSION_DENIED": "Você não tem permissão para isso.",
    "STEP_UP_REQUIRED": "Esta ação precisa de um código de verificação.",
    "replay": "Este código acabou de ser usado. Espere o próximo.",
    "invalid": "Código errado."
  },
  "notice": {
    "dm": "O envio de DMs está temporariamente desligado.",
    "readOnly": "O Descall está somente leitura por um tempo; agora não dá para enviar mensagens.",
    "registration": "Novos cadastros estão temporariamente fechados.",
    "until": "Volta por volta das {time}.",
    "soon": "Volta assim que possível.",
    "dismiss": "Ocultar a faixa"
  }
};
