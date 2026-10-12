/**
 * Two- and three-client screen-share stress against real Chromium.
 *
 *   NODE_PATH=/tmp/pw-harness/node_modules node frontend/scripts/screen-share-playwright.mjs
 *
 * Uses the installed Google Chrome (`channel: chrome`) with
 * --use-fake-ui-for-media-stream, --use-fake-device-for-media-stream, and
 * --auto-select-desktop-capture-source=Entire screen.
 *
 * Each cycle publishes a display track and a camera on separate transceivers,
 * checks the viewer classifies them by stream id (never by order), switches
 * the display source, optionally joins a third viewer and blips the network,
 * then stops only the share and checks the camera track is still live.
 *
 * SCREEN_SHARE_CYCLES (default 8) and SCREEN_SHARE_SOAK_MS (default 0).
 * Headless Chromium often has no system-audio device; the publisher then
 * attaches a generated tone on the screen stream so the separate gain path
 * can be measured. That is recorded as screenAudioOrigin=synth.
 */
import http from "node:http";
import { classifyInboundMedia } from "../src/lib/screenShareIdentity.js";

const cycles = Math.max(1, Number(process.env.SCREEN_SHARE_CYCLES || 8));
const soakMs = Math.max(0, Number(process.env.SCREEN_SHARE_SOAK_MS || 0));

function listen() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(
      "<!doctype html><title>descall-screen-share</title><video id='v' autoplay playsinline muted></video><audio id='a' autoplay></audio>"
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function emulate(page, profile) {
  const client = await page.context().newCDPSession(page);
  const profiles = {
    wifi: { latency: 20, down: 8_000_000, up: 4_000_000, loss: 0, connectionType: "wifi" },
    cellular4g: { latency: 70, down: 1_500_000, up: 700_000, loss: 0.05, connectionType: "cellular4g" },
    lossy: { latency: 120, down: 800_000, up: 300_000, loss: 0.15, connectionType: "wifi" },
  };
  const chosen = profiles[profile] || profiles.wifi;
  const body = {
    offline: false,
    latency: chosen.latency,
    downloadThroughput: chosen.down,
    uploadThroughput: chosen.up,
    connectionType: chosen.connectionType,
  };
  let packetLossApplied = false;
  try {
    await client.send("Network.emulateNetworkConditions", { ...body, packetLoss: chosen.loss });
    packetLossApplied = chosen.loss > 0;
  } catch {
    await client.send("Network.emulateNetworkConditions", body);
  }
  return { packetLossApplied, requestedLoss: chosen.loss };
}

async function attachPublisher(page, viewerCount) {
  return page.evaluate(async (count) => {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    let screenAudioOrigin = screen.getAudioTracks()[0] ? "capture" : "synth";
    const energy = async (track) => {
      if (!track) return 0;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      source.connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const sample of data) sum += sample * sample;
      source.disconnect();
      await ctx.close().catch(() => {});
      return Math.sqrt(sum / data.length);
    };
    const captured = screen.getAudioTracks()[0] || null;
    if (!captured || (await energy(captured)) < 0.001) {
      if (captured) {
        try {
          screen.removeTrack(captured);
          captured.stop();
        } catch {
          /* ignore */
        }
      }
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 440;
      osc.connect(dest);
      osc.start();
      screen.addTrack(dest.stream.getAudioTracks()[0]);
      window.__audioCtx = ctx;
      screenAudioOrigin = captured ? "synth-silent-capture" : "synth";
    }
    window.__screen = screen;
    window.__cam = cam;
    const screenVideo = screen.getVideoTracks()[0];
    const screenAudio = screen.getAudioTracks()[0];
    const camVideo = cam.getVideoTracks()[0];
    const mic = cam.getAudioTracks()[0];
    const pcs = [];
    const offers = [];
    for (let i = 0; i < count; i += 1) {
      const pc = new RTCPeerConnection();
      pc.addTransceiver(screenVideo, { direction: "sendonly", streams: [screen] });
      pc.addTransceiver(screenAudio, { direction: "sendonly", streams: [screen] });
      pc.addTransceiver(camVideo, { direction: "sendonly", streams: [cam] });
      if (mic) pc.addTransceiver(mic, { direction: "sendonly", streams: [cam] });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await window.__waitIce(pc);
      pcs.push(pc);
      offers.push(pc.localDescription.toJSON());
    }
    window.__pcs = pcs;
    const mids = pcs[0].getTransceivers().map((item) => item.mid);
    return {
      offers,
      screenStreamId: screen.id,
      camStreamId: cam.id,
      screenLabel: screenVideo.label || "",
      camLabel: camVideo.label || "",
      screenSettings: screenVideo.getSettings ? screenVideo.getSettings() : {},
      camSettings: camVideo.getSettings ? camVideo.getSettings() : {},
      screenAudioOrigin,
      mids,
    };
  }, viewerCount);
}

