import SwiftUI
import UIKit

// The iOS share sheet, draft A ("Hızlı cam sayfa", share.html#A): the same layout and states
// as src/components/share/SharePage.jsx + ShareRun.jsx, drawn in SwiftUI (iOS 15+).

struct SharePalette {
    let dark: Bool
    var brand: Color { Color(red: 88 / 255, green: 122 / 255, blue: 245 / 255) }
    var brandHi: Color { dark ? Color(red: 143 / 255, green: 166 / 255, blue: 1) : Color(red: 58 / 255, green: 102 / 255, blue: 238 / 255) }
    var t1: Color { dark ? Color.white.opacity(0.96) : Color(red: 14 / 255, green: 16 / 255, blue: 28 / 255).opacity(0.94) }
    var t2: Color { dark ? Color(red: 237 / 255, green: 240 / 255, blue: 1).opacity(0.82) : Color(red: 30 / 255, green: 34 / 255, blue: 52 / 255).opacity(0.84) }
    var t3: Color { dark ? Color(red: 232 / 255, green: 236 / 255, blue: 1).opacity(0.66) : Color(red: 40 / 255, green: 46 / 255, blue: 70 / 255).opacity(0.62) }
    var t4: Color { dark ? Color.white.opacity(0.36) : Color.black.opacity(0.3) }
    var ok: Color { dark ? Color(red: 61 / 255, green: 220 / 255, blue: 132 / 255) : Color(red: 26 / 255, green: 154 / 255, blue: 82 / 255) }
    var danger: Color { dark ? Color(red: 1, green: 123 / 255, blue: 123 / 255) : Color(red: 210 / 255, green: 59 / 255, blue: 64 / 255) }
    var warn: Color { dark ? Color(red: 245 / 255, green: 197 / 255, blue: 90 / 255) : Color(red: 176 / 255, green: 122 / 255, blue: 6 / 255) }
    var field: Color { dark ? Color.black.opacity(0.26) : Color.black.opacity(0.06) }
    var chip: Color { dark ? Color.white.opacity(0.08) : Color.black.opacity(0.06) }
    var edge: Color { dark ? Color.white.opacity(0.12) : Color.black.opacity(0.08) }
    var sep: Color { dark ? Color.white.opacity(0.1) : Color.black.opacity(0.09) }
    var solid: Color { dark ? Color(red: 27 / 255, green: 28 / 255, blue: 36 / 255) : Color.white }
    var group: LinearGradient {
        dark ? LinearGradient(colors: [Color.white.opacity(0.09), Color.white.opacity(0.045)], startPoint: .top, endPoint: .bottom)
             : LinearGradient(colors: [Color.white.opacity(0.86), Color.white.opacity(0.7)], startPoint: .top, endPoint: .bottom)
    }
    var cta: LinearGradient {
        LinearGradient(colors: [Color(red: 120 / 255, green: 150 / 255, blue: 1), Color(red: 80 / 255, green: 112 / 255, blue: 240 / 255)], startPoint: .top, endPoint: .bottom)
    }
}

func shareRowSubtitle(_ e: ShareTarget, hasFiles: Bool, now: Double) -> String {
    let sharedAt = e.lastShared.flatMap { ISO8601DateFormatter.descall.date(from: $0.at)?.timeIntervalSince1970 }.map { $0 * 1000 }
    let rel = sharedAt.flatMap { ShareRules.relativeDay($0, now: now) }
    let presence = ShareText.t("presence.\(e.presence ?? "offline")")
    switch e.kind {
    case "channel":
        let v = e.verdict(hasFiles: hasFiles)
        if !v.ok { return ShareText.t("reason.\(v.reason ?? "no_permission")") }
        if e.slowModeSec > 0 { return ShareText.t("row.slowMode", ["seconds": e.slowModeSec]) }
        if let rel = rel { return ShareText.t("row.lastShared.\(rel.key)", ["count": rel.n]) }
        return ShareText.t("row.channel")
    case "group":
        if let rel = rel, let ls = e.lastShared, ls.mediaCount > 0 {
            return ShareText.t("row.groupShared.\(rel.key)", ["members": e.memberCount, "count": ls.mediaCount, "days": rel.n])
        }
        return ShareText.t(e.onlineCount > 0 ? "row.membersOnline" : "row.members", ["members": e.memberCount, "online": e.onlineCount])
    default:
        if let rel = rel, let ls = e.lastShared, ls.mediaCount > 0 {
            return ShareText.t("row.dmShared.\(rel.key)", ["presence": presence, "count": ls.mediaCount, "days": rel.n])
        }
        return presence
    }
}

