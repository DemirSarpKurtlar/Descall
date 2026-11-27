import AppIntents
import WidgetKit

/// "El salla" from the large friends widget (iOS 17 interactive widget). Runs in the widget
/// extension without opening the app: POST /api/native/wave, the friend gets a push. The face
/// then shows a check (or "limit") for a short while; the widget reloads after the intent.
struct DescallWaveIntent: AppIntent {
    static let title: LocalizedStringResource = "Wave"
    static let description = IntentDescription("Waves at a friend from the widget. They get a notification.")
    static let isDiscoverable = false
    static let openAppWhenRun = false

    @Parameter(title: "Friend")
    var friendId: String

    init() {}

    init(friendId: String) {
        self.friendId = friendId
    }

    func perform() async throws -> some IntentResult {
        guard let client = try? DescallAPIClient.current(clientName: "ios-widget") else {
            DescallWidgetStore.recordWave(.failed, for: friendId)
            return .result()
        }
        do {
            try await client.wave(to: friendId, source: "widget")
            DescallWidgetStore.recordWave(.sent, for: friendId)
        } catch {
            DescallWidgetStore.recordWave(.from(error: DescallAPIError.from(transport: error)), for: friendId)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: DescallWidgetKind.friendsKind)
        return .result()
    }
}
