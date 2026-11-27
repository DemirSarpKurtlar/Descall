/**
 * Pure model for the iPhone Settings output field (IosCallOutputField.jsx).
 * live: a call / voice channel holds the native audio route right now; the
 * options are its routes and the value is what is really playing.
 * Otherwise: the default output for the next call ("" = system default).
 */
export function iosOutputFieldModel(snapshot, pref, labels) {
  const live = Boolean(snapshot?.active) && (snapshot?.routes || []).length > 0;
  if (!live) {
    return {
      live: false,
      value: pref === "receiver" || pref === "speaker" ? pref : "",
      options: [
        { id: "", label: labels.systemDefault },
        { id: "speaker", label: labels.speaker },
        { id: "receiver", label: labels.receiver },
      ],
    };
  }
  const options = snapshot.routes.map((r) => {
    let label = r.name || r.kind;
    if (r.kind === "speaker") label = labels.speaker;
    else if (r.kind === "receiver") label = labels.receiver;
    return { id: r.id, label };
  });
  const selected = String(snapshot.selected || "");
  const value = options.some((o) => o.id === selected) ? selected : options[0]?.id || "";
  return {
    live: true,
    value,
    options: options.map((o) => (o.id === value ? { ...o, label: `${o.label} · ${labels.now}` } : o)),
  };
}
