import SwiftUI

/// After Gönder the same sheet shows live progress and the result (draft A, step 4): sending,
/// sent with a 10 s undo, scheduled, partial with retry, offline queue, failed, undone.
struct ShareRunView: View {
    @ObservedObject var model: ShareSheetModel
    let job: ShareJob
    let p: SharePalette

    var s: ShareJob.Summary { job.summary(now: model.now) }

    var body: some View {
        let sum = s
        VStack(spacing: 12) {
            switch sum.phase {
            case "sending": sending(sum)
            case "sent", "scheduled": sent(sum)
            case "partial": partial(sum)
            case "waiting": waiting(sum)
            default: failed(sum)
            }
        }
        .padding(.top, 8)
    }

    // MARK: Pieces

    func nav(_ title: String, sub: String? = nil, left: AnyView? = nil, right: AnyView? = nil) -> some View {
        ZStack {
            HStack {
                left ?? AnyView(Color.clear.frame(width: 60, height: 1))
                Spacer()
                right ?? AnyView(Color.clear.frame(width: 60, height: 1))
            }
            VStack(spacing: 1) {
                Text(title).font(.system(size: 16, weight: .semibold))
                if let sub { Text(sub).font(.system(size: 11.5)).foregroundColor(p.t3) }
            }
        }
        .padding(.horizontal, 14).frame(height: 48)
    }

    func link(_ text: String, bold: Bool = false, _ action: @escaping () -> Void) -> AnyView {
        AnyView(Button(text, action: action).font(.system(size: 16, weight: bold ? .bold : .regular)).foregroundColor(p.brandHi).frame(minWidth: 60, alignment: .trailing))
    }

    func ring(_ fraction: Double, size: CGFloat, text: String, font: CGFloat, color: Color? = nil) -> some View {
        ZStack {
            Circle().stroke(p.dark ? Color.white.opacity(0.12) : Color.black.opacity(0.1), lineWidth: size * 3.2 / 36)
            Circle().trim(from: 0, to: max(0, min(1, fraction))).stroke(color ?? p.brandHi, style: StrokeStyle(lineWidth: size * 3.2 / 36, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.35), value: fraction)
            Text(text).font(.system(size: font, weight: .heavy)).monospacedDigit()
        }
        .frame(width: size, height: size)
    }

    func bigIcon(_ symbol: String, _ colors: [Color]) -> some View {
        Circle().fill(RadialGradient(colors: colors, center: UnitPoint(x: 0.3, y: 0.25), startRadius: 2, endRadius: 64))
            .frame(width: 64, height: 64)
            .overlay(Image(systemName: symbol).font(.system(size: 28, weight: .bold)).foregroundColor(.white))
            .shadow(color: colors.last?.opacity(0.6) ?? .clear, radius: 14, y: 8)
    }

