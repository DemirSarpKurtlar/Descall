/**
 * LiveKit adaptiveStream needs to know which <video> elements show a remote
 * video track: it watches their size (to pick a simulcast layer) and whether
 * they are on screen (to pause off-screen video). It learns that from
 * RemoteVideoTrack.attach(el) or, for custom renderers, from an ElementInfo.
 *
 * Server voice renders LiveKit tracks through its own MediaStreams
 * (el.srcObject = stream), so before this module no element was ever known to
 * LiveKit. As soon as the SFU reported a stream "active", livekit-client
 * computed "no visible element" and asked the SFU to stop sending: remote
 * cameras and screen shares froze after the first frames (verified against
 * livekit-client 2.21 in Chromium: UpdateSettings { disabled: true }).
 *
 * attach() itself is not used on purpose: it rewrites el.muted from the
 * stream's audio tracks (screen audio would then play twice, outside the
 * volume slider) and detach() removes the track from the shared MediaStream
 * other elements still render. An ElementInfo only observes.
 */

const registry = new WeakMap();

/** Remember the LiveKit RemoteVideoTrack behind a MediaStreamTrack. */
export function registerLiveKitVideoTrack(mediaTrack, liveKitTrack) {
  if (!mediaTrack || typeof mediaTrack !== "object") return;
  if (!liveKitTrack || typeof liveKitTrack.observeElementInfo !== "function") return;
  registry.set(mediaTrack, liveKitTrack);
}

export function unregisterLiveKitVideoTrack(mediaTrack) {
  if (mediaTrack && typeof mediaTrack === "object") registry.delete(mediaTrack);
}

export function liveKitTrackFor(mediaTrack) {
  if (!mediaTrack || typeof mediaTrack !== "object") return null;
  return registry.get(mediaTrack) || null;
}

/**
 * ElementInfo (livekit-client's interface for custom renderers) backed by an
 * IntersectionObserver and a ResizeObserver on the element. Observers are
 * injectable for tests.
 */
export function createVideoElementInfo(
  element,
  {
    IntersectionObserverImpl = typeof IntersectionObserver !== "undefined" ? IntersectionObserver : null,
    ResizeObserverImpl = typeof ResizeObserver !== "undefined" ? ResizeObserver : null,
    now = () => Date.now(),
    doc = typeof document !== "undefined" ? document : null,
  } = {}
) {
  let intersecting = true;
  let io = null;
  let ro = null;
  const info = {
    element,
    visibilityChangedAt: 0,
    handleResize: undefined,
    handleVisibilityChanged: undefined,
    get visible() {
      return intersecting || this.pictureInPicture;
    },
    get pictureInPicture() {
      return Boolean(doc && doc.pictureInPictureElement && doc.pictureInPictureElement === element);
    },
    width() {
      return element?.clientWidth || 0;
    },
    height() {
      return element?.clientHeight || 0;
    },
    observe() {
      // Without IntersectionObserver the element counts as visible (never paused).
      if (IntersectionObserverImpl && !io) {
        io = new IntersectionObserverImpl((entries) => {
          for (const entry of entries || []) {
            if (entry?.target !== element) continue;
            const next = Boolean(entry.isIntersecting);
            if (next === intersecting && info.visibilityChangedAt) continue;
            intersecting = next;
            info.visibilityChangedAt = now();
            info.handleVisibilityChanged?.();
          }
        });
        io.observe(element);
      }
      if (ResizeObserverImpl && !ro) {
        ro = new ResizeObserverImpl(() => info.handleResize?.());
        ro.observe(element);
      }
    },
    stopObserving() {
      io?.disconnect?.();
      ro?.disconnect?.();
      io = null;
      ro = null;
    },
  };
  return info;
}

/**
 * Tell LiveKit that `element` renders `stream`'s remote video. Tracks added to
 * the stream later (screen share merges) are picked up too. No-op for local
 * and mesh streams. Returns a cleanup function.
 */
export function bindLiveKitVideo(element, stream, options = {}) {
  if (!element || !stream || typeof stream.getVideoTracks !== "function") return () => {};
  const bound = new Map(); // MediaStreamTrack -> { track, info }
  const bindTracks = () => {
    let tracks = [];
    try {
      tracks = stream.getVideoTracks() || [];
    } catch {
      tracks = [];
    }
    for (const mediaTrack of tracks) {
      if (!mediaTrack || bound.has(mediaTrack)) continue;
      const liveKitTrack = liveKitTrackFor(mediaTrack);
      if (!liveKitTrack) continue;
      const info = createVideoElementInfo(element, options);
      try {
        liveKitTrack.observeElementInfo(info);
        bound.set(mediaTrack, { track: liveKitTrack, info });
      } catch {
        info.stopObserving();
      }
    }
  };
  bindTracks();
  const onAddTrack = () => bindTracks();
  stream.addEventListener?.("addtrack", onAddTrack);
  return () => {
    stream.removeEventListener?.("addtrack", onAddTrack);
    for (const { track, info } of bound.values()) {
      try {
        track.stopObservingElementInfo(info);
      } catch {
        info.stopObserving();
      }
    }
    bound.clear();
  };
}
