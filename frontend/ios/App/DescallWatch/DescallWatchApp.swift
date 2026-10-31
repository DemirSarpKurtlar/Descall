import SwiftUI

/// 3.7.17 Descall for Apple Watch (owner picks: design B "Descall camı", iPhone-bound,
/// chats + friends + status; admin menu for staff in the next step).
@main
struct DescallWatchApp: App {
    @StateObject private var store = WatchStore(transport: WatchTransports.make())

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(DS.brandHi)
        }
    }
}
