import { Suspense, lazy } from "react";

/** ProfileMediaPicker loaded on demand (react-easy-crop stays out of the panel chunk). */
const ProfileMediaPicker = lazy(() => import("./ProfileMediaPicker.jsx"));

export default function LazyProfileMediaPicker(props) {
  return (
    <Suspense fallback={null}>
      <ProfileMediaPicker {...props} />
    </Suspense>
  );
}
