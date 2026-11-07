import { Suspense, lazy } from "react";

/**
 * ImageCropModal loaded on demand (react-easy-crop stays out of the App chunk).
 * Same props; render it where ImageCropModal was rendered (AnimatePresence still
 * drives the modal's own exit animation through presence context).
 */
const ImageCropModal = lazy(() => import("./ImageCropModal"));

export default function LazyImageCropModal(props) {
  return (
    <Suspense fallback={null}>
      <ImageCropModal {...props} />
    </Suspense>
  );
}
