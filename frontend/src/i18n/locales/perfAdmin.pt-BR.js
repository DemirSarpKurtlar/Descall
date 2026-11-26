/** Yönetici Paneli › Performans ("perfAdmin.*", owner pick Draft A "Konsol"). Same keys in every perfAdmin.<locale>.js. */
export const PERF_ADMIN_PT_BR = {
  "title": "Desempenho",
  "crumb": "Sistema › Desempenho · métricas de usuários reais e Lighthouse CI",
  "sampling": "amostragem {pct}",
  "dataAgoSec": "dados há {n} s",
  "dataAgoMin": "dados há {n} min",
  "notReady": "As tabelas de desempenho ainda não foram criadas (20261124v_perf.sql). Os dados chegam quando a migração for aplicada.",
  "retry": "Tentar de novo",
  "close": "Fechar",
  "cancel": "Cancelar",
  "save": "Salvar",
  "saving": "Salvando…",
  "undo": "Desfazer",
  "and": "e",
  "unit": {
    "ms": "{n} ms",
    "s": "{n} s"
  },
  "tab": {
    "rum": "Usuários reais",
    "rumShort": "Usuários",
    "lh": "Lighthouse CI",
    "lhShort": "Lighthouse",
    "alerts": "Alertas"
  },
  "live": {
    "long": "Ao vivo · {n} sessões / 5 min",
    "short": "Ao vivo · {n}",
    "waiting": "Ao vivo · aguardando",
    "title": "Carregamentos de página amostrados nos últimos 5 minutos"
  },
  "export": {
    "button": "Exportar",
    "done": "{n} linhas baixadas em CSV · registrado no histórico",
    "failed": "Não foi possível exportar."
  },
  "rules": {
    "button": "Regras de alerta",
    "title": "Regra de alerta",
    "subtitle": "Avisa a sala dos admins e você quando uma métrica piora numa versão nova.",
    "metric": "Métrica",
    "platform": "Plataforma",
    "condition": "Condição",
    "conditionText": "p75, comparado à versão anterior",
    "threshold": "Piora",
    "thresholdUnit": "% ou mais",
    "minSessions": "Mínimo de amostras",
    "minUnit": "amostras",
    "notify": "Notificar",
    "ch": {
      "adminRoom": "Sala dos admins (mensagem do sistema)",
      "ownerPush": "Notificação ao dono (celular)",
      "email": "Resumo por e-mail",
      "errorLog": "Abrir registro em Registros de erros"
    },
    "chSub": {
      "adminRoom": "admins com o painel aberto",
      "ownerPush": "web, iOS, Android",
      "email": "uma vez por dia",
      "errorLog": "uma vez por alerta"
    },
    "mute": "Silenciar",
    "muteOpt": {
      "none": "Nunca",
      "release24h": "Mesma versão por 24 h",
      "7d": "7 dias"
    },
    "save": "Salvar regra",
    "saved": "Regra salva; a mudança está no histórico.",
    "previewTitle": "Prévia · últimos 90 dias",
    "previewSome": "vezes teria disparado: cada uma, uma regressão real.",
    "previewNone": "vezes: não teria disparado em 90 dias.",
    "previewInvalid": "Escolha ao menos uma métrica e uma plataforma.",
    "fire": "{version} · {platform} · {metric} +{pct}",
    "roomTitle": "Assim aparece na sala dos admins",
    "roomOff": "Sala desligada: esta mensagem não é enviada.",
    "auditNote": "Mudanças de regra vão para o histórico e podem ser desfeitas lá."
  },
  "query": {
    "label": "Consulta de desempenho",
    "placeholder": "Adicionar filtro: página, plataforma, versão, dispositivo, conexão, país, ID do usuário",
    "filters": "Filtros",
    "remove": "Remover filtro {label}",
    "suggestions": "Sugestões"
  },
  "tok": {
    "range": "últimos",
    "platform": "plataforma",
    "version": "versão",
    "route": "página",
    "device": "dispositivo",
    "connection": "conexão",
    "country": "país",
    "user": "usuário"
  },
  "range": {
    "24h": "24 horas",
    "7d": "7 dias",
    "28d": "28 dias",
    "90d": "90 dias"
  },
  "platform": {
    "web": "Web",
    "ios": "iOS",
    "android": "Android",
    "electron": "Electron",
    "tauri": "Tauri (Rust)"
  },
  "device": {
    "low": "Básico",
    "mid": "Intermediário",
    "high": "Avançado"
  },
  "conn": {
    "wifi": "Wi-Fi",
    "ethernet": "Ethernet",
    "4g": "4G",
    "3g": "3G",
    "2g": "2G",
    "offline": "Offline"
  },
  "metric": {
    "lcp": "LCP",
    "inp": "INP",
    "cls": "CLS",
    "fcp": "FCP",
    "ttfb": "TTFB",
    "msglist": "Primeira lista de mensagens",
    "voicejoin": "Entrar na voz",
    "appstart": "Abertura do app"
  },
  "metricSub": {
    "lcp": "Maior conteúdo",
    "inp": "Atraso de interação",
    "cls": "Mudança de layout",
    "fcp": "Primeiro conteúdo",
    "ttfb": "Primeiro byte",
    "msglist": "ao abrir um chat",
    "voicejoin": "conectar à sala",
    "appstart": "inicialização a frio"
  },
  "dist": {
    "good": "Bom {pct}",
    "ni": "Médio {pct}",
    "poor": "Ruim {pct}"
  },
  "route": {
    "app_kanal": "Canal do servidor",
    "app_dm": "Mensagens diretas",
    "app_grup": "Chat em grupo",
    "app_ses": "Sala de voz",
    "app": "App",
    "_": "Página inicial",
    "_download": "Página de download",
    "_features": "Recursos",
    "_login": "Entrar",
    "_blog": "Blog",
    "app_market": "Loja",
    "app_kesfet": "Descobrir",
    "app_ayarlar": "Configurações"
  },
  "views": {
    "label": "Visualizações salvas",
    "all": "Tudo",
    "mobileSlow": "Celular · rede lenta",
    "desktopStart": "Abertura no desktop",
    "voice": "Sala de voz",
    "release": "{platform} {version}",
    "regression": "regressão",
    "save": "Salvar visualização",
    "copyLink": "Copiar link",
    "linkCopied": "Link copiado: quem abrir vê os mesmos filtros.",
    "notReady": "Visualizações salvas ficam disponíveis após a migração.",
    "menu": "Visualização",
    "delete": "Excluir visualização",
    "deleted": "“{name}” excluída.",
    "saved": "“{name}” salva.",
    "saveTitle": "Salvar visualização",
    "saveSubtitle": "Esses filtros voltam com um clique.",
    "name": "Nome",
    "namePh": "ex.: regressão Android 4.1.4",
    "contains": "Filtros incluídos",
    "shared": "Compartilhar com os outros admins",
    "sharedSub": "Todos com a seção Desempenho veem."
  },
  "alert": {
    "lead": "{version}: {platform} {metric} p75 {from} → {to} (+{pct}).",
    "sessions": "{n} amostras.",
    "mostOn": "Principalmente em",
    "also": "Mais {n} alertas.",
    "firstSeen": "Visto pela primeira vez em {when}.",
    "share": "A versão está em {pct} dos usuários.",
    "review": "Analisar",
    "errorLog": "Abrir registro de erro",
    "errorAgain": "Ver registro de erro",
    "errorOpened": "Registro aberto em Registros de erros.",
    "errorExists": "Este alerta já tem um registro de erro.",
    "gotoErrors": "Abrir em Registros de erros",
    "hide": "Ocultar",
    "hidden": "Alerta oculto (para todos).",
    "show": "Mostrar de novo",
    "shown": "O alerta voltou a aparecer.",
    "vsPrev": "versão anterior {version}",
    "hasError": "registro de erro aberto"
  },
  "alerts": {
    "open": "Alertas abertos",
    "hidden": "Ocultos",
    "none": "Nenhum alerta aberto. Versões acima do limite aparecem aqui.",
    "how": "A cada 15 minutos a versão mais nova de cada plataforma é comparada com a anterior pelo p75; acima do limite, um alerta é aberto."
  },
  "chart": {
    "title": "Tendência p75",
    "metric": "Métrica do gráfico",
    "app": "App",
    "hint": "Clique numa linha: filtra a plataforma",
    "aria": "Tendência p75 de {metric} por plataforma",
    "goodLine": "Limite bom · {value}",
    "tipTitle": "{when} · p75",
    "flag": "flag: {name} {pct}",
    "flagOff": "desligado",
    "empty": "Sem dados neste período.",
    "noData": "Sem amostras com estes filtros."
  },
  "releases": {
    "title": "Comparação de versões",
    "version": "Versão",
    "share": "Fatia",
    "start": "Abertura",
    "empty": "Ainda sem dados de versões.",
    "mix": "Fatia por plataforma",
    "sessions": "{n} sessões"
  },
  "group": {
    "route": "Página",
    "platform": "Plataforma",
    "version": "Versão",
    "device": "Classe de dispositivo",
    "connection": "Conexão",
    "country": "País"
  },
  "table": {
    "title": {
      "route": "Páginas mais lentas",
      "platform": "Plataformas",
      "version": "Versões",
      "device": "Classes de dispositivo",
      "connection": "Conexões",
      "country": "Países"
    },
    "groupBy": "Agrupar por",
    "distOf": "Distribuição: {metric}",
    "sortBy": "Por {metric} p75",
    "sortLabel": "Ordenação",
    "platform": "Plataforma",
    "sessions": "Sessões",
    "dist": "Distribuição",
    "trend": "Tendência",
    "empty": "Sem amostras com estes filtros.",
    "emptySub": "Afrouxe os filtros ou escolha um período maior.",
    "rowMenu": "Ações da linha",
    "open": "Abrir detalhes",
    "filterTo": "Só {value}",
    "p75": "{metric} p75"
  },
  "drawer": {
    "tab": {
      "summary": "Resumo",
      "breakdown": "Detalhamento",
      "attribution": "Atribuição",
      "users": "Usuários lentos",
      "lighthouse": "Lighthouse"
    },
    "sessions": "{n} sessões",
    "allPlatforms": "todas as plataformas",
    "copy": "Copiar valor",
    "copied": "Copiado.",
    "heatTitle": "INP p75 · plataforma × classe",
    "heatHint": "clique na célula: filtro",
    "none": "sem dados",
    "samples": "{n} amostras",
    "noData": "Sem dados.",
    "attrTitle": "Atribuição · interações mais lentas (INP)",
    "attrEmpty": "Sem atribuição nos últimos {days} dias.",
    "itype": {
      "keyboard": "keydown · teclado",
      "pointer": "click · toque / clique",
      "other": "interação"
    },
    "shareOf": "{pct} das interações",
    "lcpEl": "Elemento LCP:",
    "onPages": "{pct} dos carregamentos",
    "usersTitle": "Usuários mais lentos",
    "usersHint": "só ID do usuário",
    "usersEmpty": "Nenhum usuário conectado lento.",
    "dossier": "Ficha do usuário",
    "userSessions": "{n} sessões deste usuário",
    "userSessionsAll": "Sessões deste usuário",
    "lhTitle": "Lighthouse · main",
    "lhNone": "O Lighthouse CI não mede esta página.",
    "lhApp": "O Lighthouse não mede telas do app, só páginas públicas.",
    "saveView": "Salvar como visualização",
    "openLh": "Abrir no Lighthouse",
    "lhMain": "main · {sha}"
  },
  "room": {
    "name": "Sistema Descall",
    "badge": "SISTEMA",
    "text": "Alerta de desempenho: {version} {platform} {metric} p75 {from} → {to} (+{pct}), {n} amostras.",
    "open": "Abrir no painel"
  },
  "filters": {
    "title": "Filtros",
    "subtitle": "Pode escolher vários valores; vazio significa tudo.",
    "userPh": "ID do usuário (completo ou 8 primeiros caracteres)",
    "clear": "Limpar",
    "apply": "Aplicar"
  },
  "err": {
    "generic": "Algo deu errado.",
    "load": "Não foi possível carregar.",
    "NO_METRIC": "Escolha ao menos uma métrica.",
    "NO_PLATFORM": "Escolha ao menos uma plataforma.",
    "BAD_THRESHOLD": "O limite deve ficar entre 1 e 500.",
    "BAD_MIN_SESSIONS": "O mínimo de amostras deve ser 10 ou mais.",
    "NAME_REQUIRED": "Digite um nome.",
    "PERF_UNAVAILABLE": "As tabelas de desempenho ainda não existem."
  },
  "lh": {
    "placeholder": "Número do PR, branch, autor, página…",
    "tok": {
      "compare": "comparar",
      "state": "estado",
      "text": "busca"
    },
    "rerun": "Rodar tudo de novo",
    "rerunHint": "Abre o workflow do Lighthouse no GitHub Actions",
    "view": {
      "open": "PRs abertos",
      "over": "Acima do orçamento",
      "main": "histórico da main",
      "merged": "Mesclados recentemente"
    },
    "method": "{pages} páginas × 3 execuções · mediana",
    "lastRun": "última execução {when}",
    "minAgo": "há {n} min",
    "hourAgo": "há {n} h",
    "yesterday": "ontem",
    "overLead": "#{pr} passa do orçamento de desempenho:",
    "budget": "(orçamento {n}).",
    "bundle": "Pacote principal {kb} KB (gzip).",
    "tbt": "TBT médio {ms} ms.",
    "openPr": "Abrir PR",
    "report": "Ver relatório",
    "empty": "Ainda sem resultados do Lighthouse. Aparecem após o próximo PR ou execução na main.",
    "cat": {
      "perf": "Desempenho",
      "a11y": "Acessibilidade",
      "best_practices": "Boas práticas",
      "seo": "SEO"
    },
    "catShort": {
      "perf": "Desemp",
      "a11y": "Acess",
      "best_practices": "BP",
      "seo": "SEO"
    },
    "weekDelta": "{n} esta semana",
    "weekFlat": "sem mudança esta semana",
    "thisWeek": "Esta semana",
    "runs": "execuções",
    "passed": "Passaram {n}",
    "warned": "Aviso {n}",
    "over": "Acima {n}",
    "history": "histórico da main",
    "historySub": "últimas {n} mesclagens",
    "noHistory": "O gráfico precisa de ao menos duas execuções na main.",
    "budgetLbl": "Orçamento · {n}",
    "perPage": "Por página · main",
    "noMain": "Ainda sem resultados da main.",
    "noindexNote": "As páginas do app são noindex de propósito; o SEO delas fica fora do orçamento.",
    "prs": "Pull requests",
    "prsSub": "diferença para a main · média de {pages} páginas",
    "author": "Autor",
    "state": "Estado",
    "noPrs": "Nenhum PR nesta visualização.",
    "st": {
      "over": "Orçamento estourado",
      "warn": "Aviso",
      "pass": "Passou",
      "merged": "Mesclado",
      "mergedWarn": "Mesclado · aviso"
    },
    "pr": "PR"
  },
  "new": "NOVO"
};
