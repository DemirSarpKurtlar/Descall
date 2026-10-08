import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.descall.app",
  appName: "Descall",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    // WebRTC media APIs require a secure context.
    // Android uses https. iOS cannot register http/https as iosScheme
    // (WKWebView already handles those); capacitor://localhost is the
    // secure context getUserMedia uses there.
    androidScheme: "https",
    hostname: "localhost",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Same dark surface as the Android 12+ splash (values/colors.xml
    // splash_background) and the in-app boot splash.
    backgroundColor: "#1E1F22",
  },
  ios: {
    // Existing CSS already pads with env(safe-area-inset-*) — the WebView runs
    // edge-to-edge and the app paints its own colors under the status bar /
    // Dynamic Island and home indicator (src/styles/native-app.css).
    contentInset: "never",
    // The app's dark surface (--surface-1, chat list) — same as the LaunchScreen
    // background and the in-app boot splash, so launch → WebView → app has no
    // color jump.
    backgroundColor: "#1E1F22",
    scheme: "Descall",
  },
  plugins: {
    PushNotifications: {
      // Foreground: banner without the system sound; the open app already
      // plays its own message sound. The chat on screen gets no push at all
      // (backend lib/iosPushContext.js).
      presentationOptions: ["badge", "alert", "banner", "list"],
    },
  },
};

export default config;
