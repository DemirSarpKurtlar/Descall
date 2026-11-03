import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";

export async function uploadFile(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Upload failed");
  return body;
}

export async function uploadAvatar(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(`${API_BASE_URL}/api/media/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Avatar upload failed");
  return body;
}

export function getMediaUrl(relativePath) {
  if (!relativePath) return null;
  if (relativePath.startsWith("http")) return relativePath;
  return `${API_BASE_URL}${relativePath}`;
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
  const response = await fetch(`${API_BASE_URL}/api/media/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Avatar upload failed");
  return body;
}

/** Banner image upload (GIFs cropped on the server, animation kept). Returns { url }. */
export async function uploadBannerImage(file, crop = null) {
  const token = getToken();
  const formData = new FormData();
  if (crop) formData.append("crop", JSON.stringify(crop));
  formData.append("banner", file);
  const response = await fetch(`${API_BASE_URL}/api/media/banner-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Banner upload failed");
  return body;
}

/** QR image for "Telefonundan yükle" (public, encodes only the universal link). */
export function handoffQrSrc(target) {
  return `${API_BASE_URL}/api/media/handoff-qr.svg?target=${target === "banner" ? "banner" : "avatar"}`;
}
