import { lazy, Suspense, useState, useEffect } from "react";

// The legal texts (every language, ~275 KB) used to load with the app shell for every
// signed-in user, because the shell imports the reader statically. They now load the
// first time a reader opens; after that the modal stays mounted so its close animation runs.
const LegalContentModal = lazy(() => import("./LegalContentModal"));

export default function LazyLegalContentModal(props) {
  const [used, setUsed] = useState(Boolean(props.open));
  useEffect(() => {
    if (props.open) setUsed(true);
  }, [props.open]);
  if (!used && !props.open) return null;
  return (
    <Suspense fallback={null}>
      <LegalContentModal {...props} />
    </Suspense>
  );
}
