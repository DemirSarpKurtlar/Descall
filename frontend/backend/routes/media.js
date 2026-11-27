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
const { apiError, templatedError } = require("../lib/apiError");
const { applyGifCrop } = require("../lib/gifCrop");
const imageVariants = require("../lib/imageVariants");
const QRCode = require("qrcode");

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
    cb(templatedError("File type {type} is not allowed.", { type: file.mimetype }, { status: 415, code: "FILE_TYPE_NOT_ALLOWED" }));
  },
});

// GET /api/media/f/<images|files>/<name>?e=&s= : private attachment behind a short-lived HMAC
// URL (issued only inside payloads for members of the conversation). No bearer header: <img>
// and <video> cannot send one. Redirects to a 10-minute Supabase signed URL.
// AVIF: a still chat image stored with the "-av1" mark has a smaller AVIF sibling. An <img>
// load whose Accept lists image/avif is sent to that sibling when it exists; everything else
// (older iOS, downloads via fetch, "open in new tab") gets the original (lib/imageVariants).
router.get(/^\/f\/(.+)$/, async (req, res) => {
  const path = req.params[0];
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Vary", "Accept");
  if (!privateMedia.verifySignature(path, req.query.e, req.query.s)) {
    return res.status(403).json({ error: "expired", code: "MEDIA_URL_EXPIRED" });
  }
  const sibling = path.startsWith("quarantine/") ? null : imageVariants.avifSiblingPath(path);
  if (sibling && imageVariants.acceptsAvif(req.headers) && !imageVariants.knownMissing(sibling)) {
    try {
      const target = await privateMedia.supabaseSignedUrl(supabase, sibling);
      return res.redirect(302, target);
    } catch {
      imageVariants.noteMissing(sibling); // not encoded (yet): serve the original
    }
  }
  try {
    const target = await privateMedia.supabaseSignedUrl(supabase, path);
    return res.redirect(302, target);
  } catch {
    return res.status(404).json({ error: "not_found" });
  }
});

