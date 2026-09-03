import { getToken } from "../lib/storage";
import { API_BASE_URL } from "../config/api";

export const REPORT_REASONS = [
  { id: "harassment", labelKey: "report.harassment" },
  { id: "hate_speech", labelKey: "report.hateSpeech" },
  { id: "threats", labelKey: "report.threats" },
  { id: "spam", labelKey: "report.spam" },
  { id: "scam", labelKey: "report.scam" },
  { id: "impersonation", labelKey: "report.impersonation" },
  { id: "nsfw", labelKey: "report.nsfw" },
  { id: "doxxing", labelKey: "report.doxxing" },
  { id: "other", labelKey: "report.other" },
];

export async function submitUserReport(payload) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}/api/reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || "Failed to submit report.");
    err.code = body.code;
    throw err;
  }
  return body;
}
