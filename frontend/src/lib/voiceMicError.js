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
  if (name === "OverconstrainedError") {
    return "The selected microphone was not found.";
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

/**
 * Toast for a failed call start (UI audit #66). A denied microphone gets the
 * MicOff icon, "Arama için mikrofon izni ver" and an "İzin ver" button that
 * asks the browser again; other errors keep their plain message.
 */
export function voiceMicErrorToast(err, { toast, t, MicOffIcon }) {
  const name = String(err?.name || "");
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    toast(t("Allow microphone access to call"), "error", {
      icon: MicOffIcon,
      duration: 8000,
      actionLabel: t("Allow"),
      onOpen: () => {
        try {
          navigator.mediaDevices
            ?.getUserMedia?.({ audio: true })
            .then((stream) => stream.getTracks().forEach((track) => track.stop()))
            .catch(() => {});
        } catch {
          /* ignore */
        }
      },
    });
    return;
  }
  toast(t(voiceMicErrorCopy(err)), "error");
}
