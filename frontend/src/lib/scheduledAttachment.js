/**
 * Scheduled sending with one attachment (messaging phase 5), client side.
 * The same types and size as a chat attachment (backend routes/media.js),
 * minus audio: voice notes are recorded live, never scheduled.
 * backend/lib/scheduledMessages.js checks it again against the stored upload.
 */

export const MAX_ATTACH_BYTES = 100 * 1024 * 1024;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO = ["video/mp4", "video/webm"];
const DOCUMENT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/json",
];

export const ATTACH_ACCEPT = [...IMAGE, ...VIDEO, ...DOCUMENT].join(",");

const baseType = (file) => String(file?.type || "").split(";")[0].trim().toLowerCase();

/** "image" | "video" | "document" | null (not schedulable). */
export function attachmentKind(file) {
  const type = baseType(file);
  if (IMAGE.includes(type)) return "image";
  if (VIDEO.includes(type)) return "video";
  if (DOCUMENT.includes(type)) return "document";
  return null;
}

/** Error code for a file that cannot be scheduled, else null. */
export function attachmentProblem(file) {
  if (!file) return "bad_attachment";
  if (!attachmentKind(file)) return "bad_attachment";
  if (Number(file.size) > MAX_ATTACH_BYTES) return "attachment_too_large";
  return null;
}

/** "2,4 MB" style size in the viewer's locale. */
export function formatBytes(bytes, locale = "tr") {
  const n = Math.max(0, Number(bytes) || 0);
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: i === 0 ? 0 : 1 }).format(v);
  return `${num} ${units[i]}`;
}
