/**
 * 3.0.0 (A3): page-level markers as classes instead of `body:has(...)`.
 *
 * The marketing CSS used `body:has(.mkt) .login-modal :focus-visible` and
 * friends. Those rules ship in the app bundle too, and a `:has()` anchored on
 * <body>/<html> with a broad subject makes Chrome/WebKit re-style the whole
 * document (6-11k elements) on every DOM insertion anywhere: each keystroke in
 * the composer, the slash menu, a new message, a typing dot. Measured 45 ms
 * (desktop) / 100+ ms (iPhone profile) per insertion before; ~1-3 ms after.
 *
 * Markers are reference counted so two mounts of the same surface (route
 * transition overlap) never drop the class early.
 */
const counts = new Map();

function key(target, className) {
  return `${target}:${className}`;
}

function elementFor(doc, target) {
  if (!doc) return null;
  return target === "html" ? doc.documentElement : doc.body;
}

/** Adds the class while at least one holder is active. Returns a release fn. */
export function holdDocumentMarker(className, { target = "body", doc = typeof document !== "undefined" ? document : null } = {}) {
  const el = elementFor(doc, target);
  if (!el || !className) return () => {};
  const k = key(target, className);
  const n = (counts.get(k) || 0) + 1;
  counts.set(k, n);
  el.classList.add(className);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = Math.max(0, (counts.get(k) || 1) - 1);
    if (left) counts.set(k, left);
    else {
      counts.delete(k);
      el.classList.remove(className);
    }
  };
}

/** Test helper. */
export function _documentMarkerCount(className, target = "body") {
  return counts.get(key(target, className)) || 0;
}
