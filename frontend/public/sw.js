self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {};
  }

  const type = payload.type || "";
  const isCall = type === "call" || type === "group-call";
  const actions = isCall
    ? [
        { action: "answer", title: type === "group-call" ? "Join" : "Answer" },
        { action: "decline", title: "Decline" },
      ]
    : type === "dm" || type === "mention"
      ? [{ action: "open", title: "Open" }]
      : [];

  event.waitUntil(self.registration.showNotification(payload.title || "Descall", {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "descall",
    renotify: true,
    requireInteraction: isCall,
    actions,
    data: {
      deepLink: payload.deepLink || "/",
      type,
      action: payload.action || "open",
      fromId: payload.fromId || null,
      from: payload.from || null,
      conversationId: payload.conversationId || payload.fromId || null,
      groupId: payload.groupId || null,
      serverId: payload.serverId || null,
      channelId: payload.channelId || null,
      callType: payload.callType || null,
    },
  }));
});

// Page asks us to drop an incoming-call push once the ring is over
// (accepted, declined, cancelled, ended, missed, answered on another device).
// Message / mention notifications are not selected.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "descall:close-call-notifications") return;
  const tags = new Set(Array.isArray(data.tags) ? data.tags : []);
  const kind = data.kind === "group" ? "group" : "dm";
  event.waitUntil((async () => {
    let notifications = [];
    try {
      notifications = await self.registration.getNotifications();
    } catch {
      return;
    }
    for (const notification of notifications) {
      const payload = notification.data || {};
      const tagHit = Boolean(notification.tag && tags.has(notification.tag));
      const dmHit = kind === "dm"
        && payload.type === "call"
        && (!data.fromId || !payload.fromId || payload.fromId === data.fromId);
      const groupHit = kind === "group"
        && payload.type === "group-call"
        && (!data.groupId || !payload.groupId || payload.groupId === data.groupId);
      if (tagHit || dmHit || groupHit) {
        try { notification.close(); } catch { /* ignore */ }
      }
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const clickAction = event.action || data.action || "open";
  const deepLink = new URL(data.deepLink || "/", self.location.origin).href;
  const message = {
    type: "descall:notification-click",
    deepLink,
    ...data,
    action: clickAction,
  };

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      existing.postMessage(message);
      return;
    }
    await clients.openWindow(deepLink);
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        client.postMessage({ type: "descall:pushsubscriptionchange" });
      }
    } catch {
      /* ignore */
    }
  })());
});
