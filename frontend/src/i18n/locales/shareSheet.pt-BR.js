/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_PT_BR = {
  "title": "Enviar para o Descall",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# item} other {# itens}}",
  "chats": "{count, plural, one {# conversa} other {# conversas}}",
  "cancel": "Cancelar",
  "close": "Fechar",
  "done": "Concluído",
  "hide": "Ocultar",
  "options": "Opções",
  "remove": "Remover",
  "search": "Busque pessoas, grupos ou canais",
  "clearSearch": "Limpar busca",
  "tabs": {
    "all": "Tudo",
    "friends": "Amigos",
    "groups": "Grupos",
    "servers": "Servidores"
  },
  "sec": {
    "friends": "Amigos",
    "groups": "Grupos",
    "channels": "Canais de servidor",
    "suggested": "Sugeridos"
  },
  "server": {
    "channels": "{count, plural, one {# canal} other {# canais}}",
    "sendable": "Você pode postar em {count}",
    "none": "Nenhum canal onde você possa postar"
  },
  "saved": "{percent}% menor",
  "presence": {
    "online": "Online",
    "idle": "Ausente",
    "dnd": "Não perturbe",
    "offline": "Offline"
  },
  "row": {
    "channel": "Canal de servidor",
    "slowMode": "Modo lento: {seconds} s",
    "lastShared": {
      "today": "Você compartilhou por último · hoje",
      "yesterday": "Você compartilhou por último · ontem",
      "days": "Você compartilhou por último · há {count} dias"
    },
    "members": "{members} membros",
    "membersOnline": "{members} membros · {online} online",
    "groupShared": {
      "today": "{members} membros · você compartilhou {count} hoje",
      "yesterday": "{members} membros · você compartilhou {count} ontem",
      "days": "{members} membros · você compartilhou {count} há {days} dias"
    },
    "dmShared": {
      "today": "{presence} · você compartilhou {count} hoje",
      "yesterday": "{presence} · você compartilhou {count} ontem",
      "days": "{presence} · você compartilhou {count} há {days} dias"
    }
  },
  "reason": {
    "no_permission": "Você não pode escrever aqui",
    "announcement": "Só moderadores podem escrever",
    "timed_out": "Você está silenciado",
    "no_attach": "Você não pode enviar arquivos aqui",
    "blocked": "Bloqueado",
    "not_friends": "Vocês não são mais amigos",
    "unknown": "Indisponível",
    "rules_required": "Aceite primeiro as regras do servidor",
    "failed": "Não foi possível enviar",
    "offline": "Conexão perdida",
    "upload_failed": "Falha no upload",
    "timeout": "Tempo esgotado",
    "too_large": "Acima do limite de 100 MB",
    "type": "Este tipo de arquivo não pode ser enviado",
    "slowmode": "Modo lento",
    "rate_limited": "Rápido demais; aguarde",
    "content_blocked": "Bloqueado pelo filtro de conteúdo",
    "attachment_unavailable": "Anexo indisponível",
    "signed_out": "Sessão encerrada",
    "cancelled": "Interrompido",
    "too_many_scheduled": "Mensagens agendadas demais",
    "too_long": "Mensagem longa demais"
  },
  "message": "Adicionar mensagem (opcional)",
  "quality": {
    "original": "Original",
    "originalDesc": "Resolução total, vídeo 4K mantido · {size}",
    "high": "Alta (recomendada)",
    "highDesc": "JPEG, vídeo 1080p · {size}",
    "saver": "Economia de dados",
    "saverDesc": "Rápido nos dados móveis · {size}",
    "chip": {
      "original": "Original",
      "high": "Alta",
      "saver": "Economia"
    },
    "title": "Qualidade de envio"
  },
  "location": {
    "title": "Remover localização",
    "desc": "GPS e dados do aparelho nas fotos",
    "chipOn": "Sem local",
    "chipOff": "Com local"
  },
  "silent": "Silencioso",
  "silentHint": "Sem notificação; continua como não lido",
  "scheduleChip": "Agendar",
  "scheduleTitle": "Quando enviar?",
  "schedule": {
    "inHour": "Em 1 hora",
    "tonight": "Hoje 20:00",
    "tomorrow": "Amanhã 09:00",
    "custom": "Escolher data e hora",
    "set": "Definir",
    "now": "Enviar agora",
    "invalid": "Escolha pelo menos 1 minuto à frente"
  },
  "send": "{count, plural, one {Enviar para # conversa} other {Enviar para # conversas}}",
  "sendShort": "{count, plural, one {# conversa} other {# conversas}}",
  "sendScheduled": "{count, plural, one {Agendar para # conversa} other {Agendar para # conversas}}",
  "pick": "Escolha quem recebe",
  "when": {
    "today": "hoje",
    "yesterday": "ontem",
    "days": "há {count} dias"
  },
  "dup": {
    "link": "Você enviou este link para {name} {when}",
    "file": "Você enviou isto para {name} {when}",
    "body": "Será enviado mesmo assim. Você pode tirar {name} deste envio.",
    "remove": "Remover"
  },
  "limitTargets": "Você pode escolher até {count} conversas",
  "limitItems": "Até {count} itens; o resto foi removido",
  "targetRemoved": "{name} removido: {reason}",
  "errorTitle": "Não foi possível carregar a lista",
  "errorOffline": "Sem internet. Ao enviar, vai para a fila.",
  "retry": "Tentar de novo",
  "signedOutTitle": "Você não entrou no Descall",
  "signedOutBody": "Entre primeiro no app do Descall.",
  "openApp": "Abrir o Descall",
  "emptyTitle": "Ninguém ainda",
  "emptyBody": "Adicione amigos ou entre em um servidor.",
  "emptySearch": "Nenhum resultado para “{query}”",
  "noItems": "Nada para compartilhar",
  "run": {
    "title": "Enviando",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Enviando para # conversa} other {Enviando para # conversas}}",
    "stats": "{sent} / {total} · {speed}/s · cerca de {eta} s",
    "statsShort": "{sent} / {total}",
    "uploaded": "{done}/{count} enviados",
    "uploading": "Enviando · {percent}%",
    "queued": "Na fila · os mesmos arquivos não sobem de novo",
    "sending": "Enviando",
    "canClose": "Você pode fechar esta tela",
    "canCloseBody": "Continua em segundo plano; você recebe uma notificação no fim.",
    "background": "Continuar em segundo plano",
    "stop": "Parar envio"
  },
  "sent": {
    "title": "Enviado",
    "hero": "{count, plural, one {Enviado para # conversa} other {Enviado para # conversas}}",
    "sub": "{items} · {size} · em {seconds} s",
    "allArrived": "Tudo entregue",
    "delivered": "Entregue · {time}",
    "open": "Abrir",
    "openInApp": "Abrir no Descall"
  },
  "undo": {
    "button": "Desfazer",
    "title": "Desfazer",
    "body": "Removido para todos em {seconds} s",
    "bodyScheduled": "O agendamento pode ser cancelado por {seconds} s",
    "busy": "Desfazendo…"
  },
  "scheduled": {
    "title": "Agendado",
    "hero": "{count, plural, one {Agendado para # conversa} other {Agendado para # conversas}}",
    "sub": "Será enviado {when}",
    "row": "Agendado · {time}"
  },
  "slowRow": "Modo lento: o resto sai a partir de {time}",
  "partial": {
    "title": "Enviado em parte",
    "hero": "Enviado para {done}/{count} conversas",
    "sub": "{name}: {reason}",
    "itemsIn": "{ok}/{count} entregues",
    "itemsFailed": "{count, plural, one {Faltou # item: {reason}} other {Faltaram # itens: {reason}}}",
    "retryOne": "Repetir",
    "infoTitle": "O que foi enviado chegou",
    "infoBody": "Ao repetir, só vai o que falta; os arquivos não sobem de novo.",
    "retryFailed": "Repetir o que falhou",
    "dropFailed": "Deixar o que falhou e manter o resto"
  },
  "offline": {
    "title": "Ainda não enviado",
    "hero": "Sem conexão com a internet",
    "subNone": "Nada foi enviado",
    "subSome": "{done}/{count} prontas, o resto aguarda",
    "kept": "Guardado no aparelho",
    "queuedTitle": "Na fila",
    "queuedBody": "Quando a conexão voltar, {items} vão para {chats} sozinhos. Acompanhe pela notificação.",
    "row": "Na fila · tentará sozinho",
    "retryNow": "Tentar agora",
    "saveDraft": "Salvar como rascunho",
    "remove": "Remover da fila",
    "draftSaved": "Rascunho salvo; envie pela notificação"
  },
  "failed": {
    "title": "Não enviado",
    "hero": "Não foi possível enviar"
  },
  "undone": {
    "title": "Desfeito",
    "hero": "Envio desfeito",
    "sub": "As mensagens foram removidas para todos",
    "failed": "Algumas mensagens não foram removidas"
  },
  "notif": {
    "channel": "Compartilhamentos",
    "sending": "{count, plural, one {Enviando para # conversa} other {Enviando para # conversas}}",
    "sent": "Enviado",
    "failedItems": "{count, plural, one {# item não enviado} other {# itens não enviados}}",
    "waiting": "Aguardando internet · na fila",
    "stop": "Parar",
    "undo": "Desfazer · {seconds} s",
    "openChat": "Abrir conversa",
    "retry": "Tentar de novo",
    "details": "Detalhes",
    "sendDraft": "Enviar",
    "draft": "Rascunho: {items} · {chats}"
  },
  "kind": {
    "photos": "Fotos",
    "files": "Arquivos",
    "link": "Link",
    "text": "Texto"
  },
  "pdf": "PDF"
};
