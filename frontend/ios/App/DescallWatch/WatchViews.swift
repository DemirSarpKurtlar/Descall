import SwiftUI

// MARK: - Root

/// Vertical pages, the iOS tabs in watch form (3.7.33): Chats, Servers, Friends, Activity,
/// Calls, You, and Admin for staff. No DimaAI, no call recording, no game / LFG content.
enum WatchTab: Int {
    case chats = 0, servers, friends, activity, calls, you, admin

    static func forDemo(_ screen: String?) -> WatchTab {
        switch screen ?? "" {
        case "servers", "server": return .servers
        case "friends", "status": return .friends
        case "activity": return .activity
        case "calls": return .calls
        case "profile": return .you
        case "admin", "reports", "case", "stepup", "feedback", "maintenance": return .admin
        default: return .chats
        }
    }
}

struct RootView: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: Int
    @State private var chatsPath: [ChatRoute]
    @State private var serversPath: [ServersRoute]
    @State private var friendsPath: [FriendsRoute]
    @State private var activityPath: [ChatRoute] = []
    @State private var callsPath: [ChatRoute] = []
    @State private var youPath: [FriendsRoute] = []
    @State private var adminPath: [AdminRoute]

    init() {
        let demo = WatchDemo.screen
        _tab = State(initialValue: WatchTab.forDemo(demo).rawValue)
        _chatsPath = State(initialValue: (demo == "chat" || demo == "reply") ? [WatchDemo.chatRoute] : [])
        _serversPath = State(initialValue: demo == "server" ? [.server(WatchDemo.serverId)] : [])
        _friendsPath = State(initialValue: demo == "status" ? [.status] : [])
        _adminPath = State(initialValue: WatchDemo.adminPath)
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $chatsPath) {
                ChatsView()
                    .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
            }
            .tag(WatchTab.chats.rawValue)
            NavigationStack(path: $serversPath) {
                ServersView()
                    .navigationDestination(for: ServersRoute.self) { route in
                        switch route {
                        case .server(let id): ServerChannelsView(serverId: id)
                        case .chat(let r): ChatView(route: r)
                        }
                    }
            }
            .tag(WatchTab.servers.rawValue)
            NavigationStack(path: $friendsPath) {
                FriendsView()
                    .navigationDestination(for: FriendsRoute.self) { FriendsRouteView(route: $0) }
            }
            .tag(WatchTab.friends.rawValue)
            NavigationStack(path: $activityPath) {
                ActivityView()
                    .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
            }
            .tag(WatchTab.activity.rawValue)
            NavigationStack(path: $callsPath) {
                CallsView()
                    .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
            }
            .tag(WatchTab.calls.rawValue)
            NavigationStack(path: $youPath) {
                ProfileView()
                    .navigationDestination(for: FriendsRoute.self) { FriendsRouteView(route: $0) }
            }
            .tag(WatchTab.you.rawValue)
            // Staff only: the page exists when the account may open at least one section.
            if store.home?.adminSections != nil {
                NavigationStack(path: $adminPath) {
                    AdminHomeView()
                        .navigationDestination(for: AdminRoute.self) { AdminRouteView(route: $0) }
                }
                .tag(WatchTab.admin.rawValue)
            }
        }
        .tabViewStyle(.verticalPage)
        .sheet(isPresented: $store.stepUpPrompt, onDismiss: { store.cancelStepUp() }) {
            NavigationStack { StepUpView() }.descallSheet()
        }
        .task {
            await store.loadHome()
            if WatchDemo.screen == "stepup" { store.stepUpPrompt = true }
        }
        // Back on the wrist: refresh what is stale (not on every glance).
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, store.homeState.isStale { Task { await store.loadHome() } }
        }
        // The iPhone came back: retry right away instead of waiting for a timer.
        .onReceive(NotificationCenter.default.publisher(for: .descallWatchReachability)) { _ in
            if store.offline, WatchDemo.screen == nil { Task { await store.refreshAll() } }
        }
    }
}

