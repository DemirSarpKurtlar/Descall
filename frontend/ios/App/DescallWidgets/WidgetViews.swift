import AppIntents
import SwiftUI
import WidgetKit

// Widgets draft B ("Yuzler"): the four widgets in every size. Home screen in colour (draft B
// tokens, dark and light), lock screen accessories in monochrome (shapes carry the meaning,
// .widgetAccentable for the tint), StandBy uses the small sizes full screen.

// MARK: - Shared bits

private let settingsLink = URL(string: "descall://settings/shortcuts")!

struct StateView: View {
    let status: WStatus

    var body: some View {
        switch status {
        case .signedOut:
            WidgetMessage(symbol: "person.crop.circle.badge.exclamationmark", title: WL.t("state.signedOut"), detail: WL.t("state.signedOutDetail"))
        case .failed:
            WidgetMessage(symbol: "wifi.slash", title: WL.t("state.offline"), detail: WL.t("state.offlineDetail"))
        case .ok:
            EmptyView()
        }
    }
}

/// Initial in a translucent circle (lock screen faces: no photos, no colour).
struct AccessoryFace: View {
    let letter: String
    let size: CGFloat
    var presence: DescallPresence?
    var ring = false

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.16))
            Text(letter).font(.system(size: size * 0.46, weight: .bold, design: .rounded))
        }
        .frame(width: size, height: size)
        .overlay { if ring { Circle().stroke(lineWidth: 2).widgetAccentable() } }
        .overlay(alignment: .bottomTrailing) {
            if let presence {
                PresenceShape(presence: presence).frame(width: size * 0.3, height: size * 0.3).offset(x: 2, y: 2).widgetAccentable()
            }
        }
    }
}

struct BubbleShape: Shape {
    func path(in rect: CGRect) -> Path {
        UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 5, bottomTrailingRadius: 16, topTrailingRadius: 16, style: .continuous).path(in: rect)
    }
}

struct JoinChip: View {
    var label: String = WL.t("voice.join")
    var height: CGFloat = 26
    var full = false

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.right.to.line").font(.system(size: 11, weight: .bold))
            Text(label)
        }
        .font(.system(size: 11.5, weight: .semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 11)
        .frame(maxWidth: full ? .infinity : nil, minHeight: height, maxHeight: height)
        .background(Capsule().fill(WB.brand))
    }
}

struct HereChip: View {
    var height: CGFloat = 26
    var full = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        HStack(spacing: 4) {
            SpeakBars(count: 3, height: 11, color: WB.success(scheme))
            Text(WL.t("voice.here"))
        }
        .font(.system(size: 11.5, weight: .semibold))
        .foregroundStyle(WB.success(scheme))
        .padding(.horizontal, 10)
        .frame(maxWidth: full ? .infinity : nil, minHeight: height, maxHeight: height)
        .background(Capsule().fill(WB.speak.opacity(0.2)))
    }
}

// MARK: - Friends

