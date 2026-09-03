import { API_BASE_URL } from "../config/api";
import { getToken } from "../lib/storage";
import { authedRequest } from "./authedHttp";

export function getDimaMeta(opts) {
  return authedRequest("/api/dimaai/meta", opts);
}

export function listDimaModels(opts) {
  return authedRequest("/api/dimaai/models", opts);
}

export function getDimaSettings(opts) {
  return authedRequest("/api/dimaai/settings", opts);
}

export function updateDimaSettings(patch) {
  return authedRequest("/api/dimaai/settings", {
    method: "PUT",
    body: patch,
  });
}

export function confirmDimaAction(id, { text } = {}) {
  return authedRequest(`/api/dimaai/actions/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: { ...(text !== undefined ? { text } : {}) },
  });
}

export function rejectDimaAction(id) {
  return authedRequest(`/api/dimaai/actions/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: {},
  });
}

export function listDimaMemories(opts) {
  return authedRequest("/api/dimaai/memories", opts);
}

export function deleteDimaMemory(id) {
  return authedRequest(`/api/dimaai/memories/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function runDimaPython(code) {
  return authedRequest("/api/dimaai/run-python", {
    method: "POST",
    body: { code },
  });
}

export function listDimaConversations(q, opts) {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return authedRequest(`/api/dimaai/conversations${qs}`, opts);
}

export function createDimaConversation(title, { modelTier } = {}) {
  return authedRequest("/api/dimaai/conversations", {
    method: "POST",
    body: { title: title || "New chat", ...(modelTier ? { modelTier } : {}) },
  });
}

export function getDimaConversation(id, opts) {
  return authedRequest(`/api/dimaai/conversations/${encodeURIComponent(id)}`, opts);
}

export function patchDimaConversation(id, patch) {
  return authedRequest(`/api/dimaai/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

export function exportDimaConversation(id) {
  return authedRequest(`/api/dimaai/conversations/${encodeURIComponent(id)}/export`);
}

export function deleteDimaConversation(id) {
  return authedRequest(`/api/dimaai/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function uploadDimaAttachment(file, { conversationId, onProgress } = {}) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  if (conversationId) form.append("conversationId", conversationId);

  // XHR for upload progress (fetch has no native progress).
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/api/dimaai/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      onProgress?.(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(form);
  });
}

/**
 * Stream a Dima reply. Calls onToken / onThought for each chunk.
 * Returns the final assistant message or throws a user-safe error.
 */
/** Client Stop / AbortController — never surface as a network error banner. */
export function isDimaAbortError(err, signal) {
  if (signal?.aborted) return true;
  if (!err) return false;
  if (err.name === "AbortError" || err.code === "aborted") return true;
  const msg = String(err.message || "");
  if (/the user aborted a request/i.test(msg)) return true;
  // Chromium often reports abort as TypeError: Failed to fetch
  if (/failed to fetch|networkerror|load failed/i.test(msg) && signal?.aborted) return true;
  return false;
}

/** Tell the API to abort the in-flight generation (Vercel proxy may not forward fetch abort). */
export async function stopDimaGeneration(conversationId) {
  const id = String(conversationId || "").trim();
  if (!id) return { ok: false };
  const token = getToken();
  try {
    const res = await fetch(
      `${API_BASE_URL}/api/dimaai/conversations/${encodeURIComponent(id)}/stop`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: "{}",
      },
    );
    return await res.json().catch(() => ({ ok: res.ok }));
  } catch {
    return { ok: false };
  }
}

export async function streamDimaMessage({
  conversationId,
  content,
  regenerate = false,
  editMessageId = null,
  attachmentIds = null,
  modelTier = null,
  signal,
  onToken,
  onThought,
  onMeta,
  onCitations,
  onPendingAction,
}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(
      `${API_BASE_URL}/api/dimaai/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content,
          regenerate,
          ...(editMessageId ? { editMessageId } : {}),
          ...(attachmentIds?.length ? { attachmentIds } : {}),
          ...(modelTier ? { modelTier } : {}),
        }),
        signal,
      },
    );
  } catch (err) {
    // Stop during Thinking often aborts before headers — treat as soft stop, not Failed to fetch.
    if (isDimaAbortError(err, signal)) {
      return {
        role: "assistant",
        content: "",
        stopped: true,
        thought: undefined,
        citations: undefined,
      };
    }
    throw err;
  }

  const ctype = res.headers.get("content-type") || "";
  if (!res.ok && !ctype.includes("text/event-stream")) {
    if (isDimaAbortError(null, signal)) {
      return {
        role: "assistant",
        content: "",
        stopped: true,
        thought: undefined,
        citations: undefined,
      };
    }
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || "Dima is temporarily unavailable. Please try again shortly.");
    if (res.status === 429 || body.code === "quota" || /at capacity|şu an yoğun/i.test(String(body.error || ""))) {
      err.code = "quota";
    }
    if (body.code === "missing_provider") err.code = "missing_provider";
    if (body.code === "unavailable") err.code = err.code || "unavailable";
    if (Number(body.retryAfterMs) > 0) err.retryAfterMs = Number(body.retryAfterMs);
    throw err;
  }

  if (!res.body) {
    if (isDimaAbortError(null, signal)) {
      return {
        role: "assistant",
        content: "",
        stopped: true,
        thought: undefined,
        citations: undefined,
      };
    }
    throw new Error("Dima is temporarily unavailable. Please try again shortly.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let assembled = "";
  let thought = "";
  let citations = null;
  let pendingActions = [];
  let doneMessage = null;
  let streamError = null;
  let streamErrorCode = null;
  let streamRetryAfterMs = null;

  const consumeBlock = (block) => {
    const lines = block.split("\n");
    let event = "message";
    let dataLine = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLine += line.slice(5).trim();
    }
    if (!dataLine) return;
    let payload = {};
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }
    if (event === "token" && payload.t) {
      assembled += payload.t;
      onToken?.(payload.t, assembled);
    } else if (event === "thought" && payload.t) {
      thought += payload.t;
      onThought?.(payload.t, thought);
    } else if (event === "meta") {
      onMeta?.(payload);
    } else if (event === "pending_action" && payload.action) {
      pendingActions = [...pendingActions.filter((a) => a.id !== payload.action.id), payload.action];
      onPendingAction?.(payload.action, pendingActions);
    } else if (event === "done") {
      citations = payload.citations || payload.message?.citations || citations;
      if (citations) onCitations?.(citations);
      const listed = payload.pendingActions || payload.message?.pendingActions || payload.message?.meta?.pendingActions;
      if (Array.isArray(listed) && listed.length) pendingActions = listed;
      doneMessage = {
        ...(payload.message || { role: "assistant", content: assembled }),
        thought: payload.thought || thought || undefined,
        citations: citations || undefined,
        pendingActions: pendingActions.length ? pendingActions : undefined,
      };
    } else if (event === "error") {
      streamError = payload.error || "Dima is temporarily unavailable. Please try again shortly.";
      if (payload.code === "quota") streamErrorCode = "quota";
      if (payload.code === "missing_provider") streamErrorCode = "missing_provider";
      if (payload.code === "unavailable") streamErrorCode = streamErrorCode || "unavailable";
      if (Number(payload.retryAfterMs) > 0) streamRetryAfterMs = Number(payload.retryAfterMs);
    } else if (event === "stopped") {
      citations = payload.citations || citations;
      if (payload.content) assembled = assembled || String(payload.content);
      if (payload.thought) thought = String(payload.thought);
      doneMessage = {
        role: "assistant",
        content: assembled,
        stopped: true,
        thought: thought || undefined,
        citations: citations || undefined,
        pendingActions: payload.pendingActions || pendingActions.length ? (payload.pendingActions || pendingActions) : undefined,
      };
    }
  };

  const stoppedPayload = () => ({
    role: "assistant",
    content: assembled,
    stopped: true,
    thought: thought || undefined,
    citations: citations || undefined,
    pendingActions: pendingActions.length ? pendingActions : undefined,
  });

  try {
    while (true) {
      if (signal?.aborted) {
        if (buf.trim()) consumeBlock(buf);
        return doneMessage?.stopped ? doneMessage : stoppedPayload();
      }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() || "";
      for (const part of parts) consumeBlock(part);
    }
    if (buf.trim()) consumeBlock(buf);
  } catch (err) {
    // Client Stop / AbortController: keep tokens already assembled; do not wipe.
    // Browsers may surface abort mid-stream as TypeError "Failed to fetch".
    if (isDimaAbortError(err, signal)) {
      return doneMessage?.stopped ? doneMessage : stoppedPayload();
    }
    throw err;
  }

  // Stop always wins — never turn an aborted stream into a capacity/error banner.
  if (isDimaAbortError(null, signal)) {
    return doneMessage?.stopped
      ? doneMessage
      : {
          role: "assistant",
          content: assembled || "",
          thought: thought || undefined,
          citations: citations || undefined,
          pendingActions: pendingActions.length ? pendingActions : undefined,
          stopped: true,
        };
  }
  if (streamError) {
    const err = new Error(streamError);
    if (streamErrorCode === "quota" || /at capacity|şu an yoğun|quota/i.test(streamError)) {
      err.code = "quota";
    }
    if (streamErrorCode === "missing_provider") {
      err.code = "missing_provider";
    }
    if (streamErrorCode === "unavailable" && !err.code) {
      err.code = "unavailable";
    }
    if (streamRetryAfterMs) err.retryAfterMs = streamRetryAfterMs;
    throw err;
  }
  const final = doneMessage || {
    role: "assistant",
    content: assembled,
    thought: thought || undefined,
    citations: citations || undefined,
    pendingActions: pendingActions.length ? pendingActions : undefined,
  };
  if (final.stopped) {
    return final;
  }
  if (!String(final.content || assembled || "").trim() && !(final.pendingActions || []).length) {
    throw new Error("Dima is temporarily unavailable. Please try again shortly.");
  }
  return final;
}
