/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_PT_BR = {
  "signIn": {
    "button": "Entrar com chave de acesso",
    "busy": "Aguardando sua chave de acesso…",
    "handoffTitle": "Continue no navegador",
    "handoffLead": "O Descall abriu no seu navegador. Confira se o código lá é {code} e confirme com sua chave de acesso.",
    "handoffReopen": "Abrir a página de novo",
    "cancel": "Cancelar",
    "autofillHint": "Toque no campo de usuário para ver também suas chaves de acesso salvas."
  },
  "settings": {
    "title": "Chaves de acesso",
    "lead": "Sua senha sempre continua. Uma chave de acesso é um jeito extra, mais rápido e seguro de entrar com sua digital, seu rosto ou o PIN do aparelho.",
    "empty": "Você ainda não adicionou uma chave de acesso.",
    "add": "Adicionar chave de acesso",
    "nameLabel": "Nome da chave de acesso",
    "namePlaceholder": "Nome (opcional), por exemplo Notebook do trabalho",
    "created": "Adicionada: {date}",
    "lastUsed": "Último uso: {date}",
    "neverUsed": "Ainda não usada",
    "synced": "Sincronizada",
    "thisDevice": "Um só aparelho",
    "suspended": "Desativada: pode ter sido copiada. Remova e adicione uma nova.",
    "rename": "Renomear",
    "save": "Salvar",
    "cancel": "Cancelar",
    "remove": "Remover",
    "removeTitle": "Remover esta chave de acesso?",
    "removeLead": "Você não poderá mais entrar com \"{name}\". Sua senha e suas outras chaves de acesso continuam funcionando. Você também pode apagar a cópia no aparelho nas configurações de senhas dele.",
    "added": "Chave de acesso adicionada.",
    "removed": "Chave de acesso removida.",
    "renamed": "Nome salvo.",
    "unavailableHere": "Este aparelho ou navegador não aceita chaves de acesso. Você pode adicionar uma em um aparelho compatível.",
    "loadFailed": "Não foi possível carregar suas chaves de acesso.",
    "sessionMethod": "Chave de acesso",
    "retry": "Tentar de novo",
    "count": "{count, plural, one {# chave de acesso} other {# chaves de acesso}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Computador",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Outro"
    }
  },
  "reauth": {
    "title": "Confirme que é você primeiro",
    "lead": "Para adicionar uma chave de acesso, confirme que esta conta é sua.",
    "password": "Senha atual",
    "code": "Código de 6 dígitos",
    "sendCode": "Enviar um código por e-mail",
    "codeSent": "Um código foi enviado para {email}.",
    "withPasskey": "Confirmar com uma chave de acesso existente",
    "totpHint": "Você também pode digitar o código do seu app autenticador.",
    "continue": "Continuar"
  },
  "err": {
    "cancelled": "Cancelado.",
    "no_credential": "Não há chave de acesso do Descall neste aparelho. Entre com sua senha e depois adicione uma em Configurações > Segurança.",
    "timeout": "O tempo acabou. Tente de novo.",
    "already_registered": "Você já tem uma chave de acesso do Descall neste aparelho.",
    "unsupported": "Este aparelho não aceita chaves de acesso.",
    "security": "Este aparelho ainda não verificou o domínio do Descall. Tente de novo daqui a pouco.",
    "busy": "Há outro pedido de chave de acesso aberto.",
    "aborted": "Cancelado.",
    "network": "Não foi possível falar com o Descall. Verifique sua conexão.",
    "server": "Algo deu errado. Tente de novo.",
    "unknown": "O pedido da chave de acesso não terminou. Tente de novo.",
    "uvRequired": "Seu aparelho não confirmou que é você (PIN, digital ou rosto). Tente de novo ou entre com sua senha.",
    "unknownCredential": "Esta chave de acesso não está mais na sua conta. Entre com sua senha.",
    "suspended": "Esta chave de acesso foi desativada porque pode ter sido copiada. Entre com sua senha e remova-a em Configurações > Segurança.",
    "unavailable": "As chaves de acesso não estão disponíveis agora. Entre com sua senha.",
    "reauthRequired": "Confirme que é você primeiro.",
    "limit": "Você chegou ao máximo de chaves de acesso. Remova uma primeiro.",
    "handoffExpired": "O link expirou. Comece de novo.",
    "badPassword": "Senha incorreta.",
    "badCode": "Código incorreto.",
    "badName": "Digite um nome.",
    "rateLimited": "Muitas tentativas. Espere um pouco."
  },
  "desktop": {
    "title": "Chave de acesso para o app do Descall no computador",
    "signinLead": "Use sua chave de acesso para entrar no app do Descall.",
    "registerLead": "Adicione uma chave de acesso a @{username} a partir deste navegador ou do seu celular.",
    "matchLabel": "Código no app",
    "matchHint": "Se este código não for o que você vê no app do Descall, não continue.",
    "signinButton": "Confirmar com chave de acesso",
    "registerButton": "Criar chave de acesso",
    "doneSignin": "Pronto. Você pode voltar ao app do Descall.",
    "doneRegister": "Chave de acesso adicionada. Você pode voltar ao app do Descall.",
    "expired": "Este link expirou ou já foi usado. Comece de novo no app do Descall.",
    "noCode": "Esta página abre a partir do app do Descall no computador.",
    "unsupported": "Este navegador não aceita chaves de acesso. Abra em um Chrome, Edge, Safari ou Firefox atual.",
    "loading": "Carregando…"
  },
  "login": {
    "button": {
      "passkey": "Entrar com chave de acesso",
      "face": "Entrar com Face ID",
      "finger": "Entrar com digital",
      "hello": "Entrar com Windows Hello"
    },
    "note": "Face ID, digital ou Windows Hello. Sua senha continua valendo."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "Digital",
      "web": "Chave de acesso"
    },
    "waitTitle": {
      "windows": "Aguardando o Windows Hello",
      "ios": "Aguardando o Face ID",
      "android": "Aguardando a digital",
      "web": "Aguardando sua chave de acesso"
    },
    "waitLead": {
      "windows": "Use seu rosto, digital ou PIN na janela do sistema.",
      "ios": "Use o Face ID na janela do sistema.",
      "android": "Use sua digital ou o bloqueio de tela na janela do sistema.",
      "web": "Escolha sua chave na janela do navegador e confirme."
    },
    "okTitle": "Bem-vindo, {name}",
    "okTitleNoName": "Bem-vindo",
    "okLead": "Você entrou com {method}. Isso conta como verificação em duas etapas, sem código.",
    "okProgress": "Abrindo seus servidores",
    "cancelTitle": "Login cancelado",
    "cancelLead": "Tudo bem. Tente de novo ou entre com sua senha.",
    "retry": "Tentar de novo",
    "password": "Usar senha",
    "errTitle": "Chave não verificada",
    "errLead": "Esta chave pode ter sido removida da sua conta, ou o pedido expirou.",
    "errDetail": "Detalhe: {detail}",
    "noneTitle": "Nenhuma chave neste aparelho",
    "noneLead": "Sua chave do Descall pode estar em outro aparelho.",
    "optPhone": "Entrar com o celular",
    "optPhoneSub": "Escaneie o código com o celular que tem a chave",
    "optKey": "Chave de segurança",
    "optKeySub": "USB ou NFC",
    "optPassword": "Entrar com senha",
    "optPasswordSub": "Depois você pode adicionar uma chave a este aparelho",
    "label": {
      "wait": "Janela do sistema aberta",
      "ok": "Sucesso",
      "cancel": "Cancelado",
      "err": "Erro",
      "none": "Sem chave neste aparelho"
    },
    "foot": {
      "windows": {
        "wait": "A janela do Windows Hello está aberta (rosto, digital ou PIN).",
        "ok": "O app abre logo depois.",
        "cancel": "Cancelar foi pressionado na janela do Windows.",
        "err": "O servidor não reconheceu a chave, ou o tempo acabou.",
        "none": "O Windows não achou chave do Descall neste computador."
      },
      "ios": {
        "wait": "A folha do iOS e a animação do Face ID estão abertas.",
        "ok": "Uma vibração háptica e seus chats abrem.",
        "cancel": "A folha do sistema foi fechada.",
        "err": "O servidor não reconheceu a chave, ou o tempo acabou.",
        "none": "Não há chave do Descall nas Chaves do iCloud."
      },
      "android": {
        "wait": "A folha do Gerenciador de senhas do Google está aberta.",
        "ok": "Uma vibração curta e seus chats abrem.",
        "cancel": "A folha foi fechada com o botão voltar.",
        "err": "O servidor não reconheceu a chave, ou o tempo acabou.",
        "none": "Não há chave do Descall neste celular."
      }
    }
  },
  "os": {
    "winHeader": "Segurança do Windows",
    "winTitle": "Entrar com sua chave de acesso",
    "winText": "Use o Windows Hello para entrar em {site}.",
    "winRecognizing": "Confirmando que é você",
    "winMore": "Mais opções",
    "cancel": "Cancelar",
    "qrTitle": "Entrar com o celular",
    "qrText": "Escaneie este código com a câmera do celular que tem sua chave.",
    "usbTitle": "Use sua chave de segurança",
    "usbText": "Conecte sua chave de segurança na porta USB e toque nela.",
    "usbWait": "Aguardando a chave",
    "gpmHeader": "Gerenciador de senhas do Google",
    "gpmTitle": "Usar sua chave salva",
    "gpmText": "Para descall.com. Confirme com o bloqueio de tela do computador.",
    "webText": "Escolha sua chave em {provider} e confirme.",
    "iosTitle": "Iniciar sessão",
    "iosText": "Quer entrar em descall.com com sua chave salva?",
    "iosSub": "Chaves do iCloud · Chave de acesso",
    "continue": "Continuar",
    "nfcTitle": "Chave de segurança",
    "nfcText": "Aproxime a chave da parte de cima do celular.",
    "nfcSub": "Por NFC",
    "nfcWait": "Aguardando",
    "andText": "Para entrar no Descall",
    "andSub": "Chave de acesso · Gerenciador de senhas do Google",
    "andTouch": "Toque no sensor de digital"
  },
  "preview": {
    "title": "O que você vê ao entrar",
    "live": "Ao vivo",
    "selected": "Selecionada: {name}. A janela que esta chave abre ao entrar:",
    "desktop": "Desktop · Windows",
    "phone": "Celular",
    "text": {
      "windows": "Uma chave do Windows Hello fica só neste computador. Celulares não a veem; lá você usa a senha ou a chave do próprio celular.",
      "ios": "Chaves do iCloud: um toque no iPhone, iPad e Mac. No Windows você escaneia o código com o iPhone e confirma.",
      "mac": "Chaves do iCloud: um toque no Mac, iPhone e iPad. No Windows você escaneia o código com o iPhone e confirma.",
      "android": "Gerenciador de senhas do Google: aparece no Android e no Chrome.",
      "key": "Chave de segurança: funciona em todo aparelho, por USB no computador e NFC no celular.",
      "web": "{provider}: aparece nos navegadores e celulares onde ele está instalado."
    },
    "idle": "{count, plural, one {Sem uso há # dia.} other {Sem uso há # dias.}}",
    "states": "Estados",
    "platform": "Plataforma",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Hoje {time}",
    "yesterday": "Ontem {time}",
    "yesterdayShort": "Ontem",
    "daysAgo": "{count, plural, one {há # dia} other {há # dias}}",
    "never": "Nunca usada",
    "now": "agora"
  },
  "center": {
    "crumbLabel": "Caminho",
    "crumbSecurity": "Segurança",
    "lead": "Login rápido sem senha. Sua senha continua valendo.",
    "kpi": {
      "count": "Chaves",
      "platforms": "{count, plural, one {em # plataforma} other {em # plataformas}}",
      "share": "Logins com chave",
      "basis": "Com base nas suas últimas {count} sessões",
      "mixLabel": "Chave {passkey}%, senha {password}%, Google e Apple {social}%",
      "noData": "Ainda sem dados",
      "speed": "Login médio",
      "seconds": "{s} s",
      "passwordSpeed": "Com senha: {s} s",
      "noMeasure": "Ainda não medido",
      "decimal": ",",
      "security": "Segurança",
      "methods": "{count, plural, one {# método} other {# métodos}}"
    },
    "level": {
      "excellent": "Muito boa",
      "good": "Boa",
      "fair": "Média",
      "weak": "Fraca"
    },
    "check": {
      "password": "Senha ou login verificado",
      "email": "E-mail verificado",
      "secondFactor": "Verificação em duas etapas",
      "passkey": "Pelo menos uma chave",
      "backup": "Segunda chave em outra plataforma",
      "fresh": "Nenhuma chave sem uso ou desativada"
    },
    "chip": {
      "password": "Senha",
      "alwaysOn": "Sempre ativa",
      "none": "Nenhuma",
      "app": "App autenticador",
      "email2fa": "Código por e-mail",
      "on": "Ativado",
      "off": "Desativado",
      "passkey": "Chave de acesso",
      "registered": "{count} salvas"
    },
    "stale": "A chave \"{name}\" não é usada há {count} dias. Se você não usa mais esse aparelho, é melhor removê-la.",
    "suspendedShort": "foi desativada porque pode ter sido copiada. Remova e adicione uma nova.",
    "review": "Ver",
    "offline": "Sem conexão. As mudanças voltam a funcionar quando você conectar; a lista é atualizada então.",
    "col": {
      "passkey": "Chave",
      "last": "Último uso",
      "added": "Adicionada",
      "usage": "30 dias"
    },
    "pill": {
      "thisDevice": "Este aparelho",
      "days": "{count} dias",
      "off": "Desativada",
      "counts2fa": "Conta como 2FA",
      "localOnly": "Só este aparelho",
      "synced": "Sincronizada",
      "noSync": "Não sincroniza"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "Chaves do iCloud",
      "mac": "Chaves do iCloud",
      "android": "Gerenciador de senhas do Google",
      "key": "Chave de segurança",
      "web": "Chave de acesso"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Desktop",
      "electron": "Desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Outro"
    },
    "via": {
      "web": "Web",
      "ios": "App do iPhone",
      "android": "App do Android",
      "windows": "App de desktop",
      "electron": "App de desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Outro"
    },
    "sync": {
      "local": "Só este aparelho",
      "icloud": "Sincroniza com iPhone, iPad e Mac",
      "google": "Sincroniza com Android e Chrome",
      "key": "USB / NFC, não sincroniza",
      "manager": "Sincroniza com {provider}",
      "synced": "Sincroniza entre seus aparelhos"
    },
    "drawer": {
      "sync": "Sincronização",
      "created": "Criada",
      "where": "Onde",
      "lastUsed": "Último uso",
      "place": "Local",
      "placeUnknown": "Desconhecido",
      "total": "Logins no total",
      "last30": "Últimos 30 dias",
      "count30": "{count, plural, one {# login} other {# logins}}",
      "info": "Ao entrar com esta chave nenhum código é pedido; conta como verificação em duas etapas.",
      "rename": "Renomear"
    },
    "remove": {
      "title": "Remover \"{name}\"?",
      "lead": "Você não poderá mais entrar com esta chave. Sua senha e outras chaves não mudam.",
      "current": "Você entrou com esta chave; esta sessão continua aberta.",
      "reason": "Motivo",
      "reasons": {
        "lost": "Perdi o aparelho",
        "unused": "Não uso mais",
        "readd": "Vou adicionar de novo",
        "other": "Outro"
      },
      "endSessions": "Encerrar também as outras sessões abertas com esta chave",
      "sessionsEnded": "{count, plural, one {# sessão encerrada.} other {# sessões encerradas.}}"
    },
    "added": {
      "title": "Chave adicionada",
      "sub": "{provider} · este aparelho",
      "name": "Nome",
      "undo": "Desfazer",
      "undone": "Desfeito, a chave foi removida."
    },
    "names": {
      "home": "PC de casa",
      "work": "PC do trabalho",
      "laptop": "Notebook",
      "gaming": "PC gamer",
      "macbook": "MacBook",
      "iphone": "Meu iPhone",
      "ipad": "iPad",
      "phone": "Meu celular",
      "tablet": "Tablet",
      "keyMain": "Chave principal",
      "keyBackup": "Chave reserva",
      "keyChain": "Chaveiro"
    },
    "add": {
      "ready": "Pronto. Continue e a janela de chaves do seu aparelho abre.",
      "thisDevice": {
        "passkey": "Este aparelho ou o gerenciador de senhas do navegador",
        "face": "Este iPhone · Face ID",
        "finger": "Este celular · digital",
        "hello": "Este computador · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "No celular: escaneie o código e salve com o celular",
        "securityKey": "Chave de segurança: USB ou NFC"
      }
    },
    "activity": {
      "title": "Atividade recente",
      "all": "Tudo",
      "empty": "Ainda sem atividade.",
      "signin": "Login com {name}",
      "added": "{name} adicionada",
      "renamed": "Renomeada para {name}",
      "removed": "{name} removida",
      "new_place": "{name} usada de um novo local",
      "suspended": "{name} desativada",
      "report_confirmed": "{name}: resposta \"Fui eu\"",
      "report_revoked": "{name}: \"Não fui eu\", sessões encerradas"
    },
    "backup": {
      "cap": "Dica de reserva",
      "title": "Adicione uma segunda chave",
      "lead": "Se perder um aparelho, você entra com o outro. Outra plataforma é o mais seguro.",
      "remoteDevice": "Adicionar no celular",
      "remoteDeviceSub": "Escaneie o código e salve com o celular",
      "securityKey": "Chave de segurança",
      "securityKeySub": "USB ou NFC",
      "computer": "Adicionar no computador",
      "computerSub": "descall.com › Configurações › Segurança › Chaves de acesso"
    },
    "email": {
      "cap": "E-mail de segurança",
      "title": "Uma nova chave de acesso foi adicionada à sua conta",
      "body": "\"{name}\"{provider} foi adicionada em {when} {from}. Se não foi você, remova agora e altere sua senha.",
      "fromPlace": "a partir de {place}",
      "fromSomewhere": "a partir de um local desconhecido",
      "notMe": "Não fui eu",
      "itWasMe": "Fui eu",
      "lead": "Este e-mail chega quando uma chave é adicionada ou usada de um novo local. \"Não fui eu\" remove a chave e encerra todas as sessões.",
      "noEmail": "Seu e-mail não está verificado, então estes e-mails não chegam. Verifique em Segurança."
    },
    "alert": {
      "cap": "Uso incomum",
      "titleCity": "{name} foi usada de uma nova cidade",
      "titleCountry": "{name} foi usada de um novo país",
      "signin": "Login: {place}",
      "before": "Antes só {places}",
      "firstFar": "Primeira vez que é usada aqui",
      "usual": "Local de costume",
      "me": "Fui eu",
      "revoke": "Remover e encerrar sessões",
      "confirmTitle": "Remover a chave e encerrar as outras sessões?",
      "confirmLead": "\"{name}\" é removida e todas as sessões, menos este aparelho, são encerradas. Depois é bom trocar a senha.",
      "doneMe": "Pronto, fechamos o alerta.",
      "doneRevoke": "{count, plural, one {Chave removida, # sessão encerrada.} other {Chave removida, # sessões encerradas.}}",
      "noneTitle": "Nenhum uso incomum",
      "noneLead": "Se uma chave entrar de uma cidade que nunca usou, avisamos aqui e por e-mail.",
      "countryOnly": "Nesta conexão só o país é conhecido; o alerta vem para um país novo."
    },
    "empty": {
      "title": "Ainda sem chaves",
      "lead": {
        "passkey": "Adicione uma chave a este aparelho; na próxima vez, sem senha e sem código.",
        "face": "Adicione uma chave com Face ID; na próxima vez, sem senha e sem código.",
        "finger": "Adicione uma chave com sua digital; na próxima vez, sem senha e sem código.",
        "hello": "Adicione uma chave com Windows Hello; na próxima vez, sem senha e sem código."
      }
    },
    "suggestToggle": "Sugerir uma chave depois de entrar com senha",
    "suggestToggleSub": "Só neste aparelho",
    "entry": {
      "title": "Chaves de acesso",
      "desc": "{count} salvas · Segurança {score}",
      "none": "Login rápido sem senha. Ainda sem chaves.",
      "alerts": "{count, plural, one {# alerta} other {# alertas}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "Na próxima vez, entre com Windows Hello",
      "ios": "Na próxima vez, entre com Face ID",
      "android": "Na próxima vez, entre com sua digital",
      "web": "Na próxima vez, entre com uma chave de acesso"
    },
    "phoneTitle": {
      "windows": "Entre mais rápido com Windows Hello",
      "ios": "Entre mais rápido com Face ID",
      "android": "Entre mais rápido com sua digital",
      "web": "Entre mais rápido com uma chave"
    },
    "lead": "Sem senha e sem código, em cerca de 2 segundos.",
    "phoneLead": "Na próxima vez, sem senha e sem código. Sua senha continua valendo.",
    "c1": "Sua senha fica; a chave é um caminho extra e mais rápido.",
    "c2": "Entrar com chave conta como verificação em duas etapas, sem código.",
    "c2short": "Conta como verificação em duas etapas.",
    "c3": "Seu rosto ou digital nunca saem deste aparelho.",
    "c3ios": "Funciona também no iPad e no Mac com as Chaves do iCloud.",
    "c3android": "Funciona também nos seus outros Android com o Gerenciador de senhas do Google.",
    "later": "Lembrar mais tarde",
    "notNow": "Agora não",
    "never": "Não perguntar de novo neste aparelho",
    "mini": "Sugestão de chave",
    "expand": "Abrir a sugestão de chave",
    "done": "Chave adicionada. Na próxima vez, entre com {method}.",
    "needsReauth": "Confirme que é você em Configurações para adicionar.",
    "openSettings": "Adicionar em Configurações",
    "signedIn": {
      "password": "Você entrou com senha",
      "2fa": "Você entrou com senha e código",
      "google": "Você entrou com o Google",
      "apple": "Você entrou com a Apple"
    }
  },
  "report": {
    "loading": "Carregando…",
    "invalidTitle": "Link inválido",
    "invalid": "Este link não é válido ou foi copiado incompleto. Toque de novo no botão do e-mail.",
    "expiredTitle": "Link expirado",
    "expired": "Este link expirou. Entre e confira Configurações > Segurança > Chaves de acesso.",
    "network": "Não foi possível acessar o Descall. Verifique sua conexão e tente de novo.",
    "title": {
      "added": "Uma nova chave de acesso foi adicionada à sua conta",
      "newPlace": "Sua chave de acesso foi usada de um novo local"
    },
    "passkey": "Chave",
    "when": "Hora",
    "place": "Local",
    "device": "Aparelho",
    "question": "Foi você?",
    "notMe": "Não fui eu",
    "revokeLead": "\"{name}\" é removida da sua conta e todas as sessões são encerradas. Depois entre com sua senha e troque-a.",
    "revokeLeadGone": "A chave já tinha sido removida. Encerramos todas as sessões da sua conta; depois troque sua senha.",
    "revokeButton": "Remover e encerrar todas as sessões",
    "itWasMe": "Fui eu",
    "confirmLead": "Nada muda; fechamos o alerta.",
    "confirmButton": "Sim, fui eu",
    "doneRevokedTitle": "Sua conta está segura",
    "doneRevoked": "{count, plural, one {Chave removida e # sessão encerrada. Troque sua senha agora.} other {Chave removida e # sessões encerradas. Troque sua senha agora.}}",
    "doneConfirmedTitle": "Obrigado",
    "doneConfirmed": "Fechamos o alerta.",
    "alreadyRevoked": "Este link já foi usado: a chave foi removida e as sessões encerradas.",
    "alreadyConfirmed": "Este alerta já foi respondido: \"Fui eu\".",
    "openApp": "Ir para o Descall",
    "changePassword": "Entrar e trocar a senha"
  }
};