    func hero<Icon: View>(_ icon: Icon, title: String, sub: String) -> some View {
        HStack(spacing: 14) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 19, weight: .bold))
                Text(sub).font(.system(size: 13)).foregroundColor(p.t3).monospacedDigit()
            }
            Spacer()
        }
        .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 2)
    }

    func tiles(note: String, force: String? = nil) -> some View {
        HStack(spacing: 7) {
            ForEach(job.items.filter { $0.status != "dropped" }.prefix(5), id: \.index) { it in
                let badge = force ?? job.itemBadge(it.index)
                let src = model.items.first { $0.id == it.id }
                ZStack(alignment: .bottomTrailing) {
                    Group {
                        if let src, let img = model.thumbs[src.id] {
                            Image(uiImage: img).resizable().scaledToFill()
                        } else {
                            ZStack {
                                p.brand.opacity(0.16)
                                Image(systemName: it.kind == "video" ? "video" : it.kind == "image" ? "photo" : "doc.text").foregroundColor(p.brandHi)
                            }
                        }
                    }
                    .frame(width: 46, height: 46).clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    Circle().fill(badge == "ok" ? Color(red: 35 / 255, green: 165 / 255, blue: 90 / 255) : badge == "fail" ? Color(red: 218 / 255, green: 55 / 255, blue: 60 / 255) : Color(red: 201 / 255, green: 140 / 255, blue: 18 / 255))
                        .frame(width: 18, height: 18)
                        .overlay(Image(systemName: badge == "ok" ? "checkmark" : badge == "fail" ? "xmark" : "clock").font(.system(size: 9, weight: .heavy)).foregroundColor(.white))
                        .overlay(Circle().stroke(p.solid, lineWidth: 2))
                        .offset(x: 4, y: 4)
                }
            }
            Text(note).font(.system(size: 11.5)).foregroundColor(p.t3).padding(.leading, 4)
            Spacer()
        }
        .padding(.horizontal, 18)
    }

    func rows<Line: View, Trail: View>(@ViewBuilder line: @escaping (ShareJobTarget) -> Line, @ViewBuilder trailing: @escaping (ShareJobTarget) -> Trail) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(job.targets.enumerated()), id: \.element.conv) { i, t in
                HStack(spacing: 12) {
                    ShareAvatar(entry: model.index[t.conv] ?? t.entry, size: 36, p: p)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(t.kind == "channel" ? "#\(t.name)" : t.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                        line(t)
                    }
                    Spacer(minLength: 4)
                    trailing(t)
                }
                .padding(.horizontal, 14).padding(.vertical, 6).frame(minHeight: 50)
                .overlay(Rectangle().fill(i == 0 ? .clear : p.sep).frame(height: 0.5).padding(.leading, 62), alignment: .top)
            }
        }
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(p.group))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(p.edge, lineWidth: 0.5))
        .padding(.horizontal, 12)
    }

    func status(_ icon: String?, _ text: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            if let icon { Image(systemName: icon).font(.system(size: 11, weight: .semibold)) }
            Text(text).lineLimit(1)
        }
        .font(.system(size: 12)).foregroundColor(color)
    }

    func bar(_ percent: Int) -> some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(p.dark ? Color.white.opacity(0.12) : Color.black.opacity(0.1))
                Capsule().fill(LinearGradient(colors: [Color(red: 111 / 255, green: 140 / 255, blue: 1), p.brandHi], startPoint: .leading, endPoint: .trailing))
                    .frame(width: g.size.width * CGFloat(max(0, min(100, percent))) / 100)
                    .animation(.easeOut(duration: 0.35), value: percent)
            }
        }
        .frame(height: 5)
    }

    func banner(_ icon: String, title: String, body: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon).foregroundColor(p.brandHi).font(.system(size: 16))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 13, weight: .semibold))
                Text(body).font(.system(size: 12.5)).foregroundColor(p.t2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.brand.opacity(0.12)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.brandHi.opacity(0.32), lineWidth: 0.5))
        .padding(.horizontal, 14)
    }

    func primary(_ icon: String?, _ text: String, disabled: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon).font(.system(size: 16, weight: .semibold)) }
                Text(text).font(.system(size: 16, weight: .semibold))
            }
            .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 50)
            .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(p.cta))
            .shadow(color: p.brand.opacity(0.5), radius: 12, y: 8)
            .opacity(disabled ? 0.5 : 1)
        }
        .disabled(disabled)
    }

    func secondary(_ icon: String?, _ text: String, color: Color? = nil, plain: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon).font(.system(size: 15, weight: .semibold)) }
                Text(text).font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(color ?? p.t1).frame(maxWidth: .infinity).frame(height: plain ? 34 : 46)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(plain ? .clear : p.chip))
        }
    }

    func mini(_ icon: String?, _ text: String, primary: Bool = false, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(text).font(.system(size: 13, weight: .semibold))
                if let icon { Image(systemName: icon).font(.system(size: 11, weight: .bold)) }
            }
            .foregroundColor(primary ? .white : p.t1)
            .padding(.horizontal, 12).frame(height: 30)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(primary ? AnyShapeStyle(p.cta) : AnyShapeStyle(p.chip)))
        }
        .buttonStyle(.plain)
    }

    var itemsText: String { ShareText.t("items", ["count": max(1, s.itemCount)]) }
    var chatsText: String { ShareText.t("chats", ["count": s.targetCount]) }
    func reason(_ r: String?) -> String { ShareText.t("reason.\(r ?? "failed")") }

    func deliveredLine(_ t: ShareJobTarget) -> some View {
        Group {
            if t.status == "scheduled" {
                status("checkmark", ShareText.t("scheduled.row", ["time": ShareText.dayTime(job.sendAt ?? model.now, now: model.now)]), p.ok)
            } else if !t.scheduledIds.isEmpty {
                status("checkmark", ShareText.t("slowRow", ["time": ShareText.time((t.at ?? model.now) + 35_000)]), p.ok)
            } else {
                status("checkmark", ShareText.t("sent.delivered", ["time": ShareText.time(t.at ?? model.now)]), p.ok)
            }
        }
    }

    // MARK: Phases

    @ViewBuilder
    func sending(_ sum: ShareJob.Summary) -> some View {
        nav(ShareText.t("run.title"), sub: ShareText.t("run.sub", ["items": itemsText, "chats": chatsText]), left: AnyView(Button(ShareText.t("hide")) { model.close() }.font(.system(size: 16)).foregroundColor(p.brandHi).frame(minWidth: 60, alignment: .leading)))
        ScrollView {
            VStack(spacing: 12) {
                let stats = sum.speed > 0 && sum.eta != nil
                    ? ShareText.t("run.stats", ["sent": ShareText.bytes(sum.sentBytes), "total": ShareText.bytes(sum.totalBytes), "speed": ShareText.bytes(Int64(sum.speed)), "eta": sum.eta ?? 1])
                    : ShareText.t("run.statsShort", ["sent": ShareText.bytes(sum.sentBytes), "total": ShareText.bytes(sum.totalBytes)])
                hero(ring(Double(sum.percent) / 100, size: 72, text: ShareText.current == "tr" ? "%\(sum.percent)" : "\(sum.percent)%", font: 18),
                     title: ShareText.t("run.hero", ["count": sum.targetCount]), sub: stats)
                if !job.items.isEmpty { tiles(note: ShareText.t("run.uploaded", ["done": sum.uploaded, "count": sum.itemCount])) }
                rows(line: { t in
                    let pr = job.targetProgress(t.conv)
                    if t.status == "sent" || t.status == "scheduled" {
                        deliveredLine(t)
                    } else if t.status == "queued" && pr == 0 {
                        status("clock", ShareText.t("run.queued"), p.t3)
                        bar(0)
                    } else {
                        status(nil, t.status == "sending" && pr >= 80 ? ShareText.t("run.sending") : ShareText.t("run.uploading", ["percent": pr]), p.brandHi)
                        bar(pr)
                    }
                }, trailing: { _ in EmptyView() })
                banner("info.circle", title: ShareText.t("run.canClose"), body: ShareText.t("run.canCloseBody"))
            }
        }
        VStack(spacing: 8) {
            primary(nil, ShareText.t("run.background")) { model.close() }
            secondary("xmark", ShareText.t("run.stop"), color: p.danger) { model.stop() }
        }
        .padding(.horizontal, 14).padding(.bottom, 14)
    }

    @ViewBuilder
    func sent(_ sum: ShareJob.Summary) -> some View {
        let scheduled = sum.phase == "scheduled"
        nav(ShareText.t(scheduled ? "scheduled.title" : "sent.title"), right: link(ShareText.t("done"), bold: true) { model.close() })
        ScrollView {
            VStack(spacing: 12) {
                hero(bigIcon(scheduled ? "clock" : "checkmark", scheduled ? [Color(red: 125 / 255, green: 151 / 255, blue: 1), Color(red: 74 / 255, green: 104 / 255, blue: 224 / 255)] : [Color(red: 63 / 255, green: 209 / 255, blue: 126 / 255), Color(red: 29 / 255, green: 143 / 255, blue: 76 / 255)]),
                     title: ShareText.t(scheduled ? "scheduled.hero" : "sent.hero", ["count": sum.done]),
                     sub: scheduled ? ShareText.t("scheduled.sub", ["when": ShareText.dayTime(job.sendAt ?? model.now, now: model.now)])
                                    : ShareText.t("sent.sub", ["items": itemsText, "size": ShareText.bytes(sum.totalBytes), "seconds": sum.seconds ?? 1]))
                if !job.items.isEmpty { tiles(note: ShareText.t("sent.allArrived"), force: scheduled ? nil : "ok") }
                if sum.undoLeft > 0 && !job.undone {
                    HStack(spacing: 12) {
                        ring(Double(sum.undoLeft) / Double(ShareRules.undoSeconds), size: 38, text: "\(sum.undoLeft)", font: 13, color: Color(red: 143 / 255, green: 166 / 255, blue: 1))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(ShareText.t("undo.title")).font(.system(size: 14, weight: .semibold))
                            Text(ShareText.t(scheduled ? "undo.bodyScheduled" : "undo.body", ["seconds": sum.undoLeft])).font(.system(size: 12)).foregroundColor(p.t3)
                        }
                        Spacer()
                        mini("arrow.uturn.backward", model.busy ? ShareText.t("undo.busy") : ShareText.t("undo.button"), primary: true) { model.undo() }
                            .disabled(model.busy)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.solid).shadow(color: .black.opacity(0.4), radius: 16, y: 8))
                    .padding(.horizontal, 14)
                }
                rows(line: { t in deliveredLine(t) }, trailing: { t in
                    mini("chevron.right", ShareText.t("sent.open")) { model.open(model.index[t.conv] ?? t.entry) }
                })
            }
        }
        VStack(spacing: 8) {
            primary("arrow.up.right", ShareText.t("sent.openInApp")) { model.open(nil) }
            secondary(nil, ShareText.t("done")) { model.close() }
        }
        .padding(.horizontal, 14).padding(.bottom, 14)
    }

    @ViewBuilder
    func partial(_ sum: ShareJob.Summary) -> some View {
        let bad = job.targets.first { $0.status == "failed" || $0.status == "partial" }
        nav(ShareText.t("partial.title"), right: link(ShareText.t("close")) { model.close() })
        ScrollView {
            VStack(spacing: 12) {
                hero(bigIcon("exclamationmark", [Color(red: 246 / 255, green: 196 / 255, blue: 83 / 255), Color(red: 201 / 255, green: 140 / 255, blue: 18 / 255)]),
                     title: ShareText.t("partial.hero", ["done": sum.done, "count": sum.targetCount]),
                     sub: ShareText.t("partial.sub", ["name": bad.map { $0.kind == "channel" ? "#\($0.name)" : $0.name } ?? "", "reason": reason(bad?.reason)]))
                if !job.items.isEmpty { tiles(note: ShareText.t("partial.itemsIn", ["ok": sum.itemsOk, "count": sum.itemCount])) }
                rows(line: { t in
                    if t.status == "sent" || t.status == "scheduled" {
                        deliveredLine(t)
                    } else {
                        status("exclamationmark.circle", t.failedItems.isEmpty ? reason(t.reason) : ShareText.t("partial.itemsFailed", ["count": t.failedItems.count, "reason": reason(t.reason)]), p.danger)
                    }
                }, trailing: { t in
                    if (t.status == "failed" || t.status == "partial") && t.reason != "cancelled" {
                        mini("arrow.clockwise", ShareText.t("partial.retryOne"), primary: true) { model.retry() }
                    }
                })
                banner("info.circle", title: ShareText.t("partial.infoTitle"), body: ShareText.t("partial.infoBody"))
            }
        }
        VStack(spacing: 8) {
            primary("arrow.clockwise", ShareText.t("partial.retryFailed")) { model.retry() }
            secondary(nil, ShareText.t("partial.dropFailed")) { model.dropFailed() }
        }
        .padding(.horizontal, 14).padding(.bottom, 14)
    }

    @ViewBuilder
    func waiting(_ sum: ShareJob.Summary) -> some View {
        nav(ShareText.t("offline.title"), right: link(ShareText.t("close")) { model.close() })
        ScrollView {
            VStack(spacing: 12) {
                hero(bigIcon("wifi.slash", [Color(red: 240 / 255, green: 100 / 255, blue: 106 / 255), Color(red: 181 / 255, green: 38 / 255, blue: 43 / 255)]),
                     title: ShareText.t("offline.hero"),
                     sub: sum.done > 0 ? ShareText.t("offline.subSome", ["done": sum.done, "count": sum.targetCount]) : ShareText.t("offline.subNone"))
                if !job.items.isEmpty { tiles(note: ShareText.t("offline.kept"), force: "wait") }
                banner("clock", title: ShareText.t("offline.queuedTitle"), body: ShareText.t("offline.queuedBody", ["items": itemsText, "chats": chatsText]))
                rows(line: { t in
                    if t.status == "sent" || t.status == "scheduled" { deliveredLine(t) } else { status("clock", ShareText.t("offline.row"), p.warn) }
                }, trailing: { _ in EmptyView() })
            }
        }
        VStack(spacing: 8) {
            primary("arrow.clockwise", ShareText.t("offline.retryNow")) { model.retryNow() }
            secondary(nil, ShareText.t("offline.saveDraft")) { model.saveDraft() }
            secondary(nil, ShareText.t("offline.remove"), color: p.danger, plain: true) { model.removeFromQueue() }
        }
        .padding(.horizontal, 14).padding(.bottom, 14)
    }

    @ViewBuilder
    func failed(_ sum: ShareJob.Summary) -> some View {
        let undone = sum.phase == "undone"
        let first = job.targets.first { $0.reason != nil }
        nav(ShareText.t(undone ? "undone.title" : "failed.title"), right: link(ShareText.t("close")) { model.close() })
        ScrollView {
            VStack(spacing: 12) {
                hero(bigIcon(undone ? "arrow.uturn.backward" : "exclamationmark",
                             undone ? [Color(red: 125 / 255, green: 151 / 255, blue: 1), Color(red: 74 / 255, green: 104 / 255, blue: 224 / 255)] : [Color(red: 240 / 255, green: 100 / 255, blue: 106 / 255), Color(red: 181 / 255, green: 38 / 255, blue: 43 / 255)]),
                     title: ShareText.t(undone ? "undone.hero" : "failed.hero"),
                     sub: undone ? ShareText.t("undone.sub") : reason(first?.reason))
                if !undone {
                    rows(line: { t in status("exclamationmark.circle", reason(t.reason), p.danger) }, trailing: { _ in EmptyView() })
                }
            }
        }
        VStack(spacing: 8) {
            if !undone && first?.reason != "signed_out" { primary("arrow.clockwise", ShareText.t("retry")) { model.retry() } }
            secondary(nil, ShareText.t("close")) { model.close() }
        }
        .padding(.horizontal, 14).padding(.bottom, 14)
    }
}
