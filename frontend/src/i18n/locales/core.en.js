/**
 * App shell strings (App.jsx, api/, context/, hooks/, lib/, auth / boot / ui components).
 * Same key tree as core.tr.js.
 */
export const CORE_EN = {
  http: {
    apiNotConfigured: "API URL is not configured. Please contact support.",
    invalidResponse: "The server returned an invalid response",
    connectionError: "Connection error",
  },
  dur: {
    h: "{h} h",
    m: "{m} min",
    hm: "{h} h {m} min",
    approxH: "~{n} h",
    approxM: "~{n} min",
  },
  app: {
    backendUnreachable: "Cannot reach backend ({url}). Check your network or VITE_API_BASE_URL setting.",
    reconnectAttempt: "Reconnecting… attempt {attempt}",
    socketReconnectFailed: "Socket reconnect failed. Check backend URL and CORS.",
    retryPollingFirst: "Connection retry: switching to polling-first…",
    retryPollingOnly: "Connection retry: switching to polling-only…",
    socketConnectFailed: "Socket connection failed. Check backend deploy status, backend URL, and CORS settings.",
    socketAuthFailed: "Socket authentication failed",
    acceptFailed: "Failed to accept",
    declineFailed: "Failed to decline",
    serverFallback: "Server",
  },
  seo: {
    serverInviteTitle: "Server invite, Descall",
    serverInviteDesc: "Join a Descall server",
    groupInviteTitle: "Group invite, Descall",
    groupInviteDesc: "Join a Descall group",
    appDesc: "Descall app",
  },
  download: {
    dmTitle: "Direct messages",
    dmDesc: "Typing indicators, replies and reactions",
    voiceTitle: "Voice Messages",
    voiceDesc: "Record a voice message and send it in any chat",
    videoTitle: "Video Calls",
    videoDesc: "Camera and screen share in DMs, groups and voice channels",
    serversTitle: "Servers and groups",
    serversDesc: "Text and voice channels with roles for your friends",
  },
  call: {
    mediaTitle: "Descall call",
    inCall: "In call",
    inCallWith: "In call with {name}",
    inProgress: "Call in progress",
  },
  fx: {
    none: "None",
    noneDesc: "No effects",
    robot: "Robot",
    robotDesc: "Robot voice effect",
    deep: "Deep",
    deepDesc: "Deep voice effect",
    helium: "Helium",
    heliumDesc: "High pitched voice",
    echo: "Echo",
    echoDesc: "Echo effect",
    radio: "Radio",
    radioDesc: "Radio/telephone effect",
  },
  boot: {
    loadingDescall: "Loading Descall",
  },
  screenPicker: {
    title: "Share your screen",
    tip: "Choose the screen, window, or browser tab you want to share.",
    screen: "Screen",
  },
  server: {
    slowmode: "Slowmode is on. Try again in {wait}s.",
    rulesRequired: "You must accept the server rules before continuing.",
  },
};
