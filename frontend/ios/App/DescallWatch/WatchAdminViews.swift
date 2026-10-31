import SwiftUI

// 3.7.20 Apple Watch admin menu (owner pick: full, for staff only). Every section is
// shown only when the account may open it (home.adminSections = backend sectionsFor).
// Reads use the existing /api/admin routes; every change asks for the authenticator
// code first (step-up), exactly like the admin panel.

extension L {
    static var admin: String { t2("Yönetici", "Admin") }
    static var online: String { t2("Çevrimiçi", "Online") }
    static var signupsToday: String { t2("Bugün kayıt", "Sign-ups today") }
    static var openReports: String { t2("Açık rapor", "Open reports") }
    static var newFeedback: String { t2("Yeni geri bildirim", "New feedback") }
    static func section(_ s: AdminSection) -> String {
        switch s {
        case .reports: return t2("Raporlar", "Reports")
        case .feedback: return t2("Geri bildirim", "Feedback")
        case .errors: return t2("Hata kayıtları", "Error log")
        case .maintenance: return t2("Bakım", "Maintenance")
        case .accessBans: return t2("Erişim yasakları", "Access bans")
        case .people: return t2("Kişiler", "People")
        }
    }
    static var stepUpTitle: String { t2("Doğrulama kodu", "Verification code") }
    static var stepUpBody: String { t2("Doğrulama uygulamandaki 6 haneli kodu gir.", "Enter the 6-digit code from your authenticator app.") }
    static var enterCode: String { t2("Kodu gir", "Enter code") }
    static var codeWrong: String { t2("Kod yanlış ya da süresi geçti.", "Wrong or expired code.") }
    static var cancel: String { t2("Vazgeç", "Cancel") }
    static var done: String { t2("Tamam", "Done") }
    static var nothingHere: String { t2("Şu an bir şey yok.", "Nothing here right now.") }
    static func openCount(_ n: Int) -> String { t2("\(n) açık rapor", "\(n) open reports") }
    static var assignMe: String { t2("Bana ata", "Assign to me") }
    static var timeout1h: String { t2("Zaman aşımı · 1 saat", "Timeout · 1 hour") }
    static var timeout24h: String { t2("Zaman aşımı · 24 saat", "Timeout · 24 hours") }
    static var ban: String { t2("Ban", "Ban") }
    static var banConfirm: String { t2("Kalıcı ban verilsin mi?", "Ban permanently?") }
    static var dismiss: String { t2("Reddet", "Dismiss") }
    static var assignedTo: String { t2("Atanan", "Assigned") }
    static var actionDone: String { t2("Yapıldı.", "Done.") }
    static var startProgress: String { t2("İşleme al", "Start") }
    static var markResolved: String { t2("Çözüldü", "Resolved") }
    static var ignore: String { t2("Yoksay", "Ignore") }
    static var note: String { t2("Not", "Note") }
    static var team: String { t2("Ekip", "Team") }
    static var operational: String { t2("Bakım yok, her şey açık.", "No maintenance, all systems open.") }
    static var maintActive: String { t2("Bakım sürüyor", "Maintenance active") }
    static var maintScheduled: String { t2("Planlı bakım", "Scheduled maintenance") }
    static var extend30: String { t2("+30 dakika", "+30 minutes") }
    static var endNow: String { t2("Şimdi bitir", "End now") }
    static var endConfirm: String { t2("Bakım bitirilsin mi?", "End maintenance?") }
    static var start30: String { t2("30 dk bakım başlat", "Start 30 min maintenance") }
    static var startConfirm: String { t2("Herkes için bakım ekranı açılsın mı?", "Show the maintenance screen to everyone?") }
    static var maintMessage: String { t2("Kısa bir bakım yapıyoruz. Birazdan geri döneceğiz.", "We're doing a short maintenance. Back soon.") }
    static var revoke: String { t2("Yasağı kaldır", "Revoke") }
    static var revokeConfirm: String { t2("Yasak kaldırılsın mı?", "Revoke this ban?") }
    static func hits(_ n: Int) -> String { t2("\(n) engelleme", "\(n) blocks") }
    static var search: String { t2("Kullanıcı ara", "Search users") }
    static var removeTimeout: String { t2("Zaman aşımını kaldır", "Remove timeout") }
    static var unban: String { t2("Banı kaldır", "Unban") }
    static func errorStats(_ count: Int, _ users: Int) -> String { t2("\(count) kez · \(users) kişi", "\(count)× · \(users) people") }

