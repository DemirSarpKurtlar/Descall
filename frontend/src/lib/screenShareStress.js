/**
 * Two- and three-client screen-share session simulator.
 *
 * Replays the failure modes that used to show the camera as the share, drop
 * a DM share when system audio was attached, and leave the stage up after
 * stop. The legacy classifier is the previous production rule, kept here so
 * before/after numbers come from the same scenarios.
 */
import {
  LIVEKIT_SOURCE,
  ROLE_CAMERA,
  TRACK_NAME,
  assertPublishRole,
  dropScreenEntries,
  layoutInboundEntries,
  playbackGains,
  sanitizeScreenAnnouncement,
  tagLocalTrack,
} from "./screenShareIdentity.js";

function legacyRole(entry, announcement, expectScreen) {
  const source = String(entry.source || "");
  if (source === "screen_share" || source === "screen_share_audio") {
    return entry.kind === "audio" ? "screen-audio" : "screen";
  }
  if (source === "camera") return "camera";
  if (source === "microphone") return "mic";
  if (entry.kind === "video" && expectScreen && source !== "camera") return "screen";
  const label = String(entry.label || "").toLowerCase();
  const surface = entry.displaySurface;
  if (
    entry.kind === "video" &&
    (expectScreen ||
      surface ||
      label.includes("screen") ||
      label.includes("display") ||
      label.includes("window") ||
      label.includes("tab") ||
      label.includes("desktop") ||
      label.includes("monitor"))
  ) {
    return "screen";
  }
  if (entry.kind === "audio" && expectScreen && entry.streamId && entry.streamId !== "mic-stream") {
    return "screen-audio";
  }
  return entry.kind === "audio" ? "mic" : "camera";
}

function legacyLayout(entries, announcement) {
  const expectScreen = Boolean(announcement);
  const layout = { screen: null, screenAudio: null, camera: null, mic: null };
  const silentVideos = [];
  for (const entry of entries) {
    if (!entry || entry.ended) continue;
    const role = legacyRole(entry, announcement, expectScreen);
    if (role === "screen") layout.screen = entry.id;
    else if (role === "screen-audio") layout.screenAudio = entry.id;
    else if (role === "camera") layout.camera = entry.id;
    else layout.mic = entry.id;
    if (entry.kind === "video" && !entry.hasAudio) silentVideos.push(entry);
  }
  // Old DM recovery: when the signal arrives, steal the newest silent video
  // and ignore a display track that shares its stream with system audio.
  if (expectScreen && silentVideos.length) {
    const stolen = silentVideos[silentVideos.length - 1];
    if (stolen && stolen.source !== "camera") layout.screen = stolen.id;
    if (stolen?.source === "camera" || stolen?.trackName === TRACK_NAME.camera || !stolen?.displaySurface) {
      layout.screen = stolen.id;
      if (layout.camera === stolen.id) layout.camera = null;
    }
  }
  return layout;
}

function applyStop(entries, announcement) {
  return dropScreenEntries(entries, announcement).map((entry) => ({ ...entry }));
}

export function reduceSession(steps, { legacy = false } = {}) {
  let announcement = null;
  let entries = [];
  let firstFrameStep = null;
  let freezes = 0;
  let mutedRun = 0;
  const layoutOf = legacy
    ? (list, ann) => legacyLayout(list, ann)
    : (list, ann) => layoutInboundEntries(list, ann);

  steps.forEach((step, index) => {
    if (step.op === "announce") {
      announcement = sanitizeScreenAnnouncement(step);
    } else if (step.op === "stop") {
      entries = applyStop(entries, announcement);
      announcement = null;
      mutedRun = 0;
    } else if (step.op === "track") {
      entries = entries.filter((entry) => entry.id !== step.id);
      entries.push({ ...step, ended: false, muted: false });
    } else if (step.op === "end") {
      entries = entries.map((entry) => (entry.id === step.id ? { ...entry, ended: true } : entry));
    } else if (step.op === "loss") {
      const target = entries.find((entry) => entry.id === step.id && !entry.ended);
      if (target) target.muted = true;
    } else if (step.op === "resume") {
      const target = entries.find((entry) => entry.id === step.id && !entry.ended);
      if (target) target.muted = false;
    }

    const layout = layoutOf(entries, announcement);
    const screenEntry = entries.find((entry) => entry.id === layout.screen && !entry.ended);
    if (layout.screen && screenEntry?.muted) {
      mutedRun += 1;
      if (mutedRun === 3) freezes += 1;
    } else {
      mutedRun = 0;
    }
    if (firstFrameStep == null && layout.screen && screenEntry && !screenEntry.muted) {
      firstFrameStep = index;
    }
  });

  return {
    layout: layoutOf(entries, announcement),
    announcement,
    firstFrameStep,
    freezes,
    entries,
  };
}

