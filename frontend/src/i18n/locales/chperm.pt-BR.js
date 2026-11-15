/** Channel permission notices: read-only channels, attachments, synced category rules, channel moves, user limit ("chperm.*", server audit P2 / P5). Same keys in every chperm.<locale>.js. */
export const CHPERM_PT_BR = {
  "readOnlyChannel": "Você não pode enviar mensagens neste canal.",
  "readOnlyAnnouncement": "Só moderadores podem publicar neste canal de anúncios.",
  "noAttachments": "Você não pode anexar arquivos neste canal.",
  "noVoiceMessages": "Você não pode enviar mensagens de voz neste canal.",
  "syncedWith": "Sincronizado com a categoria {name}: estas são as regras da categoria. Se você mudar uma aqui, o canal passa a ter regras próprias.",
  "category": "categoria",
  "userLimit": "Limite de usuários",
  "userLimitSub": "Quantas pessoas podem entrar ao mesmo tempo. 0 = sem limite (até 99).",
  "userLimitNone": "Sem limite",
  "userLimitInvalid": "Digite um número de 0 a 99.",
  "fromCategory": "Da categoria",
  "moveSyncTitle": "Permissões na nova categoria",
  "moveSyncMsg": "#{channel} tem permissões próprias e {category} tem outras. Quais ele deve usar?",
  "moveSyncUse": "Sincronizar com {category}",
  "moveSyncKeep": "Manter as próprias permissões",
  "movedKeptOwn": "#{channel} manteve as próprias permissões em {category}.",
};