enum FriendsRoute: Hashable {
    case status
    case chat(ChatRoute)
}

struct FriendsRouteView: View {
    var route: FriendsRoute
    var body: some View {
        switch route {
        case .status: StatusPickerView()
        case .chat(let r): ChatView(route: r)
        }
    }
}

/// Runs `body` now and every `seconds` while the app is active and the screen is shown
/// (3.7.33: polling used to keep going with the wrist down).
struct ActivePolling: ViewModifier {
    var seconds: UInt64
    var action: () async -> Void
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content.task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await action()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: seconds * 1_000_000_000)
                if Task.isCancelled { break }
                await action()
            }
        }
    }
}

extension View {
    func whileActive(every seconds: UInt64, _ action: @escaping () async -> Void) -> some View {
        modifier(ActivePolling(seconds: seconds, action: action))
    }
}

/// Glass screen with an in-content refresh button.
/// Root cause of the 3.7.33 SIGABRT: a ToolbarItem in each NavigationStack inside the
/// vertical-page TabView. Its label changed with `loading`, so SwiftUI re-rendered the
/// bar item while UIKit tore down / re-laid out the page's UINavigationBar
/// (DisplayList.ViewUpdater.removeRemaining -> UINavigationBar layoutSubviews assertion).
/// Pages therefore carry no navigation-bar items; refresh is the first row instead.
struct DescallList<Content: View>: View {
    var title: String
    var loading: Bool
    var refresh: () async -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                RefreshRowButton(loading: loading) { Task { await refresh() } }
                content()
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(title)
        .descallScreen()
    }
}

// MARK: - Chats

struct ChatsView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let state = store.homeState
        DescallList(title: L.chats, loading: state.loading, refresh: { await store.loadHome() }) {
            OfflineBanner(error: state.value == nil ? nil : state.error, updatedAt: state.updatedAt)
            if let home = state.value {
                if home.conversations.isEmpty { EmptyState(text: L.noChats) }
                ForEach(home.conversations) { c in
                    NavigationLink(value: ChatRoute(conv: c.conv, title: c.title)) {
                        ConversationRow(c: c)
                    }
                    .buttonStyle(.plain)
                }
                UpdatedLine(updatedAt: state.updatedAt, loading: state.loading)
            } else if let error = state.error {
                ErrorCard(error: error) { Task { await store.loadHome() } }
            } else {
                LoadingRows(count: 4)
            }
        }
        .whileActive(every: 60) { if store.homeState.isStale || store.homeState.value == nil { await store.loadHome() } }
    }
}

struct ConversationRow: View {
    var c: WatchConversation

    var body: some View {
        HStack(spacing: 8) {
            AvatarView(url: c.avatarUrl, initials: c.initials, seed: c.conv, size: 30, presence: c.kind == "dm" ? c.presence : nil)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(c.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Spacer(minLength: 2)
                    Text(WatchTime.short(c.at)).font(.system(size: 11)).foregroundStyle(DS.ink2)
                }
                Text(c.preview.isEmpty ? " " : c.preview)
                    .font(.system(size: 12))
                    .foregroundStyle(DS.ink2)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glass(16)
        .contentShape(Rectangle())
    }
}

// MARK: - Chat

struct ChatView: View {
    var route: ChatRoute
    @EnvironmentObject var store: WatchStore
    @State private var thread: WatchThread?
    @State private var error: WatchError?
    @State private var refreshError: WatchError?
    @State private var showReply = WatchDemo.screen == "reply"

