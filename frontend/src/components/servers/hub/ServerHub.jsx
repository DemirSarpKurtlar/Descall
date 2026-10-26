/* Descall 3.0.0 server hub (mockups 03–22): one iOS sheet with a page stack on iPhone,
 * a split form (hub list | page) on iPad. Desktop keeps the old modals. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Back, FormPanel, NavText, PageStack, Sheet } from "./kit";
import { HubCtx, routeKey } from "./hubCore";
import { useSvh } from "./useSvh";
import { getServerMembers, getServerRoles, listServerInvites, listServerBans, getServerAuditLogs } from "../../../api/servers";
import { serverHasPermission } from "../../../lib/serverPermissions";
import { ROUTES, sectionOf, SPLIT_ROUTES, HubSide } from "./routes";

const withKey = (r) => (r.key ? r : { ...r, key: routeKey() });

export default function ServerHub({ server, mode, initial, onClose, deps }) {
  const svh = useSvh();
  const tablet = mode === "tablet";
  const [stack, setStack] = useState(() => (Array.isArray(initial) ? initial : [initial || { id: tablet ? "ov" : "root" }]).map(withKey));
  const [dir, setDir] = useState(0);
  const drafts = useRef(new Map()).current;
  const [data, setData] = useState(() => ({ roles: server?.roles?.length ? server.roles : null }));
  const inflight = useRef(new Map());
  const serverId = server?.id;

  const load = useCallback((kind, force) => {
    if (!serverId) return Promise.resolve();
    if (!force && inflight.current.has(kind)) return inflight.current.get(kind);
    const fns = {
      members: () => getServerMembers(serverId).then((r) => setData((d) => ({ ...d, members: r?.members || [] }))),
      roles: () => getServerRoles(serverId).then((r) => setData((d) => ({ ...d, roles: r?.roles || [], editable: r?.editablePermissions || [] }))),
      invites: () => listServerInvites(serverId).then((r) => setData((d) => ({ ...d, invites: r?.invites || [] }))),
      bans: () => listServerBans(serverId).then((r) => setData((d) => ({ ...d, bans: r?.bans || [] }))),
      logs: () => getServerAuditLogs(serverId, { limit: 100 }).then((r) => setData((d) => ({ ...d, logs: r?.logs || [] }))),
    };
    const p = (fns[kind] ? fns[kind]() : Promise.resolve()).catch((err) => {
      inflight.current.delete(kind);
      setData((d) => ({ ...d, [`${kind}Error`]: err?.message || "error" }));
    });
    inflight.current.set(kind, p);
    return p;
  }, [serverId]);

  // Root numbers (members/roles/invites/bans) are visible immediately on the hub list.
  useEffect(() => {
    load("members"); load("roles");
    if (serverHasPermission(server, "CREATE_INSTANT_INVITE")) load("invites");
    if (serverHasPermission(server, "BAN_MEMBERS")) load("bans");
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = useCallback((r) => { setDir(1); setStack((st) => [...st, withKey(r)]); }, []);
  const pop = useCallback((n = 1) => {
    setDir(-1);
    setStack((st) => {
      if (st.length <= n) { queueMicrotask(() => onClose?.()); return st; }
      st.slice(st.length - n).forEach((r) => drafts.delete(r.key));
      return st.slice(0, st.length - n);
    });
  }, [drafts, onClose]);
  const reset = useCallback((r) => { setDir(0); drafts.clear(); setStack([withKey(r)]); }, [drafts]);
  const replaceTop = useCallback((r) => { setDir(1); setStack((st) => [...st.slice(0, -1), withKey(r)]); }, []);
  const update = useCallback((patch) => setStack((st) => st.map((r, i) => (i === st.length - 1 ? { ...r, ...patch } : r))), []);
  const updateRoute = useCallback((key, patch) => setStack((st) => st.map((r) => (r.key === key ? { ...r, ...patch } : r))), []);

  const ctxBase = { server, ...svh, tablet, phone: !tablet, deps: deps || {}, data, setData, load, push, pop, reset, replaceTop, update, updateRoute, drafts, close: onClose, stack };
  const titleOf = (r) => {
    const def = ROUTES[r.id];
    if (!def) return "";
    return typeof def.title === "function" ? def.title(r, ctxBase) : def.title || "";
  };
  const backFor = (r) => {
    const i = stack.findIndex((x) => x.key === r.key);
    if (i > 0) {
      const prev = stack[i - 1];
      const lab = prev.id === "root" ? svh.s.server : titleOf(prev) || svh.s.back;
      return <Back label={lab} onClick={() => pop(stack.length - i)} />;
    }
    if (r.cancel) return <NavText onClick={onClose}>{r.cancel === true ? svh.s.cancel : r.cancel}</NavText>;
    return null;
  };
  const ctx = { ...ctxBase, titleOf, backFor };

  const top = stack[stack.length - 1];
  const def = ROUTES[top.id] || ROUTES.root;
  const pages = stack.map((r) => {
    const C = (ROUTES[r.id] || ROUTES.root).Page;
    return { key: r.key, node: <C route={r} /> };
  });

  if (!tablet) {
    const medium = def.medium ? def.medium(top) : null;
    return (
      <HubCtx.Provider value={ctx}>
        <Sheet onClose={onClose} label={titleOf(top) || server?.name} medium={Boolean(medium)} h={medium || undefined}>
          <PageStack pages={pages} dir={dir} keepMounted />
        </Sheet>
      </HubCtx.Provider>
    );
  }

  const split = SPLIT_ROUTES[top.id];
  const size = def.size ? def.size(top) : { w: 940, h: 740 };
  const closeOrPop = () => {
    if (split && stack.length > 1) pop();
    else onClose?.();
  };
  const C = def.Page;
  const noSide = typeof def.noSide === "function" ? def.noSide(top) : def.noSide;
  return (
    <HubCtx.Provider value={ctx}>
      <FormPanel onClose={closeOrPop} w={size.w} h={size.h} label={titleOf(top) || server?.name}
        side={noSide ? null : split ? <split.Side route={top} /> : <HubSide sel={sectionOf(stack, top)} />}>
        <PageStack pages={[{ key: top.key, node: <C route={top} /> }]} dir={dir} />
      </FormPanel>
    </HubCtx.Provider>
  );
}

