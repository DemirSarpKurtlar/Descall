"use strict";

const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const supabase = require("../db/supabase");
const { cacheUserProfile, broadcastUserProfileUpdate, toPublicUser } = require("../lib/userProfile");
const privateMedia = require("../lib/privateMedia");
const { recordFailure } = require("../lib/rateLimit");
const voiceTranscode = require("../lib/voiceTranscode");
const { safeExtension, uploadConcurrencyGate } = require("../lib/uploadGuard");
const { templatedError } = require("../lib/apiError");

const router = express.Router();

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO = ["video/mp4", "video/webm"];
const ALLOWED_AUDIO = [
  "audio/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
];
const ALLOWED_DOCUMENT = [
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
const ALLOWED_ALL = [...ALLOWED_IMAGE, ...ALLOWED_VIDEO, ...ALLOWED_AUDIO, ...ALLOWED_DOCUMENT];
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const storage = multer.memoryStorage();
// Files are buffered in memory: at most 2 uploads in flight per user.
const uploadGate = uploadConcurrencyGate({ maxPerUser: 2 });

const upload = multer({
  storage,
  // One file per request, a handful of small text fields (e.g. purpose).
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 20, fieldSize: 64 * 1024, parts: 25 },
  fileFilter: (_req, file, cb) => {
    // Browsers may send "audio/webm;codecs=opus": compare the base type only.
    const base = voiceTranscode.baseMime(file.mimetype);
    if (ALLOWED_ALL.includes(base)) {
      file.mimetype = base;
      return cb(null, true);
    }
    cb(templatedError("File type {type} is not allowed.", { type: file.mimetype }));
  },
});

// GET /api/media/f/<images|files>/<name>?e=&s= : private attachment behind a short-lived HMAC
// URL (issued only inside payloads for members of the conversation). No bearer header: <img>
// and <video> cannot send one. Redirects to a 10-minute Supabase signed URL.
router.get(/^\/f\/(.+)$/, async (req, res) => {
  const path = req.params[0];
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (!privateMedia.verifySignature(path, req.query.e, req.query.s)) {
    return res.status(403).json({ error: "expired", code: "MEDIA_URL_EXPIRED" });
  }
  try {
    const target = await privateMedia.supabaseSignedUrl(supabase, path);
    return res.redirect(302, target);
  } catch {
    return res.status(404).json({ error: "not_found" });
  }
});

router.use(requireAuth);

// POST /api/media/refresh { urls: [...] } → { urls: { [given]: freshSignedUrl } }
// Accepts our signed URLs (expired ones too), stored refs and legacy public message URLs.
// Each one is re-issued only if the caller uploaded it or can see a message carrying it.
router.post("/refresh", express.json({ limit: "64kb" }), async (req, res) => {
  const list = Array.isArray(req.body?.urls) ? req.body.urls.filter((u) => typeof u === "string").slice(0, 50) : [];
  const limited = recordFailure(`media-refresh:${req.user.id}`, { windowMs: 10 * 60 * 1000, max: 300 });
  if (!limited.ok) return res.status(429).json({ error: "rate_limited" });
  const out = {};
  for (const given of list) {
    const parsed = privateMedia.parseMediaUrl(given);
    if (!parsed || parsed.path.startsWith("quarantine/")) continue;
    try {
      if (await privateMedia.canAccessPath(supabase, req.user.id, parsed.path)) {
        out[given] = privateMedia.signedUrlForPath(parsed.path);
      }
    } catch (err) {
      console.warn("[MEDIA] refresh check failed:", err?.message);
    }
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ urls: out, ttlSeconds: privateMedia.URL_TTL_S });
});

// POST /api/media/voice-compat { url } → { url } : an AAC/M4A copy of an older voice note
// (WebM/Opus recorded before 2.13.2) for clients that cannot decode the original (iOS).
// Same access rule as /refresh. The copy is a new object next to the original
// (<path>.m4a in the private bucket); the original and the message row are never touched.
const compatInflight = new Map();
router.post("/voice-compat", express.json({ limit: "16kb" }), async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const limited = recordFailure(`media-voice-compat:${req.user.id}`, { windowMs: 10 * 60 * 1000, max: 60 });
  if (!limited.ok) return res.status(429).json({ error: "rate_limited" });
  const parsed = typeof req.body?.url === "string" ? privateMedia.parseMediaUrl(req.body.url) : null;
  if (!parsed || parsed.path.startsWith("quarantine/") || /\.m4a$/i.test(parsed.path)) {
    return res.status(400).json({ error: "bad_url" });
  }
  try {
    if (!(await privateMedia.canAccessPath(supabase, req.user.id, parsed.path))) {
      return res.status(404).json({ error: "not_found" });
    }
    const bucket = parsed.kind === "legacy" ? privateMedia.PUBLIC_BUCKET : privateMedia.PRIVATE_BUCKET;
    const target = `${parsed.path.replace(/^quarantine\//, "")}.m4a`;
    if (!privateMedia.isSafePath(target)) return res.status(400).json({ error: "bad_url" });
    let job = compatInflight.get(target);
    if (!job) {
      job = (async () => {
        const store = supabase.storage.from(privateMedia.PRIVATE_BUCKET);
        const dir = target.slice(0, target.lastIndexOf("/"));
        const name = target.slice(target.lastIndexOf("/") + 1);
        const { data: existing } = await store.list(dir, { search: name, limit: 1 });
        if (existing && existing.some((o) => o.name === name)) return;
        const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(parsed.path);
        if (dlErr || !blob) throw dlErr || new Error("download failed");
        const out = await voiceTranscode.transcodeToM4a(Buffer.from(await blob.arrayBuffer()));
        const { error: upErr } = await store.upload(target, out.buffer, { contentType: out.mimeType, upsert: true });
        if (upErr) throw upErr;
      })().finally(() => compatInflight.delete(target));
      compatInflight.set(target, job);
    }
    await job;
    return res.json({ url: privateMedia.signedUrlForPath(target), mimeType: voiceTranscode.OUTPUT_MIME });
  } catch (err) {
    console.warn("[MEDIA] voice-compat failed:", err?.message);
    return res.status(500).json({ error: "compat_failed" });
  }
});

