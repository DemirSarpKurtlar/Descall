/* Calls and voice (t("callui.<group>.<key>")): call cards, the iOS native call card,
 * ring notices, presence capsule, server voice errors, media session and overlay
 * titles. Same key tree as callui.tr.js. */
export const CALLUI_EN = {
  // components/voice/CallTapCard.jsx (mockups 31, 32)
  tap: {
    live: "Group call in progress",
    liveVideo: "Group video call in progress",
    micOn: "Mic on",
    micOff: "Mic off",
    camOn: "Camera on",
    camOff: "Camera off",
    join: "Join the call",
    notNow: "Not now",
    ended: "Call ended",
    voiceCall: "Voice call",
    videoCall: "Video call",
    groupVoice: "Group call",
    groupVideo: "Group video call",
    callBack: "Call back",
    message: "Message",
    close: "Close",
    more: "{n} more",
    talking: "{count, plural, one {{names} is talking} other {{names} are talking}}",
    nobody: "Nobody is left in the call",
    rRemote: "Disconnected ({name} left)",
    rLocal: "You ended the call",
    rMissed: "The call ended before you answered",
    rGroup: "The group call ended",
    rDrop: "Disconnected",
    group: "Group",
    dialog: "Call",
  },
  // components/calls/NativeCallCard.jsx + lib/iosNativeCallState.js
  native: {
    callWith: "Call with {name}",
    mute: "Mute",
    speaker: "Speaker",
    end: "End",
    connecting: "Connecting…",
    reconnecting: "Reconnecting…",
  },
  // lib/callRingSync.js
  ring: {
    answeredElsewhere: "Call answered on another device.",
    declinedElsewhere: "Call declined on another device.",
    missed: "Missed call.",
  },
  // lib/nativeToast.js (iOS presence capsule)
  presence: {
    online: "{name} is online",
    sub: "Just connected",
    action: "Message",
  },
  // hooks/useServerVoice.js (shown with t(serverVoice.error))
  voice: {
    needInvite: "You need to be invited to speak first.",
    noSpeakPerm: "You do not have permission to speak.",
    needShareMedia: "You need SPEAK and STREAM permission to share media.",
    needCamera: "You need SPEAK and STREAM permission to turn on camera.",
    cameraFailed: "Could not start camera.",
    disconnected: "You were disconnected from the voice channel.",
    nsBadge: "NS",
  },
  // OS media controls (hooks/useCall.js, hooks/useGroupCall.js) and the Electron overlay
  media: {
    dmTitle: "Descall call",
    groupTitle: "Descall group call",
  },
  overlay: {
    call: "Call",
    groupCall: "Group Call",
    voiceChannel: "Voice Channel",
  },
};