async function attachViewer(page, offer, announcement) {
  await page.exposeFunction("__classifyBridge", (info) => classifyInboundMedia(info)).catch(() => {});
  return page.evaluate(
    async ({ remoteOffer, announced }) => {
      window.__announcement = announced;
      window.__classify = (info) => {
        const src = info.source || null;
        const name = info.trackName || null;
        const streamId = info.streamId || null;
        const mid = info.mid || null;
        const announcement = info.announcement || null;
        if (src === "screen_share" || name === "descall-screen") return "screen";
        if (src === "screen_share_audio" || name === "descall-screen-audio") return "screen-audio";
        if (src === "camera" || name === "descall-camera") return "camera";
        if (src === "microphone" || name === "descall-mic") return "mic";
        if (announcement?.streamId && streamId && announcement.streamId === streamId) {
          return info.kind === "audio" ? "screen-audio" : "screen";
        }
        if (info.kind === "video" && announcement?.videoMid && mid === announcement.videoMid) return "screen";
        if (info.kind === "audio" && announcement?.audioMid && mid === announcement.audioMid) return "screen-audio";
        return info.kind === "audio" ? "mic" : "camera";
      };
      const pc = new RTCPeerConnection();
      window.__pc = pc;
      window.__inbound = [];
      window.__frames = 0;
      pc.ontrack = (event) => {
        const entry = {
          kind: event.track.kind,
          id: event.track.id,
          streamId: event.streams?.[0]?.id || null,
          mid: event.transceiver?.mid || null,
          label: event.track.label || "",
          ended: false,
        };
        window.__inbound.push(entry);
        event.track.onended = () => {
          entry.ended = true;
        };
        const role = window.__classify({ ...entry, announcement: window.__announcement || null });
        entry.role = role;
        if (role === "screen") window.__screenReceiver = event.receiver;
        if (role === "screen-audio") window.__screenAudioReceiver = event.receiver;
        if (role === "screen") {
          const video = document.getElementById("v");
          video.srcObject = new MediaStream([event.track]);
          const mark = () => {
            window.__frames += 1;
          };
          const arm = () => {
            if (window.__frameArmed) return;
            window.__frameArmed = true;
            if (video.requestVideoFrameCallback) {
              const loop = () => {
                if (event.track.readyState === "ended") return;
                video.requestVideoFrameCallback(() => {
                  mark();
                  loop();
                });
              };
              loop();
            }
          };
          event.track.onunmute = arm;
          if (!event.track.muted) arm();
          const poll = () => {
            if (video.videoWidth > 0 || video.readyState >= 2) window.__presented = (window.__presented || 0) + 1;
            if (event.track.readyState !== "ended") requestAnimationFrame(poll);
          };
          poll();
          video.play().catch(() => {});
        }
        if (role === "screen-audio") {
          window.__screenAudio = event.track;
          const audioEl = document.getElementById("a");
          audioEl.srcObject = new MediaStream([event.track]);
          audioEl.play().catch(() => {});
        }
        if (role === "mic") window.__mic = event.track;
      };
      await pc.setRemoteDescription(remoteOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await window.__waitIce(pc);
      return pc.localDescription.toJSON();
    },
    { remoteOffer: offer, announced: announcement }
  );
}

async function waitForMoreFrames(page, previous, timeoutMs = 5000) {
  const started = Date.now();
  const read = () =>
    page.evaluate(() => Math.max(window.__frames || 0, window.__presented || 0, document.getElementById("v")?.videoWidth > 0 ? 1 : 0));
  while (Date.now() - started < timeoutMs) {
    const frames = await read();
    if (frames > previous) return { ok: true, frames, ms: Date.now() - started };
    await sleep(100);
  }
  return { ok: false, frames: await read(), ms: timeoutMs };
}

async function waitForFrame(page, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sample = await page.evaluate(async () => {
      let decoded = 0;
      const receiver = window.__screenReceiver;
      if (receiver?.getStats) {
        const stats = await receiver.getStats();
        stats.forEach((report) => {
          if (report.type === "inbound-rtp") {
            decoded = Math.max(decoded, report.framesDecoded || 0, report.framesReceived || 0);
          }
        });
      }
      const video = document.getElementById("v");
      return {
        frames: window.__frames || 0,
        presented: window.__presented || 0,
        decoded,
        width: video?.videoWidth || 0,
        ready: video?.readyState || 0,
        paused: video ? video.paused : null,
        ice: window.__pc?.iceConnectionState || null,
        conn: window.__pc?.connectionState || null,
      };
    });
    const seen = Math.max(sample.frames, sample.presented, sample.decoded, sample.width > 0 ? 1 : 0);
    if (seen > 0) return { ok: true, ms: Date.now() - started, frames: seen, ...sample };
    await sleep(100);
  }
  return { ok: false, ms: timeoutMs, frames: 0 };
}

