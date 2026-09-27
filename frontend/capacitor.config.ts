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
    // Existing CSS already pads with env(safe-area-inset-*).
    contentInset: "never",
    backgroundColor: "#0b0c10",
    scheme: "Descall",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert", "banner", "list"],
    },
  },
};

export default config;