// Upload file to Supabase Storage
async function uploadPrivate(file, folder) {
  const ext = safeExtension(file.originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `${folder}/${filename}`;
  const { error } = await supabase.storage
    .from(privateMedia.PRIVATE_BUCKET)
    .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;
  return { ref: privateMedia.refForPath(filePath), url: privateMedia.signedUrlForPath(filePath), path: filePath };
}

async function uploadToSupabase(file, folder = "files") {
  const ext = safeExtension(file.originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `${folder}/${filename}`;

  const { data, error } = await supabase.storage
    .from("media")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from("media")
    .getPublicUrl(filePath);

  return { url: publicUrl, path: filePath };
}

router.post("/upload", uploadGate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const file = req.file;
    const isPrivate = String(req.body?.purpose || "") === "message";
    // Chat audio (voice notes) → AAC/M4A so a note recorded on Electron (WebM/Opus) plays on
    // iOS and one recorded on iOS plays everywhere. On failure the original is stored.
    if (isPrivate && ALLOWED_AUDIO.includes(file.mimetype)) {
      await voiceTranscode.normalizeVoiceUpload(file);
    }
    let mediaType = "file";
    if (ALLOWED_IMAGE.includes(file.mimetype)) mediaType = "image";
    else if (ALLOWED_VIDEO.includes(file.mimetype)) mediaType = "video";
    else if (ALLOWED_AUDIO.includes(file.mimetype)) mediaType = "audio";
    else if (ALLOWED_DOCUMENT.includes(file.mimetype)) mediaType = "document";

    const folder = mediaType === "image" ? "images" : "files";
    // purpose=message (2.11.2+ clients): chat attachment → private bucket, signed URL.
    // Anything else (group photo, server icon, feedback, pre-2.11.2 clients) stays public;
    // older clients' chat attachments are copied to private when the message is sent.
    const stored = isPrivate ? await uploadPrivate(file, folder) : await uploadToSupabase(file, folder);
    const { url, path: storagePath } = stored;

    await supabase.from("media_uploads").insert({
      uploader_id: req.user.id,
      storage_path: storagePath,
      public_url: isPrivate ? stored.ref : url,
      media_type: mediaType,
      mime_type: file.mimetype,
      file_size: file.size,
      original_name: file.originalname,
    });

    res.json({
      url,
      mediaType,
      mimeType: file.mimetype,
      size: file.size,
      originalName: file.originalname,
    });
  } catch (err) {
    console.error("[MEDIA] Upload error:", err);
    res.status(500).json({ error: "Upload failed." });
  }
});

const MAX_AVATAR_SIZE = 8 * 1024 * 1024;

router.post("/avatar", uploadGate, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No avatar uploaded." });
    if (!ALLOWED_IMAGE.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Avatar must be JPG, PNG, WebP, or GIF." });
    }
    if (req.file.size > MAX_AVATAR_SIZE) {
      return res.status(400).json({ error: "Avatar must be 8 MB or smaller." });
    }

    const userId = req.user.id;
    const { url } = await uploadToSupabase(req.file, "avatars");

    const { error } = await supabase
      .from("users")
      .update({ avatar_url: url, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      return res.status(500).json({ error: "Failed to update avatar." });
    }

    const profile = cacheUserProfile({
      id: userId,
      username: req.user.username,
      avatar_url: url,
      updated_at: new Date().toISOString(),
    });

    const io = req.app.get("io");
    if (io) await broadcastUserProfileUpdate(io, userId);

    res.json({ avatarUrl: url, user: toPublicUser(profile) });
  } catch (err) {
    console.error("[MEDIA] Avatar upload error:", err);
    res.status(500).json({ error: "Avatar upload failed." });
  }
});

router.post("/banner", uploadGate, upload.single("banner"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No banner uploaded." });
    if (!ALLOWED_IMAGE.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "Banner must be an image." });
    }

    const userId = req.user.id;
    const { url } = await uploadToSupabase(req.file, "banners");

    const { error } = await supabase
      .from("users")
      .update({ banner_url: url })
      .eq("id", userId);

    if (error) {
      return res.status(500).json({ error: "Failed to update banner." });
    }

    res.json({ bannerUrl: url });
  } catch (err) {
    console.error("[MEDIA] Banner upload error:", err);
    res.status(500).json({ error: "Banner upload failed." });
  }
});

module.exports = router;
