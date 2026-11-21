/** Painel de administração › Sistema ("sysx.*"). Same keys in every sysx.<locale>.js. */
export const SYSX_PT_BR = {
  "title": "Sistema",
  "crumb": "Saúde do servidor, feature flags, chaves de emergência e manutenção em uma só tela",
  "backupBtn": "Baixar backup",
  "restartBtn": "Reinício seguro",
  "close": "Fechar",
  "cancel": "Cancelar",
  "retry": "Tentar de novo",
  "loading": "Carregando…",
  "saving": "Salvando…",
  "system": "sistema",
  "pct": "{n}%",
  "pctDec": "{n}%",
  "people": "{n} pessoas",
  "sec": "{n} s",
  "bytes": "{n} {unit}",
  "pausedAt": "{n}% pausado",
  "ver": {
    "front": "Front-end {v}",
    "server": "Servidor {c}",
    "local": "local",
    "host": "Render · no ar há {t}",
    "hostLocal": "Servidor · no ar há {t}"
  },
  "time": {
    "dh": "{d} d {h} h",
    "hm": "{h} h {m} min",
    "m": "{m} min"
  },
  "ago": {
    "now": "agora mesmo",
    "m": "há {n} min",
    "h": "há {n} h",
    "d": "há {n} d",
    "mShort": "{n} min",
    "hShort": "{n} h",
    "dShort": "{n} d"
  },
  "level": {
    "ok": "Normal",
    "warn": "Alto",
    "bad": "Crítico",
    "unknown": "Medindo"
  },
  "tile": {
    "cpu": "Processador",
    "cores": "{n} núcleos",
    "mem": "Memória (RSS)",
    "ofMb": "/ {n} MB",
    "lag": "Loop de eventos",
    "p99": "p99 {n} ms",
    "lagUnit": "ms de atraso",
    "sockets": "Sockets conectados",
    "edgeN": "{n} edge",
    "live": "ao vivo",
    "db": "Banco de dados",
    "supabase": "Supabase",
    "dbDown": "Sem resposta",
    "dbUnit": "ms de resposta",
    "uptime": "Tempo no ar"
  },
  "memAlert": {
    "title": {
      "warn": "Memória alta",
      "bad": "Memória em nível crítico",
      "peak": "A memória teve um pico hoje"
    },
    "body": {
      "warn": "O servidor usa {rss} / {limit} MB ({pct}%); está em {sustained}% ou mais há {min} minutos.",
      "bad": "O servidor usa {rss} / {limit} MB ({pct}%). Se a memória acabar, o servidor reinicia e todos são desconectados.",
      "peak": "Normal agora ({pct}%), mas chegou a {peak}% hoje."
    },
    "advice": "Mude o Instance Type no Render para Standard ({gb} GB).",
    "watch": "Nada a fazer por enquanto; se acontecer de novo, considere um plano maior.",
    "plan": "Abrir o plano do Render"
  },
  "flags": {
    "title": "Feature flags",
    "count": "{n} flags",
    "history": "Histórico de mudanças",
    "historyTitle": "Histórico de mudanças de flags",
    "historySub": "Cada mudança de flag, quem fez e por quê. Clique em uma linha para abrir a flag.",
    "openAria": "Abrir as configurações de {name}",
    "toggleAria": "Ligar ou desligar {name}",
    "tipTitle": "Clique em uma linha",
    "tipBody": "Plataforma, porcentagem e só equipe; cada mudança vai para o histórico e se desfaz com um clique."
  },
  "col": {
    "flag": "Flag",
    "scope": "Escopo",
    "reach": "Liberação"
  },
  "flag": {
    "iosGlass": { "name": "iOS Liquid Glass", "desc": "app do iPhone e Android", "long": "interface de vidro do app do iPhone e Android" },
    "desktopGlass": { "name": "Liquid Glass no desktop", "desc": "desktop e web", "long": "interface de desktop e web" },
    "presenceScoped": { "name": "Lista online restrita", "desc": "chave de emergência", "long": "o status online só vai para amigos e servidores em comum" },
    "bootDiet": { "name": "Início leve ao reconectar", "desc": "chave de emergência", "long": "uma lista de amigos sem mudanças não é reenviada ao reconectar" },
    "edgeRealtime": { "name": "Edge realtime", "desc": "Cloudflare", "long": "conexões em tempo real pela Cloudflare" }
  },
  "reach": {
    "all": "Todos",
    "staff": "Equipe",
    "partial": "Parcial",
    "off": "Desligado"
  },
  "platform": {
    "web": "Web",
    "electron": "Desktop",
    "ios": "iOS",
    "android": "Android",
    "all": "Todas"
  },
  "mode": {
    "off": "Desligado",
    "staff": "Só equipe",
    "rollout": "Gradual",
    "all": "Todos",
    "rolloutPct": "Gradual {n}%"
  },
  "drawer": {
    "status": "Status",
    "platforms": "Plataformas",
    "separateFlag": "{name} · flag separada",
    "serverWide": "Esta flag vale para o servidor todo: só desligada ou para todos.",
    "percent": "Porcentagem de liberação",
    "approx": "Cerca de {n} / {total} usuários · fixo pelo ID do usuário, não muda ao recarregar",
    "staff": "Sempre ligado (equipe)",
    "staffEdge": "Usuários da equipe (em todas as plataformas)",
    "add": "Adicionar",
    "addStaff": "Adicionar alguém à equipe",
    "removeStaff": "Remover @{name}",
    "searchPh": "Buscar nome de usuário",
    "noResults": "Ninguém encontrado",
    "staffChip": "Equipe",
    "reason": "Motivo (vai para o registro de auditoria)",
    "reasonPh": "Escreva por que está mudando",
    "autoRollback": "Reverter automaticamente em 15 min se a taxa de erros passar de 2%",
    "tryFirst": "Testar na minha própria conta antes de salvar",
    "tryClientOnly": "Testar na sua conta só funciona com flags do app",
    "tryNow": "Testar na minha conta",
    "tried": "Ligado só nos seus apps abertos. Confira e depois publique para todos.",
    "publishNow": "Publicar agora",
    "save": "Salvar e publicar",
    "guardOn": "A reversão automática está de olho · até {time}",
    "history": "Histórico de mudanças",
    "historyMemory": "Por enquanto o histórico fica na memória; reiniciar o servidor apaga.",
    "emptyHistory": "Nenhuma mudança ainda",
    "now": "Agora",
    "revert": "Voltar para isto",
    "reverted": "desfeito",
    "autoReverted": "revertido automaticamente",
    "unknownState": "Sem detalhes"
  },
  "edge": {
    "title": "Edge realtime (Cloudflare)",
    "masterAria": "Chave principal do edge realtime",
    "bridgeOpen": "Ponte conectada",
    "bridgeDown": "Ponte caída",
    "bridgeNone": "Ponte não configurada",
    "stats": "{n} sockets edge · {p}% do tráfego",
    "legendAll": "Todos os sockets",
    "legendEdge": "Sockets edge",
    "days": "{n} dias",
    "chartAria": "Pico de sockets conectados e sockets edge nos últimos 14 dias",
    "chartEmpty": "Ainda sem medições",
    "stageLabel": "Etapa de liberação",
    "platforms": "Plataformas",
    "team": "Usuários da equipe",
    "teamValue": "{n} pessoas · em todas as plataformas"
  },
  "stage": {
    "shadow": "Sombra",
    "team": "Equipe",
    "p5": "5%",
    "p25": "25%",
    "p50": "50%",
    "p100": "100%"
  },
  "kill": {
    "title": "Chaves de emergência",
    "orderLabel": "Ordem",
    "order": {
      "area": "Por área",
      "state": "Por estado"
    },
    "planned": "Previsto: {range}",
    "plannedActive": "Manutenção em andamento: {range}",
    "noPlan": "Nenhuma manutenção prevista · página de Manutenção"
  },
  "group": {
    "chat": "Chat",
    "account": "Contas e mensagens",
    "media": "Voz e vídeo",
    "maintenance": "Manutenção",
    "cut": "Desligados agora",
    "normal": "O resto"
  },
  "sw": {
    "chatFrozen": "Congelar chat",
    "slowModeSeconds": "Modo lento",
    "slower": "Diminuir o modo lento",
    "faster": "Aumentar o modo lento",
    "registrationEnabled": "Novos cadastros",
    "dmEnabled": "Mensagens diretas",
    "groupCreationEnabled": "Criação de grupos",
    "voice": "Voz",
    "video": "Vídeo",
    "screen": "Tela",
    "media": "Voz · Vídeo · Tela",
    "maintenanceMode": "Modo manutenção"
  },
  "state": {
    "on": "Ligado",
    "off": "Desligado"
  },
  "cut": {
    "apply": "Aplicar",
    "reasonPh": "Por que você está fazendo isso? Vai para o registro de auditoria.",
    "chatFrozen": { "title": "Congelar o chat?", "body": "Ninguém consegue enviar mensagens; admins não são afetados. Um clique desfaz." },
    "maintenanceMode": { "title": "Ligar o modo manutenção?", "body": "Os usuários veem a tela de manutenção. Para trabalhos previstos, use a página de Manutenção." },
    "registrationEnabled": { "title": "Fechar novos cadastros?", "body": "Nenhuma conta nova é criada; contas existentes não são afetadas." },
    "dmEnabled": { "title": "Desligar mensagens diretas?", "body": "Ninguém consegue enviar novas mensagens diretas; os canais dos servidores continuam." },
    "groupCreationEnabled": { "title": "Desligar a criação de grupos?", "body": "Não dá para criar grupos novos; os existentes continuam." },
    "voice": { "title": "Desligar a voz?", "body": "Chamadas e canais de voz não começam." },
    "video": { "title": "Desligar o vídeo?", "body": "As câmeras não ligam; as chamadas de voz continuam." },
    "screen": { "title": "Desligar o compartilhamento de tela?", "body": "Nenhum compartilhamento de tela novo começa." }
  },
  "lim": {
    "title": "Limites",
    "reset": "Voltar ao padrão",
    "resetTitle": "Voltar os limites ao padrão?",
    "resetBody": "Tamanho da mensagem 2.000, limite de requisições desligado, 60 mensagens por minuto. Dá para desfazer.",
    "maxMessageLength": "Tamanho da mensagem",
    "rateLimitGlobalMs": "Limite de requisições",
    "maxMessagesPerMinute": "Mensagens por minuto",
    "unit": {
      "maxMessageLength": "caracteres",
      "rateLimitGlobalMs": "ms",
      "maxMessagesPerMinute": "mensagens"
    },
    "default": "Padrão {n}",
    "off": "Desligado",
    "invalid": "O valor precisa estar entre {min} e {max}."
  },
  "bc": {
    "title": "Transmissão",
    "history": "Histórico · {n}",
    "historyTitle": "Transmissões recentes",
    "ph": "Escreva um aviso instantâneo para todos…",
    "preview": "Prévia",
    "send": "Enviar",
    "last": "Última transmissão {date} · chegou a {n} pessoas",
    "none": "Nenhuma transmissão ainda",
    "noText": "Texto não salvo",
    "more": "Direcionados e agendados:",
    "toAnnouncements": "Anúncios",
    "toLivePopup": "Pop-up ao vivo",
    "previewTitle": "É assim que os usuários vão ver",
    "sendTitle": "Enviar para todos?",
    "reach": "{n} pessoas estão online agora; todas veem na hora.",
    "seen": "O que os usuários vão ver",
    "seenNote": "Aparece no app como um aviso de 8 segundos. Quem estiver offline não vê.",
    "desktop": "Desktop e web",
    "phone": "Celular",
    "notice": "Servidor: {text}",
    "sendN": "Enviar para {n} pessoas"
  },
  "bk": {
    "title": "Backup e filtro",
    "last": "Último backup {date}",
    "none": "Nenhum backup ainda · baixar agora",
    "filterMoved": "O filtro de palavras agora fica em Moderação"
  },
  "rs": {
    "title": "Reiniciar o servidor com segurança?",
    "sub": "{n} sockets conectados · {e} edge · serviço Render {svc} · queda estimada {min}-{max} s",
    "subNoSvc": "{n} sockets conectados · {e} edge · queda estimada {min}-{max} s",
    "step": {
      "stop": { "t": "Parar novas conexões", "d": "O health check do Render responde 'esvaziando'" },
      "notify": { "t": "Avisar os usuários", "d": "O app mostra uma faixa com contagem regressiva de {n} s", "dSkip": "A faixa aparece sem contagem regressiva" },
      "drain": { "t": "Esvaziar sockets", "d": "{n} → 0 · clientes edge não passam para o servidor principal" },
      "backup": { "t": "Fazer backup da memória", "d": "Chat geral, configurações, amostra de auditoria · baixado", "dSkip": "Desta vez nenhum backup é baixado" },
      "exit": { "t": "Reiniciar o processo", "d": "O Render abre um processo novo e os clientes reconectam sozinhos" }
    },
    "time": {
      "now": "na hora",
      "drain": "~20 s",
      "exit": "~40 s",
      "download": "baixado",
      "skipped": "pulado"
    },
    "backupFirst": "Baixar o backup primeiro",
    "notifyTeam": "Avisar a equipe",
    "skipCountdown": "Pular a contagem regressiva",
    "reason": "Motivo (obrigatório, vai para o registro de auditoria)",
    "reasonPh": "Ex.: a memória passou de 900 MB, suspeita de vazamento",
    "typeLabel": "Digite {word} para confirmar",
    "confirmWord": "REINICIAR",
    "go": "Esvaziar e reiniciar",
    "downloading": "Baixando o backup…",
    "preview": "O que os usuários vão ver",
    "recent": "Reinícios recentes",
    "cause": {
      "admin": "admin",
      "deploy": "deploy",
      "auto": "automático",
      "first": "primeira inicialização"
    },
    "deploy": "Deploy do Render {v}",
    "downtime": "{n} s de queda",
    "noHistory": "Nenhum reinício registrado ainda",
    "noHistoryTable": "O histórico aparece quando a tabela do banco for criada",
    "maintWarn": "Manutenção prevista em {date}. Se não for urgente, esperar essa janela afeta menos os usuários.",
    "running": "Esvaziando; as etapas seguem em ordem.",
    "waiting": "O servidor caiu, esperando o processo novo…",
    "back": "O servidor voltou · {n} s de queda",
    "active": "em andamento",
    "done": "feito",
    "left": "faltam {n}"
  },
  "strip": {
    "text": "Reiniciando, já voltamos",
    "reconnecting": "Reconectando…"
  },
  "toast": {
    "undo": "Desfazer",
    "undone": "Desfeito",
    "saved": "Salvo",
    "noChange": "Nada mudou",
    "flagOn": "{name} ligado",
    "flagOff": "{name} desligado",
    "flagSaved": "{name} publicado",
    "restored": "{name} voltou ao estado anterior",
    "stage": "Etapa edge: {stage}",
    "switched": "{name}: {state}",
    "slow": "Modo lento: {n} s",
    "limits": "Limite salvo",
    "limitsReset": "Os limites voltaram ao padrão",
    "backup": "Backup baixado · {size}",
    "broadcast": "Enviado para {n} pessoas",
    "rollback": "A taxa de erros subiu; {name} foi revertido automaticamente"
  },
  "err": {
    "generic": "Algo deu errado. Tente de novo.",
    "load": "Não foi possível carregar os dados do sistema.",
    "stepUp": "Esta ação precisa de um código de verificação.",
    "reason": "É preciso um motivo.",
    "percent": "Uma liberação gradual precisa estar entre 1% e 99%.",
    "serverWide": "Esta flag vale para o servidor todo: só desligada ou para todos.",
    "noStaff": "Adicione pelo menos uma pessoa para só equipe.",
    "noPlatform": "Escolha pelo menos uma plataforma.",
    "confirm": "O texto de confirmação não confere.",
    "running": "Já há um reinício em andamento.",
    "stale": "Essa configuração mudou de novo desde então.",
    "alreadyUndone": "Essa mudança já foi desfeita.",
    "permission": "Você não tem acesso a esta seção.",
    "textLong": "Um aviso pode ter no máximo 500 caracteres."
  }
};
