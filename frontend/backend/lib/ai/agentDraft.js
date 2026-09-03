"use strict";

function normalizeHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function convKey(a, b) {
  return [String(a || ""), String(b || "")].filter(Boolean).sort().join("::");
}

function looksLikeToolJson(text) {
  const s = String(text || "").trim();
  if (!s.startsWith("{")) return false;
  return /"(?:pending_action|action_id|toUserId|to_user_id|preview|content)"\s*:/.test(s);
}

function unwrapFence(text) {
  const s = String(text || "").trim();
  const m = s.match(/^```(?:[a-zA-Z0-9_+-]+)?\s*\n([\s\S]*?)\n```$/);
  return m ? m[1].trim() : s;
}

function unwrapQuotes(text) {
  const s = String(text || "").trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'") || (a === "“" && b === "”")) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

function polishOutboundText(text) {
  let s = unwrapQuotes(unwrapFence(String(text || "").trim()));
  s = s.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!s) return { error: "Draft the full message text first, then call this tool." };
  if (s.length > 4000) return { error: "Message is too long (max 4000 characters)." };
  if (looksLikeToolJson(s)) {
    return { error: "Draft looks like tool JSON. Write the actual message in the user's language." };
  }
  if (/\b(as an ai|i am (?:an? )?(?:ai|assistant|dima)|yapay zeka olarak)\b/i.test(s)) {
    return { error: "Do not mention being an AI in the outbound message. Rewrite it as the user." };
  }
  return { text: s };
}

function publicPerson(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name || user.displayName || null,
    avatar_url: user.avatar_url || user.avatarUrl || null,
  };
}

function scorePerson(user, query) {
  const q = String(query || "").toLowerCase();
  const username = String(user?.username || "").toLowerCase();
  const display = String(user?.display_name || user?.displayName || "").toLowerCase();
  if (!q) return 0;
  if (username === q) return 100;
  if (display === q) return 90;
  if (username.startsWith(q)) return 80;
  if (display.startsWith(q)) return 70;
  if (username.includes(q)) return 60;
  if (display.includes(q)) return 50;
  return 0;
}

module.exports = {
  normalizeHandle,
  convKey,
  looksLikeToolJson,
  polishOutboundText,
  publicPerson,
  scorePerson,
};
