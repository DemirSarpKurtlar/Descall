/* Mounts the "Google'da göster" desk alone (window or embedded), API answered by
   capture.cjs through Playwright routes. Synthetic data only. */
import { createRoot } from "react-dom/client";
import "../../../src/styles/design-tokens.css";
import { LocaleProvider } from "../../../src/context/LocaleContext.jsx";
import { setToken } from "../../../src/lib/storage.js";
import PublicPageDesk from "../../../src/components/servers/publicPage/PublicPageDesk.jsx";

const q = new URLSearchParams(location.search);
try {
  localStorage.setItem("descall_language", q.get("lang") || "tr");
} catch {
  /* ignore */
}
try {
  setToken("harness-token");
} catch {
  /* ignore */
}
const theme = q.get("theme") === "light" ? "light" : "dark";
document.documentElement.setAttribute("data-theme", theme);
document.body.style.margin = "0";
document.body.style.minHeight = "100vh";
document.body.style.background = theme === "light" ? "#e9ecf3" : "radial-gradient(900px 600px at 12% -5%,rgba(88,122,245,.30),transparent 60%),#0b0c12";
const server = { id: "srv-1", name: "Anadolu Craft", isOwner: true, iconUrl: "https://abc.supabase.co/storage/v1/object/public/icon.png", permissions: "8" };
const nav = [
  { title: "Sunucu", items: [{ key: "overview", tile: "gray", icon: "sliders", label: "Genel bakış" }, { key: "channels", tile: "blue", icon: "hash", label: "Kanallar" }, { key: "community", tile: "green", icon: "globe", label: "Topluluk ve Keşif" }, { key: "rules", tile: "teal", icon: "book", label: "Kurallar" }] },
  { title: "Üyeler", items: [{ key: "members", tile: "indigo", icon: "users", label: "Üyeler" }, { key: "roles", tile: "purple", icon: "shield", label: "Roller" }, { key: "invites", tile: "brand", icon: "link", label: "Davetler" }] },
  { title: "Moderasyon", items: [{ key: "bans", tile: "red", icon: "x", label: "Yasaklar" }, { key: "audit", tile: "orange", icon: "clock", label: "Denetim kaydı" }] },
];
const embedded = q.get("mode") === "embedded";
createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    {embedded ? (
      <div style={{ maxWidth: q.get("w") ? Number(q.get("w")) : 430, margin: "0 auto" }}>
        <PublicPageDesk server={server} mode="embedded" />
      </div>
    ) : (
      <PublicPageDesk server={server} mode="window" navItems={nav} onClose={() => {}} onNavigate={() => {}} />
    )}
  </LocaleProvider>
);