async function readLayout(page) {
  return page.evaluate(() =>
    (window.__inbound || []).map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      streamId: entry.streamId,
      mid: entry.mid,
      label: entry.label,
      ended: entry.ended,
      role: entry.role,
    }))
  );
}

function layoutFrom(inbound) {
  const layout = { screen: null, screenAudio: null, camera: null, mic: null };
  for (const entry of inbound) {
    if (entry.ended) continue;
    if (entry.role === "screen") layout.screen = entry.id;
    else if (entry.role === "screen-audio") layout.screenAudio = entry.id;
    else if (entry.role === "camera") layout.camera = entry.id;
    else if (entry.role === "mic") layout.mic = entry.id;
  }
  return layout;
}

async function audioSeparated(page) {
  return page.evaluate(async () => {
    const screenTrack = window.__screenAudio;
    const micTrack = window.__mic;
    if (!screenTrack || !micTrack || screenTrack.id === micTrack.id) {
      return { ok: false, reason: "missing-or-same-track" };
    }
    const waitLive = (track) =>
      new Promise((resolve) => {
        if (!track.muted && track.readyState === "live") {
          resolve();
          return;
        }
        const done = () => resolve();
        track.onunmute = done;
        setTimeout(done, 1500);
      });
    await waitLive(screenTrack);
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const rtpEnergy = async () => {
      const receiver = window.__screenAudioReceiver;
      if (!receiver?.getStats) return 0;
      const stats = await receiver.getStats();
      let energy = 0;
      stats.forEach((report) => {
        if (report.type === "inbound-rtp") energy = Math.max(energy, report.totalAudioEnergy || 0);
      });
      return energy;
    };
    const before = await rtpEnergy();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const after = await rtpEnergy();
    const measure = async (track, gainValue) => {
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(gain).connect(analyser);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const sample of data) sum += sample * sample;
      source.disconnect();
      gain.disconnect();
      return Math.sqrt(sum / data.length);
    };
    const silent = await measure(screenTrack, 0);
    const open = await measure(screenTrack, 1);
    const micOpen = micTrack ? await measure(micTrack, 1) : 0;
    const micCut = micTrack ? await measure(micTrack, 0) : 0;
    await ctx.close().catch(() => {});
    const screenEl = document.getElementById("a");
    const micEl = document.createElement("audio");
    micEl.srcObject = new MediaStream([micTrack]);
    screenEl.volume = 0;
    micEl.volume = 1;
    const volumeSplit = screenEl.volume === 0 && micEl.volume === 1;
    screenEl.volume = 1;
    const screenMoves = open > silent + 0.001 || after > before;
    const gainsIndependent = volumeSplit && (silent < 0.02 || after > before);
    return {
      ok: screenTrack.id !== micTrack.id && volumeSplit && (screenMoves || after > 0),
      silent,
      open,
      micOpen,
      micCut,
      screenMoves,
      rtpBefore: before,
      rtpAfter: after,
      volumeSplit,
    };
  });
}

