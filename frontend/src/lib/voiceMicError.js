/** Map getUserMedia failures to existing i18n source strings. */
export function voiceMicErrorCopy(err) {
  const name = String(err?.name || "");
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphones found";
  }
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission required";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Microphone is already in use by another app.";
  }
  return "Could not access the microphone.";
}

export function isVoiceMicError(err) {
  const name = String(err?.name || "");
  return (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "NotReadableError" ||
    name === "TrackStartError"
  );
}