// GET /api/media/handoff-qr.svg?target=avatar|banner : QR for "Telefonundan yükle" in the
// profile photo / banner picker. It only encodes the fixed universal link that opens
// the same picker on the phone (no token, no user data), so it is public: <img> sends no auth.
router.get("/handoff-qr.svg", async (req, res) => {
  const target = req.query.target === "banner" ? "banner" : "avatar";
  try {
    const svg = await QRCode.toString(`https://descall.com/settings/profile?picker=${target}`, {
      type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0c10", light: "#ffffff" },
    });
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(svg);
  } catch {
    return res.status(500).end();
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

// Upload file to Supabase Storage. `name` (optional) is a ready storage file name
// (imageVariants.uploadName); by default the extension comes from the client's file name.
async function uploadPrivate(file, folder, { name } = {}) {
  const ext = safeExtension(file.originalname);
  const filename = name || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  const filePath = `${folder}/${filename}`;
  const { error } = await supabase.storage
    .from(privateMedia.PRIVATE_BUCKET)
    .upload(filePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;
  return { ref: privateMedia.refForPath(filePath), url: privateMedia.signedUrlForPath(filePath), path: filePath };
}

async function uploadToSupabase(file, folder = "files", { name } = {}) {
  const ext = safeExtension(file.originalname);
  const filename = name || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
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

/**
 * Public still image (avatar, banner, group photo, server icon): encode the AVIF first and
 * store it, then store the original under the "-av1" name, so a client that sees the mark
 * can always load the sibling. Any AVIF problem (busy, not smaller, store failed) falls back
 * to the plain upload, byte for byte what it was before.
 */
async function uploadPublicImage(file, folder, profile) {
  const ext = imageVariants.extForMime(file.mimetype);
  if (!ext || !imageVariants.isAvifEligible(file)) return uploadToSupabase(file, folder);
  const avif = await imageVariants.encodeAvif(file.buffer, { profile, waitMs: 1500, timeoutS: 8 });
  if (!avif) return uploadToSupabase(file, folder);
  const name = imageVariants.uploadName(ext, { avif: true });
  const siblingPath = `${folder}/${imageVariants.avifSiblingPath(name)}`;
  const { error } = await supabase.storage
    .from(privateMedia.PUBLIC_BUCKET)
    .upload(siblingPath, avif.buffer, { contentType: imageVariants.AVIF_MIME, upsert: false });
  if (error) {
    console.warn("[MEDIA] AVIF sibling upload failed:", error.message || error);
    return uploadToSupabase(file, folder);
  }
  return uploadToSupabase(file, folder, { name });
}

/**
 * Private chat image: the original goes up at once under the "-av1" name and the upload
 * answers; the AVIF is encoded afterwards (GET /f checks that it exists before using it).
 * Returns { name, encodeLater } or {} when this file gets no AVIF.
 */
function planPrivateAvif(file) {
  const ext = imageVariants.extForMime(file.mimetype);
  if (!ext || !imageVariants.enabled() || !imageVariants.isAvifEligible(file) || !imageVariants.loadSharp()) return {};
  const name = imageVariants.uploadName(ext, { avif: true });
  const buffer = file.buffer;
  const encodeLater = (folder) => {
    const siblingPath = `${folder}/${imageVariants.avifSiblingPath(name)}`;
    return imageVariants
      .encodeAvif(buffer, { profile: "image", waitMs: 60_000, timeoutS: 30 })
      .then(async (avif) => {
        if (!avif) return false;
        const { error } = await supabase.storage
          .from(privateMedia.PRIVATE_BUCKET)
          .upload(siblingPath, avif.buffer, { contentType: imageVariants.AVIF_MIME, upsert: false });
        if (error) throw error;
        imageVariants.forgetMissing(siblingPath);
        return true;
      })
      .catch((err) => {
        console.warn("[MEDIA] chat AVIF failed:", err?.message || err);
        return false;
      });
  };
  return { name, encodeLater };
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
    // Still images also get an AVIF sibling (lib/imageVariants): private ones after the
    // upload answers, public ones before their URL is handed out.
    const avifPlan = isPrivate && mediaType === "image" ? planPrivateAvif(file) : {};
    let stored;
    if (isPrivate) stored = await uploadPrivate(file, folder, { name: avifPlan.name });
    else if (mediaType === "image") stored = await uploadPublicImage(file, folder, "image");
    else stored = await uploadToSupabase(file, folder);
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
    if (avifPlan.encodeLater) avifPlan.encodeLater(folder); // background; never rejects
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

    // Descall+ 2.0: a new animated avatar is Descall+ where it is on sale (old GIFs stay; lib/plus/animatedProfile.js).
    {
      const animatedGate = require("../lib/plus/animatedProfile");
      const verdict = await animatedGate.check(req, { buffer: req.file.buffer, kind: "avatar" });
      if (!verdict.allowed) return res.status(403).json(animatedGate.refusal("avatar"));
    }
    // picker: an animated GIF arrives whole with its crop and is cut here, every frame kept.
    await applyGifCrop(req.file, req.body?.crop, "avatar");

    const userId = req.user.id;
    const { url } = await uploadPublicImage(req.file, "avatars", "avatar");

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

    // Descall+ 2.0: a new animated banner is Descall+ where it is on sale (old GIFs stay; lib/plus/animatedProfile.js).
    {
      const animatedGate = require("../lib/plus/animatedProfile");
      const verdict = await animatedGate.check(req, { buffer: req.file.buffer, kind: "banner" });
      if (!verdict.allowed) return res.status(403).json(animatedGate.refusal("banner"));
    }
    const userId = req.user.id;
    const { url } = await uploadPublicImage(req.file, "banners", "banner");

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

// POST /api/media/banner-image (picker): store a profile banner image (a GIF is cropped
// here with its animation) and return its public URL. The profile row is saved by the client
// through PUT /api/user/profile exactly as before, so shop-banner and premium rules are unchanged.
router.post("/banner-image", uploadGate, upload.single("banner"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    if (!ALLOWED_IMAGE.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "bad_type" });
    }
    if (req.file.size > MAX_AVATAR_SIZE) {
      return res.status(400).json({ error: "too_large" });
    }
    // Descall+ 2.0: a new animated banner is Descall+ where it is on sale (old GIFs stay; lib/plus/animatedProfile.js).
    {
      const animatedGate = require("../lib/plus/animatedProfile");
      const verdict = await animatedGate.check(req, { buffer: req.file.buffer, kind: "banner" });
      if (!verdict.allowed) return res.status(403).json(animatedGate.refusal("banner"));
    }
    await applyGifCrop(req.file, req.body?.crop, "banner");
    const { url, path: storagePath } = await uploadPublicImage(req.file, "banners", "banner");
    await supabase.from("media_uploads").insert({
      uploader_id: req.user.id,
      storage_path: storagePath,
      public_url: url,
      media_type: "image",
      mime_type: req.file.mimetype,
      file_size: req.file.size,
      original_name: req.file.originalname,
    });
    res.json({ url, bannerUrl: url, mimeType: req.file.mimetype });
  } catch (err) {
    console.error("[MEDIA] Banner image upload error:", err);
    res.status(500).json({ error: "upload_failed" });
  }
});

// Upload errors answer with a status and a code the client translates (polish
// messaging-12): a too large file or a refused type used to fall through to the
// global handler as 500 "Internal server error.".
router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json(apiError("File is too large (max {max} MB).", { max: Math.round(MAX_FILE_SIZE / (1024 * 1024)) }, { code: "FILE_TOO_LARGE" }));
  }
  if (err.code === "FILE_TYPE_NOT_ALLOWED") {
    return res.status(415).json({ error: err.message, code: "FILE_TYPE_NOT_ALLOWED", ...(err.i18n || {}) });
  }
  if (err.name === "MulterError") {
    return res.status(400).json(apiError("Upload failed.", null, { code: err.code || "UPLOAD_FAILED" }));
  }
  return next(err);
});

module.exports = router;
module.exports._uploadPublicImage = uploadPublicImage;
module.exports._planPrivateAvif = planPrivateAvif;