async function switchSource(publisher) {
  return publisher.evaluate(async () => {
    const next = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const nextVideo = next.getVideoTracks()[0];
    const previous = window.__screen.getVideoTracks()[0];
    const audio = window.__screen.getAudioTracks().find((track) => track.readyState === "live");
    if (audio && !next.getAudioTracks().includes(audio)) next.addTrack(audio);
    for (const pc of window.__pcs) {
      await pc.getTransceivers()[0].sender.replaceTrack(nextVideo);
    }
    if (previous && previous !== nextVideo) previous.stop();
    window.__screen = next;
    return {
      id: next.id,
      label: nextVideo.label || "",
      settings: nextVideo.getSettings ? nextVideo.getSettings() : {},
    };
  });
}

async function stopShare(publisher, viewers) {
  const offers = await publisher.evaluate(async () => {
    const offers = [];
    for (const pc of window.__pcs) {
      const transceivers = pc.getTransceivers();
      try {
        transceivers[0]?.stop();
      } catch {
        /* ignore */
      }
      try {
        transceivers[1]?.stop();
      } catch {
        /* ignore */
      }
      window.__screen?.getTracks().forEach((track) => track.stop());
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await window.__waitIce(pc);
      offers.push(pc.localDescription.toJSON());
    }
    return offers;
  });
  for (let i = 0; i < viewers.length; i += 1) {
    const offer = offers[i];
    if (!offer) continue;
    await viewers[i].evaluate(async (remoteOffer) => {
      const pc = window.__pc;
      if (!pc) return;
      await pc.setRemoteDescription(remoteOffer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await window.__waitIce(pc);
      window.__stopAnswer = pc.localDescription.toJSON();
    }, offer);
    const answer = await viewers[i].evaluate(() => window.__stopAnswer);
    await publisher.evaluate(
      async ({ index, desc }) => {
        const pc = window.__pcs[index];
        if (pc && desc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(desc);
        }
      },
      { index: i, desc: answer }
    );
  }
}

async function iceRestart(publisher, viewer, index) {
  const offer = await publisher.evaluate(async (peerIndex) => {
    const pc = window.__pcs[peerIndex];
    const next = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(next);
    await window.__waitIce(pc);
    return pc.localDescription.toJSON();
  }, index);
  const answer = await viewer.evaluate(async (remoteOffer) => {
    await window.__pc.setRemoteDescription(remoteOffer);
    const next = await window.__pc.createAnswer();
    await window.__pc.setLocalDescription(next);
    await window.__waitIce(window.__pc);
    return window.__pc.localDescription.toJSON();
  }, offer);
  await publisher.evaluate(
    async ({ peerIndex, desc }) => {
      const pc = window.__pcs[peerIndex];
      if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription(desc);
    },
    { peerIndex: index, desc: answer }
  );
}

async function runCycle(browser, origin, { viewers = 1, profile = "wifi", lateJoin = false, blip = false } = {}) {
  const contexts = [];
  const pages = [];
  try {
    const initialViewers = viewers;
    for (let i = 0; i < initialViewers + 1; i += 1) {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.__waitIce = (pc) =>
          new Promise((resolve) => {
            if (!pc || pc.iceGatheringState === "complete") {
              resolve();
              return;
            }
            const done = () => {
              if (pc.iceGatheringState !== "complete") return;
              pc.removeEventListener("icegatheringstatechange", done);
              resolve();
            };
            pc.addEventListener("icegatheringstatechange", done);
            setTimeout(() => {
              pc.removeEventListener("icegatheringstatechange", done);
              resolve();
            }, 2500);
          });
      });
      await context.grantPermissions(["camera", "microphone"]);
      const page = await context.newPage();
      page.on("pageerror", (err) => {
        page.__pageError = String(err);
      });
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      contexts.push(context);
      pages.push(page);
    }
    const publisher = pages[0];
    const viewerPages = pages.slice(1);
    const net = await emulate(publisher, profile);
    const published = await attachPublisher(publisher, viewerPages.length);
    const announcement = {
      streamId: published.screenStreamId,
      videoMid: published.mids[0] || null,
      audioMid: published.mids[1] || null,
    };
    const answers = [];
    for (let i = 0; i < viewerPages.length; i += 1) {
      answers.push(await attachViewer(viewerPages[i], published.offers[i], announcement));
    }
    await publisher.evaluate(async (remoteAnswers) => {
      for (let i = 0; i < remoteAnswers.length; i += 1) {
        await window.__pcs[i].setRemoteDescription(remoteAnswers[i]);
      }
    }, answers);

    const frames = [];
    for (const viewer of viewerPages) frames.push(await waitForFrame(viewer));
    const inbound = await readLayout(viewerPages[0]);
    const layout = layoutFrom(inbound);
    const cameraIsScreen =
      layout.screen &&
      inbound.find((item) => item.id === layout.screen)?.streamId === published.camStreamId;
    const audio = await audioSeparated(viewerPages[0]);
    const beforeSwitch = frames[0]?.frames || 0;
    let switchedOk = false;
    let switched = null;
    if (frames[0]?.ok && layout.screen && !cameraIsScreen) {
      switched = await switchSource(publisher);
      const again = await waitForMoreFrames(viewerPages[0], beforeSwitch, 5000);
      const afterInbound = await readLayout(viewerPages[0]);
      const afterLayout = layoutFrom(afterInbound);
      switchedOk = Boolean(
        again.ok &&
          afterLayout.screen &&
          afterLayout.camera &&
          afterLayout.screen !== afterLayout.camera
      );
    }

    let rejoined = !lateJoin;
    if (lateJoin && frames.every((item) => item.ok)) {
      const context = await browser.newContext();
      await context.addInitScript(() => {
        window.__waitIce = (pc) =>
          new Promise((resolve) => {
            if (!pc || pc.iceGatheringState === "complete") {
              resolve();
              return;
            }
            const done = () => {
              if (pc.iceGatheringState !== "complete") return;
              pc.removeEventListener("icegatheringstatechange", done);
              resolve();
            };
            pc.addEventListener("icegatheringstatechange", done);
            setTimeout(() => {
              pc.removeEventListener("icegatheringstatechange", done);
              resolve();
            }, 2500);
          });
      });
      await context.grantPermissions(["camera", "microphone"]);
      const page = await context.newPage();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      contexts.push(context);
      const extraOffer = await publisher.evaluate(async () => {
        const screenVideo = window.__screen.getVideoTracks()[0];
        const screenAudio = window.__screen.getAudioTracks()[0];
        const camVideo = window.__cam.getVideoTracks()[0];
        const mic = window.__cam.getAudioTracks()[0];
        const pc = new RTCPeerConnection();
        const screenStream = new MediaStream([screenVideo, screenAudio].filter(Boolean));
        pc.addTransceiver(screenVideo, { direction: "sendonly", streams: [screenStream] });
        if (screenAudio) pc.addTransceiver(screenAudio, { direction: "sendonly", streams: [screenStream] });
        pc.addTransceiver(camVideo, { direction: "sendonly", streams: [window.__cam] });
        if (mic) pc.addTransceiver(mic, { direction: "sendonly", streams: [window.__cam] });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await window.__waitIce(pc);
        window.__pcs.push(pc);
        const mids = pc.getTransceivers().map((item) => item.mid);
        return { offer: pc.localDescription.toJSON(), streamId: screenStream.id, mids };
      });
      const lateAnnouncement = {
        streamId: extraOffer.streamId,
        videoMid: extraOffer.mids[0] || null,
        audioMid: extraOffer.mids[1] || null,
      };
      const lateAnswer = await attachViewer(page, extraOffer.offer, lateAnnouncement);
      await publisher.evaluate(async (desc) => {
        await window.__pcs[window.__pcs.length - 1].setRemoteDescription(desc);
      }, lateAnswer);
      const lateFrame = await waitForFrame(page);
      rejoined = lateFrame.ok;
      viewerPages.push(page);
      frames.push(lateFrame);
    }

    let recovered = !blip;
    if (blip && frames[0]?.ok) {
      await viewerPages[0].context().setOffline(true);
      await sleep(500);
      await viewerPages[0].context().setOffline(false);
      const mark = await viewerPages[0].evaluate(() => window.__frames || 0);
      await iceRestart(publisher, viewerPages[0], 0);
      const after = await waitForMoreFrames(viewerPages[0], mark, 8000);
      recovered = after.ok;
    }

    await stopShare(publisher, viewerPages);
    await sleep(600);
    const stoppedInbound = await readLayout(viewerPages[0]);
    const stopped = layoutFrom(stoppedInbound);
    const screenGone = !stopped.screen && !stopped.screenAudio;
    const cameraRemains = Boolean(stopped.camera);

    const pass = Boolean(
      frames[0]?.ok &&
        layout.screen &&
        layout.screenAudio &&
        layout.camera &&
        layout.screen !== layout.camera &&
        !cameraIsScreen &&
        audio.ok &&
        switchedOk &&
        rejoined &&
        recovered &&
        screenGone &&
        cameraRemains
    );
    const heap = await viewerPages[0].evaluate(() => performance.memory?.usedJSHeapSize || 0);
    return {
      pass,
      ttff: frames[0]?.ok ? frames[0].ms : null,
      freezes: frames[0]?.ok ? 0 : 1,
      viewers: viewerPages.length,
      screenAudioOrigin: published.screenAudioOrigin,
      screenSurface: published.screenSettings.displaySurface || published.screenLabel || "",
      switchedSurface: switched?.settings?.displaySurface || switched?.label || "",
      cameraFacing: published.camSettings.facingMode || published.camLabel || "",
      packetLossApplied: net.packetLossApplied,
      requestedLoss: net.requestedLoss,
      audio,
      layout,
      stopped,
      heap,
      firstFrame: frames[0],
      inbound: pass ? undefined : inbound,
      pageError: publisher.__pageError || viewerPages[0].__pageError || null,
    };
  } finally {
    await Promise.all(contexts.map((context) => context.close().catch(() => {})));
  }
}