function baseShareSteps(id, { withAudio = true, camera = false, signal = "before" } = {}) {
  const streamId = `screen-${id}`;
  const steps = [];
  const announce = {
    op: "announce",
    streamId,
    videoMid: `mid-screen-${id}`,
    audioMid: withAudio ? `mid-screen-audio-${id}` : null,
  };
  const video = {
    op: "track",
    id: `screen-${id}`,
    kind: "video",
    streamId,
    mid: `mid-screen-${id}`,
    label: "",
    hasAudio: withAudio,
    source: LIVEKIT_SOURCE.screen,
    trackName: TRACK_NAME.screen,
  };
  const audio = {
    op: "track",
    id: `screen-audio-${id}`,
    kind: "audio",
    streamId,
    mid: `mid-screen-audio-${id}`,
    label: "tab audio",
    source: LIVEKIT_SOURCE.screenAudio,
    trackName: TRACK_NAME.screenAudio,
  };
  const cam = {
    op: "track",
    id: `cam-${id}`,
    kind: "video",
    streamId: `cam-${id}`,
    mid: `mid-cam-${id}`,
    label: "Integrated Camera",
    hasAudio: false,
    source: LIVEKIT_SOURCE.camera,
    trackName: TRACK_NAME.camera,
    displaySurface: null,
  };
  const mic = {
    op: "track",
    id: `mic-${id}`,
    kind: "audio",
    streamId: "mic-stream",
    mid: `mid-mic-${id}`,
    source: LIVEKIT_SOURCE.mic,
    trackName: TRACK_NAME.mic,
  };
  if (signal === "before") steps.push(announce);
  steps.push(video);
  if (withAudio) steps.push(audio);
  if (camera) {
    steps.push(cam);
    steps.push(mic);
  }
  if (signal === "after") steps.push(announce);
  if (signal === "never") {
    /* unlabeled display still has source when the publisher is current */
  }
  return { steps, expectScreen: `screen-${id}`, expectAudio: withAudio ? `screen-audio-${id}` : null, expectCamera: camera ? `cam-${id}` : null };
}

