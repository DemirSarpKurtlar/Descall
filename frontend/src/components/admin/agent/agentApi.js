/**
 * Admin agent (Taslak B) API calls. Every call goes through adminFetch, so a change that
 * needs a 2FA code opens the step-up prompt and retries once.
 */
import { adminFetch } from "../../../api/adminHttp";
import { API_BASE_URL } from "../../../config/api";
import { getToken } from "../../../lib/storage";
import { clearStepUpToken, stepUpHeaders } from "../../../lib/adminStepUp";
import { parseSse } from "../agentMarkdown.js";

const json = (body) => ({ body: JSON.stringify(body || {}) });

export const agentApi = {
  status: () => adminFetch("/agent/status"),
  saveSettings: (patch) => adminFetch("/agent/settings", { method: "PUT", ...json(patch) }),
  threads: () => adminFetch("/agent/threads"),
  thread: (id) => adminFetch(`/agent/threads/${encodeURIComponent(id)}`),
  deleteThread: (id) => adminFetch(`/agent/threads/${encodeURIComponent(id)}`, { method: "DELETE" }),

  scopes: () => adminFetch("/agent/scopes"),
  saveScopes: (patch) => adminFetch("/agent/scopes", { method: "PUT", ...json(patch) }),

  plans: (query = {}) => {
    const q = new URLSearchParams();
    if (query.threadId) q.set("threadId", query.threadId);
    if (query.view) q.set("view", query.view);
    const s = q.toString();
    return adminFetch(`/agent/plans${s ? `?${s}` : ""}`);
  },
  plan: (id) => adminFetch(`/agent/plans/${encodeURIComponent(id)}`),
  select: (id, itemIds, selected) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/selection`, { method: "PATCH", ...json({ itemIds, selected }) }),
  edit: (id, body) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/edit`, { method: "POST", ...json(body) }),
  dryRun: (id) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/dry-run`, { method: "POST", ...json({}) }),
  discard: (id) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/discard`, { method: "POST", ...json({}) }),
  /** Approval always asks for a new code: the cached 15-minute token is dropped first. */
  approve: (id, body) => {
    clearStepUpToken();
    return adminFetch(`/agent/plans/${encodeURIComponent(id)}/approve`, { method: "POST", ...json(body) });
  },
  op: (id, op) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/${op}`, { method: "POST", ...json({}) }),
  undo: (id, itemIds) => adminFetch(`/agent/plans/${encodeURIComponent(id)}/undo`, { method: "POST", ...json(itemIds ? { itemIds } : {}) }),

  prompts: () => adminFetch("/agent/prompts"),
  createPrompt: (body) => adminFetch("/agent/prompts", { method: "POST", ...json(body) }),
  usePrompt: (id) => adminFetch(`/agent/prompts/${encodeURIComponent(id)}/use`, { method: "POST", ...json({}) }),
  deletePrompt: (id) => adminFetch(`/agent/prompts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  tasks: () => adminFetch("/agent/tasks"),
  createTask: (body) => adminFetch("/agent/tasks", { method: "POST", ...json(body) }),
  updateTask: (id, body) => adminFetch(`/agent/tasks/${encodeURIComponent(id)}`, { method: "PATCH", ...json(body) }),
  deleteTask: (id) => adminFetch(`/agent/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  runTask: (id) => adminFetch(`/agent/tasks/${encodeURIComponent(id)}/run`, { method: "POST", ...json({}) }),
};

/**
 * POST /admin/agent/chat and read the Server-Sent Events.
 * @param {{message: string, threadId?: string, planId?: string, mode: string}} body
 * @param {(event: object) => void} onEvent
 */
export async function streamChat(body, onEvent, { signal } = {}) {
  const res = await fetch(`${API_BASE_URL}/admin/agent/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json", ...stepUpHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { code: data.code });
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const [events, rest] = parseSse(buf);
    buf = rest;
    for (const ev of events) {
      if (ev.type === "error") throw Object.assign(new Error(ev.message), { code: ev.code });
      onEvent(ev);
    }
  }
}