private let avatarColors: [Color] = [0xE8457A, 0x19A2B3, 0x9B5DE5, 0xE1780F, 0x2DAA53, 0x5E5CE6, 0xC9A227, 0x3E7BFA].map {
    Color(red: Double(($0 >> 16) & 0xFF) / 255, green: Double(($0 >> 8) & 0xFF) / 255, blue: Double($0 & 0xFF) / 255)
}

func avatarColor(_ id: String) -> Color {
    var h: UInt32 = 0
    for u in id.unicodeScalars { h = h &* 31 &+ u.value }
    return avatarColors[Int(h % UInt32(avatarColors.count))]
}

struct ShareAvatar: View {
    let entry: ShareTarget
    var size: CGFloat = 40
    var selected = false
    var showPresence = true
    let p: SharePalette

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Group {
                if entry.kind == "channel" {
                    RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                        .fill(p.chip)
                        .overlay(Image(systemName: "number").font(.system(size: size * 0.42, weight: .semibold)).foregroundColor(p.t2))
                } else {
                    let base = avatarColor(entry.id)
                    Circle()
                        .fill(LinearGradient(colors: [base.opacity(0.92), base], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay(
                            Group {
                                if entry.kind == "group" {
                                    Image(systemName: "person.2").font(.system(size: size * 0.4, weight: .semibold))
                                } else {
                                    Text(entry.initials ?? String(entry.name.prefix(1)).uppercased()).font(.system(size: size * 0.4, weight: .bold))
                                }
                            }.foregroundColor(.white)
                        )
                }
            }
            .frame(width: size, height: size)
            .overlay(Circle().stroke(selected ? p.brand : .clear, lineWidth: 2.5).padding(-5))
            if showPresence, entry.kind == "dm", let pr = entry.presence {
                Circle().fill(presenceColor(pr)).frame(width: max(11, size * 0.3), height: max(11, size * 0.3))
                    .overlay(Circle().stroke(p.solid, lineWidth: 2.5))
                    .offset(x: 1, y: 1)
            }
            if selected {
                Circle().fill(p.brand).frame(width: size * 0.38, height: size * 0.38)
                    .overlay(Image(systemName: "checkmark").font(.system(size: size * 0.2, weight: .heavy)).foregroundColor(.white))
                    .overlay(Circle().stroke(p.solid, lineWidth: 2.5))
                    .offset(x: 3, y: 3)
            }
        }
        .accessibilityHidden(true)
    }

    func presenceColor(_ s: String) -> Color {
        switch s {
        case "online": return Color(red: 35 / 255, green: 165 / 255, blue: 90 / 255)
        case "idle": return Color(red: 1, green: 159 / 255, blue: 10 / 255)
        case "dnd": return Color(red: 218 / 255, green: 55 / 255, blue: 60 / 255)
        default: return Color(red: 128 / 255, green: 132 / 255, blue: 142 / 255)
        }
    }
}

struct ShareRootView: View {
    @ObservedObject var model: ShareSheetModel
    @Environment(\.colorScheme) var scheme

