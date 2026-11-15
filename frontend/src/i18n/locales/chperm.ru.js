/** Channel permission notices: read-only channels, attachments, synced category rules, channel moves, user limit ("chperm.*", server audit P2 / P5). Same keys in every chperm.<locale>.js. */
export const CHPERM_RU = {
  "readOnlyChannel": "Ты не можешь отправлять сообщения в этом канале.",
  "readOnlyAnnouncement": "Публиковать в этом канале объявлений могут только модераторы.",
  "noAttachments": "Ты не можешь прикреплять файлы в этом канале.",
  "noVoiceMessages": "Ты не можешь отправлять голосовые сообщения в этом канале.",
  "syncedWith": "Синхронизировано с категорией {name}: это правила категории. Если изменить одно из них здесь, у канала появятся свои правила.",
  "category": "категория",
  "userLimit": "Лимит участников",
  "userLimitSub": "Сколько человек может подключиться одновременно. 0 = без ограничений (до 99).",
  "userLimitNone": "Без ограничений",
  "userLimitInvalid": "Введи число от 0 до 99.",
  "fromCategory": "Из категории",
  "moveSyncTitle": "Права в новой категории",
  "moveSyncMsg": "У #{channel} свои права, а у {category} другие. Какие использовать?",
  "moveSyncUse": "Синхронизировать с {category}",
  "moveSyncKeep": "Оставить свои права",
  "movedKeptOwn": "#{channel} сохранил свои права в {category}.",
};
