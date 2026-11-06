/** Messaging phase 4 ("msg4.*"): drafts, unread jump, forwarding, link previews, Görüldü,
 * shortcuts, notification options, scheduled sending, Descall stickers. Same keys in every msg4.<locale>.js. */
export const MSG4_PT_BR = {
  draft: {
    label: "Rascunho:",
  },
  unread: {
    pill: "{count, plural, one {# nova mensagem} other {# novas mensagens}}",
    jump: "Ir para não lidas",
    dismiss: "Dispensar",
  },
  preview: {
    open: "Abrir link de {site}",
  },
  seen: {
    label: "Visto",
    at: "Visto às {time}",
    everyone: "Visto por todos",
    by: "Visto por {names}",
    byMore: "Visto por {names} +{count}",
    section: "Mensagens",
    setting: "Confirmações de leitura",
    settingDesc: "Se você desativar, ninguém verá quando você leu as mensagens, e você também não verá as dos outros.",
    saveError: "Não foi possível salvar. Tente de novo em instantes.",
  },
  forward: {
    action: "Encaminhar",
    label: "Encaminhada",
    title: "Encaminhar",
    search: "Buscar pessoas, grupos ou canais",
    people: "Pessoas",
    groups: "Grupos",
    channels: "Canais deste servidor",
    note: "Adicionar uma nota (opcional)",
    limit: "Você pode encaminhar para até {max} conversas.",
    send: "Enviar",
    sendCount: "{count, plural, one {Enviar para # conversa} other {Enviar para # conversas}}",
    done: "{count, plural, one {Encaminhada para # conversa} other {Encaminhada para # conversas}}",
  },
};