    var body: some View {
        let p = SharePalette(dark: scheme == .dark)
        ZStack(alignment: .top) {
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                LinearGradient(colors: [p.brand.opacity(scheme == .dark ? 0.22 : 0.14), .clear], startPoint: .topLeading, endPoint: .center)
                LinearGradient(colors: [.clear, Color(red: 124 / 255, green: 92 / 255, blue: 1).opacity(scheme == .dark ? 0.18 : 0.1)], startPoint: .center, endPoint: .bottomTrailing)
                (scheme == .dark ? Color(red: 18 / 255, green: 19 / 255, blue: 27 / 255).opacity(0.86) : Color(red: 238 / 255, green: 240 / 255, blue: 248 / 255).opacity(0.86))
            }
            .ignoresSafeArea()
            if let job = model.job {
                ShareRunView(model: model, job: job, p: p)
            } else {
                ShareComposeView(model: model, p: p)
            }
            if let toast = model.toast {
                Text(toast)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(p.t1)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(p.solid).shadow(color: .black.opacity(0.35), radius: 16, y: 8))
                    .padding(.top, 58).padding(.horizontal, 20)
                    .transition(.opacity)
            }
        }
        .foregroundColor(p.t1)
        .animation(.easeOut(duration: 0.2), value: model.toast)
    }
}

// MARK: - Compose

struct ShareComposeView: View {
    @ObservedObject var model: ShareSheetModel
    let p: SharePalette

