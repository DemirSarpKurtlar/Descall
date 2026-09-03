"use strict";

const supabase = require("../../db/supabase");
const {
  extractTextFromBuffer,
  allowedMime,
  kindFromMime,
  MAX_UPLOAD_BYTES,
  formatAttachmentForPrompt,
  IMAGE_MIME,
} = require("./fileExtract");
const { logInternal } = require("./sanitize");

async function createAttachment({ userId, file, conversationId }) {
  if (!file || !file.buffer) {
    const err = new Error("No file");
    err.code = "bad_file";
    throw err;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const err = new Error("too_large");
    err.code = "too_large";
    throw err;
  }
  const mime = file.mimetype || "application/octet-stream";
  const name = String(file.originalname || "file").slice(0, 180);
  if (!allowedMime(mime, name)) {
    const err = new Error("bad_type");
    err.code = "bad_type";
    throw err;
  }

  const extracted = await extractTextFromBuffer(file.buffer, mime, name);
  const kind = extracted.kind || kindFromMime(mime, name);

  let storagePath = null;
  let publicUrl = null;
  try {
    const ext = (name.split(".").pop() || "bin").slice(0, 12);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
    storagePath = `dimaai/${userId}/${filename}`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(storagePath, file.buffer, { contentType: mime, upsert: true });
    if (!upErr) {
      const { data } = supabase.storage.from("media").getPublicUrl(storagePath);
      publicUrl = data?.publicUrl || null;
    } else {
      logInternal("dimaai-upload", upErr);
    }
  } catch (err) {
    logInternal("dimaai-upload", err);
  }

  const row = {
    user_id: userId,
    conversation_id: conversationId || null,
    original_name: name,
    mime_type: mime,
    file_size: file.size || file.buffer.length,
    kind,
    storage_path: storagePath,
    public_url: publicUrl,
    extracted_text: extracted.text || null,
  };

  const { data, error } = await supabase
    .from("dimaai_attachments")
    .insert(row)
    .select("id,original_name,mime_type,file_size,kind,public_url,created_at")
    .single();
  if (error) throw error;

  // Keep base64 only in-process for immediate multimodal; re-fetch buffer from storage if needed later.
  return {
    attachment: data,
    previewText: extracted.text ? String(extracted.text).slice(0, 240) : null,
    _imageBase64: extracted.base64 || null,
    _imageMime: extracted.mime || mime,
  };
}

async function getOwnedAttachments(userId, ids) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))].slice(0, 6);
  if (!list.length) return [];
  const { data, error } = await supabase
    .from("dimaai_attachments")
    .select("id,user_id,original_name,mime_type,file_size,kind,storage_path,public_url,extracted_text,created_at")
    .eq("user_id", userId)
    .in("id", list);
  if (error) throw error;
  return data || [];
}

async function markConsumed(userId, ids, conversationId) {
  const list = [...new Set((ids || []).map(String).filter(Boolean))];
  if (!list.length) return;
  const patch = { consumed_at: new Date().toISOString() };
  if (conversationId) patch.conversation_id = conversationId;
  await supabase
    .from("dimaai_attachments")
    .update(patch)
    .eq("user_id", userId)
    .in("id", list);
}

async function loadImageParts(attachments) {
  const parts = [];
  for (const att of attachments || []) {
    if (att.kind !== "image") continue;
    if (!att.storage_path) continue;
    try {
      const { data, error } = await supabase.storage.from("media").download(att.storage_path);
      if (error || !data) continue;
      const buf = Buffer.from(await data.arrayBuffer());
      parts.push({
        inlineData: {
          mimeType: att.mime_type || "image/jpeg",
          data: buf.toString("base64"),
        },
      });
    } catch (err) {
      logInternal("dimaai-image-load", err);
    }
  }
  return parts;
}

function buildUserContentWithAttachments(text, attachments) {
  const blocks = [];
  for (const att of attachments || []) {
    if (att.kind === "image") continue;
    blocks.push(formatAttachmentForPrompt(att));
  }
  const body = String(text || "").trim();
  if (body) blocks.push(body);
  return blocks.join("\n\n") || body;
}

function publicAttachment(row) {
  return {
    id: row.id,
    name: row.original_name,
    size: row.file_size,
    mime: row.mime_type,
    kind: row.kind,
    url: row.kind === "image" ? row.public_url : null,
    previewUrl: row.kind === "image" ? row.public_url : null,
  };
}

module.exports = {
  createAttachment,
  getOwnedAttachments,
  markConsumed,
  loadImageParts,
  buildUserContentWithAttachments,
  publicAttachment,
  IMAGE_MIME,
};