function scriptedScenarios() {
  const scenarios = [];
  const signalOrders = ["before", "after"];
  for (const signal of signalOrders) {
    for (const withAudio of [false, true]) {
      for (const camera of [false, true]) {
        const built = baseShareSteps("a", { withAudio, camera, signal });
        scenarios.push({
          name: `dm-${signal}-audio-${withAudio}-camera-${camera}`,
          call: "dm",
          steps: built.steps,
          expect: {
            screen: built.expectScreen,
            screenAudio: built.expectAudio,
            camera: built.expectCamera,
          },
        });
      }
    }
  }

  scenarios.push({
    name: "camera-during-share-stays-camera",
    call: "dm",
    steps: [
      ...baseShareSteps("a", { withAudio: true, camera: false, signal: "before" }).steps,
      {
        op: "track",
        id: "cam-late",
        kind: "video",
        streamId: "cam-late",
        mid: "mid-cam-late",
        label: "FaceTime HD Camera",
        hasAudio: false,
        source: LIVEKIT_SOURCE.camera,
        trackName: TRACK_NAME.camera,
      },
    ],
    expect: { screen: "screen-a", screenAudio: "screen-audio-a", camera: "cam-late" },
  });

  scenarios.push({
    name: "empty-source-camera-not-promoted",
    call: "dm",
    steps: [
      { op: "announce", streamId: "screen-a", videoMid: "mid-screen-a", audioMid: null },
      {
        op: "track",
        id: "cam-blank",
        kind: "video",
        streamId: "cam-blank",
        mid: "mid-cam-blank",
        label: "",
        hasAudio: false,
        source: "",
        trackName: "",
      },
      {
        op: "track",
        id: "screen-a",
        kind: "video",
        streamId: "screen-a",
        mid: "mid-screen-a",
        label: "",
        hasAudio: true,
        source: LIVEKIT_SOURCE.screen,
        trackName: TRACK_NAME.screen,
      },
    ],
    expect: { screen: "screen-a", camera: "cam-blank" },
  });

  scenarios.push({
    name: "stop-local",
    call: "dm",
    steps: [...baseShareSteps("a", { withAudio: true, camera: true, signal: "before" }).steps, { op: "stop" }],
    expect: { screen: null, screenAudio: null, camera: "cam-a", mic: "mic-a" },
  });

  scenarios.push({
    name: "stop-browser-bar",
    call: "dm",
    steps: [
      ...baseShareSteps("a", { withAudio: true, camera: true, signal: "before" }).steps,
      { op: "end", id: "screen-a" },
      { op: "end", id: "screen-audio-a" },
      { op: "stop" },
    ],
    expect: { screen: null, screenAudio: null, camera: "cam-a" },
  });

  scenarios.push({
    name: "stop-remote-signal",
    call: "group",
    steps: [...baseShareSteps("a", { withAudio: false, camera: false, signal: "after" }).steps, { op: "stop" }],
    expect: { screen: null, screenAudio: null },
  });

  scenarios.push({
    name: "rejoin-mid-share",
    call: "dm",
    steps: [
      ...baseShareSteps("old", { withAudio: true, camera: true, signal: "before" }).steps,
      { op: "stop" },
      ...baseShareSteps("new", { withAudio: true, camera: false, signal: "before" }).steps,
    ],
    expect: { screen: "screen-new", screenAudio: "screen-audio-new", camera: "cam-old" },
  });

  const lossSteps = baseShareSteps("a", { withAudio: true, camera: true, signal: "before" }).steps;
  for (let i = 0; i < 8; i += 1) {
    lossSteps.push({ op: "loss", id: "screen-a" });
    if (i % 2 === 1) lossSteps.push({ op: "resume", id: "screen-a" });
  }
  lossSteps.push({ op: "resume", id: "screen-a" });
  scenarios.push({
    name: "packet-loss-keeps-share",
    call: "dm",
    steps: lossSteps,
    expect: { screen: "screen-a", screenAudio: "screen-audio-a", camera: "cam-a" },
  });

  const longSteps = baseShareSteps("a", { withAudio: true, camera: true, signal: "before" }).steps;
  for (let second = 0; second < 1800; second += 1) {
    if (second % 17 === 0) longSteps.push({ op: "loss", id: "screen-a" });
    if (second % 17 === 2) longSteps.push({ op: "resume", id: "screen-a" });
    else longSteps.push({ op: "tick" });
  }
  scenarios.push({
    name: "long-share-30min",
    call: "server",
    steps: longSteps,
    expect: { screen: "screen-a", screenAudio: "screen-audio-a", camera: "cam-a" },
    long: true,
  });

  scenarios.push({
    name: "livekit-source-beats-order",
    call: "server",
    steps: [
      {
        op: "track",
        id: "cam",
        kind: "video",
        source: LIVEKIT_SOURCE.camera,
        trackName: TRACK_NAME.camera,
        streamId: "c",
        label: "",
        hasAudio: false,
      },
      {
        op: "track",
        id: "screen",
        kind: "video",
        source: LIVEKIT_SOURCE.screen,
        trackName: TRACK_NAME.screen,
        streamId: "s",
        label: "",
        hasAudio: true,
      },
      {
        op: "track",
        id: "sys",
        kind: "audio",
        source: LIVEKIT_SOURCE.screenAudio,
        trackName: TRACK_NAME.screenAudio,
        streamId: "s",
      },
    ],
    expect: { screen: "screen", screenAudio: "sys", camera: "cam" },
  });

  scenarios.push({
    name: "window-title-is-not-a-camera-promotion",
    call: "group",
    steps: [
      { op: "announce", streamId: "s", videoMid: "sv", audioMid: null },
      {
        op: "track",
        id: "window",
        kind: "video",
        streamId: "s",
        mid: "sv",
        label: "Visual Studio Code",
        displaySurface: "window",
        hasAudio: false,
      },
    ],
    expect: { screen: "window", camera: null },
  });

  return scenarios;
}

function randomScenarios(count, seed = 6440) {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const withAudio = rand() > 0.3;
    const camera = rand() > 0.4;
    const signal = rand() > 0.5 ? "before" : "after";
    const loss = rand() > 0.7;
    const built = baseShareSteps(`r${n}`, { withAudio, camera, signal });
    const steps = [...built.steps];
    if (loss) {
      steps.push({ op: "loss", id: built.expectScreen });
      steps.push({ op: "resume", id: built.expectScreen });
    }
    if (rand() > 0.85) steps.push({ op: "stop" });
    const stopped = steps[steps.length - 1]?.op === "stop";
    out.push({
      name: `random-${n}`,
      call: ["dm", "group", "server"][n % 3],
      steps,
      expect: stopped
        ? { screen: null, screenAudio: null, camera: camera ? `cam-r${n}` : null }
        : {
            screen: built.expectScreen,
            screenAudio: built.expectAudio,
            camera: built.expectCamera,
          },
    });
  }
  return out;
}

