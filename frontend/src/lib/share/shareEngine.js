/**
 * Runs a share job (shareModel.createJob) in JavaScript: uploads every attachment once,
 * then sends to each conversation through POST /api/native/share/send. Used by the web
 * share sheet and as the fallback on Android when the native worker is missing; the
 * Android worker (DescallShareWorker.java) and the iOS extension (ShareTransport.swift)
 * follow the same steps.
 *
 *  - Same upload reused for every conversation ("aynı dosyalar tekrar yüklenmez").
 *  - Offline: the job waits (phase "waiting") and goes on by itself when the network is back.
 *  - Every send carries a stable clientId, so a retry after a lost answer never sends twice.
 *  - Cancel stops after the current request; what already went stays (and can be undone).
 *
 * deps: { api: { upload(item, { onProgress, signal }), send(body, { signal }), undo(body) },
 *         isOnline(), waitOnline(signal), sleep(ms), now() }
 */
import { reduceJob, pendingItemsFor } from "./shareModel.js";

const OFFLINE_CODES = new Set(["offline", "network", "timeout"]);

export function isOfflineError(err) {
  return Boolean(err?.offline) || OFFLINE_CODES.has(String(err?.code || "").toLowerCase());
}

function retryable(err) {
  const s = Number(err?.status) || 0;
  return isOfflineError(err) || s === 0 || s === 429 || s >= 500;
}

/** clientId for one send: same job, same conversation, same item set → same id. */
export function clientIdFor(job, targetIndex, indexes) {
  const set = indexes.length ? indexes.join("_") : "t";
  return `${job.id}-${targetIndex}-${set}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

export function createShareEngine(deps) {
  const { api } = deps;
  const isOnline = deps.isOnline || (() => true);
  const waitOnline = deps.waitOnline || (() => Promise.resolve());
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || (() => Date.now());

  async function run(initial, { emit, signal, prepare } = {}) {
    let job = initial;
    const apply = (ev) => {
      job = reduceJob(job, { at: now(), ...ev });
      emit?.(job, ev);
      return job;
    };
    const aborted = () => Boolean(signal?.aborted);
    const ensureOnline = async () => {
      if (isOnline()) return;
      apply({ type: "offline" });
      await waitOnline(signal);
      if (!aborted()) apply({ type: "online" });
    };

    apply({ type: "start" });

    // 1) Uploads, one at a time (the extension memory limit; parallel uploads also fight
    //    for the same uplink and finish no sooner).
    for (const it of job.items) {
      if (aborted()) break;
      if (it.status === "uploaded" || it.status === "dropped") continue;
      let attempt = 0;
      for (;;) {
        if (aborted()) break;
        await ensureOnline();
        if (aborted()) break;
        try {
          const source = prepare ? await prepare(it, job) : it;
          const res = await api.upload(source, {
            signal,
            onProgress: (sent, total) => apply({ type: "upload", index: it.index, sentBytes: sent, bytes: total || undefined }),
          });
          apply({ type: "uploaded", index: it.index, url: res.url, bytes: res.size || undefined, upload: res });
          break;
        } catch (err) {
          if (aborted()) break;
          if (isOfflineError(err)) {
            apply({ type: "offline" });
            await waitOnline(signal);
            if (!aborted()) apply({ type: "online" });
            continue;
          }
          attempt += 1;
          if (retryable(err) && attempt < 3) {
            await sleep(800 * attempt);
            continue;
          }
          apply({ type: "uploadFailed", index: it.index, error: err?.reason || err?.code || "failed" });
          break;
        }
      }
    }

    // 2) One send per conversation with every uploaded item (caption on the first).
    for (let ti = 0; ti < job.targets.length; ti++) {
      const t = job.targets[ti];
      if (aborted()) break;
      if (t.status === "sent" || t.status === "scheduled") continue;
      const pending = pendingItemsFor(job, t.conv);
      const ready = pending.filter((i) => job.items.find((x) => x.index === i)?.status === "uploaded");
      const broken = pending.filter((i) => !ready.includes(i));
      const firstSend = t.sentItems.length === 0 && !t.textSent;
      const text = firstSend ? job.text : "";
      if (!ready.length && !text) {
        apply({ type: "targetResult", conv: t.conv, results: broken.map((index) => ({ index, status: "failed", reason: job.items.find((x) => x.index === index)?.error || "upload_failed" })) });
        continue;
      }
      apply({ type: "targetSending", conv: t.conv });
      const body = {
        clientId: clientIdFor(job, ti, ready),
        conv: t.conv,
        text,
        items: ready.map((i) => {
          const it = job.items.find((x) => x.index === i);
          const up = it.upload || {};
          return { url: it.url, mediaType: up.mediaType || (it.kind === "image" ? "image" : it.kind === "video" ? "video" : "file"), mimeType: up.mimeType || null, size: up.size || it.bytes || null, originalName: up.originalName || it.name || null };
        }),
        silent: job.silent,
        ...(job.sendAt ? { sendAt: new Date(job.sendAt).toISOString() } : {}),
      };
      let attempt = 0;
      for (;;) {
        if (aborted()) break;
        await ensureOnline();
        if (aborted()) break;
        try {
          const res = await api.send(body, { signal });
          // Server result indexes are positions in body.items: map back to job item indexes.
          const results = (res.results || []).map((r) => ({ ...r, index: r.index >= 0 ? ready[r.index] : -1 }));
          for (const index of broken) results.push({ index, status: "failed", reason: job.items.find((x) => x.index === index)?.error || "upload_failed" });
          const textSent = Boolean(text) && results.some((r) => r.status === "sent" || r.status === "scheduled");
          apply({ type: "targetResult", conv: t.conv, results, textSent });
          break;
        } catch (err) {
          if (aborted()) break;
          if (isOfflineError(err)) {
            apply({ type: "offline" });
            await waitOnline(signal);
            if (!aborted()) apply({ type: "online" });
            continue;
          }
          attempt += 1;
          if (retryable(err) && attempt < 3) {
            await sleep(900 * attempt);
            continue;
          }
          apply({ type: "targetFailed", conv: t.conv, reason: err?.reason || err?.code || "failed" });
          break;
        }
      }
    }

    if (aborted()) {
      for (const t of job.targets) {
        if (!["sent", "scheduled", "failed", "partial"].includes(t.status)) apply({ type: "targetFailed", conv: t.conv, reason: "cancelled" });
      }
    }
    return apply({ type: "finish" });
  }

  /** Remove what this job delivered (within the undo window) and cancel its scheduled rows. */
  async function undo(job) {
    let failed = 0;
    for (const t of job.targets) {
      if (!t.messageIds.length && !t.scheduledIds.length) continue;
      try {
        const res = await api.undo({ conv: t.conv, messageIds: t.messageIds, scheduledIds: t.scheduledIds });
        failed += Number(res?.failed) || 0;
      } catch {
        failed += t.messageIds.length + t.scheduledIds.length;
      }
    }
    return { job: reduceJob(job, { type: "undone", at: now() }), failed };
  }

  return { run, undo };
}