    private var isGroup: Bool { !route.conv.hasPrefix("dm:") }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 5) {
                    if thread != nil, let refreshError, refreshError.isOffline {
                        OfflineBanner(error: refreshError, updatedAt: nil)
                    }
                    if let thread {
                        if thread.messages.isEmpty {
                            Text(L.noMessages).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.vertical, 12)
                        }
                        ForEach(thread.messages) { m in
                            MessageBubble(m: m, showAuthor: isGroup).id(m.id)
                        }
                    } else if let error {
                        ErrorCard(error: error) { Task { await load() } }
                    } else {
                        ProgressView().padding(.vertical, 20)
                    }
                    Button {
                        showReply = true
                    } label: {
                        Label(L.reply, systemImage: "arrowshape.turn.up.left.fill")
                    }
                    .buttonStyle(CTAButtonStyle())
                    .padding(.top, 6)
                    .id("reply-button")
                }
                .padding(.horizontal, 2)
            }
            .onChange(of: thread?.messages.last?.id) { _, _ in
                proxy.scrollTo("reply-button", anchor: .bottom)
            }
        }
        .navigationTitle(route.title)
        .descallScreen()
        .sheet(isPresented: $showReply) {
            NavigationStack {
                ReplyView(conv: route.conv) {
                    showReply = false
                    await load()
                }
            }
            .descallSheet()
        }
        .task { await store.markRead(route.conv) }
        // Light polling while the chat is on screen and the app is active (no socket on the watch).
        .whileActive(every: 10) { await load() }
    }

    private func load() async {
        do {
            thread = try await store.thread(route.conv)
            error = nil
            refreshError = nil
        } catch let e as WatchError {
            refreshError = e
            if thread == nil { error = e }
        } catch {
            refreshError = .network
            if thread == nil { self.error = .network }
        }
    }
}

struct MessageBubble: View {
    var m: WatchMessage
    var showAuthor: Bool

    var body: some View {
        HStack {
            if m.mine { Spacer(minLength: 24) }
            VStack(alignment: .leading, spacing: 2) {
                if showAuthor && !m.mine && !m.author.isEmpty {
                    Text(m.author).font(.system(size: 11, weight: .semibold)).foregroundStyle(DS.brandHi)
                }
                Text(m.text.isEmpty ? " " : m.text)
                    .font(.system(size: 13.5))
                    .italic(m.kind != "text")
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background {
                if m.mine {
                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                        .fill(LinearGradient(colors: [DS.ctaTop, DS.ctaBottom], startPoint: .top, endPoint: .bottom))
                        .shadow(color: DS.brand.opacity(0.4), radius: 5, y: 2)
                }
            }
            .modifier(OptionalGlass(enabled: !m.mine))
            if !m.mine { Spacer(minLength: 24) }
        }
    }
}

private struct OptionalGlass: ViewModifier {
    var enabled: Bool
    func body(content: Content) -> some View {
        if enabled { content.glass(15) } else { content }
    }
}

// MARK: - Reply

struct ReplyView: View {
    var conv: String
    var onSent: () async -> Void
    @EnvironmentObject var store: WatchStore
    @State private var sending = false
    @State private var error: WatchError?

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                TextFieldLink(prompt: Text(L.writeOrSpeak)) {
                    HStack(spacing: 10) {
                        Image(systemName: "mic.fill")
                        Image(systemName: "scribble")
                        Text(L.writeOrSpeak).font(.system(size: 13, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .glass(20)
                } onSubmit: { value in
                    Task { await send(value) }
                }
                .buttonStyle(.plain)

                SectionLabel(text: L.quickReplies)
                ForEach(L.quick, id: \.self) { q in
                    Button {
                        Task { await send(q) }
                    } label: {
                        Text(q)
                            .font(.system(size: 14))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .glass(16)
                    }
                    .buttonStyle(.plain)
                    .disabled(sending)
                }
                if let error {
                    Text(L.error(error)).font(.system(size: 12)).foregroundStyle(DS.dnd).multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 2)
        }
        .overlay {
            if sending { ProgressView().padding(14).glass(16) }
        }
        .navigationTitle(L.reply)
        .descallScreen()
    }

    private func send(_ raw: String) async {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        do {
            try await store.sendMessage(conv: conv, text: String(text.prefix(1000)))
            error = nil
            await onSent()
        } catch let e as WatchError {
            error = e
        } catch {
            self.error = .network
        }
    }
}

// MARK: - Friends + status

struct FriendsView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let state = store.friendsState
        DescallList(title: L.friends, loading: state.loading, refresh: { await store.loadFriends() }) {
            if let me = store.home?.me {
                NavigationLink(value: FriendsRoute.status) { MeRow(me: me) }
                    .buttonStyle(.plain)
            }
            OfflineBanner(error: state.value == nil ? nil : state.error, updatedAt: state.updatedAt)
            if let friends = state.value {
                SectionLabel(text: L.onlineHeader(friends.onlineCount))
                if friends.online.isEmpty { EmptyState(text: L.noOneOnline, icon: "person.2") }
                ForEach(friends.online) { f in
                    NavigationLink(value: FriendsRoute.chat(ChatRoute(conv: f.conv, title: f.name))) {
                        HStack(spacing: 8) {
                            AvatarView(url: f.avatarUrl, initials: f.initials, seed: f.id, size: 28, presence: f.presence)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(f.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                Text((f.customStatus?.isEmpty == false) ? f.customStatus! : L.status(f.presence))
                                    .font(.system(size: 11)).foregroundStyle(DS.ink2).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 8)
                        .glass(16)
                    }
                    .buttonStyle(.plain)
                }
                if friends.offlineCount > 0 {
                    Text(L.offlineFooter(friends.offlineCount)).font(.system(size: 11)).foregroundStyle(DS.ink2).frame(maxWidth: .infinity).padding(.top, 4)
                }
                UpdatedLine(updatedAt: state.updatedAt, loading: state.loading)
            } else if let error = state.error {
                ErrorCard(error: error) { Task { await store.loadFriends() } }
            } else {
                LoadingRows()
            }
        }
        .whileActive(every: 30) { await store.loadFriends() }
    }
}

struct MeRow: View {
    var me: WatchMe

