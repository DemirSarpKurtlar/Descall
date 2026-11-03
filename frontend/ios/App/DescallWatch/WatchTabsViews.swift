import SwiftUI

// 3.7.33: the rest of the iOS tabs in watch form. Servers -> text channels -> the existing
// ChatView (conv "channel:<id>"), Activity (friend requests + missed calls, read-only),
// Calls (history only, no call recording), You (profile, status, iPhone link, version).

enum ServersRoute: Hashable {
    case server(String)
    case chat(ChatRoute)
}

// MARK: - Servers

struct ServersView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let state = store.serversState
        DescallList(title: L.servers, loading: state.loading, refresh: { await store.loadServers() }) {
            OfflineBanner(error: state.value == nil ? nil : state.error, updatedAt: state.updatedAt)
            if let servers = state.value?.servers {
                if servers.isEmpty { EmptyState(text: L.noServers, icon: "square.stack.3d.up") }
                ForEach(servers) { s in
                    NavigationLink(value: ServersRoute.server(s.id)) { ServerRow(server: s) }
                        .buttonStyle(.plain)
                }
                UpdatedLine(updatedAt: state.updatedAt, loading: state.loading)
            } else if let error = state.error {
                ErrorCard(error: error) { Task { await store.loadServers() } }
            } else {
                LoadingRows()
            }
        }
        .whileActive(every: 120) { await store.loadServers() }
    }
}

struct ServerRow: View {
    var server: WatchServer

    var body: some View {
        HStack(spacing: 8) {
            AvatarView(url: server.iconUrl, initials: server.initials, seed: server.id, size: 30)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(server.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                HStack(spacing: 4) {
                    if server.muted == true { Image(systemName: "bell.slash.fill").font(.system(size: 9)) }
                    Text(server.memberCount.map { L.members($0) } ?? "").lineLimit(1)
                }
                .font(.system(size: 11))
                .foregroundStyle(DS.ink2)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(DS.ink2)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .glass(16)
        .contentShape(Rectangle())
    }
}

struct ServerChannelsView: View {
    var serverId: String
    @EnvironmentObject var store: WatchStore

    private var server: WatchServer? { store.serversState.value?.servers.first { $0.id == serverId } }

    var body: some View {
        DescallList(title: server?.name ?? L.servers, loading: store.serversState.loading, refresh: { await store.loadServers() }) {
            if let server {
                if server.timedOut == true {
                    Label(L.timedOutHere, systemImage: "clock.badge.exclamationmark")
                        .font(.system(size: 12, weight: .semibold)).foregroundStyle(DS.idle)
                        .padding(8).frame(maxWidth: .infinity).glass(12)
                }
                if server.channels.isEmpty { EmptyState(text: L.noChannels, icon: "number") }
                ForEach(groups(server.channels)) { group in
                    if !group.name.isEmpty { SectionLabel(text: group.name) }
                    ForEach(group.channels) { ch in
                        NavigationLink(value: ServersRoute.chat(ChatRoute(conv: ch.conv, title: "#\(ch.name)"))) {
                            HStack(spacing: 6) {
                                Image(systemName: "number").font(.system(size: 12, weight: .semibold)).foregroundStyle(DS.brandHi)
                                Text(ch.name).font(.system(size: 14, weight: .medium)).lineLimit(1)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 9)
                            .glass(14)
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else if let error = store.serversState.error {
                ErrorCard(error: error) { Task { await store.loadServers() } }
            } else {
                LoadingRows()
            }
        }
        .task { if server == nil { await store.loadServers() } }
    }

    /// Channels grouped by category, in server order.
    struct Group: Identifiable { var name: String; var channels: [WatchChannel]; var id: String { name } }

    private func groups(_ channels: [WatchChannel]) -> [Group] {
        var out: [Group] = []
        for ch in channels {
            let key = ch.category ?? ""
            if let i = out.firstIndex(where: { $0.name == key }) { out[i].channels.append(ch) } else { out.append(Group(name: key, channels: [ch])) }
        }
        return out
    }
}

// MARK: - Activity

struct ActivityView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let state = store.activityState
        DescallList(title: L.activity, loading: state.loading, refresh: { await store.loadActivity() }) {
            OfflineBanner(error: state.value == nil ? nil : state.error, updatedAt: state.updatedAt)
            if let a = state.value {
                if a.items.isEmpty { EmptyState(text: L.noActivity, icon: "checkmark.circle") }
                if a.requestCount > 0 { SectionLabel(text: L.requestsHeader(a.requestCount)) }
                ForEach(a.items.filter { $0.type == "friendRequest" }) { item in
                    ActivityRow(item: item)
                }
                if a.requestCount > 0 {
                    Text(L.acceptOnPhone).font(.system(size: 11)).foregroundStyle(DS.ink2).frame(maxWidth: .infinity).multilineTextAlignment(.center)
                }
                if a.missedCount > 0 { SectionLabel(text: L.missedHeader(a.missedCount)) }
                ForEach(a.items.filter { $0.type != "friendRequest" }) { item in
                    if let conv = item.conv {
                        NavigationLink(value: ChatRoute(conv: conv, title: item.title)) { ActivityRow(item: item) }
                            .buttonStyle(.plain)
                    } else {
                        ActivityRow(item: item)
                    }
                }
                UpdatedLine(updatedAt: state.updatedAt, loading: state.loading)
            } else if let error = state.error {
                ErrorCard(error: error) { Task { await store.loadActivity() } }
            } else {
                LoadingRows()
            }
        }
        .whileActive(every: 60) { await store.loadActivity() }
    }
}

struct ActivityRow: View {
    var item: WatchActivityItem

    var body: some View {
        let missed = item.type != "friendRequest"
        HStack(spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(url: item.avatarUrl, initials: item.initials, seed: item.id, size: 30)
                Image(systemName: item.type == "friendRequest" ? "person.badge.plus" : (item.type == "missedVideo" ? "video.fill" : "phone.fill"))
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(3)
                    .background(Circle().fill(missed ? DS.dnd : DS.brand))
                    .offset(x: 3, y: 3)
            }
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(item.title).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                    Spacer(minLength: 2)
                    Text(WatchTime.short(item.at)).font(.system(size: 11)).foregroundStyle(DS.ink2)
                }
                Text(L.activityLine(item.type)).font(.system(size: 11.5)).foregroundStyle(missed ? DS.dnd : DS.ink2).lineLimit(2)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .glass(16)
        .contentShape(Rectangle())
    }
}

// MARK: - Calls

struct CallsView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        let state = store.callsState
        DescallList(title: L.calls, loading: state.loading, refresh: { await store.loadCalls() }) {
            OfflineBanner(error: state.value == nil ? nil : state.error, updatedAt: state.updatedAt)
            if let calls = state.value?.calls {
                if calls.isEmpty { EmptyState(text: L.noCalls, icon: "phone") }
                ForEach(calls) { c in
                    if let conv = c.conv {
                        NavigationLink(value: ChatRoute(conv: conv, title: c.title)) { CallRow(call: c) }
                            .buttonStyle(.plain)
                    } else {
                        CallRow(call: c)
                    }
                }
                Text(L.callsOnPhone).font(.system(size: 11)).foregroundStyle(DS.ink2).frame(maxWidth: .infinity).multilineTextAlignment(.center)
                UpdatedLine(updatedAt: state.updatedAt, loading: state.loading)
            } else if let error = state.error {
                ErrorCard(error: error) { Task { await store.loadCalls() } }
            } else {
                LoadingRows()
            }
        }
        .whileActive(every: 120) { await store.loadCalls() }
    }
}

struct CallRow: View {
    var call: WatchCall

