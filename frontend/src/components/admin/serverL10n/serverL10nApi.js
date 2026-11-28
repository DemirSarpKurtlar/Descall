/** Topluluk çevirileri admin API (backend/routes/adminServerTranslations.js). Writes ask for a step-up code via adminFetch. */
import { adminFetch } from "../../../api/adminHttp";

const json = (method, body) => ({ method, body: JSON.stringify(body || {}) });
const enc = encodeURIComponent;

export const sl10nApi = {
  list: () => adminFetch("/server-translations"),
  load: (serverId) => adminFetch(`/server-translations/${enc(serverId)}`),
  save: (serverId, items, extra = {}) => adminFetch(`/server-translations/${enc(serverId)}/items`, json("PUT", { items, ...extra })),
  settings: (serverId, body) => adminFetch(`/server-translations/${enc(serverId)}/settings`, json("PUT", body)),
  draft: (serverId, body) => adminFetch(`/server-translations/${enc(serverId)}/draft/preview`, json("POST", body)),
};