    var body: some View {
        HStack(spacing: 8) {
            AvatarView(url: me.avatarUrl, initials: me.initials, seed: me.id ?? me.name, size: 30, presence: me.status == "invisible" ? "offline" : me.status)
            VStack(alignment: .leading, spacing: 1) {
                Text(me.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text("\(L.status(me.status)) · \(L.change)").font(.system(size: 12)).foregroundStyle(DS.brandHi)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(DS.ink2)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .glass(16, highlight: true)
    }
}

struct StatusPickerView: View {
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    @State private var busy: String?
    @State private var error: WatchError?

    private let options = ["online", "idle", "dnd", "invisible"]

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                ForEach(options, id: \.self) { s in
                    Button {
                        Task { await pick(s) }
                    } label: {
                        HStack(spacing: 10) {
                            PresenceDot(status: s == "invisible" ? "offline" : s, size: 12)
                            Text(L.status(s)).font(.system(size: 14, weight: .semibold))
                            Spacer(minLength: 0)
                            if busy == s {
                                ProgressView().frame(width: 16, height: 16)
                            } else if store.home?.me.status == s {
                                Image(systemName: "checkmark").font(.system(size: 13, weight: .bold)).foregroundStyle(DS.brandHi)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .glass(16, highlight: store.home?.me.status == s)
                    }
                    .buttonStyle(.plain)
                    .disabled(busy != nil)
                }
                if let error {
                    Text(L.error(error)).font(.system(size: 12)).foregroundStyle(DS.dnd).multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.yourStatus)
        .descallScreen()
    }

    private func pick(_ s: String) async {
        busy = s
        defer { busy = nil }
        do {
            try await store.setStatus(s)
            error = nil
            dismiss()
        } catch let e as WatchError {
            error = e
        } catch {
            self.error = .network
        }
    }
}