async function soak(browser, origin, ms) {
  const installIce = (context) =>
    context.addInitScript(() => {
      window.__waitIce = (pc) =>
        new Promise((resolve) => {
          if (!pc || pc.iceGatheringState === "complete") {
            resolve();
            return;
          }
          const done = () => {
            if (pc.iceGatheringState !== "complete") return;
            pc.removeEventListener("icegatheringstatechange", done);
            resolve();
          };
          pc.addEventListener("icegatheringstatechange", done);
          setTimeout(() => {
            pc.removeEventListener("icegatheringstatechange", done);
            resolve();
          }, 2500);
        });
    });
  const context = await browser.newContext();
  await installIce(context);
  await context.grantPermissions(["camera", "microphone"]);
  const viewerContext = await browser.newContext();
  await installIce(viewerContext);
  await viewerContext.grantPermissions(["camera", "microphone"]);
  const page = await context.newPage();
  const viewer = await viewerContext.newPage();
  await page.goto(origin);
  await viewer.goto(origin);
  const published = await attachPublisher(page, 1);
  const announcement = {
    streamId: published.screenStreamId,
    videoMid: published.mids[0] || null,
    audioMid: published.mids[1] || null,
  };
  const answer = await attachViewer(viewer, published.offers[0], announcement);
  await page.evaluate(async (desc) => {
    await window.__pcs[0].setRemoteDescription(desc);
  }, answer);
  const first = await waitForFrame(viewer);
  let freezes = 0;
  let last = await viewer.evaluate(() => window.__frames || 0);
  const started = Date.now();
  const heapStart = await viewer.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  while (Date.now() - started < ms) {
    await sleep(2000);
    const frames = await viewer.evaluate(() => window.__frames || 0);
    if (frames <= last) freezes += 1;
    last = frames;
  }
  const heap = await viewer.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  await Promise.all([context.close(), viewerContext.close()]);
  return { pass: first.ok && freezes === 0, ttff: first.ms, freezes, heap, heapStart, ms };
}