    fileprivate static func t2(_ tr: String, _ en: String) -> String { isTurkish ? tr : en }
}

// MARK: - Shared pieces

struct AdminActionButton: View {
    var title: String
    var icon: String
    var destructive = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                Text(title).font(.system(size: 14, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
            }
            .foregroundStyle(destructive ? Color(red: 1, green: 0.54, blue: 0.5) : .white)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(destructive ? DS.dnd.opacity(0.22) : Color.white.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(destructive ? DS.dnd.opacity(0.45) : Color.white.opacity(0.16), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}

/// Result line under the actions ("Yapıldı." or the error).
struct AdminResultLine: View {
    var text: String?
    var ok: Bool
    var body: some View {
        if let text {
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(ok ? DS.online : DS.dnd)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

/// Runs one admin change and turns the result into a line of text.
@MainActor
func runAdmin(_ store: WatchStore, _ method: String, _ path: String, _ body: [String: Any] = [:], result: Binding<(String, Bool)?>) async -> Bool {
    switch await store.adminChange(method, path, body) {
    case .success:
        result.wrappedValue = (L.actionDone, true)
        return true
    case .failure(let e):
        if case .http(0, let reason) = e, reason == "cancelled" { return false }
        result.wrappedValue = (L.error(e), false)
        return false
    }
}

struct AdminLoadState<T> {
    var value: T?
    var error: WatchError?
}

// MARK: - Step-up

struct StepUpView: View {
    @EnvironmentObject var store: WatchStore

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "lock.shield.fill").font(.system(size: 28)).foregroundStyle(DS.brandHi)
                Text(L.stepUpBody).font(.system(size: 13)).multilineTextAlignment(.center)
                TextFieldLink(prompt: Text(L.enterCode)) {
                    Label(L.enterCode, systemImage: "number")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                } onSubmit: { value in
                    Task { await store.submitStepUp(code: value) }
                }
                .buttonStyle(CTAButtonStyle())
                if store.stepUpBusy { ProgressView() }
                if let error = store.stepUpError {
                    Text(error).font(.system(size: 12)).foregroundStyle(DS.dnd).multilineTextAlignment(.center)
                }
                Button(L.cancel) { store.cancelStepUp() }
                    .font(.system(size: 13))
                    .foregroundStyle(DS.ink2)
                    .buttonStyle(.plain)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(L.stepUpTitle)
        .descallScreen()
    }
}

// MARK: - Admin home

struct AdminHomeView: View {
    @EnvironmentObject var store: WatchStore
    @State private var overview = AdminLoadState<AdminOverview>()

    private var sections: [AdminSection] {
        let allowed = Set(store.home?.adminSections ?? [])
        return AdminSection.allCases.filter { allowed.contains($0.rawValue) }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                if let o = overview.value {
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                        KpiTile(value: o.live?.connected, label: L.online, icon: "dot.radiowaves.left.and.right")
                        KpiTile(value: o.product?.signupsToday, label: L.signupsToday, icon: "person.badge.plus")
                        KpiTile(value: o.safety?.openReports, label: L.openReports, icon: "flag.fill", alert: (o.safety?.openReports ?? 0) > 0)
                        KpiTile(value: o.product?.newFeedback, label: L.newFeedback, icon: "bubble.left.fill", alert: (o.product?.newFeedback ?? 0) > 0)
                    }
                } else if let e = overview.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.vertical, 12)
                }
                ForEach(sections, id: \.self) { s in
                    NavigationLink(value: s.route) {
                        HStack(spacing: 10) {
                            Image(systemName: s.icon).font(.system(size: 14)).foregroundStyle(DS.brandHi).frame(width: 20)
                            Text(L.section(s)).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundStyle(DS.ink2)
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 10)
                        .glass(16)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.admin)
        .descallScreen()
        .task { await load() }
    }

    private func load() async {
        do {
            overview.value = try await store.adminGet("/overview", as: AdminOverview.self)
            overview.error = nil
        } catch let e as WatchError {
            overview.error = e
        } catch {
            overview.error = .network
        }
    }
}

struct KpiTile: View {
    var value: Int?
    var label: String
    var icon: String
    var alert = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: icon).font(.system(size: 11)).foregroundStyle(alert ? DS.idle : DS.brandHi)
                Spacer(minLength: 0)
            }
            Text(value.map(String.init) ?? "-").font(.system(size: 22, weight: .bold)).monospacedDigit()
            Text(label).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(DS.ink2).lineLimit(2).minimumScaleFactor(0.8)
        }
        .padding(9)
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
        .glass(16, highlight: alert)
    }
}

