import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// Widgets draft B: the running call as a Live Activity. The face of whoever is speaking sits
// in the Dynamic Island (compact, minimal, expanded) and on the lock screen card; it changes
// as the speaker changes (DescallLiveCallManager spaces the updates out). Mute and leave are
// LiveActivityIntents that reach the running app. StandBy shows the lock screen card large.

struct DescallLiveCallActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DescallCallAttributes.self) { context in
            LiveCallLockScreen(state: context.state, stale: context.isStale)
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(nil)
                .widgetURL(context.state.link.flatMap(URL.init(string:)))
        } dynamicIsland: { context in
            let state = context.state
            let speaker = LiveFaces.speaker(state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    FaceView(face: speaker, size: 56, speaking: state.speaker != nil)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(state.speaker.map { $0.me ? WL.t("call.you") : $0.name } ?? state.title)
                                .font(.system(size: 17, weight: .bold)).lineLimit(1)
                            if state.speaker != nil {
                                Text(WL.t("call.speakingShort")).font(.system(size: 14)).foregroundStyle(Color.white.opacity(0.6))
                            }
                        }
                        HStack(spacing: 3) {
                            Text(state.title).lineLimit(1)
                            Text("·")
                            Text(state.startedAt, style: .timer).monospacedDigit()
                        }
                        .font(.system(size: 12.5)).foregroundStyle(Color.white.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SpeakBars(count: 5, height: 16).padding(.trailing, 6).opacity(state.speaker == nil ? 0.3 : 1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 10) {
                        FaceStack(faces: LiveFaces.strip(state), size: 28, speakingId: state.speaker?.id, ring: .black)
                        if state.participantCount > state.participants.count {
                            Text("+\(state.participantCount - state.participants.count)").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.white.opacity(0.6))
                        }
                        Spacer(minLength: 0)
                        LiveMuteButton(muted: state.muted, size: 46, icon: 20, background: Color.white.opacity(0.14))
                        LiveLeaveButton(size: 46, icon: 22)
                    }
                    .padding(.top, 8)
                }
            } compactLeading: {
                FaceView(face: speaker, size: 25, speaking: state.speaker != nil)
            } compactTrailing: {
                if state.muted {
                    Image(systemName: "mic.slash.fill").foregroundStyle(WB.red)
                } else {
                    SpeakBars(count: 5, height: 13)
                }
            } minimal: {
                FaceView(face: speaker, size: 25, speaking: state.speaker != nil)
            }
            .widgetURL(state.link.flatMap(URL.init(string:)))
            .keylineTint(WB.speak)
        }
    }
}

/// Faces of the call, photos from the App Group cache the app filled.
enum LiveFaces {
    static func face(_ p: DescallCallPerson) -> WFace {
        WFace(id: p.id, name: p.name, initials: p.initials, image: DescallAvatarCache.appGroupShared.cachedImage(id: p.id, url: nil), screen: p.screen)
    }

    static func speaker(_ state: DescallCallState) -> WFace {
        if let s = state.speaker { return face(s) }
        // Nobody spoke yet: the first other person (a DM: the peer), else the room.
        if let other = state.participants.first(where: { !$0.me }) { return face(other) }
        return WFace(id: "call-\(state.title)", name: state.title, initials: DescallText.initials(of: state.title))
    }

    static func strip(_ state: DescallCallState) -> [WFace] {
        state.participants.prefix(5).map(face)
    }
}

struct LiveMuteButton: View {
    let muted: Bool
    let size: CGFloat
    let icon: CGFloat
    let background: Color

    var body: some View {
        Button(intent: DescallActivityToggleMuteIntent()) {
            Image(systemName: muted ? "mic.slash.fill" : "mic.fill")
                .font(.system(size: icon, weight: .semibold))
                .foregroundStyle(muted ? WB.red : .white)
                .frame(width: size, height: size)
                .background(Circle().fill(background))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t(muted ? "call.unmute" : "call.mute"))
    }
}

struct LiveLeaveButton: View {
    let size: CGFloat
    let icon: CGFloat

    var body: some View {
        Button(intent: DescallActivityLeaveIntent()) {
            Image(systemName: "phone.down.fill")
                .font(.system(size: icon, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: size, height: size)
                .background(Circle().fill(WB.red))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WL.t("call.leave"))
    }
}

/// Lock screen card (also StandBy): speaker face, "Kaan konuşuyor", title · server · timer,
/// mute and leave, then every face with its name.
struct LiveCallLockScreen: View {
    let state: DescallCallState
    let stale: Bool
    @Environment(\.colorScheme) private var scheme
    @Environment(\.isLuminanceReduced) private var dimmed

    private var fg: Color { scheme == .light ? Color(hex: 0x111318) : .white }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                FaceView(face: LiveFaces.speaker(state), size: 54, speaking: state.speaker != nil && !dimmed)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stale ? WL.t("call.reconnecting") : CallWidgetView.speakerLine(state))
                        .font(.system(size: 16.5, weight: .bold)).lineLimit(1)
                    HStack(spacing: 3) {
                        Text([state.title, state.subtitle].filter { !$0.isEmpty }.joined(separator: " · ")).lineLimit(1)
                        Text("·")
                        Text(state.startedAt, style: .timer).monospacedDigit()
                    }
                    .font(.system(size: 12.5)).opacity(0.62)
                }
                Spacer(minLength: 0)
                LiveMuteButton(muted: state.muted, size: 44, icon: 19,
                               background: scheme == .light ? Color.black.opacity(0.07) : Color.white.opacity(0.13))
                LiveLeaveButton(size: 44, icon: 21)
            }
            Rectangle().fill(fg.opacity(scheme == .light ? 0.08 : 0.1)).frame(height: 1).padding(.top, 12)
            HStack(spacing: 8) {
                ForEach(state.participants.prefix(5)) { p in
                    HStack(spacing: 5) {
                        FaceView(face: LiveFaces.face(p), size: 22, speaking: p.id == state.speaker?.id && !dimmed)
                        Text(p.me ? WL.t("call.you") : p.name).font(.system(size: 11.5, weight: .semibold)).lineLimit(1)
                    }
                }
                if state.participantCount > 5 {
                    Text("+\(state.participantCount - 5)").font(.system(size: 11.5, weight: .bold)).opacity(0.62)
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 10)
        }
        .foregroundStyle(fg)
        .padding(EdgeInsets(top: 14, leading: 14, bottom: 12, trailing: 14))
    }
}
