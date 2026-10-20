/**
 * First image File in a paste event's DataTransfer (screenshots, copied
 * images, copied image files), or null. Text-only clipboards return null.
 */
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/i;

export function pastedImageFile(data) {
  if (!data) return null;
  const files = Array.from(data.files || []);
  const fromFiles = files.find((f) => IMAGE_TYPES.test(f?.type || ""));
  if (fromFiles) return fromFiles;
  for (const item of Array.from(data.items || [])) {
    if (item?.kind === "file" && IMAGE_TYPES.test(item.type || "")) {
      const file = item.getAsFile?.();
      if (file) return file;
    }
  }
  return null;
}
