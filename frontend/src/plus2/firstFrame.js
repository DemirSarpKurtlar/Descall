/**
 * "İlk kareyi sabit olarak kullan": the first frame of an animated GIF as a still PNG File, same
 * pixel size (so the crop the person already made still fits). createImageBitmap decodes frame 0;
 * engines without it fall back to an <img> drawn right after load (also frame 0).
 */
export async function firstFrameFile(file, { name = "photo.png" } = {}) {
  if (!file) throw new Error("no_file");
  let source = null;
  let width = 0;
  let height = 0;
  let revoke = null;
  try {
    if (typeof createImageBitmap === "function") {
      source = await createImageBitmap(file);
      width = source.width;
      height = source.height;
    }
  } catch {
    source = null;
  }
  if (!source) {
    const url = URL.createObjectURL(file);
    revoke = url;
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode_failed"));
      img.src = url;
    });
    width = source.naturalWidth;
    height = source.naturalHeight;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), "image/png"));
    return new File([blob], name.replace(/\.[a-z0-9]+$/i, "") + ".png", { type: "image/png", lastModified: Date.now() });
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
    if (source && typeof source.close === "function") source.close();
  }
}

/** Pending picker media switched to the still frame (keeps the crop area and natural size). */
export async function pendingToStill(pending) {
  const file = await firstFrameFile(pending.file, { name: pending.file?.name || "photo.png" });
  const src = URL.createObjectURL(file);
  return { ...pending, file, src, isGif: false };
}
