"use strict";

const AGENT_JSON_KEY =
  /"(?:recipient|pending_action|action_id|toUserId|to_user_id|preview|content)"\s*:/;

function isAgentDraftJson(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (!AGENT_JSON_KEY.test(s)) return false;
  // Streaming fences often have no closing `}` yet.
  return s.includes("{") || /pending_action|action_id/.test(s);
}

function stripFencedAgentJson(markdown) {
  return String(markdown || "").replace(
    /```(?:json|jsonc|javascript|js|text)?[ \t]*\r?\n([\s\S]*?)```/gi,
    (full, body) => (isAgentDraftJson(body) ? "" : full),
  );
}

function stripOpenAgentFence(markdown) {
  return String(markdown || "").replace(
    /```(?:json|jsonc|javascript|js|text)?[ \t]*\r?\n\{[\s\S]*$/i,
    (full) => (isAgentDraftJson(full.replace(/^```[^\n]*\n/, "")) ? "" : full),
  );
}

function stripBareAgentJson(markdown) {
  return String(markdown || "").replace(
    /^[ \t]*\{[\s\S]*?"(?:recipient|pending_action|action_id|content)"[\s\S]*?\}[ \t]*$/gm,
    (block) => (isAgentDraftJson(block) ? "" : block),
  );
}

const CARD_CHROME =
  /^\s*(?:[✅✔️🟢]\s*)?(?:DM Ready!?|DM Hazır!?|Direct message ready!?|Mesaj hazır!?)\s*$/gim;

const CARD_REVIEW =
  /^\s*(?:please\s+)?(?:review|check)(?:\s+the)?\s+card\b[^.!?]*[.!?]?\s*$/gim;

const CARD_REVIEW_TR =
  /^\s*lütfen\s+kartı\s+gözden\s+geçirin[^.!?]*[.!?]?\s*$/gim;

const PLANNING_RE =
  /dispatch plan|i need to send|before i |in my toolkit|blast it out|okay, so the task/i;

function collapsePlanningWhenCard(text) {
  const out = String(text || "").trim();
  if (!out) return "";
  if (PLANNING_RE.test(out) || out.length > 220) return "";
  return out;
}

function stripAgentDraftChrome(markdown, { hasPendingCard = false } = {}) {
  let out = stripFencedAgentJson(markdown);
  out = stripOpenAgentFence(out);
  out = stripBareAgentJson(out);
  if (hasPendingCard) {
    CARD_CHROME.lastIndex = 0;
    CARD_REVIEW.lastIndex = 0;
    CARD_REVIEW_TR.lastIndex = 0;
    out = out.replace(CARD_CHROME, "");
    out = out.replace(CARD_REVIEW, "");
    out = out.replace(CARD_REVIEW_TR, "");
    out = collapsePlanningWhenCard(out);
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = { isAgentDraftJson, stripAgentDraftChrome };