    var body: some View {
        VStack(spacing: 0) {
            nav
            ScrollView {
                VStack(spacing: 0) {
                    if let d = model.duplicates.first { dupBanner(d) }
                    strip
                    meta
                    search
                    if model.query.isEmpty { recents }
                    tabs.padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 2)
                    list
                }
                .padding(.bottom, 12)
            }
            footer
        }
        .overlay(menus, alignment: .bottom)
    }

    var subtitle: String {
        let items = ShareText.t("items", ["count": model.items.count])
        return ShareText.t("itemsSize", ["items": items, "size": ShareText.bytes(model.totals.chosen)])
    }

    var nav: some View {
        ZStack {
            HStack {
                Button(ShareText.t("cancel")) { model.cancelSheet() }
                    .font(.system(size: 16)).foregroundColor(p.brandHi).frame(minWidth: 60, alignment: .leading)
                Spacer()
                Button { model.menu = model.menu == "quality" ? nil : "quality" } label: {
                    Image(systemName: "slider.horizontal.3").font(.system(size: 15, weight: .semibold))
                        .frame(width: 34, height: 34).background(Circle().fill(model.menu == "quality" ? p.brand.opacity(0.16) : p.chip))
                }
                .accessibilityLabel(ShareText.t("options"))
            }
            VStack(spacing: 1) {
                HStack(spacing: 7) {
                    Image(systemName: "link").font(.system(size: 11, weight: .bold)).foregroundColor(p.brand)
                        .frame(width: 20, height: 20).background(RoundedRectangle(cornerRadius: 6).fill(Color(red: 57 / 255, green: 60 / 255, blue: 77 / 255)))
                    Text(ShareText.t("title")).font(.system(size: 16, weight: .semibold))
                }
                Text(subtitle).font(.system(size: 11.5)).foregroundColor(p.t3).lineLimit(1)
            }
            .padding(.horizontal, 90)
        }
        .padding(.horizontal, 14).frame(height: 48).padding(.top, 8)
    }

    func dupBanner(_ d: (conv: String, kind: String, at: Double)) -> some View {
        let name = model.index[d.conv]?.name ?? ""
        let rel = ShareRules.relativeDay(d.at, now: model.now)
        let when = rel.map { ShareText.t("when.\($0.key)", ["count": $0.n]) } ?? ""
        return HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle").foregroundColor(p.warn).font(.system(size: 16))
            VStack(alignment: .leading, spacing: 1) {
                Text(ShareText.t(d.kind == "link" ? "dup.link" : "dup.file", ["when": when, "name": name])).font(.system(size: 13, weight: .semibold))
                Text(ShareText.t("dup.body", ["name": ShareRules.firstName(name)])).font(.system(size: 12.5)).foregroundColor(p.t2)
            }
            Spacer(minLength: 4)
            Button(ShareText.t("dup.remove")) {
                model.selected.removeAll { $0 == d.conv }
                model.dismissedDup.insert(d.conv)
            }
            .font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(height: 30)
            .background(RoundedRectangle(cornerRadius: 10).fill(p.chip))
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(red: 240 / 255, green: 178 / 255, blue: 50 / 255).opacity(0.12)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(red: 240 / 255, green: 178 / 255, blue: 50 / 255).opacity(0.35), lineWidth: 0.5))
        .padding(.horizontal, 14).padding(.bottom, 8)
    }

    var strip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(model.items) { it in tile(it) }
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 4)
        }
    }

    @ViewBuilder
    func tile(_ it: ShareInputItem) -> some View {
        let bad = it.problem(quality: model.quality, allowedMimes: model.allowedMimes)
        ZStack(alignment: .topTrailing) {
            Group {
                switch it.kind {
                case "link":
                    let meta = model.linkMeta[it.url ?? ""]
                    HStack(spacing: 0) {
                        Rectangle().fill(p.brand).frame(width: 3)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(meta?.site ?? URL(string: it.url ?? "")?.host ?? "").font(.system(size: 10, weight: .semibold)).foregroundColor(p.t3).lineLimit(1)
                            Text(it.title ?? meta?.title ?? it.url ?? "").font(.system(size: 11.5, weight: .semibold)).lineLimit(2)
                        }
                        .padding(.horizontal, 8)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10).padding(.leading, 6)
                    .frame(width: 176, height: 76)
                case "text":
                    Text(it.text ?? "").font(.system(size: 11.5)).foregroundColor(p.t2).lineLimit(4).padding(9).frame(width: 146, height: 76, alignment: .topLeading)
                case "file":
                    VStack(alignment: .leading) {
                        Image(systemName: "doc.text").font(.system(size: 17)).foregroundColor(p.brandHi)
                            .frame(width: 36, height: 36).background(RoundedRectangle(cornerRadius: 10).fill(p.brand.opacity(0.16)))
                        Spacer(minLength: 0)
                        Text(it.name).font(.system(size: 11.5, weight: .semibold)).lineLimit(1)
                        Text(ShareText.bytes(it.size)).font(.system(size: 10.5)).foregroundColor(p.t3)
                    }
                    .padding(9).frame(width: 146, height: 76, alignment: .leading)
                default:
                    ZStack(alignment: .bottomLeading) {
                        if let img = model.thumbs[it.id] {
                            Image(uiImage: img).resizable().scaledToFill()
                        } else {
                            Rectangle().fill(p.chip)
                        }
                        if it.kind == "video" {
                            HStack(spacing: 3) {
                                Image(systemName: "play.fill").font(.system(size: 8))
                                Text(durationText(it.durationMs)).font(.system(size: 10.5, weight: .bold)).monospacedDigit()
                            }
                            .foregroundColor(.white).padding(.horizontal, 5).padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 7).fill(Color.black.opacity(0.7))).padding(5)
                        }
                    }
                    .frame(width: 76, height: 76).clipped()
                }
            }
            .background(p.chip)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(bad != nil ? p.danger : Color.white.opacity(0.18), lineWidth: bad != nil ? 2 : 0.5))
            Button { model.removeItem(it.id) } label: {
                Image(systemName: "xmark").font(.system(size: 9, weight: .heavy)).foregroundColor(.white)
                    .frame(width: 20, height: 20).background(Circle().fill(Color.black.opacity(0.72)))
            }
            .padding(5)
            .accessibilityLabel("\(ShareText.t("remove")) \(it.name)")
        }
    }

    func durationText(_ ms: Int) -> String {
        let s = max(0, ms / 1000)
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }

    var meta: some View {
        let t = model.totals
        let bad = model.items.compactMap { $0.problem(quality: model.quality, allowedMimes: model.allowedMimes) }.first
        return HStack(spacing: 7) {
            Text(model.items.isEmpty ? ShareText.t("noItems") : ShareText.t("items", ["count": model.items.count])).font(.system(size: 12, weight: .semibold)).foregroundColor(p.t2)
            if model.hasFiles {
                Circle().fill(p.t4).frame(width: 3, height: 3)
                Text(model.quality == "original" ? ShareText.bytes(t.original) : "\(ShareText.bytes(t.original)) → \(ShareText.bytes(t.chosen))").monospacedDigit()
                if t.savedPercent > 0 { Text(ShareText.t("saved", ["percent": t.savedPercent])).fontWeight(.semibold).foregroundColor(p.ok) }
            }
            if let bad {
                Circle().fill(p.t4).frame(width: 3, height: 3)
                Text(ShareText.t("reason.\(bad)")).foregroundColor(p.danger)
            }
            Spacer()
        }
        .font(.system(size: 12)).foregroundColor(p.t3)
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
    }

    var search: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 15)).foregroundColor(p.t3)
            TextField(ShareText.t("search"), text: $model.query).font(.system(size: 15)).disableAutocorrection(true)
            if !model.query.isEmpty {
                Button { model.query = "" } label: { Image(systemName: "xmark.circle.fill").foregroundColor(p.t3) }
                    .accessibilityLabel(ShareText.t("clearSearch"))
            }
        }
        .padding(.horizontal, 12).frame(height: 40)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(p.field))
        .padding(.horizontal, 14)
    }

    var recents: some View {
        let list = model.targets?.recentEntries(max: 8) ?? []
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(list) { e in
                    let on = model.selected.contains(e.conv)
                    Button { model.toggle(e.conv) } label: {
                        VStack(spacing: 6) {
                            ShareAvatar(entry: e, size: 54, selected: on, showPresence: false, p: p)
                            Text(e.kind == "channel" ? "#\(e.name)" : ShareRules.firstName(e.name))
                                .font(.system(size: 11.5, weight: .medium)).foregroundColor(on ? p.t1 : p.t2).lineLimit(1).frame(maxWidth: 68)
                        }
                        .frame(width: 70)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(e.name)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.horizontal, 10).padding(.top, 12).padding(.bottom, 4)
        }
    }

    var tabs: some View {
        HStack(spacing: 2) {
            ForEach(ShareRules.tabs, id: \.self) { k in
                Button { model.tab = k } label: {
                    Text(ShareText.t("tabs.\(k)")).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                        .foregroundColor(model.tab == k ? p.t1 : p.t3)
                        .frame(maxWidth: .infinity).frame(height: 30)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(model.tab == k ? (p.dark ? Color.white.opacity(0.17) : .white) : .clear))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(model.tab == k ? .isSelected : [])
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(p.field))
    }

    func sectionTitle(_ text: String, trailing: String? = nil) -> some View {
        HStack {
            Text(text).font(.system(size: 12.5, weight: .semibold)).foregroundColor(p.t3)
            Spacer()
            if let trailing { Text(trailing).font(.system(size: 12.5, weight: .semibold)).foregroundColor(p.brandHi) }
        }
        .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 6)
    }

    func groupBox<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0, content: content)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(p.group))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.edge, lineWidth: 0.5))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(.horizontal, 12)
    }

    func row(_ e: ShareTarget, sub: Bool = false, first: Bool) -> some View {
        let on = model.selected.contains(e.conv)
        let dis = !e.verdict(hasFiles: model.hasFiles).ok
        return Button { model.toggle(e.conv) } label: {
            HStack(spacing: 12) {
                ShareAvatar(entry: e, size: sub ? 32 : 40, p: p)
                VStack(alignment: .leading, spacing: 1) {
                    (Text(e.name).font(.system(size: 15, weight: .semibold))
                        + Text(e.kind == "channel" && !sub ? "  · \(e.serverName ?? "")" : "").font(.system(size: 15)).foregroundColor(p.t3))
                        .lineLimit(1)
                    Text(shareRowSubtitle(e, hasFiles: model.hasFiles, now: model.now)).font(.system(size: 12.5)).foregroundColor(p.t3).lineLimit(1)
                }
                Spacer(minLength: 4)
                if dis {
                    Image(systemName: "lock").font(.system(size: 14)).foregroundColor(p.t3).frame(width: 24, height: 24)
                } else {
                    ZStack {
                        Circle().stroke(on ? .clear : p.t4, lineWidth: 1.5)
                        if on { Circle().fill(p.brand); Image(systemName: "checkmark").font(.system(size: 12, weight: .heavy)).foregroundColor(.white) }
                    }
                    .frame(width: 24, height: 24)
                    .animation(.spring(response: 0.25, dampingFraction: 0.7), value: on)
                }
            }
            .padding(.leading, sub ? 30 : 14).padding(.trailing, 14).padding(.vertical, 8)
            .frame(minHeight: sub ? 50 : 56)
            .contentShape(Rectangle())
            .overlay(Rectangle().fill(first ? .clear : p.sep).frame(height: 0.5).padding(.leading, sub ? 78 : 66), alignment: .top)
            .opacity(dis ? 0.55 : 1)
        }
        .buttonStyle(.plain)
        .disabled(dis)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    @ViewBuilder
    var list: some View {
        switch model.load {
        case .signedOut:
            empty(ShareText.t("signedOutTitle"), ShareText.t("signedOutBody"), action: ShareText.t("openApp")) { model.open(nil) }
        case .error:
            empty(ShareText.t("errorTitle"), model.offline ? ShareText.t("errorOffline") : "", action: ShareText.t("retry")) { Task { await model.loadTargets() } }
        case .loading:
            groupBox {
                ForEach(0..<4, id: \.self) { i in
                    HStack(spacing: 12) {
                        Circle().fill(p.chip).frame(width: 40, height: 40)
                        VStack(alignment: .leading, spacing: 6) {
                            RoundedRectangle(cornerRadius: 6).fill(p.chip).frame(width: CGFloat(170 - i * 20), height: 12)
                            RoundedRectangle(cornerRadius: 6).fill(p.chip).frame(width: 90, height: 10)
                        }
                        Spacer()
                    }
                    .padding(.horizontal, 14).frame(height: 56)
                }
            }
            .padding(.top, 12)
        case .ready:
            let sections = model.targets?.sections(tab: model.tab, query: model.query, selected: model.selected) ?? []
            if sections.isEmpty {
                empty(model.query.isEmpty ? ShareText.t("emptyTitle") : ShareText.t("emptySearch", ["query": model.query]), model.query.isEmpty ? ShareText.t("emptyBody") : "", action: nil) {}
            } else if model.tab == "servers" {
                ForEach(Array(sections.enumerated()), id: \.element.id) { i, sec in
                    if let s = sec.server { serverBlock(s, rows: sec.rows, first: i == 0) }
                }
            } else {
                ForEach(sections) { sec in
                    sectionTitle(ShareText.t("sec.\(sec.id)"))
                    groupBox {
                        ForEach(Array(sec.rows.enumerated()), id: \.element.conv) { i, e in row(e, first: i == 0) }
                    }
                }
            }
        }
    }

    func serverBlock(_ s: ShareServer, rows: [ShareTarget], first: Bool) -> some View {
        let open = !model.query.isEmpty || (model.expanded == nil ? first : model.expanded == s.id)
        let ok = rows.filter { $0.verdict(hasFiles: model.hasFiles).ok }.count
        let head = ShareTarget(conv: "server:\(s.id)", kind: "server", id: s.id, name: s.name)
        return VStack(spacing: 0) {
            if first || open { sectionTitle(s.name, trailing: ShareText.t("server.channels", ["count": rows.count])) } else { Color.clear.frame(height: 10) }
            groupBox {
                Button { model.expanded = open ? "__none" : s.id } label: {
                    HStack(spacing: 12) {
                        Text(s.initials ?? String(s.name.prefix(2)).uppercased()).font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                            .frame(width: 40, height: 40).background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(avatarColor(head.id)))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                            Text(ok > 0 ? ShareText.t("server.sendable", ["count": ok]) : ShareText.t("server.none")).font(.system(size: 12.5)).foregroundColor(p.t3)
                        }
                        Spacer()
                        Image(systemName: open ? "chevron.down" : "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundColor(p.t3)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 52).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(open ? .isSelected : [])
                if open {
                    ForEach(rows, id: \.conv) { e in row(e, sub: true, first: false) }
                }
            }
        }
    }

    func empty(_ title: String, _ body: String, action: String?, _ run: @escaping () -> Void) -> some View {
        VStack(spacing: 6) {
            Text(title).font(.system(size: 15, weight: .semibold))
            if !body.isEmpty { Text(body).font(.system(size: 13.5)).foregroundColor(p.t3).multilineTextAlignment(.center) }
            if let action {
                Button(action, action: run).font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                    .padding(.horizontal, 14).frame(height: 30).background(RoundedRectangle(cornerRadius: 10).fill(p.cta)).padding(.top, 8)
            }
        }
        .padding(.horizontal, 24).padding(.vertical, 28)
        .frame(maxWidth: .infinity)
    }

    // Footer: message, chips, Gönder.
    var footer: some View {
        VStack(spacing: 9) {
            if model.menu == nil {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "bubble.left").font(.system(size: 16)).foregroundColor(p.t3).padding(.top, 12)
                    TextField(ShareText.t("message"), text: $model.message).font(.system(size: 15)).padding(.vertical, 12)
                }
                .padding(.horizontal, 12)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.field))
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    if model.hasFiles {
                        chip(icon: model.quality == "saver" ? "bolt" : model.quality == "original" ? "photo" : "sparkles",
                             text: ShareText.t("quality.chip.\(model.quality)"), on: true, focus: model.menu == "quality", chevron: true) {
                            model.menu = model.menu == "quality" ? nil : "quality"
                        }
                    }
                    chip(icon: "bell.slash", text: ShareText.t("silent"), on: model.silent) {
                        model.silent.toggle()
                        if model.silent { model.say(ShareText.t("silentHint")) }
                    }
                    chip(icon: "clock", text: model.sendAt.map { ShareText.dayTime($0, now: model.now) } ?? ShareText.t("scheduleChip"), on: model.sendAt != nil, focus: model.menu == "schedule") {
                        model.menu = model.menu == "schedule" ? nil : "schedule"
                    }
                    if model.hasMedia {
                        chip(icon: model.strip ? "location.slash" : "location", text: ShareText.t(model.strip ? "location.chipOn" : "location.chipOff"), on: model.strip) {
                            model.strip.toggle()
                        }
                    }
                }
            }
            Button { model.send() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane").font(.system(size: 16, weight: .semibold))
                    Text(ctaText).font(.system(size: 16, weight: .semibold))
                }
                .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 50)
                .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(p.cta))
                .shadow(color: p.brand.opacity(model.selected.isEmpty ? 0 : 0.55), radius: 12, y: 8)
                .opacity(model.selected.isEmpty ? 0.45 : 1)
            }
            .disabled(model.selected.isEmpty)
        }
        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 14)
        .background(p.solid.opacity(0.92).ignoresSafeArea(edges: .bottom))
        .overlay(Rectangle().fill(p.sep).frame(height: 0.5), alignment: .top)
    }

    var ctaText: String {
        let n = model.selected.count
        if n == 0 { return ShareText.t("pick") }
        return ShareText.t(model.sendAt != nil ? "sendScheduled" : "send", ["count": n])
    }

    func chip(icon: String, text: String, on: Bool, focus: Bool = false, chevron: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: icon).font(.system(size: 12, weight: .semibold))
                Text(text).font(.system(size: 12.5, weight: .semibold)).lineLimit(1)
                if chevron { Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)) }
            }
            .foregroundColor(on ? (p.dark ? Color(red: 213 / 255, green: 222 / 255, blue: 1) : Color(red: 31 / 255, green: 63 / 255, blue: 176 / 255)) : p.t2)
            .padding(.horizontal, 10).frame(height: 30)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(on ? p.brand.opacity(0.24) : p.chip))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(focus ? p.brand : (on ? p.brandHi.opacity(0.5) : p.edge), lineWidth: focus ? 2 : 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // Opaque menus (quality + location, schedule).
    @ViewBuilder
    var menus: some View {
        if let m = model.menu {
            ZStack(alignment: .bottomLeading) {
                Color.black.opacity(0.22).ignoresSafeArea().onTapGesture { model.menu = nil }
                VStack(alignment: .leading, spacing: 0) {
                    if m == "quality" { qualityMenu } else { scheduleMenu }
                }
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.solid).shadow(color: .black.opacity(0.5), radius: 30, y: 16))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(p.edge, lineWidth: 0.5))
                .padding(.leading, 14).padding(.trailing, 60).padding(.bottom, 108)
            }
            .transition(.opacity)
        }
    }

    func menuItem(icon: String, title: String, sub: String?, checked: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 16)).foregroundColor(p.t2).frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 14.5, weight: .semibold))
                    if let sub { Text(sub).font(.system(size: 12)).foregroundColor(p.t3).lineLimit(1) }
                }
                Spacer()
                if checked { Image(systemName: "checkmark").font(.system(size: 15, weight: .semibold)).foregroundColor(p.brandHi) }
            }
            .padding(.horizontal, 10).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(checked ? p.brand.opacity(0.18) : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    var qualityMenu: some View {
        VStack(spacing: 0) {
            ForEach(ShareRules.qualities, id: \.self) { q in
                menuItem(icon: q == "original" ? "photo" : q == "high" ? "sparkles" : "bolt", title: ShareText.t("quality.\(q)"),
                         sub: ShareText.t("quality.\(q)Desc", ["size": ShareText.bytes(shareTotals(model.sendable, quality: q).chosen)]), checked: model.quality == q) {
                    model.quality = q
                    model.menu = nil
                }
            }
            if model.hasMedia {
                Rectangle().fill(p.sep).frame(height: 0.5).padding(.horizontal, 8).padding(.vertical, 5)
                HStack(spacing: 10) {
                    Image(systemName: "location.slash").font(.system(size: 16)).foregroundColor(p.t2).frame(width: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(ShareText.t("location.title")).font(.system(size: 14.5, weight: .semibold))
                        Text(ShareText.t("location.desc")).font(.system(size: 12)).foregroundColor(p.t3).lineLimit(1)
                    }
                    Spacer()
                    Toggle("", isOn: $model.strip).labelsHidden().tint(Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255))
                }
                .padding(.horizontal, 10).padding(.vertical, 6)
            }
        }
    }

    @State private var customDate = Date().addingTimeInterval(3600)

    var scheduleMenu: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(ShareText.t("scheduleTitle")).font(.system(size: 11.5, weight: .bold)).foregroundColor(p.t3).padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 6)
            ForEach(ShareRules.schedulePresets(now: model.now), id: \.key) { pr in
                menuItem(icon: "clock", title: ShareText.t("schedule.\(pr.key)"), sub: ShareText.dayTime(pr.at, now: model.now), checked: model.sendAt == pr.at) {
                    model.sendAt = pr.at
                    model.menu = nil
                }
            }
            HStack {
                DatePicker("", selection: $customDate, in: Date().addingTimeInterval(120)..., displayedComponents: [.date, .hourAndMinute]).labelsHidden()
                Spacer()
                Button(ShareText.t("schedule.set")) {
                    let at = customDate.timeIntervalSince1970 * 1000
                    guard ShareRules.validSchedule(at, now: model.now) else { return model.say(ShareText.t("schedule.invalid")) }
                    model.sendAt = at
                    model.menu = nil
                }
                .font(.system(size: 13, weight: .semibold)).foregroundColor(.white).padding(.horizontal, 12).frame(height: 30)
                .background(RoundedRectangle(cornerRadius: 10).fill(p.cta))
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            if model.sendAt != nil {
                Rectangle().fill(p.sep).frame(height: 0.5).padding(.horizontal, 8).padding(.vertical, 5)
                menuItem(icon: "paperplane", title: ShareText.t("schedule.now"), sub: nil, checked: false) {
                    model.sendAt = nil
                    model.menu = nil
                }
            }
        }
    }
}