// MARK: - Reports

struct AdminReportsView: View {
    @EnvironmentObject var store: WatchStore
    @State private var state = AdminLoadState<[AdminReportGroup]>()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                if let groups = state.value {
                    if groups.isEmpty { Text(L.nothingHere).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 16) }
                    ForEach(groups) { g in
                        NavigationLink(value: AdminRoute.reportCase(g)) {
                            HStack(spacing: 8) {
                                AvatarView(url: g.targetAvatarUrl, initials: String(g.name.prefix(2)).uppercased(), seed: g.targetId, size: 28)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(g.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                    Text(g.reports?.first?.reasonLabel ?? g.reports?.first?.reason ?? "")
                                        .font(.system(size: 11.5)).foregroundStyle(DS.ink2).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                                Text("\(g.openCount ?? 0)")
                                    .font(.system(size: 12, weight: .bold))
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(Capsule().fill(DS.dnd.opacity(0.85)))
                            }
                            .padding(.horizontal, 9).padding(.vertical, 8)
                            .glass(16)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.reports))
        .descallScreen()
        .task { await load() }
    }

    private func load() async {
        do {
            let r = try await store.adminGet("/reports?status=open&limit=30", as: AdminReportsResponse.self)
            state.value = (r.groups ?? []).filter { ($0.openCount ?? 0) > 0 }
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

struct AdminReportCaseView: View {
    var group: AdminReportGroup
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    @State private var result: (String, Bool)?
    @State private var busy = false
    @State private var confirmBan = false

    private var openReports: [AdminReport] { (group.reports ?? []).filter { ($0.status ?? "open") == "open" } }
    private var latestId: String? { openReports.first?.id ?? group.reports?.first?.id }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    AvatarView(url: group.targetAvatarUrl, initials: String(group.name.prefix(2)).uppercased(), seed: group.targetId, size: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(group.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        Text(L.openCount(group.openCount ?? openReports.count)).font(.system(size: 11.5)).foregroundStyle(DS.ink2)
                        if let a = group.assigneeUsername {
                            Text("\(L.assignedTo): @\(a)").font(.system(size: 11)).foregroundStyle(DS.brandHi)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(9).glass(16)

                ForEach(openReports.prefix(5)) { r in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(r.reasonLabel ?? r.reason ?? "").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(DS.brandHi)
                        let detail = (r.note?.isEmpty == false ? r.note : r.snippet) ?? ""
                        if !detail.isEmpty { Text(String(detail.prefix(220))).font(.system(size: 12.5)).fixedSize(horizontal: false, vertical: true) }
                        if let who = r.reporterUsername { Text("@\(who) · \(WatchTime.short(r.createdAt))").font(.system(size: 10.5)).foregroundStyle(DS.ink2) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(9).glass(14)
                }

                if let latestId {
                    AdminActionButton(title: L.assignMe, icon: "person.fill.checkmark") {
                        act("POST", "/reports/target/\(group.targetId)/assign", ["assigneeId": "me"], close: false)
                    }
                    AdminActionButton(title: L.timeout1h, icon: "clock.fill") {
                        act("POST", "/reports/\(latestId)/timeout", ["presetId": "1h"])
                    }
                    AdminActionButton(title: L.timeout24h, icon: "clock.badge.exclamationmark.fill") {
                        act("POST", "/reports/\(latestId)/timeout", ["presetId": "24h"])
                    }
                    AdminActionButton(title: L.ban, icon: "nosign", destructive: true) { confirmBan = true }
                    AdminActionButton(title: L.dismiss, icon: "xmark.circle") { dismissAll() }
                }
                if busy { ProgressView() }
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.reports))
        .descallScreen()
        .disabled(busy)
        .confirmationDialog(L.banConfirm, isPresented: $confirmBan) {
            Button(L.ban, role: .destructive) {
                if let latestId { act("POST", "/reports/\(latestId)/ban", ["presetId": "permanent"]) }
            }
            Button(L.cancel, role: .cancel) {}
        }
    }

    private func act(_ method: String, _ path: String, _ body: [String: Any], close: Bool = true) {
        Task {
            busy = true
            let ok = await runAdmin(store, method, path, body, result: $result)
            busy = false
            if ok && close {
                try? await Task.sleep(nanoseconds: 700_000_000)
                dismiss()
            }
        }
    }

    private func dismissAll() {
        Task {
            busy = true
            var allOk = true
            for r in openReports {
                let ok = await runAdmin(store, "POST", "/reports/\(r.id)/dismiss", [:], result: $result)
                if !ok { allOk = false; break }
            }
            busy = false
            if allOk {
                try? await Task.sleep(nanoseconds: 700_000_000)
                dismiss()
            }
        }
    }
}

// MARK: - Feedback

struct AdminFeedbackListView: View {
    @EnvironmentObject var store: WatchStore
    @State private var state = AdminLoadState<[AdminFeedback]>()

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                if let items = state.value {
                    if items.isEmpty { Text(L.nothingHere).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 16) }
                    ForEach(items) { f in
                        NavigationLink(value: AdminRoute.feedbackItem(f)) {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(f.who).font(.system(size: 13.5, weight: .semibold)).lineLimit(1)
                                    Spacer(minLength: 2)
                                    Circle().fill(f.status == "new" ? DS.brand : DS.idle).frame(width: 7, height: 7)
                                }
                                Text(String((f.subject?.isEmpty == false ? f.subject! : (f.message ?? "")).prefix(90)))
                                    .font(.system(size: 12)).foregroundStyle(DS.ink2).lineLimit(2)
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .glass(16)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.feedback))
        .descallScreen()
        .task { await load() }
    }

    private func load() async {
        do {
            async let fresh = store.adminGet("/feedback?status=new&limit=15", as: AdminFeedbackResponse.self)
            async let working = store.adminGet("/feedback?status=in_progress&limit=15", as: AdminFeedbackResponse.self)
            let a = try await fresh
            let b = try await working
            state.value = (a.feedbacks ?? []) + (b.feedbacks ?? [])
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

struct AdminFeedbackDetailView: View {
    var item: AdminFeedback
    @EnvironmentObject var store: WatchStore
    @Environment(\.dismiss) private var dismiss
    @State private var result: (String, Bool)?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.who).font(.system(size: 13, weight: .semibold)).foregroundStyle(DS.brandHi)
                    Text(String((item.message ?? "").prefix(700))).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
                    Text(WatchTime.short(item.created_at)).font(.system(size: 10.5)).foregroundStyle(DS.ink2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(9).glass(14)

                ForEach(Array((item.replies ?? []).filter { $0.type != "system" }.suffix(6).enumerated()), id: \.offset) { _, r in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(r.internal == true ? L.note : (r.isAdmin == false ? item.who : L.team))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(r.internal == true ? DS.idle : DS.brandHi)
                        Text(String((r.text ?? "").prefix(400))).font(.system(size: 12.5)).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8).glass(14)
                }

                TextFieldLink(prompt: Text(L.writeOrSpeak)) {
                    Label(L.reply, systemImage: "arrowshape.turn.up.left.fill")
                } onSubmit: { value in
                    let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    act("POST", "/feedback/\(item.id)/reply", ["text": String(text.prefix(2000))], close: false)
                }
                .buttonStyle(CTAButtonStyle())

                if item.status == "new" {
                    AdminActionButton(title: L.startProgress, icon: "hammer.fill") {
                        act("PATCH", "/feedback/\(item.id)", ["status": "in_progress"], close: false)
                    }
                }
                AdminActionButton(title: L.markResolved, icon: "checkmark.circle.fill") {
                    act("PATCH", "/feedback/\(item.id)", ["status": "resolved"])
                }
                if busy { ProgressView() }
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.feedback))
        .descallScreen()
        .disabled(busy)
    }

    private func act(_ method: String, _ path: String, _ body: [String: Any], close: Bool = true) {
        Task {
            busy = true
            let ok = await runAdmin(store, method, path, body, result: $result)
            busy = false
            if ok && close {
                try? await Task.sleep(nanoseconds: 700_000_000)
                dismiss()
            }
        }
    }
}

// MARK: - Errors

struct AdminErrorsView: View {
    @EnvironmentObject var store: WatchStore
    @State private var state = AdminLoadState<[AdminErrorGroup]>()
    @State private var picked: AdminErrorGroup?
    @State private var result: (String, Bool)?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
                if let groups = state.value {
                    if groups.isEmpty { Text(L.nothingHere).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 16) }
                    ForEach(groups.prefix(30)) { g in
                        Button { picked = g } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 4) {
                                    if g.regressed == true || g.isNew == true {
                                        Circle().fill(g.regressed == true ? DS.dnd : DS.idle).frame(width: 7, height: 7)
                                    }
                                    Text(g.title ?? g.fingerprint).font(.system(size: 12.5, weight: .semibold)).lineLimit(2)
                                }
                                Text("\(L.errorStats(g.count ?? 0, g.users ?? 0)) · \(WatchTime.short(g.lastSeen))")
                                    .font(.system(size: 10.5)).foregroundStyle(DS.ink2)
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .glass(16)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.errors))
        .descallScreen()
        .task { await load() }
        .confirmationDialog(picked?.title ?? "", isPresented: Binding(get: { picked != nil }, set: { if !$0 { picked = nil } })) {
            Button(L.markResolved) { setStatus("resolved") }
            Button(L.ignore) { setStatus("ignored") }
            Button(L.cancel, role: .cancel) { picked = nil }
        }
    }

    private func setStatus(_ status: String) {
        guard let g = picked else { return }
        let fp = g.fingerprint.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? g.fingerprint
        picked = nil
        Task {
            if await runAdmin(store, "POST", "/error-groups/\(fp)/status", ["status": status], result: $result) {
                await load()
            }
        }
    }

    private func load() async {
        do {
            let r = try await store.adminGet("/error-groups?status=open&range=7d", as: AdminErrorGroupsResponse.self)
            state.value = r.groups ?? []
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

// MARK: - Maintenance

struct AdminMaintenanceView: View {
    @EnvironmentObject var store: WatchStore
    @State private var state = AdminLoadState<AdminMaintenanceResponse>()
    @State private var result: (String, Bool)?
    @State private var busy = false
    @State private var confirmEnd = false
    @State private var confirmStart = false

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                if let m = state.value {
                    if let w = m.current, w.status == "active" || w.status == "scheduled" {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(w.status == "active" ? L.maintActive : L.maintScheduled)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(w.status == "active" ? DS.idle : DS.brandHi)
                            if let t = w.title { Text(t).font(.system(size: 13, weight: .semibold)) }
                            Text("\(WatchTime.short(w.startsAt)) - \(WatchTime.short(w.endsAt))").font(.system(size: 11)).foregroundStyle(DS.ink2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(9).glass(14, highlight: w.status == "active")
                        if w.status == "active" {
                            AdminActionButton(title: L.extend30, icon: "plus.circle.fill") {
                                act("POST", "/maintenance/windows/\(w.id)/extend", ["minutes": 30])
                            }
                            AdminActionButton(title: L.endNow, icon: "stop.circle.fill", destructive: true) { confirmEnd = true }
                        }
                    } else {
                        Text(L.operational).font(.system(size: 13)).multilineTextAlignment(.center).padding(10).glass(14)
                        AdminActionButton(title: L.start30, icon: "wrench.and.screwdriver.fill", destructive: true) { confirmStart = true }
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
                if busy { ProgressView() }
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.maintenance))
        .descallScreen()
        .disabled(busy)
        .task { await load() }
        .confirmationDialog(L.endConfirm, isPresented: $confirmEnd) {
            Button(L.endNow, role: .destructive) {
                if let id = state.value?.current?.id { act("POST", "/maintenance/windows/\(id)/end", [:]) }
            }
            Button(L.cancel, role: .cancel) {}
        }
        .confirmationDialog(L.startConfirm, isPresented: $confirmStart) {
            Button(L.start30, role: .destructive) { startNow() }
            Button(L.cancel, role: .cancel) {}
        }
    }

    private func startNow() {
        let f = ISO8601DateFormatter()
        let now = Date()
        act("POST", "/maintenance/windows", [
            "startsAt": f.string(from: now),
            "endsAt": f.string(from: now.addingTimeInterval(30 * 60)),
            "message": L.maintMessage,
            "kind": "emergency",
        ])
    }

    private func act(_ method: String, _ path: String, _ body: [String: Any]) {
        Task {
            busy = true
            if await runAdmin(store, method, path, body, result: $result) { await load() }
            busy = false
        }
    }

    private func load() async {
        do {
            state.value = try await store.adminGet("/maintenance/windows", as: AdminMaintenanceResponse.self)
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

// MARK: - Access bans

struct AdminAccessBansView: View {
    @EnvironmentObject var store: WatchStore
    @State private var state = AdminLoadState<[AdminAccessBan]>()
    @State private var picked: AdminAccessBan?
    @State private var result: (String, Bool)?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
                if let bans = state.value {
                    if bans.isEmpty { Text(L.nothingHere).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 16) }
                    ForEach(bans.prefix(40)) { b in
                        Button { picked = b } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(b.label ?? b.kind ?? "").font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                Text([b.kind, b.sourceUsername.map { "@\($0)" }, b.hits.map { L.hits($0) }].compactMap { $0 }.joined(separator: " · "))
                                    .font(.system(size: 11)).foregroundStyle(DS.ink2).lineLimit(1)
                                if let r = b.reason, !r.isEmpty { Text(r).font(.system(size: 11.5)).lineLimit(2) }
                            }
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .glass(16)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await load() } }
                } else {
                    ProgressView().padding(.top, 16)
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.accessBans))
        .descallScreen()
        .task { await load() }
        .confirmationDialog(L.revokeConfirm, isPresented: Binding(get: { picked != nil }, set: { if !$0 { picked = nil } })) {
            Button(L.revoke, role: .destructive) {
                guard let b = picked else { return }
                picked = nil
                Task { if await runAdmin(store, "DELETE", "/access-bans/\(b.id)", [:], result: $result) { await load() } }
            }
            Button(L.cancel, role: .cancel) { picked = nil }
        }
    }

    private func load() async {
        do {
            let r = try await store.adminGet("/access-bans?status=active", as: AdminAccessBansResponse.self)
            state.value = r.bans ?? []
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

// MARK: - People

struct AdminPeopleView: View {
    @EnvironmentObject var store: WatchStore
    @State private var query = ""
    @State private var state = AdminLoadState<[AdminPerson]>()
    @State private var loading = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                TextFieldLink(prompt: Text(L.search)) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                        Text(query.isEmpty ? L.search : query).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .font(.system(size: 14))
                    .padding(.horizontal, 12).frame(minHeight: 40)
                    .glass(20)
                } onSubmit: { value in
                    query = value.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task { await search() }
                }
                .buttonStyle(.plain)
                if loading { ProgressView() }
                if let people = state.value {
                    if people.isEmpty { Text(L.nothingHere).font(.system(size: 13)).foregroundStyle(DS.ink2).padding(.top, 8) }
                    ForEach(people) { p in
                        NavigationLink(value: AdminRoute.person(p)) {
                            HStack(spacing: 8) {
                                AvatarView(url: nil, initials: String(p.name.prefix(2)).uppercased(), seed: p.id, size: 28, presence: p.isOnline == true ? "online" : "offline")
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(p.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                                    if let u = p.username { Text("@\(u)").font(.system(size: 11)).foregroundStyle(DS.ink2).lineLimit(1) }
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 9).padding(.vertical, 8)
                            .glass(16)
                        }
                        .buttonStyle(.plain)
                    }
                } else if let e = state.error {
                    ErrorCard(error: e) { Task { await search() } }
                }
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.people))
        .descallScreen()
    }

    private func search() async {
        guard query.count >= 2 else { return }
        loading = true
        defer { loading = false }
        do {
            let q = WatchStore.query(query)
            let r = try await store.adminGet("/people/search?q=\(q)", as: AdminPeopleResponse.self)
            state.value = r.users ?? []
            state.error = nil
        } catch let e as WatchError {
            state.error = e
        } catch {
            state.error = .network
        }
    }
}

