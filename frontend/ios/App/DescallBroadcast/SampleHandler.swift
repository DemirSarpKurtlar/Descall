import LiveKit

/// ReplayKit Broadcast Upload Extension for whole-screen sharing from iPhone /
/// iPad (docs/ios-screen-share.md).
///
/// LiveKit's `LKSampleHandler` only forwards the frames to the Descall app
/// through a socket in the shared App Group container (group.com.descall.app,
/// `RTCAppGroupIdentifier` in Info.plist): JPEG per frame, one frame in flight,
/// so the extension stays far below the ~50 MB broadcast extension memory
/// limit. Encoding and publishing (the `<userId>:screen` companion) happen in
/// the app process (App/DescallScreenBroadcastPlugin.swift). A stop request
/// from the app, or the app closing the socket, finishes the broadcast.
#if os(iOS)
@available(macCatalyst 13.1, *)
class SampleHandler: LKSampleHandler {
    /// Logs under the "LKSampleHandler" category in Console.app (no user data).
    override var enableLogging: Bool { true }
}
#endif
