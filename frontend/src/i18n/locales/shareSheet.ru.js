/** "Paylaş > Descall" share sheet ("shareSheet.*", src/components/share). Same keys in every shareSheet.<locale>.js; scripts/gen-share-native-strings.mjs copies them to iOS (DescallShare/ShareStrings.swift) and Android (res/values(-xx)/share_strings.xml). */
export const SHARE_SHEET_RU = {
  "title": "Отправить в Descall",
  "source": "{app} · {items}",
  "itemsSize": "{items} · {size}",
  "items": "{count, plural, one {# объект} few {# объекта} many {# объектов} other {# объекта}}",
  "chats": "{count, plural, one {# чат} few {# чата} many {# чатов} other {# чата}}",
  "cancel": "Отмена",
  "close": "Закрыть",
  "done": "Готово",
  "hide": "Скрыть",
  "options": "Параметры",
  "remove": "Убрать",
  "search": "Поиск людей, групп или каналов",
  "clearSearch": "Очистить поиск",
  "tabs": {
    "all": "Все",
    "friends": "Друзья",
    "groups": "Группы",
    "servers": "Серверы"
  },
  "sec": {
    "friends": "Друзья",
    "groups": "Группы",
    "channels": "Каналы серверов",
    "suggested": "Рекомендуемые"
  },
  "server": {
    "channels": "{count, plural, one {# канал} few {# канала} many {# каналов} other {# канала}}",
    "sendable": "Можно писать в {count}",
    "none": "Нет каналов, где можно писать"
  },
  "saved": "на {percent}% меньше",
  "presence": {
    "online": "В сети",
    "idle": "Отошёл",
    "dnd": "Не беспокоить",
    "offline": "Не в сети"
  },
  "row": {
    "channel": "Канал сервера",
    "slowMode": "Медленный режим: {seconds} с",
    "lastShared": {
      "today": "Вы делились последним · сегодня",
      "yesterday": "Вы делились последним · вчера",
      "days": "Вы делились последним · {count} дн. назад"
    },
    "members": "Участников: {members}",
    "membersOnline": "Участников: {members} · в сети: {online}",
    "groupShared": {
      "today": "Участников: {members} · сегодня отправлено: {count}",
      "yesterday": "Участников: {members} · вчера отправлено: {count}",
      "days": "Участников: {members} · {days} дн. назад отправлено: {count}"
    },
    "dmShared": {
      "today": "{presence} · сегодня отправлено: {count}",
      "yesterday": "{presence} · вчера отправлено: {count}",
      "days": "{presence} · {days} дн. назад отправлено: {count}"
    }
  },
  "reason": {
    "no_permission": "Нет права писать",
    "announcement": "Писать могут только модераторы",
    "timed_out": "Вы временно ограничены",
    "no_attach": "Нельзя отправлять файлы",
    "blocked": "Заблокирован",
    "not_friends": "Вы больше не друзья",
    "unknown": "Недоступно",
    "rules_required": "Сначала примите правила сервера",
    "failed": "Не удалось отправить",
    "offline": "Соединение потеряно",
    "upload_failed": "Не удалось загрузить",
    "timeout": "Время ожидания истекло",
    "too_large": "Больше 100 МБ",
    "type": "Этот тип файла нельзя отправить",
    "slowmode": "Медленный режим",
    "rate_limited": "Слишком быстро, подождите",
    "content_blocked": "Заблокировано фильтром",
    "attachment_unavailable": "Вложение недоступно",
    "signed_out": "Вы вышли из аккаунта",
    "cancelled": "Остановлено",
    "too_many_scheduled": "Слишком много отложенных сообщений",
    "too_long": "Сообщение слишком длинное"
  },
  "message": "Добавить сообщение (необязательно)",
  "quality": {
    "original": "Оригинал",
    "originalDesc": "Полное разрешение, 4K видео · {size}",
    "high": "Высокое (рекомендуется)",
    "highDesc": "JPEG, видео 1080p · {size}",
    "saver": "Экономия трафика",
    "saverDesc": "Быстро через мобильный интернет · {size}",
    "chip": {
      "original": "Оригинал",
      "high": "Высокое",
      "saver": "Эконом"
    },
    "title": "Качество отправки"
  },
  "location": {
    "title": "Удалить геоданные",
    "desc": "GPS и данные устройства в фото",
    "chipOn": "Без геоданных",
    "chipOff": "С геоданными"
  },
  "silent": "Без звука",
  "silentHint": "Без уведомления, но останется непрочитанным",
  "scheduleChip": "Отложить",
  "scheduleTitle": "Когда отправить?",
  "schedule": {
    "inHour": "Через час",
    "tonight": "Сегодня в 20:00",
    "tomorrow": "Завтра в 09:00",
    "custom": "Выбрать дату и время",
    "set": "Готово",
    "now": "Отправить сейчас",
    "invalid": "Выберите время хотя бы через минуту"
  },
  "send": "{count, plural, one {Отправить в # чат} few {Отправить в # чата} many {Отправить в # чатов} other {Отправить в # чата}}",
  "sendShort": "{count, plural, one {# чат} few {# чата} many {# чатов} other {# чата}}",
  "sendScheduled": "{count, plural, one {Отложить в # чат} few {Отложить в # чата} many {Отложить в # чатов} other {Отложить в # чата}}",
  "pick": "Выберите получателей",
  "when": {
    "today": "сегодня",
    "yesterday": "вчера",
    "days": "{count} дн. назад"
  },
  "dup": {
    "link": "Вы отправляли эту ссылку в чат {name} {when}",
    "file": "Вы отправляли это в чат {name} {when}",
    "body": "Отправка всё равно пройдёт. Можно убрать {name} из получателей.",
    "remove": "Убрать"
  },
  "limitTargets": "Можно выбрать до {count} чатов",
  "limitItems": "Не больше {count} объектов, лишние убраны",
  "targetRemoved": "{name} убран: {reason}",
  "errorTitle": "Не удалось загрузить список",
  "errorOffline": "Нет интернета. После отправки всё встанет в очередь.",
  "retry": "Повторить",
  "signedOutTitle": "Вы не вошли в Descall",
  "signedOutBody": "Сначала войдите в приложение Descall.",
  "openApp": "Открыть Descall",
  "emptyTitle": "Пока никого нет",
  "emptyBody": "Добавьте друзей или вступите на сервер.",
  "emptySearch": "Ничего не найдено по запросу «{query}»",
  "noItems": "Нечего отправить",
  "run": {
    "title": "Отправка",
    "sub": "{items} · {chats}",
    "hero": "{count, plural, one {Отправка в # чат} few {Отправка в # чата} many {Отправка в # чатов} other {Отправка в # чата}}",
    "stats": "{sent} / {total} · {speed}/с · около {eta} с",
    "statsShort": "{sent} / {total}",
    "uploaded": "Загружено {done}/{count}",
    "uploading": "Загрузка · {percent}%",
    "queued": "В очереди · те же файлы не загружаются повторно",
    "sending": "Отправка",
    "canClose": "Это окно можно закрыть",
    "canCloseBody": "Отправка продолжится в фоне, по окончании придёт уведомление.",
    "background": "Продолжить в фоне",
    "stop": "Остановить отправку"
  },
  "sent": {
    "title": "Отправлено",
    "hero": "{count, plural, one {Отправлено в # чат} few {Отправлено в # чата} many {Отправлено в # чатов} other {Отправлено в # чата}}",
    "sub": "{items} · {size} · за {seconds} с",
    "allArrived": "Всё доставлено",
    "delivered": "Доставлено · {time}",
    "open": "Открыть",
    "openInApp": "Открыть в Descall"
  },
  "undo": {
    "button": "Отменить",
    "title": "Отмена",
    "body": "Удалится у всех в течение {seconds} с",
    "bodyScheduled": "Отложенную отправку можно отменить {seconds} с",
    "busy": "Отмена…"
  },
  "scheduled": {
    "title": "Отложено",
    "hero": "{count, plural, one {Отложено в # чат} few {Отложено в # чата} many {Отложено в # чатов} other {Отложено в # чата}}",
    "sub": "Отправится {when}",
    "row": "Отложено · {time}"
  },
  "slowRow": "Медленный режим: остальное с {time}",
  "partial": {
    "title": "Отправлено частично",
    "hero": "Отправлено в {done}/{count} чатов",
    "sub": "{name}: {reason}",
    "itemsIn": "Доставлено {ok}/{count}",
    "itemsFailed": "{count, plural, one {Не дошёл # объект: {reason}} few {Не дошли # объекта: {reason}} many {Не дошли # объектов: {reason}} other {Не дошли # объекта: {reason}}}",
    "retryOne": "Повторить",
    "infoTitle": "Отправленное дошло",
    "infoBody": "Повтор отправит только недостающее, файлы не загружаются заново.",
    "retryFailed": "Повторить неудачное",
    "dropFailed": "Пропустить неудачное, оставить остальное"
  },
  "offline": {
    "title": "Пока не отправлено",
    "hero": "Нет подключения к интернету",
    "subNone": "Ничего не отправлено",
    "subSome": "Готово {done}/{count}, остальное ждёт",
    "kept": "Сохранено на устройстве",
    "queuedTitle": "В очереди",
    "queuedBody": "Когда появится сеть, {items} уйдут в {chats}. Следите в уведомлении.",
    "row": "В очереди · повторится автоматически",
    "retryNow": "Повторить сейчас",
    "saveDraft": "Сохранить как черновик",
    "remove": "Убрать из очереди",
    "draftSaved": "Черновик сохранён, отправьте его из уведомления"
  },
  "failed": {
    "title": "Не отправлено",
    "hero": "Не удалось отправить"
  },
  "undone": {
    "title": "Отменено",
    "hero": "Отправка отменена",
    "sub": "Сообщения удалены у всех",
    "failed": "Некоторые сообщения не удалось удалить"
  },
  "notif": {
    "channel": "Отправки",
    "sending": "{count, plural, one {Отправка в # чат} few {Отправка в # чата} many {Отправка в # чатов} other {Отправка в # чата}}",
    "sent": "Отправлено",
    "failedItems": "{count, plural, one {# объект не отправлен} few {# объекта не отправлены} many {# объектов не отправлены} other {# объекта не отправлены}}",
    "waiting": "Ждём интернет · в очереди",
    "stop": "Стоп",
    "undo": "Отменить · {seconds} с",
    "openChat": "Открыть чат",
    "retry": "Повторить",
    "details": "Подробнее",
    "sendDraft": "Отправить",
    "draft": "Черновик: {items} · {chats}"
  },
  "kind": {
    "photos": "Фото",
    "files": "Файлы",
    "link": "Ссылка",
    "text": "Текст"
  },
  "pdf": "PDF"
};