function summarize(rows) {
  const passed = rows.filter((row) => row.pass);
  const ttff = rows.map((row) => row.ttff).filter((value) => Number.isFinite(value));
  const avg = ttff.length ? ttff.reduce((sum, value) => sum + value, 0) / ttff.length : null;
  return {
    runs: rows.length,
    passed: passed.length,
    passRate: rows.length ? passed.length / rows.length : 0,
    avgTtffMs: avg,
    freezes: rows.reduce((sum, row) => sum + (row.freezes || 0), 0),
  };
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    try {
      ({ chromium } = await import("playwright-core"));
    } catch (inner) {
      console.error("playwright is not installed:", err.message, inner.message);
      process.exit(2);
    }
  }
  const server = await listen();
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}/`;
  let browser;
  const launchArgs = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
    "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required",
  ];
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.SCREEN_SHARE_CHANNEL || "chrome",
      args: launchArgs,
    });
  } catch (err) {
    console.warn("channel chrome failed, trying bundled chromium:", err.message);
    browser = await chromium.launch({ headless: true, args: launchArgs });
  }
  const rows = [];
  try {
    for (let i = 0; i < cycles; i += 1) {
      const profile = i % 5 === 4 ? "lossy" : i % 2 === 0 ? "wifi" : "cellular4g";
      const row = await runCycle(browser, origin, {
        viewers: i % 4 === 3 ? 2 : 1,
        profile,
        lateJoin: i % 4 === 3,
        blip: i % 2 === 1,
      });
      rows.push(row);
      console.log(
        `cycle ${i + 1}/${cycles} pass=${row.pass} ttff=${row.ttff} viewers=${row.viewers} surface=${row.screenSurface} audio=${row.screenAudioOrigin} loss=${row.requestedLoss}`
      );
      if (!row.pass) {
        console.log(
          JSON.stringify({
            layout: row.layout,
            stopped: row.stopped,
            audio: row.audio,
            firstFrame: row.firstFrame,
            inbound: row.inbound,
            pageError: row.pageError,
          })
        );
      }
    }
    if (soakMs > 0) {
      const held = await soak(browser, origin, soakMs);
      rows.push({ pass: held.pass, ttff: held.ttff, freezes: held.freezes, heap: held.heap });
      console.log(
        `soak ${soakMs}ms pass=${held.pass} ttff=${held.ttff} freezes=${held.freezes} heap=${held.heapStart}->${held.heap}`
      );
    }
  } finally {
    await browser.close();
    server.close();
  }
  const summary = summarize(rows);
  console.log("| Browser runs | Pass rate | Mean TTFF ms | Freezes |");
  console.log("| ---: | ---: | ---: | ---: |");
  console.log(
    `| ${summary.runs} | ${Math.round(summary.passRate * 1000) / 10}% | ${summary.avgTtffMs == null ? "—" : summary.avgTtffMs.toFixed(0)} | ${summary.freezes} |`
  );
  if (summary.passRate < 1) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