function matches(layout, expect) {
  const keys = ["screen", "screenAudio", "camera", "mic"];
  for (const key of keys) {
    if (!(key in (expect || {}))) continue;
    if ((layout?.[key] ?? null) !== (expect[key] ?? null)) return false;
  }
  return true;
}

function summarize(results) {
  const passed = results.filter((item) => item.pass);
  const ttff = passed.map((item) => item.ttff).filter((value) => Number.isFinite(value));
  const avgTtff = ttff.length ? ttff.reduce((sum, value) => sum + value, 0) / ttff.length : null;
  return {
    runs: results.length,
    passed: passed.length,
    failed: results.length - passed.length,
    passRate: results.length ? passed.length / results.length : 0,
    avgTtffSteps: avgTtff,
    freezes: results.reduce((sum, item) => sum + (item.freezes || 0), 0),
    failures: results.filter((item) => !item.pass).slice(0, 8).map((item) => item.name),
  };
}

export function runScreenShareStress({ randomCount = 240, seed = 6440 } = {}) {
  const scenarios = [...scriptedScenarios(), ...randomScenarios(randomCount, seed)];
  const run = (legacy) =>
    scenarios.map((scenario) => {
      const result = reduceSession(scenario.steps, { legacy });
      const pass = matches(result.layout, scenario.expect);
      return {
        name: scenario.name,
        call: scenario.call,
        pass,
        ttff: result.firstFrameStep,
        freezes: result.freezes,
        layout: result.layout,
        long: Boolean(scenario.long),
      };
    });
  const beforeResults = run(true);
  const afterResults = run(false);
  const gains = playbackGains({ micVolume: 0.4, screenVolume: 0.8, deafened: false });
  const deaf = playbackGains({ micVolume: 0.4, screenVolume: 0.8, deafened: true });
  const separated = gains.mic === 0.4 && gains.screen === 0.8 && gains.mic !== gains.screen && deaf.mic === 0 && deaf.screen === 0;

  let cameraRefused = false;
  try {
    const camera = {
      kind: "video",
      label: "Integrated Camera",
      getSettings: () => ({ facingMode: "user" }),
    };
    tagLocalTrack(camera, ROLE_CAMERA);
    assertPublishRole(camera, "screen");
  } catch (err) {
    cameraRefused = err?.code === "SCREEN_SHARE_ROLE_MISMATCH" || err?.code === "SCREEN_SHARE_CAMERA_REFUSED";
  }

  const three = runThreeClientMesh();
  return {
    before: summarize(beforeResults),
    after: summarize(afterResults),
    audioSeparated: separated,
    cameraRefused,
    threeClient: three,
    longShare: afterResults.find((item) => item.name === "long-share-30min") || null,
  };
}

function runThreeClientMesh() {
  const peers = ["a", "b", "c"];
  const failures = [];
  for (const viewer of peers) {
    const slots = {};
    for (const sharer of peers) {
      if (viewer === sharer) continue;
      const built = baseShareSteps(sharer, { withAudio: true, camera: true, signal: "before" });
      let announcement = null;
      const entries = [];
      for (const step of built.steps) {
        if (step.op === "announce") announcement = sanitizeScreenAnnouncement(step);
        if (step.op === "track") entries.push({ ...step });
      }
      const layout = layoutInboundEntries(entries, announcement);
      slots[sharer] = layout;
      if (layout.screen !== `screen-${sharer}`) failures.push(`${viewer} missed ${sharer}`);
      if (layout.screenAudio !== `screen-audio-${sharer}`) failures.push(`${viewer} missed audio from ${sharer}`);
      if (layout.camera !== `cam-${sharer}`) failures.push(`${viewer} camera mixup from ${sharer}`);
      if (layout.mic !== `mic-${sharer}`) failures.push(`${viewer} mic mixup from ${sharer}`);
    }
    if (Object.keys(slots).length !== 2) failures.push(`${viewer} expected two remote sharers`);
  }
  return { pass: failures.length === 0, failures };
}

function formatRate(rate) {
  return `${Math.round(rate * 1000) / 10}%`;
}

export function formatStressTable(report) {
  const row = (label, summary) =>
    `| ${label} | ${summary.runs} | ${formatRate(summary.passRate)} | ${summary.avgTtffSteps == null ? "—" : summary.avgTtffSteps.toFixed(2)} | ${summary.freezes} |`;
  return [
    "| Run | Runs | Pass rate | Mean steps to first correct frame | Freezes |",
    "| --- | ---: | ---: | ---: | ---: |",
    row("Before (order / expect-screen)", report.before),
    row("After (source, stream id, mid)", report.after),
  ].join("\n");
}
