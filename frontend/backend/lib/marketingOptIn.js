"use strict";

/**
 * Product-update opt-in. Double opt-in, no IP, unsubscribe link in every mail.
 * A missing marketing_subscribers table is tolerated so the public form still
 * answers { ok: true } until the additive migration is applied.
 */

const crypto = require("crypto");
const supabase = require("../db/supabase");
const { sendEmail, escapeHtml } = require("./mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicOrigin(env = process.env) {
  return String(env.PUBLIC_APP_URL || "https://descall.com").replace(/\/$/, "");
}

function createOptInTokens() {
  return {
    confirmToken: crypto.randomBytes(32).toString("hex"),
    unsubscribeToken: crypto.randomBytes(32).toString("hex"),
  };
}

function confirmUrl(token, env = process.env) {
  return `${publicOrigin(env)}/api/marketing/confirm?token=${encodeURIComponent(token)}`;
}

function unsubscribeUrl(token, env = process.env) {
  return `${publicOrigin(env)}/api/marketing/unsubscribe?token=${encodeURIComponent(token)}`;
}

function marketingFooterText(link) {
  return `\n\nUnsubscribe any time: ${link}\n`;
}

function marketingFooterHtml(link) {
  const href = escapeHtml(link);
  return `<p style="margin-top:24px;font-size:12px;color:#666">Unsubscribe any time: <a href="${href}">${href}</a></p>`;
}

function isMissingTable(error) {
  const msg = String(error?.message || error?.details || error?.hint || error || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42P01" || code === "PGRST205" || msg.includes("marketing_subscribers") || msg.includes("does not exist") || msg.includes("schema cache");
}

function copyFor(locale) {
  if (String(locale || "").toLowerCase().startsWith("tr")) {
    return {
      subject: "Descall ürün güncellemelerini onaylayın",
      text: "Descall ürün notlarını almak için bu bağlantıyı açın. Onaylamazsanız size yazmayız.",
      htmlLead: "Descall ürün notlarını almak için aşağıdaki bağlantıyı açın. Onaylamazsanız size yazmayız.",
      confirmLabel: "Aboneliği onayla",
      pageConfirm: "Aboneliğiniz onaylandı. İstediğiniz zaman abonelikten çıkabilirsiniz.",
      pageGone: "Bu bağlantı geçersiz veya süresi dolmuş.",
      pageUnsub: "Abonelikten çıktınız. Size bir daha ürün e-postası göndermeyeceğiz.",
    };
  }
  return {
    subject: "Confirm Descall product updates",
    text: "Open this link to confirm product notes from Descall. If you do not confirm, we will not email you.",
    htmlLead: "Open the link below to confirm product notes from Descall. If you do not confirm, we will not email you.",
    confirmLabel: "Confirm subscription",
    pageConfirm: "You are confirmed. You can unsubscribe any time.",
    pageGone: "This link is invalid or has already been used.",
    pageUnsub: "You are unsubscribed. We will not send you product emails.",
  };
}

function pageHtml(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;padding:32px;max-width:560px;margin:auto"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body></html>`;
}

async function sendConfirmEmail({ email, locale, confirmToken, unsubscribeToken }) {
  const copy = copyFor(locale);
  const confirm = confirmUrl(confirmToken);
  const unsub = unsubscribeUrl(unsubscribeToken);
  const text = `${copy.text}\n\n${confirm}${marketingFooterText(unsub)}`;
  const html = `<p>${escapeHtml(copy.htmlLead)}</p><p><a href="${escapeHtml(confirm)}">${escapeHtml(copy.confirmLabel)}</a></p>${marketingFooterHtml(unsub)}`;
  await sendEmail({ to: email, subject: copy.subject, text, html });
}

/**
 * Store an opt-in and send the confirmation mail.
 * Returns { ok: true, stored }. Never throws for a missing table.
 */
async function subscribe({ email, source, path, locale, consentText }) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    const err = new Error("Invalid email");
    err.status = 400;
    throw err;
  }
  const tokens = createOptInTokens();
  const now = new Date().toISOString();
  const row = {
    email: normalized,
    source: String(source || "unknown").slice(0, 64),
    consent_record: {
      source: String(source || "unknown").slice(0, 64),
      path: String(path || "").slice(0, 128),
      locale: String(locale || "en").slice(0, 16),
      text: String(consentText || "Get occasional release notes — no spam, unsubscribe anytime.").slice(0, 240),
      at: now,
    },
    confirmed_at: null,
    unsubscribed_at: null,
    confirm_token: tokens.confirmToken,
    unsubscribe_token: tokens.unsubscribeToken,
    created_at: now,
  };
  try {
    const { data: existing, error: readErr } = await supabase
      .from("marketing_subscribers")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (readErr) throw readErr;
    if (existing?.id) {
      const { error: updErr } = await supabase
        .from("marketing_subscribers")
        .update({
          source: row.source,
          consent_record: row.consent_record,
          confirmed_at: null,
          unsubscribed_at: null,
          confirm_token: row.confirm_token,
          unsubscribe_token: row.unsubscribe_token,
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("marketing_subscribers").insert(row);
      if (insErr) throw insErr;
    }
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn("[marketing] subscribers table missing; opt-in not stored");
      return { ok: true, stored: false };
    }
    console.error("[marketing] opt-in store failed:", err?.message || err);
    return { ok: true, stored: false };
  }
  try {
    await sendConfirmEmail({
      email: normalized,
      locale,
      confirmToken: tokens.confirmToken,
      unsubscribeToken: tokens.unsubscribeToken,
    });
  } catch (err) {
    console.warn("[marketing] confirm email failed:", err?.message || err);
  }
  return { ok: true, stored: true };
}

async function confirmByToken(token) {
  const value = String(token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) return { ok: false };
  try {
    const { data, error } = await supabase
      .from("marketing_subscribers")
      .select("id, locale, unsubscribed_at")
      .eq("confirm_token", value)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.unsubscribed_at) return { ok: false, locale: data?.locale };
    const { error: updErr } = await supabase
      .from("marketing_subscribers")
      .update({ confirmed_at: new Date().toISOString(), confirm_token: null })
      .eq("id", data.id);
    if (updErr) throw updErr;
    return { ok: true, locale: data.locale };
  } catch (err) {
    if (!isMissingTable(err)) console.error("[marketing] confirm failed:", err?.message || err);
    return { ok: false };
  }
}

async function unsubscribeByToken(token) {
  const value = String(token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(value)) return { ok: false };
  try {
    const { data, error } = await supabase
      .from("marketing_subscribers")
      .select("id, locale")
      .eq("unsubscribe_token", value)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false };
    const { error: updErr } = await supabase
      .from("marketing_subscribers")
      .update({ unsubscribed_at: new Date().toISOString(), confirm_token: null })
      .eq("id", data.id);
    if (updErr) throw updErr;
    return { ok: true, locale: data.locale };
  } catch (err) {
    if (!isMissingTable(err)) console.error("[marketing] unsubscribe failed:", err?.message || err);
    return { ok: false };
  }
}

module.exports = {
  createOptInTokens,
  confirmUrl,
  unsubscribeUrl,
  marketingFooterText,
  marketingFooterHtml,
  isMissingTable,
  copyFor,
  pageHtml,
  subscribe,
  confirmByToken,
  unsubscribeByToken,
};
