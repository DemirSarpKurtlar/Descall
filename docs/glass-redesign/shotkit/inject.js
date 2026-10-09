// Mocked Capacitor iOS bridge (no native code). Plugin calls resolve with harmless stubs.
(function () {
  window.webkit = { messageHandlers: { bridge: { postMessage: function () {} } } };
  var methods = function (names) { return names.map(function (n) { return { name: n, rtype: n === "addListener" ? "callback" : "promise" }; }); };
  var stubs = {
    "PushNotifications.checkPermissions": { receive: "granted" },
    "PushNotifications.requestPermissions": { receive: "granted" },
    "DescallCallKit.isAvailable": { available: false },
    "DescallCallKit.drainEvents": { events: [] },
    "DescallCallKit.getVoipToken": { token: "" },
    "DescallCallKit.getAudioDiagnostics": {},
    // Liquid Glass display state (DescallDisplayPlugin.swift). Overridable per shot
    // via window.__DESCALL_DISPLAY__ set before the app boots.
    "DescallDisplay.getState": Object.assign({ reduceTransparency: false, darkerColors: false, lowPower: false, thermal: "nominal", machine: "iPhone18,2" }, window.__DESCALL_DISPLAY__ || {}),
    "DescallDisplay.setStatusBarStyle": {},
  };
  window.Capacitor = {
    getPlatform: function () { return "ios"; },
    isNativePlatform: function () { return true; },
    PluginHeaders: [
      { name: "PushNotifications", methods: methods(["register","checkPermissions","requestPermissions","addListener","removeAllListeners","getDeliveredNotifications","removeAllDeliveredNotifications","removeDeliveredNotifications","createChannel","listChannels","deleteChannel","unregister"]) },
      { name: "DescallCallKit", methods: methods(["addListener","beginCallAudio","drainEvents","endCallAudio","getAudioDiagnostics","getVoipToken","isAvailable","reactivateCapture","setAudioRoute","reportIncomingCall","endCall","startCall","reportOutgoingCall"]) },
      { name: "CallKeepAlive", methods: methods(["start","stop","addListener"]) },
      { name: "AppleSignIn", methods: methods(["authorize"]) },
      { name: "DescallDisplay", methods: methods(["getState","setStatusBarStyle","addListener"]) },
    ],
    nativePromise: function (plugin, method) { return Promise.resolve(stubs[plugin + "." + method] || {}); },
    nativeCallback: function () { return "cb-" + Math.random().toString(36).slice(2); },
  };
})();
