import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import ImageCropModal from "../ui/ImageCropModal";
import { uploadFile } from "../../api/media";
import { setGroupAvatar } from "../../api/groups";
import { readFileAsDataUrl } from "../../lib/cropImage";
import { AVATAR_ACCEPT, needsCrop, validateAvatarFile } from "../../lib/avatarFile";
import { confirmAction } from "../../lib/glassConfirm";
import { useToast } from "../../context/ToastContext";
import { useT } from "../../context/LocaleContext";

/**
 * Group photo flow, identical to the profile photo flow:
 * pick JPG/PNG/WebP/GIF (8 MB) → still images open the crop/zoom editor →
 * upload to the media bucket → POST /groups/:id/avatar. GIFs upload as-is.
 *
 * Returns { pick(group), remove(group), busyId, element } — render `element` once.
 */
export function useGroupPhotoChanger({ onUpdated } = {}) {
  const t = useT();
  const { toast } = useToast();
  const inputRef = useRef(null);
  const targetRef = useRef(null);
  const [cropSrc, setCropSrc] = useState("");
  const [busyId, setBusyId] = useState(null);

  const save = async (group, file) => {
    if (!group?.id) return;
    setBusyId(group.id);
    try {
      const uploaded = await uploadFile(file);
      const url = uploaded?.url;
      if (!url) throw new Error(t("Upload failed"));
      const data = await setGroupAvatar(group.id, url);
      onUpdated?.(group.id, data?.avatarUrl ?? url);
      setCropSrc("");
      toast(t("Group photo updated"), "success");
    } catch (err) {
      toast(err?.message || t("Failed to update group photo."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const group = targetRef.current;
    if (!file || !group) return;
    const problem = validateAvatarFile(file);
    if (problem === "type") return toast(t("Avatar must be JPG, PNG, WebP, or GIF."), "error");
    if (problem === "size") return toast(t("Avatar must be 8 MB or smaller."), "error");
    if (!needsCrop(file)) return save(group, file);
    try {
      setCropSrc(await readFileAsDataUrl(file));
    } catch {
      toast(t("Failed to read image."), "error");
    }
  };

  const pick = (group) => {
    targetRef.current = group;
    inputRef.current?.click();
  };

  const remove = async (group) => {
    if (!group?.id) return;
    const ok = await confirmAction({
      title: t("Remove group photo"),
      message: t("The group will show its initials again for everyone."),
      confirmLabel: t("Remove"),
      cancelLabel: t("Cancel"),
      danger: true,
    });
    if (!ok) return;
    setBusyId(group.id);
    try {
      await setGroupAvatar(group.id, null);
      onUpdated?.(group.id, null);
      toast(t("Group photo removed"), "success");
    } catch (err) {
      toast(err?.message || t("Failed to update group photo."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const element = (
    <>
      <input ref={inputRef} type="file" accept={AVATAR_ACCEPT} hidden onChange={onFile} data-testid="group-photo-input" />
      <AnimatePresence>
        {cropSrc ? (
          <ImageCropModal
            key="group-photo-crop"
            imageSrc={cropSrc}
            aspect={1}
            cropShape="rect"
            title={t("Adjust group photo")}
            confirmLabel={t("Save photo")}
            outputMimeType="image/jpeg"
            outputFileName="group.jpg"
            maxOutputSize={1024}
            onCancel={() => setCropSrc("")}
            onConfirm={(file) => save(targetRef.current, file)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );

  return { pick, remove, busyId, element };
}
