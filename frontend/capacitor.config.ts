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
  },
  ios: {
    // Existing CSS already pads with env(safe-area-inset-*) — the WebView runs
    // edge-to-edge and the app paints its own colors under the status bar /
    // Dynamic Island and home indicator (src/styles/native-app.css).
    contentInset: "never",
    // Same slate as the LaunchScreen (Splash image background) and the native
    // boot splash, so launch → WebView → app never flashes black.
    backgroundColor: "#393C4D",
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
