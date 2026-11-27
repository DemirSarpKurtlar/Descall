import Foundation
import AppIntents
#if canImport(ActivityKit)
import ActivityKit
#endif

// Widgets draft B: the running call as a Live Activity (Dynamic Island compact / minimal /
// expanded, lock screen card, StandBy). Compiled into the app (which starts, updates and
// ends it: DescallWidgetsPlugin) and into the widget extension (which draws it).

#if canImport(ActivityKit)
@available(iOS 16.1, *)
public struct DescallCallAttributes: ActivityAttributes {
    public typealias ContentState = DescallCallState

    /// Stable for one call ("server:<channelId>", "group:<id>", "dm:<peerId>").
    public let callId: String
    public let kind: String

    public init(callId: String, kind: String) {
        self.callId = callId
        self.kind = kind
    }
}
#endif

/// The app's handler for the Live Activity / call widget buttons. Set at launch by
/// DescallWidgetsPlugin; it hands the action to the web layer (DescallIntentBridge, same
/// path as "Hey Siri, mute Descall"). In the extension process it stays nil: the system runs
/// LiveActivityIntent in the app's process.
public final class DescallCallControl: @unchecked Sendable {
    public static let shared = DescallCallControl()
    private let lock = NSLock()
    private var handler: (@Sendable (String) async -> Bool)?

    public func setHandler(_ h: (@Sendable (String) async -> Bool)?) {
        lock.lock()
        handler = h
        lock.unlock()
    }

    func run(_ action: String) async -> Bool {
        lock.lock()
        let h = handler
        lock.unlock()
        guard let h else { return false }
        return await h(action)
    }
}

/// Mute / unmute from the Dynamic Island, the lock screen card or the call widget, without
/// opening the app.
@available(iOS 17.0, *)
public struct DescallActivityToggleMuteIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "Mute or Unmute"
    public static let isDiscoverable = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        _ = await DescallCallControl.shared.run("toggleMute")
        return .result()
    }
}

/// Leave the call (red button) from the Dynamic Island, the lock screen card or the call widget.
@available(iOS 17.0, *)
public struct DescallActivityLeaveIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "Leave Call"
    public static let isDiscoverable = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        _ = await DescallCallControl.shared.run("leave")
        return .result()
    }
}

/// Headphones (deafen) on the medium and large call widget.
@available(iOS 17.0, *)
public struct DescallActivityToggleDeafenIntent: LiveActivityIntent {
    public static let title: LocalizedStringResource = "Deafen or Undeafen"
    public static let isDiscoverable = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        _ = await DescallCallControl.shared.run("toggleDeafen")
        return .result()
    }
}
