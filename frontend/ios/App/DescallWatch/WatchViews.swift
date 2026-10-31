import SwiftUI

// MARK: - Root

struct RootView: View {
    @EnvironmentObject var store: WatchStore
    @State private var tab: Int
    @State private var chatsPath: [ChatRoute]
    @State private var friendsPath: [FriendsRoute]
    @State private var adminPath: [AdminRoute]

    init() {
        let demo = WatchDemo.screen
        let adminScreens: Set<String> = ["admin", "reports", "case", "stepup", "feedback", "maintenance"]
        _tab = State(initialValue: (demo == "friends" || demo == "status") ? 1 : (adminScreens.contains(demo ?? "") ? 2 : 0))
        _chatsPath = State(initialValue: (demo == "chat" || demo == "reply") ? [WatchDemo.chatRoute] : [])
        _friendsPath = State(initialValue: demo == "status" ? [.status] : [])
        _adminPath = State(initialValue: WatchDemo.adminPath)
    }

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack(path: $chatsPath) {
                ChatsView()
                    .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
            }
            .tag(0)
            NavigationStack(path: $friendsPath) {
                FriendsView()
                    .navigationDestination(for: FriendsRoute.self) { route in
                        switch route {
                        case .status: StatusPickerView()
                        case .chat(let r): ChatView(route: r)
                        }
                    }
            }
            .tag(1)
            // Staff only: the page exists when the account may open at least one section.
            if store.home?.adminSections != nil {
                NavigationStack(path: $adminPath) {
                    AdminHomeView()
                        .navigationDestination(for: AdminRoute.self) { AdminRouteView(route: $0) }
                }
                .tag(2)
            }
        }
        .tabViewStyle(.verticalPage)
        .sheet(isPresented: $store.stepUpPrompt, onDismiss: { store.cancelStepUp() }) {
            NavigationStack { StepUpView() }
        }
        .task {
            await store.loadHome()
            if WatchDemo.screen == "stepup" { store.stepUpPrompt = true }
        }
    }
}

enum FriendsRoute: Hashable {
    case status
    case chat(ChatRoute)
}

// MARK: - Chats

struct ChatsView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                if let home = store.home {
                    if home.conversations.isEmpty {
                        Text(L.noChats).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 20)
                    }
                    ForEach(home.conversations) { c in
                        NavigationLink(value: ChatRoute(conv: c.conv, title: c.title)) {
                            ConversationRow(c: c)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let error = store.homeError {
                    ErrorCard(error: error) { Task { await store.loadHome() } }
                } else {
                    ProgressView().padding(.top, 24)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.chats)
        .descallScreen()
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
    @State private var showReply = WatchDemo.screen == "reply"

    private var isGroup: Bool { !route.conv.hasPrefix("dm:") }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 5) {
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
        }
        .task {
            await load()
            await store.markRead(route.conv)
            // Light polling while the chat is on screen (no socket on the watch).
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                if Task.isCancelled { break }
                await load()
            }
        }
    }

    private func load() async {
        do {
            thread = try await store.thread(route.conv)
            error = nil
        } catch let e as WatchError {
            if thread == nil { error = e }
        } catch {
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
        ScrollView {
            LazyVStack(spacing: 6) {
                if let me = store.home?.me {
                    NavigationLink(value: FriendsRoute.status) {
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
                    .buttonStyle(.plain)
                }
                if let friends = store.friends {
                    SectionLabel(text: L.onlineHeader(friends.onlineCount))
                    if friends.online.isEmpty {
                        Text(L.noOneOnline).font(.system(size: 12)).foregroundStyle(DS.ink2).padding(.vertical, 8)
                    }
                    ForEach(friends.online) { f in
                        NavigationLink(value: FriendsRoute.chat(ChatRoute(conv: f.conv, title: f.name))) {
                            HStack(spacing: 8) {
                                AvatarView(url: f.avatarUrl, initials: f.initials, seed: f.id, size: 28, presence: f.presence)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(f.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                    if let s = f.customStatus, !s.isEmpty {
                                        Text(s).font(.system(size: 11)).foregroundStyle(DS.ink2).lineLimit(1)
                                    }
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
                        Text(L.offlineFooter(friends.offlineCount)).font(.system(size: 11)).foregroundStyle(DS.ink2).padding(.top, 4)
                    }
                } else if let error = store.friendsError {
                    ErrorCard(error: error) { Task { await store.loadFriends() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.friends)
        .descallScreen()
        .task {
            await store.loadFriends()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                if Task.isCancelled { break }
                await store.loadFriends()
            }
        }
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
