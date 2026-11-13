/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_PT_BR = {
  roles: {
    section: "Cargos",
    subRole: "Cargo · os membros dele são notificados",
    subRoleAdmin: "Cargo · só administradores podem mencioná-lo",
    subEveryone: "Notifica todo mundo que vê este canal",
    subHere: "Notifica quem está on-line agora",
    unknown: "cargo desconhecido",
    aria: "Cargo: {name}",
    popover: "Cargo · {name}",
    everyoneCooldown: "Você pode usar @everyone ou @here de novo em {wait} s.",
  },
  preview: {
    settingDesc: "Desligado: as notificações do app, do navegador e do celular mostram só \"Nova mensagem\" em vez do texto.",
    saveError: "Não foi possível salvar. Tente de novo daqui a pouco.",
  },
  schedule: {
    addAttachment: "Adicionar arquivo",
    attachmentHint: "Uma foto ou um arquivo, até 100 MB",
    attachment: "Anexo",
    attachmentKept: "O anexo continua; você pode mudar o texto e o horário.",
    removeAttachment: "Remover anexo",
    errAttachment: "Este arquivo não pode ser agendado. Escolha uma foto, um vídeo ou um documento.",
    errTooLarge: "O arquivo é grande demais. O limite é 100 MB.",
    errAttachNotReady: "Agendar com arquivo ainda não está ativo no servidor. Remova o arquivo para agendar só o texto.",
    errUpload: "Não foi possível enviar o arquivo. Verifique sua conexão e tente de novo.",
  },
  reengage: {
    friendVoice: "Amigo no canal de voz",
    friendVoiceDesc: "Uma notificação quando um amigo entra em um canal de voz em que você pode entrar enquanto está fora. No máximo algumas por dia, nunca à noite.",
    email: "Notificações por e-mail",
    emailDesc: "E-mails sobre pedidos de amizade e convites que você perdeu, e algumas dicas para contas novas.",
  },
  media: {
    imageFailed: "Não foi possível carregar a imagem",
    videoFailed: "Não foi possível carregar o vídeo",
  },
};
