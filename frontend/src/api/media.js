import { apiBase, primaryApiBase } from "../lib/nodeRouting";
import { t } from "../i18n/runtime.js";
import { serverErrorText } from "./httpError";
import { getToken } from "../lib/storage";
import { platformHeaders } from "../plus2/platform.js";

export async function uploadFile(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBase()}/api/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json();
  if (!response.ok) throw new Error(serverErrorText(body) || t("Upload failed"));
  return body;
}

export async function uploadAvatar(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(`${apiBase()}/api/media/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json();
  if (!response.ok) throw new Error(serverErrorText(body) || t("Upload failed"));
  return body;
}

export function getMediaUrl(relativePath) {
  if (!relativePath) return null;
  if (relativePath.startsWith("http")) return relativePath;
  return `${primaryApiBase()}${relativePath}`;
}

/**
 * Profile media picker: avatar upload with an optional server-side GIF crop.
 * Same endpoint and response as uploadAvatar; the extra `crop` field is ignored by older servers.
 */
export async function uploadAvatarWithCrop(file, crop = null) {
  const token = getToken();
  const formData = new FormData();
  if (crop) formData.append("crop", JSON.stringify(crop));
  formData.append("avatar", file);
  const response = await fetch(`${apiBase()}/api/media/avatar`, {
    method: "POST",
    // X-Descall-Platform: Descall+ 2.0 decides the animated avatar / banner rule per platform.
    headers: { Authorization: `Bearer ${token}`, ...platformHeaders() },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(serverErrorText(body) || t("Upload failed")), { code: body?.code || null });
  return body;
}

/** Banner image upload (GIFs cropped on the server, animation kept). Returns { url }. */
export async function uploadBannerImage(file, crop = null) {
  const token = getToken();
  const formData = new FormData();
  if (crop) formData.append("crop", JSON.stringify(crop));
  formData.append("banner", file);
  const response = await fetch(`${apiBase()}/api/media/banner-image`, {
    method: "POST",
    // X-Descall-Platform: Descall+ 2.0 decides the animated avatar / banner rule per platform.
    headers: { Authorization: `Bearer ${token}`, ...platformHeaders() },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(serverErrorText(body) || t("Upload failed")), { code: body?.code || null });
  return body;
}

/** QR image for "Telefonundan yükle" (public, encodes only the universal link). */
export function handoffQrSrc(target) {
  return `${primaryApiBase()}/api/media/handoff-qr.svg?target=${target === "banner" ? "banner" : "avatar"}`;
}
