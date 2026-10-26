self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {};
  }

  const type = payload.type || "";
  if (type === "call-ring-ended") {
    event.waitUntil(handleRingEnded(payload));
    return;
  }
  const isCall = type === "call" || type === "group-call";
  const actions = isCall
    ? [
        { action: "answer", title: type === "group-call" ? "Katıl" : "Yanıtla" },
        { action: "decline", title: "Reddet" },
      ]
    : type === "dm" || type === "mention"
      ? [{ action: "open", title: "Aç" }]
      : [];

  event.waitUntil(self.registration.showNotification(payload.title || "Descall", {
    body: payload.body || "",
    icon: "/favicon-192.png?v=concept2",
    badge: "/favicon-32.png?v=concept2",
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
      callUuid: payload.callUuid || null,
    },
  }));
});

/** Answered / declined elsewhere: the result card closes itself after this. */
const RING_RESULT_VISIBLE_MS = 4000;

/**
 * The DM ring is over on the server (answered / declined on another device,
 * caller cancelled, missed). Close every ringing card from that caller,
 * tell open tabs to stop their ringtone + in-page card, and show a quiet
 * replacement with the same tag (a push must always show a notification).
 */
async function handleRingEnded(payload) {
  const fromId = payload.fromId || null;
  const tag = payload.tag || (fromId ? `call-${fromId}` : "incoming-call");
  const outcome = String(payload.outcome || "cancelled");
  try {
    const shown = await self.registration.getNotifications();
    for (const n of shown) {
      const d = n.data || {};
      const sameCaller = d.type === "call" && (!fromId || !d.fromId || d.fromId === fromId);
      if (n.tag === tag || sameCaller) {
        try { n.close(); } catch { /* ignore */ }
      }
    }
  } catch {
    /* ignore */
  }
  let focusedClient = false;
  try {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    focusedClient = windows.some((c) => c.focused);
    for (const client of windows) {
      client.postMessage({
        type: "descall:call-ring-ended",
        fromUserId: fromId,
        callUuid: payload.callUuid || null,
        reason: outcome,
      });
    }
  } catch {
    /* ignore */
  }
  const missed = outcome === "missed" || outcome === "cancelled";
  await self.registration.showNotification(payload.title || "Descall", {
    body: payload.body || "",
    icon: "/favicon-192.png?v=concept2",
    badge: "/favicon-32.png?v=concept2",
    tag,
    renotify: false,
    silent: true,
    requireInteraction: false,
    data: {
      deepLink: payload.deepLink || "/",
      type: missed ? "missed-call" : "call-ring-ended",
      action: "open",
      fromId,
      conversationId: fromId,
      outcome,
    },
  });
  if (!missed) {
    // A focused Descall tab is (almost always) the device that answered:
    // "answered on another device" would be wrong there, so the replacement
    // only satisfies the show-a-notification rule and is closed at once.
    if (!focusedClient) await new Promise((resolve) => setTimeout(resolve, RING_RESULT_VISIBLE_MS));
    try {
      const again = await self.registration.getNotifications({ tag });
      for (const n of again) {
        if ((n.data || {}).type === "call-ring-ended") n.close();
      }
    } catch {
      /* ignore */
    }
  }
}

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

/* No fetch handler on purpose: the app shell and bundles always come from the
   network (HTML is max-age=0), so this worker can never serve a stale build.
   A new worker still takes over right away so push / ring fixes ship at once. */
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