    private var icon: String {
        if call.missed { return call.video ? "video.slash.fill" : "phone.down.fill" }
        switch call.direction {
        case "outgoing": return call.video ? "video.fill" : "phone.arrow.up.right.fill"
        case "group": return "person.3.fill"
        default: return call.video ? "video.fill" : "phone.arrow.down.left.fill"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            AvatarView(url: call.avatarUrl, initials: call.initials, seed: call.id, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(call.title).font(.system(size: 14, weight: .semibold)).foregroundStyle(call.missed ? DS.dnd : .white).lineLimit(1)
                    Spacer(minLength: 2)
                    Text(WatchTime.short(call.at)).font(.system(size: 11)).foregroundStyle(DS.ink2)
                }
                HStack(spacing: 4) {
                    Image(systemName: icon).font(.system(size: 10))
                    Text(L.call((missed: call.missed, direction: call.direction, video: call.video))).lineLimit(1)
                    if let d = call.durationSec, d > 0, !call.missed {
                        Text("· \(WatchDuration.clock(d))").monospacedDigit()
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(call.missed ? DS.dnd : DS.ink2)
            }
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .glass(16)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - You

struct ProfileView: View {
    @EnvironmentObject var store: WatchStore
    @State private var refreshingAll = false

    private var version: String {
        let info = Bundle.main.infoDictionary
        let v = info?["CFBundleShortVersionString"] as? String ?? "?"
        let b = info?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    var body: some View {
        DescallList(title: L.you, loading: refreshingAll, refresh: { await all() }) {
            if let me = store.home?.me {
                VStack(spacing: 4) {
                    AvatarView(url: me.avatarUrl, initials: me.initials, seed: me.id ?? me.name, size: 54, presence: me.status == "invisible" ? "offline" : me.status)
                    Text(me.name).font(.system(size: 16, weight: .bold)).lineLimit(1)
                    if let u = me.username, !u.isEmpty {
                        Text("@\(u)").font(.system(size: 12)).foregroundStyle(DS.ink2).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                NavigationLink(value: FriendsRoute.status) {
                    HStack(spacing: 8) {
                        PresenceDot(status: me.status == "invisible" ? "offline" : me.status, size: 11)
                        Text(L.status(me.status)).font(.system(size: 14, weight: .semibold))
                        Spacer(minLength: 0)
                        Text(L.change).font(.system(size: 12)).foregroundStyle(DS.brandHi)
                    }
                    .padding(.horizontal, 11)
                    .padding(.vertical, 10)
                    .glass(16, highlight: true)
                }
                .buttonStyle(.plain)
            } else if let error = store.homeError {
                ErrorCard(error: error) { Task { await store.loadHome() } }
            } else {
                LoadingRows(count: 1)
            }
            HStack(spacing: 8) {
                Image(systemName: store.offline ? "iphone.slash" : "iphone")
                    .foregroundStyle(store.offline ? DS.idle : DS.online)
                Text(store.offline ? L.iphoneAway : L.iphoneConnected).font(.system(size: 13, weight: .medium))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 9)
            .glass(16)
            Button {
                Task { await all() }
            } label: {
                if refreshingAll { ProgressView() } else { Label(L.refreshAll, systemImage: "arrow.clockwise") }
            }
            .buttonStyle(CTAButtonStyle())
            .disabled(refreshingAll)
            VStack(spacing: 3) {
                Image("DescallMark").resizable().renderingMode(.template).scaledToFit()
                    .frame(width: 22, height: 22).foregroundStyle(DS.brandHi)
                Text("Descall · \(L.version) \(version)").font(.system(size: 10.5)).foregroundStyle(DS.ink2).monospacedDigit()
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 6)
            .accessibilityElement(children: .combine)
        }
    }

    private func all() async {
        refreshingAll = true
        await store.refreshAll()
        refreshingAll = false
    }
}