struct AdminPersonView: View {
    var person: AdminPerson
    @EnvironmentObject var store: WatchStore
    @State private var result: (String, Bool)?
    @State private var busy = false
    @State private var confirmBan = false

    private var canModerate: Bool { store.home?.adminSections?.contains("moderation") == true }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    AvatarView(url: nil, initials: String(person.name.prefix(2)).uppercased(), seed: person.id, size: 32, presence: person.isOnline == true ? "online" : "offline")
                    VStack(alignment: .leading, spacing: 1) {
                        Text(person.name).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                        if let u = person.username { Text("@\(u)").font(.system(size: 11)).foregroundStyle(DS.ink2) }
                    }
                    Spacer(minLength: 0)
                }
                .padding(9).glass(16)
                if canModerate && person.isAdmin != true {
                    AdminActionButton(title: L.timeout1h, icon: "clock.fill") { act("/users/\(person.id)/timeout", ["presetId": "1h"]) }
                    AdminActionButton(title: L.removeTimeout, icon: "clock.arrow.circlepath") { act("/users/\(person.id)/untimeout", [:]) }
                    AdminActionButton(title: L.ban, icon: "nosign", destructive: true) { confirmBan = true }
                    AdminActionButton(title: L.unban, icon: "checkmark.shield") { act("/users/\(person.id)/unban", [:]) }
                }
                if busy { ProgressView() }
                AdminResultLine(text: result?.0, ok: result?.1 ?? true)
            }
            .padding(.horizontal, 2)
        }
        .navigationTitle(L.section(.people))
        .descallScreen()
        .disabled(busy)
        .confirmationDialog(L.banConfirm, isPresented: $confirmBan) {
            Button(L.ban, role: .destructive) { act("/users/\(person.id)/ban", ["presetId": "permanent", "category": "other"]) }
            Button(L.cancel, role: .cancel) {}
        }
    }

    private func act(_ path: String, _ body: [String: Any]) {
        Task {
            busy = true
            _ = await runAdmin(store, "POST", path, body, result: $result)
            busy = false
        }
    }
}

// MARK: - Router

struct AdminRouteView: View {
    var route: AdminRoute
    var body: some View {
        switch route {
        case .reports: AdminReportsView()
        case .reportCase(let g): AdminReportCaseView(group: g)
        case .feedback: AdminFeedbackListView()
        case .feedbackItem(let f): AdminFeedbackDetailView(item: f)
        case .errors: AdminErrorsView()
        case .maintenance: AdminMaintenanceView()
        case .accessBans: AdminAccessBansView()
        case .people: AdminPeopleView()
        case .person(let p): AdminPersonView(person: p)
        }
    }
}