struct FriendsWidgetView: View {
    let entry: FriendsEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if entry.status != .ok {
            if family == .accessoryInline {
                Label(WL.t("state.signedOutShort"), systemImage: "person.2")
            } else {
                StateView(status: entry.status)
            }
        } else {
            switch family {
            case .systemSmall: small
            case .systemMedium: medium
            case .systemLarge: large
            case .accessoryRectangular: rectangular
            case .accessoryInline: inline
            default: small
            }
        }
    }

    private var emptyView: some View {
        WidgetMessage(symbol: "person.2", title: WL.t("friends.empty"), detail: WL.t("friends.emptyDetail"))
    }

    private var small: some View {
        Group {
            if entry.cards.isEmpty {
                emptyView
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(entry.cards.prefix(4)) { card in
                        VStack(spacing: 3) {
                            FaceView(face: card.face, size: 44, dot: true)
                            Text(card.face.name).font(.system(size: 11.5, weight: .semibold)).lineLimit(1)
                        }
                    }
                }
                .foregroundStyle(WB.text(scheme))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .widgetURL(entry.cards.count == 1 ? entry.cards[0].link : DescallDeepLink.friends)
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: WL.t("friends.online")) {
                Text(WL.t("friends.people", entry.onlineCount)).font(.system(size: 12)).monospacedDigit().foregroundStyle(WB.text2(scheme))
            }
            if entry.cards.isEmpty {
                emptyView
            } else {
                HStack(alignment: .top, spacing: 4) {
                    ForEach(entry.cards.prefix(4)) { card in
                        Link(destination: card.link ?? DescallDeepLink.friends) {
                            VStack(spacing: 0) {
                                FaceView(face: card.face, size: 50, dot: true)
                                Text(card.face.name).font(.system(size: 12.5, weight: .bold)).lineLimit(1).padding(.top, 6)
                                if entry.showActivity, let line = card.line {
                                    Text(line).font(.system(size: 10.5)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
                .padding(.top, 12)
                Spacer(minLength: 0)
            }
            StaleNote(since: entry.staleSince)
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: WL.t("friends.favorites")) {
                Text(WL.t("friends.onlineCount", entry.onlineCount)).font(.system(size: 12)).monospacedDigit().foregroundStyle(WB.text2(scheme))
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 3), spacing: 10) {
                ForEach(entry.cards.prefix(8)) { card in
                    largeCell(card)
                }
                Link(destination: settingsLink) {
                    VStack(spacing: 0) {
                        Circle()
                            .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .foregroundStyle(WB.text3(scheme))
                            .frame(width: 56, height: 56)
                            .overlay(Image(systemName: "plus").font(.system(size: 20, weight: .medium)).foregroundStyle(WB.text2(scheme)))
                        Text(WL.t("friends.edit")).font(.system(size: 12, weight: .bold)).foregroundStyle(WB.text2(scheme)).padding(.top, 6)
                    }
                }
            }
            .padding(.top, 12)
            Spacer(minLength: 0)
            StaleNote(since: entry.staleSince)
        }
        .foregroundStyle(WB.text(scheme))
    }

    private func largeCell(_ card: PersonCard) -> some View {
        VStack(spacing: 0) {
            Link(destination: card.link ?? DescallDeepLink.friends) {
                FaceView(face: card.face, size: 56, dot: true)
            }
            .overlay(alignment: .topTrailing) {
                if entry.showWave { waveButton(card).offset(x: 8, y: -2) }
            }
            Text(card.face.name).font(.system(size: 12.5, weight: .bold)).lineLimit(1).padding(.top, 6)
            if entry.showActivity, let line = card.line {
                Text(line).font(.system(size: 10.5)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func waveButton(_ card: PersonCard) -> some View {
        let symbol: String = {
            switch card.wave {
            case .sent?: return "checkmark"
            case .limit?: return "hourglass"
            case .failed?: return "exclamationmark"
            case nil: return "hand.wave.fill"
            }
        }()
        Button(intent: DescallWaveIntent(friendId: card.id)) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(card.wave == .sent ? WB.success(scheme) : WB.text2(scheme))
                .frame(width: 22, height: 22)
                .background(Circle().fill(WB.ring(scheme)))
                .overlay(Circle().stroke(WB.chip(scheme), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t("friends.wave", card.face.name))
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                ForEach(entry.cards.prefix(4)) { card in
                    AccessoryFace(letter: card.face.letter, size: 30, presence: card.face.presence)
                }
            }
            Text(namesLine(max: 3)).font(.system(size: 14, weight: .semibold)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(DescallDeepLink.friends)
    }

    private var inline: some View {
        Label(inlineText, systemImage: "person.2")
            .widgetURL(DescallDeepLink.friends)
    }

    private var onlineNames: [String] {
        entry.cards.filter { $0.face.presence != nil && $0.face.presence != .offline }.map(\.face.name)
    }

    private func namesLine(max: Int) -> String {
        let names = onlineNames
        guard !names.isEmpty else { return WL.t("friends.empty") }
        let shown = names.prefix(max).joined(separator: ", ")
        let rest = Swift.max(0, entry.onlineCount - min(max, names.count))
        return rest > 0 ? "\(shown) +\(rest)" : shown
    }

    private var inlineText: String {
        let names = onlineNames
        switch names.count {
        case 0: return WL.t("friends.empty")
        case 1: return names[0]
        default:
            let rest = entry.onlineCount - 2
            return rest > 0 ? WL.t("friends.inline", names[0], names[1], rest) : WL.t("friends.inlineTwo", names[0], names[1])
        }
    }
}

/// Lock screen, one face (draft B "Kilitte tek kişilik yuvarlak").
struct PersonAccessoryView: View {
    let entry: FriendsEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let card = entry.cards.first {
                Text(card.face.letter).font(.system(size: 30, weight: .bold, design: .rounded))
                if let p = card.face.presence {
                    PresenceShape(presence: p).frame(width: 13, height: 13).offset(x: 17, y: 17).widgetAccentable()
                }
            } else {
                Image(systemName: entry.status == .signedOut ? "person.crop.circle.badge.exclamationmark" : "person.fill")
                    .font(.system(size: 22, weight: .semibold))
            }
        }
        .widgetURL(entry.cards.first?.link ?? DescallDeepLink.friends)
        .accessibilityLabel(entry.cards.first?.face.name ?? "Descall")
    }
}

// MARK: - Unread

struct UnreadWidgetView: View {
    let entry: UnreadEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if entry.status != .ok {
            if family == .accessoryInline || family == .accessoryCircular || family == .accessoryRectangular {
                Label(WL.t("state.signedOutShort"), systemImage: "bubble.left")
            } else {
                StateView(status: entry.status)
            }
        } else {
            switch family {
            case .systemSmall: small
            case .systemMedium: medium
            case .systemLarge: large
            case .accessoryCircular: circular
            case .accessoryRectangular: rectangular
            case .accessoryInline: inline
            default: small
            }
        }
    }

    private var empty: some View {
        WidgetMessage(symbol: "checkmark.bubble", title: WL.t("unread.none"), detail: WL.t("unread.noneDetail"))
    }

    private func text(for b: Bubble) -> String {
        b.text ?? WL.t("unread.newCount", b.count)
    }

    private func bubble<C: View>(mention: Bool, @ViewBuilder _ content: () -> C) -> some View {
        content()
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BubbleShape().fill(WB.chip(scheme)))
            .overlay { if mention { BubbleShape().stroke(WB.brand.opacity(0.7), lineWidth: 1.5) } }
    }

    private func badged(_ face: WFace, size: CGFloat, count: Int) -> some View {
        FaceView(face: face, size: size)
            .overlay(alignment: .topTrailing) { if count > 0 { CountBadge(count: count).offset(x: 5, y: -3) } }
    }

    private var small: some View {
        Group {
            if let b = entry.bubbles.first {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 9) {
                        badged(b.face, size: 42, count: b.count)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(b.kind == "dm" ? b.title : (b.by ?? b.title)).font(.system(size: 14, weight: .bold)).lineLimit(1)
                            if let ago = b.ago { Text(WL.t("time.ago", ago)).font(.system(size: 11)).foregroundStyle(WB.text2(scheme)) }
                        }
                        Spacer(minLength: 0)
                    }
                    bubble(mention: b.mention) {
                        Text(text(for: b)).font(.system(size: 12)).lineLimit(3)
                    }
                    .padding(.top, 10)
                    Spacer(minLength: 0)
                }
                .widgetURL(b.link)
            } else {
                empty
            }
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: entry.total > 0 ? WL.t("unread.title", entry.total) : WL.t("unread.none")) {
                if entry.conversations > 0 {
                    Text(WL.t("unread.chats", entry.conversations)).font(.system(size: 11.5)).foregroundStyle(WB.text2(scheme))
                }
            }
            if entry.bubbles.isEmpty {
                empty
            } else {
                VStack(spacing: 8) {
                    ForEach(entry.bubbles.prefix(2)) { b in
                        Link(destination: b.link ?? DescallDeepLink.home) {
                            HStack(alignment: .bottom, spacing: 9) {
                                badged(b.face, size: 32, count: b.count)
                                bubble(mention: b.mention) {
                                    VStack(alignment: .leading, spacing: 1) {
                                        HStack(spacing: 4) {
                                            Text(b.title).font(.system(size: 12, weight: .bold)).lineLimit(1)
                                            if let by = b.by { Text("· \(by)").font(.system(size: 12)).foregroundStyle(WB.text2(scheme)).lineLimit(1) }
                                        }
                                        Text(text(for: b)).font(.system(size: 12)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.top, 10)
                Spacer(minLength: 0)
            }
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: WL.t("unread.largeTitle")) {
                if entry.total > 0 {
                    Text("\(entry.total)").font(.system(size: 11, weight: .bold)).monospacedDigit().foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 2).background(Capsule().fill(WB.red))
                }
            }
            if entry.bubbles.isEmpty {
                empty
            } else {
                VStack(spacing: 9) {
                    ForEach(entry.bubbles.prefix(4)) { b in
                        Link(destination: b.link ?? DescallDeepLink.home) {
                            HStack(alignment: .bottom, spacing: 9) {
                                badged(b.face, size: 34, count: b.count)
                                bubble(mention: b.mention) {
                                    VStack(alignment: .leading, spacing: 1) {
                                        HStack(spacing: 6) {
                                            Text(b.title).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                                            Spacer(minLength: 4)
                                            if let ago = b.ago { Text(ago).font(.system(size: 10.5)).foregroundStyle(WB.text3(scheme)) }
                                        }
                                        Text(b.by.map { "\($0): \(text(for: b))" } ?? text(for: b))
                                            .font(.system(size: 12)).foregroundStyle(WB.text2(scheme)).lineLimit(2)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.top, 12)
                Spacer(minLength: 0)
                HStack {
                    let more = max(0, entry.conversations - 4)
                    if more > 0 {
                        Text(WL.t("unread.more", more)).font(.system(size: 11.5)).foregroundStyle(WB.text2(scheme))
                    }
                    Spacer()
                    if let first = entry.bubbles.first, let link = first.link {
                        Link(destination: link) {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill").font(.system(size: 11))
                                Text(WL.t("unread.reply"))
                            }
                            .font(.system(size: 11.5, weight: .semibold))
                            .padding(.horizontal, 11)
                            .frame(height: 26)
                            .background(Capsule().fill(WB.chip(scheme)))
                        }
                    }
                }
            }
            StaleNote(since: entry.staleSince)
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let b = entry.bubbles.first {
                Text(b.face.letter).font(.system(size: 30, weight: .bold, design: .rounded))
                Text(entry.total > 99 ? "99+" : "\(entry.total)")
                    .font(.system(size: 12, weight: .heavy)).monospacedDigit()
                    .foregroundStyle(.black)
                    .padding(.horizontal, 4)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Capsule().fill(.white))
                    .widgetAccentable()
                    .offset(x: 16, y: -16)
            } else {
                Image(systemName: "checkmark.bubble").font(.system(size: 22, weight: .semibold))
            }
        }
        .widgetURL(entry.bubbles.first?.link)
    }

    private var rectangular: some View {
        Group {
            if let b = entry.bubbles.first {
                HStack(alignment: .top, spacing: 8) {
                    AccessoryFace(letter: b.face.letter, size: 32)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(b.kind == "dm" ? b.title : (b.by ?? b.title)) · \(b.count)").font(.system(size: 14.5, weight: .bold)).lineLimit(1)
                        Text(text(for: b)).font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                .widgetURL(b.link)
            } else {
                Label(WL.t("unread.none"), systemImage: "checkmark.bubble").font(.system(size: 14, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        Group {
            if let b = entry.bubbles.first {
                Label("\(b.kind == "dm" ? b.title : (b.by ?? b.title)): \(text(for: b))", systemImage: "bubble.left")
            } else {
                Label(WL.t("unread.none"), systemImage: "bubble.left")
            }
        }
        .widgetURL(entry.bubbles.first?.link)
    }
}

// MARK: - Voice

struct VoiceWidgetView: View {
    let entry: VoiceEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if entry.status != .ok {
            if family == .accessoryInline || family == .accessoryCircular || family == .accessoryRectangular {
                Label(WL.t("state.signedOutShort"), systemImage: "waveform")
            } else {
                StateView(status: entry.status)
            }
        } else {
            switch family {
            case .systemSmall: small
            case .systemMedium: medium
            case .systemLarge: large
            case .accessoryCircular: circular
            case .accessoryRectangular: rectangular
            case .accessoryInline: inline
            default: small
            }
        }
    }

    private var empty: some View {
        WidgetMessage(symbol: "waveform", title: WL.t("voice.empty"), detail: WL.t("voice.emptyDetail"))
    }

    private func serverBadge(_ room: RoomCard, size: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
            .fill(LinearGradient(colors: room.serverFace.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay(Text(room.serverFace.initials).font(.system(size: size * 0.38, weight: .bold)).foregroundStyle(.white))
    }

    private func statusLine(_ room: RoomCard) -> some View {
        HStack(spacing: 4) {
            if let speaker = room.speaker {
                SpeakBars(count: 3, height: 10, color: WB.success(scheme))
                Text(WL.t("call.speaking", speaker)).foregroundStyle(WB.success(scheme))
            } else if let since = room.since {
                Text(WL.t("voice.quiet", since)).foregroundStyle(WB.text3(scheme))
            }
        }
        .font(.system(size: 11))
        .lineLimit(1)
    }

    private var small: some View {
        Group {
            if let room = entry.rooms.first {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        serverBadge(room, size: 18)
                        Text(room.serverName).font(.system(size: 11.5, weight: .bold)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                    }
                    HStack(spacing: 10) {
                        FaceCluster(faces: room.faces, size: 30)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(room.channelName).font(.system(size: 13.5, weight: .bold)).lineLimit(2)
                            Text(WL.t("voice.people", room.count)).font(.system(size: 11)).foregroundStyle(WB.text2(scheme))
                        }
                    }
                    .padding(.top, 9)
                    Spacer(minLength: 0)
                    HStack {
                        if entry.rooms.count > 1 {
                            Text(WL.t("voice.moreChannels", entry.rooms.count - 1)).font(.system(size: 10.5)).foregroundStyle(WB.text2(scheme))
                        }
                        Spacer()
                        if room.here { HereChip() } else { JoinChip() }
                    }
                }
                .widgetURL(room.link)
            } else {
                empty
            }
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: WL.t("voice.title")) {
                Text(WL.t("voice.people", entry.people)).font(.system(size: 11.5)).monospacedDigit().foregroundStyle(WB.text2(scheme))
            }
            if entry.rooms.isEmpty {
                empty
            } else {
                HStack(spacing: 8) {
                    ForEach(entry.rooms.prefix(2)) { room in
                        Link(destination: room.link ?? DescallDeepLink.home) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 8) {
                                    FaceCluster(faces: room.faces, size: 22)
                                    VStack(alignment: .leading, spacing: 0) {
                                        Text(room.channelName).font(.system(size: 12.5, weight: .bold)).lineLimit(1)
                                        Text(room.serverName).font(.system(size: 10.5)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                if room.here { HereChip(full: true) } else { JoinChip(full: true) }
                            }
                            .padding(9)
                            .frame(maxWidth: .infinity, maxHeight: 100, alignment: .topLeading)
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WB.chip(scheme)))
                        }
                    }
                    if entry.rooms.count == 1 { Spacer().frame(maxWidth: .infinity) }
                }
                .padding(.top, 10)
            }
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: WL.t("voice.title")) {
                Text(WL.t("voice.summary", entry.rooms.count, entry.people)).font(.system(size: 11.5)).monospacedDigit().foregroundStyle(WB.text2(scheme))
            }
            if entry.rooms.isEmpty {
                empty
            } else {
                VStack(spacing: 9) {
                    ForEach(entry.rooms.prefix(3)) { room in
                        Link(destination: room.link ?? DescallDeepLink.home) {
                            HStack(spacing: 11) {
                                FaceCluster(faces: room.faces, size: 26)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(room.channelName).font(.system(size: 13.5, weight: .bold)).lineLimit(1)
                                    Text("\(room.serverName) · \(WL.t("voice.people", room.count))").font(.system(size: 11)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                                    statusLine(room).padding(.top, 2)
                                }
                                Spacer(minLength: 4)
                                if room.here { HereChip(height: 28) } else { JoinChip(height: 28) }
                            }
                            .padding(10)
                            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(WB.chip(scheme)))
                        }
                    }
                }
                .padding(.top, 12)
                Spacer(minLength: 0)
            }
            StaleNote(since: entry.staleSince)
        }
        .foregroundStyle(WB.text(scheme))
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let room = entry.rooms.first {
                let letters = room.faces.prefix(3).map(\.letter)
                ZStack(alignment: .topLeading) {
                    ForEach(Array(letters.enumerated()), id: \.offset) { i, l in
                        AccessoryFace(letter: l, size: 24).offset(x: [0, 17, 8.5][i], y: [0, 0, 14][i])
                    }
                }
                .frame(width: 41, height: 38, alignment: .topLeading)
                .offset(y: -4)
                if room.count > 3 {
                    Text("+\(room.count - 3)").font(.system(size: 10, weight: .heavy)).monospacedDigit().offset(y: 19)
                }
            } else {
                Image(systemName: "waveform").font(.system(size: 22, weight: .semibold))
            }
        }
        .widgetURL(entry.rooms.first?.link)
    }

    private var rectangular: some View {
        Group {
            if let room = entry.rooms.first {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        HStack(spacing: -6) {
                            ForEach(room.faces.prefix(4)) { f in AccessoryFace(letter: f.letter, size: 22) }
                        }
                        Text("\(room.count)").font(.system(size: 12, weight: .bold)).monospacedDigit().foregroundStyle(.secondary)
                    }
                    Text(room.channelName).font(.system(size: 14.5, weight: .bold)).lineLimit(1)
                    Text(room.speaker.map { WL.t("call.speaking", $0) } ?? room.serverName)
                        .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.secondary).lineLimit(1)
                }
                .widgetURL(room.link)
            } else {
                Label(WL.t("voice.empty"), systemImage: "waveform").font(.system(size: 14, weight: .semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        let names = entry.rooms.flatMap(\.faces).map(\.name)
        let text: String
        switch names.count {
        case 0: text = WL.t("voice.empty")
        case 1: text = WL.t("voice.inlineOne", names[0])
        default:
            let rest = entry.people - 2
            text = rest > 0 ? WL.t("voice.inline", names[0], names[1], rest) : WL.t("voice.inlineTwo", names[0], names[1])
        }
        return Label(text, systemImage: "waveform").widgetURL(entry.rooms.first?.link)
    }
}

// MARK: - Call

struct CallWidgetView: View {
    let entry: CallEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if let state = entry.state {
            switch family {
            case .systemSmall: small(state)
            case .systemMedium: medium(state)
            case .systemLarge: large(state)
            case .accessoryCircular: circular(state)
            case .accessoryRectangular: rectangular(state)
            case .accessoryInline: inline(state)
            default: small(state)
            }
        } else {
            idle
        }
    }

    static func speakerLine(_ state: DescallCallState) -> String {
        guard let s = state.speaker else { return state.title.isEmpty ? WL.t("call.voiceCall") : state.title }
        return s.me ? WL.t("call.youSpeaking") : WL.t("call.speaking", s.name)
    }

    private func muteButton(_ state: DescallCallState, w: CGFloat, h: CGFloat, icon: CGFloat) -> some View {
        Button(intent: DescallActivityToggleMuteIntent()) {
            Image(systemName: state.muted ? "mic.slash.fill" : "mic.fill")
                .font(.system(size: icon, weight: .semibold))
                .foregroundStyle(state.muted ? WB.red : WB.text(scheme))
                .frame(width: w, height: h)
                .background(Capsule().fill(WB.chip(scheme)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t(state.muted ? "call.unmute" : "call.mute"))
    }

    private func deafenButton(_ state: DescallCallState, w: CGFloat?, h: CGFloat, icon: CGFloat) -> some View {
        Button(intent: DescallActivityToggleDeafenIntent()) {
            Image(systemName: state.deafened ? "speaker.slash.fill" : "headphones")
                .font(.system(size: icon, weight: .semibold))
                .foregroundStyle(state.deafened ? WB.red : WB.text(scheme))
                .frame(maxWidth: w == nil ? .infinity : nil)
                .frame(width: w, height: h)
                .background(Capsule().fill(WB.chip(scheme)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t("call.deafen"))
    }

    private func leaveButton(w: CGFloat?, h: CGFloat, icon: CGFloat) -> some View {
        Button(intent: DescallActivityLeaveIntent()) {
            Image(systemName: "phone.down.fill")
                .font(.system(size: icon, weight: .semibold))
                .foregroundStyle(.white)
                .frame(maxWidth: w == nil ? .infinity : nil)
                .frame(width: w, height: h)
                .background(Capsule().fill(WB.red))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t("call.leave"))
    }

    private func speakerFace(_ size: CGFloat) -> some View {
        Group {
            if let face = entry.speaker {
                FaceView(face: face, size: size, speaking: true)
            } else {
                Circle().fill(WB.chip(scheme)).frame(width: size, height: size)
                    .overlay(Image(systemName: "waveform").font(.system(size: size * 0.36, weight: .semibold)).foregroundStyle(WB.speak))
            }
        }
    }

    private func small(_ state: DescallCallState) -> some View {
        VStack(spacing: 0) {
            speakerFace(56).padding(.top, 2)
            Text(Self.speakerLine(state)).font(.system(size: 13, weight: .bold)).lineLimit(1).padding(.top, 7)
            HStack(spacing: 3) {
                Text(state.title).lineLimit(1)
                Text("·")
                Text(state.startedAt, style: .timer).monospacedDigit()
            }
            .font(.system(size: 11)).foregroundStyle(WB.text2(scheme))
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                muteButton(state, w: 40, h: 28, icon: 14)
                leaveButton(w: 40, h: 28, icon: 15)
            }
        }
        .frame(maxWidth: .infinity)
        .foregroundStyle(WB.text(scheme))
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    private func medium(_ state: DescallCallState) -> some View {
        HStack(spacing: 14) {
            VStack(spacing: 0) {
                speakerFace(74)
                Text(state.speaker?.name ?? state.title).font(.system(size: 13, weight: .bold)).lineLimit(1).padding(.top, 7)
                Text(state.speaker == nil ? WL.t("call.voiceCall") : WL.t("call.speakingShort")).font(.system(size: 10.5)).foregroundStyle(WB.text2(scheme))
            }
            .frame(width: 92)
            VStack(alignment: .leading, spacing: 0) {
                Text(state.title).font(.system(size: 14, weight: .bold)).lineLimit(1)
                HStack(spacing: 3) {
                    if !state.subtitle.isEmpty { Text(state.subtitle).lineLimit(1); Text("·") }
                    Text(state.startedAt, style: .timer).monospacedDigit()
                }
                .font(.system(size: 11.5)).foregroundStyle(WB.text2(scheme))
                FaceStack(faces: Array(entry.faces.prefix(5)), size: 26, speakingId: state.speaker?.id).padding(.top, 10)
                Spacer(minLength: 0)
                HStack(spacing: 7) {
                    muteButton(state, w: 56, h: 32, icon: 15)
                    deafenButton(state, w: nil, h: 32, icon: 15)
                    leaveButton(w: nil, h: 32, icon: 17)
                }
            }
        }
        .foregroundStyle(WB.text(scheme))
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    private func large(_ state: DescallCallState) -> some View {
        let others = entry.faces.filter { face in !(state.participants.first { $0.id == face.id }?.me ?? false) }
        let me = entry.faces.first { face in state.participants.first { $0.id == face.id }?.me ?? false }
        return VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: state.title) {
                Text(state.startedAt, style: .timer).font(.system(size: 13, weight: .bold)).monospacedDigit().foregroundStyle(WB.success(scheme))
                    .frame(maxWidth: 70, alignment: .trailing)
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(others.prefix(4)) { face in
                    ZStack(alignment: .bottomLeading) {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(LinearGradient(colors: face.gradient.map { $0.opacity(0.22) }, startPoint: .topLeading, endPoint: .bottomTrailing))
                            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(WB.chip(scheme)))
                            .overlay {
                                if face.id == state.speaker?.id {
                                    RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(WB.speak, lineWidth: 2)
                                }
                            }
                        FaceView(face: face, size: 46, speaking: face.id == state.speaker?.id)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        HStack(spacing: 4) {
                            Text(face.name).lineLimit(1)
                            if face.screen { Image(systemName: "rectangle.on.rectangle").font(.system(size: 10)) }
                        }
                        .font(.system(size: 11.5, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.black.opacity(0.35)))
                        .padding(8)
                    }
                    .frame(height: 104)
                }
            }
            .padding(.top, 11)
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                if let me { FaceView(face: me, size: 30) }
                Text("\(WL.t("call.you")) · \(WL.t(state.muted ? "call.micOff" : "call.micOn"))").font(.system(size: 11.5)).foregroundStyle(WB.text2(scheme)).lineLimit(1)
                Spacer(minLength: 0)
                muteButton(state, w: 40, h: 34, icon: 16)
                deafenButton(state, w: 40, h: 34, icon: 16)
                leaveButton(w: 52, h: 34, icon: 19)
            }
        }
        .foregroundStyle(WB.text(scheme))
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    private func circular(_ state: DescallCallState) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            Circle().stroke(lineWidth: 2).padding(5).widgetAccentable()
            Text(entry.speaker?.letter ?? String(state.title.prefix(1))).font(.system(size: 26, weight: .bold, design: .rounded))
            Image(systemName: "waveform").font(.system(size: 9, weight: .bold)).offset(y: 20)
        }
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    private func rectangular(_ state: DescallCallState) -> some View {
        HStack(spacing: 9) {
            AccessoryFace(letter: entry.speaker?.letter ?? String(state.title.prefix(1)), size: 34, ring: true)
            VStack(alignment: .leading, spacing: 1) {
                Text(Self.speakerLine(state)).font(.system(size: 14, weight: .bold)).lineLimit(1)
                HStack(spacing: 3) {
                    Text(state.startedAt, style: .timer).monospacedDigit()
                    Text("· \(state.title)").lineLimit(1)
                }
                .font(.system(size: 13, weight: .semibold)).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    private func inline(_ state: DescallCallState) -> some View {
        Label {
            Text("\(Self.speakerLine(state)) · ") + Text(state.startedAt, style: .timer)
        } icon: {
            Image(systemName: "waveform")
        }
        .widgetURL(state.link.flatMap(URL.init(string:)))
    }

    /// No call: who you could call (favourites), or a quiet note.
    private var idle: some View {
        Group {
            switch family {
            case .accessoryCircular:
                ZStack { AccessoryWidgetBackground(); Image(systemName: "phone").font(.system(size: 20, weight: .semibold)) }
            case .accessoryRectangular:
                Label(WL.t("call.none"), systemImage: "phone").font(.system(size: 14, weight: .semibold))
            case .accessoryInline:
                Label(WL.t("call.none"), systemImage: "phone")
            default:
                VStack(alignment: .leading, spacing: 0) {
                    WidgetHeader(title: WL.t("call.none")) { EmptyView() }
                    if entry.favorites.isEmpty {
                        WidgetMessage(symbol: "phone", title: WL.t("call.none"), detail: WL.t("call.noneDetail"))
                    } else {
                        Text(WL.t("call.noneDetail")).font(.system(size: 11)).foregroundStyle(WB.text2(scheme)).lineLimit(2).padding(.top, 6)
                        Spacer(minLength: 0)
                        HStack(spacing: 6) {
                            ForEach(entry.favorites.prefix(family == .systemSmall ? 2 : 4)) { card in
                                Link(destination: card.link ?? DescallDeepLink.friends) {
                                    VStack(spacing: 3) {
                                        FaceView(face: card.face, size: family == .systemSmall ? 44 : 50)
                                        Text(card.face.name).font(.system(size: 11, weight: .semibold)).lineLimit(1)
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                    }
                }
                .foregroundStyle(WB.text(scheme))
            }
        }
    }
}
