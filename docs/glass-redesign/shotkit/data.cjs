// Clearly fake demo data for App Store screenshots. No real users.
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const U = (id, username, displayName, status = "online") => ({
  id, username, displayName, display_name: displayName, avatarUrl: null, avatar_url: null,
  status, online: status !== "offline", bio: null, customStatus: null,
  created_at: "2026-01-10T10:00:00.000Z", updated_at: "2026-01-10T10:00:00.000Z",
});
const ME = {
  ...U("00000000-0000-4000-8000-000000000001", "deniz", "Deniz"),
  email: "demo@example.com", email_confirmed_at: iso(10000), birthDate: "2000-05-05", birth_date: "2000-05-05",
  is_admin: false, isAdmin: false, descoin_balance: 1250, descoinBalance: 1250, verified: true,
  two_factor_enabled: false, valorant: null,
  ...(process.env.MOCK_STATUS ? { customStatus: "🔥 Ranked arıyorum", custom_status: "🔥 Ranked arıyorum" } : {}),
};
const AYSE = Object.assign(U("00000000-0000-4000-8000-000000000002", process.env.AYSE_USERNAME || "ayse", process.env.AYSE_NAME || "Ayşe"),
  process.env.AYSE_ADMIN ? { is_admin: true, isAdmin: true, role: "admin" } : {});
const MERT = U("00000000-0000-4000-8000-000000000003", "mert", "Mert");
const ZEYNEP = U("00000000-0000-4000-8000-000000000004", "zeynep", "Zeynep", "idle");
const CAN = U("00000000-0000-4000-8000-000000000005", "can", "Can", "dnd");
const ELIF = U("00000000-0000-4000-8000-000000000006", "elif", "Elif");
const BURAK = U("00000000-0000-4000-8000-000000000007", "burak", "Burak", "offline");
const FRIENDS = [AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK];
module.exports = { now, iso, U, ME, AYSE, MERT, ZEYNEP, CAN, ELIF, BURAK, FRIENDS };
