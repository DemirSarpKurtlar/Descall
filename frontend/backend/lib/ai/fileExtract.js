"use strict";

const path = require("path");
const { logInternal } = require("./sanitize");

const MAX_EXTRACT_CHARS = 24000;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const TEXT_MIME = new Set(["text/plain", "text/csv", "application/json", "text/markdown"]);
const PDF_MIME = new Set(["application/pdf"]);
const DOCX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function kindFromMime(mime, name) {
  const m = String(mime || "").toLowerCase();
  const ext = path.extname(String(name || "")).toLowerCase();
  if (IMAGE_MIME.has(m) || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return "image";
  if (PDF_MIME.has(m) || ext === ".pdf") return "pdf";
  if (DOCX_MIME.has(m) || [".docx", ".doc"].includes(ext)) return "docx";
  if (m === "text/csv" || ext === ".csv") return "csv";
  if (TEXT_MIME.has(m) || [".txt", ".md", ".json", ".log"].includes(ext)) return "text";
  return "document";
}

function allowedMime(mime, name) {
  const kind = kindFromMime(mime, name);
  return ["image", "pdf", "docx", "csv", "text"].includes(kind);
}

async function extractTextFromBuffer(buffer, mime, originalName) {
  const kind = kindFromMime(mime, originalName);
  if (kind === "image") return { kind, text: "", base64: buffer.toString("base64"), mime: mime || "image/jpeg" };
  if (kind === "text" || kind === "csv") {
    const text = buffer.toString("utf8").slice(0, MAX_EXTRACT_CHARS);
    return { kind, text };
  }
  if (kind === "pdf") {
    try {
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(buffer);
      return { kind, text: String(parsed.text || "").slice(0, MAX_EXTRACT_CHARS) };
    } catch (err) {
      logInternal("file-pdf", err);
      return { kind, text: "", error: "Could not read PDF text." };
    }
  }
  if (kind === "docx") {
    try {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return { kind, text: String(result.value || "").slice(0, MAX_EXTRACT_CHARS) };
    } catch (err) {
      logInternal("file-docx", err);
      return { kind, text: "", error: "Could not read document text." };
    }
  }
  return { kind: "document", text: "", error: "Unsupported file type." };
}

function formatAttachmentForPrompt(att) {
  const name = att.original_name || att.name || "file";
  const kind = att.kind || "document";
  if (kind === "image") {
    return `[Attached image: ${name}]`;
  }
  const text = String(att.extracted_text || "").trim();
  if (!text) return `[Attached file: ${name} (${kind}) — no extractable text]`;
  return `[Attached file: ${name} (${kind})]\n---\n${text.slice(0, MAX_EXTRACT_CHARS)}\n---`;
}

module.exports = {
  MAX_EXTRACT_CHARS,
  MAX_UPLOAD_BYTES,
  kindFromMime,
  allowedMime,
  extractTextFromBuffer,
  formatAttachmentForPrompt,
  IMAGE_MIME,
};
