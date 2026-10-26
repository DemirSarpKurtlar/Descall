/* 11 Roller · 12 Rol üyeleri · 13 Üye · 22 Sahipliği devret (iPad) + iPhone devret sayfaları. */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, Reorder, useDragControls } from "framer-motion";
import { ActionSheet, Act, AlertBox, Av, Btn, Chip, Field, Foot, Group, I, Nav, PRESENCE_DOT, Row, Scroll, Sec, Spinner } from "./kit";
import { DoneBtn, PageFrame, Rich, useHub, useRouteDraft, useRun } from "./hubCore";
import { useToast } from "../../../context/ToastContext";
import { copyText } from "../../../lib/copyText";
import { promptAction } from "../../../lib/glassConfirm";
import { hapticSelection, hapticWarning } from "../../../lib/fluid/haptics";
import { isBlockedByMe, setUserBlocked, useBlockedUserIds } from "../../../lib/blockedUsers";
import ReportUserModal from "../../social/ReportUserModal";
import {
  assignMemberRole, removeMemberRole, kickServerMember, banServerMember, updateMemberNickname, timeoutServerMember,
  removeServerMemberTimeout, createServerRole, updateServerRole, deleteServerRole, getOwnershipTransferInfo, transferServerOwnership,
} from "../../../api/servers";
import {
  canActOnServerMember, canEditServerRole, canGrantServerPermission, isAssignableServerRole, permissionsToFlagMap,
  serverHasPermission, serverHighestPosition, serverIsOwner,
} from "../../../lib/serverPermissions";
import {
  EVERYONE_LOCKED_KEYS, ROLE_PERM_ORDER, ROLE_SWATCHES, TIMEOUT_OPTIONS, colorToHex, durationLabel, hexToColor, memberAge, memberName,
  memberRoleLine, orderKeys, presenceOf, roleHex, sortMembers, timeLeftLabel, confirmNameMatches } from "./hubData";

const lower = (v) => String(v || "").toLocaleLowerCase("tr");
const matches = (m, q) => !q || [m.nickname, m.displayName, m.username].some((x) => x && lower(x).includes(q));
const userOf = (m) => (m ? { ...m, id: m.userId } : null);
const byPosDesc = (a, b) => (Number(b.position) || 0) - (Number(a.position) || 0);

function useRolesById() {
  const { data } = useHub();
  return useMemo(() => new Map((data.roles || []).map((r) => [String(r.id), r])), [data.roles]);
}
function presence(hub, m) {
  if (hub.deps.me?.id && String(m.userId) === String(hub.deps.me.id)) return presenceOf(hub.deps.onlineUsers, m.userId) || "online";
  return presenceOf(hub.deps.onlineUsers, m.userId);
}
/** Patch one member in the shared hub data. */
function patchMember(hub, userId, fn) {
  hub.setData((d) => ({ ...d, members: (d.members || []).map((m) => (String(m.userId) === String(userId) ? fn(m) : m)) }));
}
function highestOf(roleIds, roles) {
  return (roleIds || []).reduce((top, id) => Math.max(top, Number((roles || []).find((r) => String(r.id) === String(id))?.position) || 0), 0);
}

/* ───────────────────────── Members (13) ───────────────────────── */

function MemberList({ sel, onPick, chev, style }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const rolesById = useRolesById();
  const [q, setQ] = useState("");
  useEffect(() => { hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = lower(q.trim());
  const all = useMemo(() => sortMembers(data.members || []), [data.members]);
  const list = all.filter((m) => matches(m, needle));
  const online = list.filter((m) => presence(hub, m));
  const offline = list.filter((m) => !presence(hub, m));
  const row = (m) => {
    const p = presence(hub, m);
    return (
      <Row key={m.userId} av={<Av user={userOf(m)} name={memberName(m)} s={32} dot={p ? PRESENCE_DOT[p] : null} />} inset={58} t={memberName(m)}
        sub={memberRoleLine(m, rolesById, s) || `@${m.username}`} chev={chev} sel={sel != null && String(sel) === String(m.userId)} onClick={() => { hapticSelection(); onPick(m); }} />
    );
  };
  return (
    <>
      <Field value={q} onChange={setQ} icon="search" placeholder={f("searchInN", { n: server?.memberCount || all.length || 1 })} style={style} />
      {!data.members ? (data.membersError ? <div className="svh-err">{data.membersError}</div> : <Spinner />) : null}
      {online.length ? <><Sec>{f("onlineN", { n: online.length })}</Sec><Group>{online.map(row)}</Group></> : null}
      {offline.length ? <><Sec>{f("offlineN", { n: offline.length })}</Sec><Group>{offline.map(row)}</Group></> : null}
      {data.members && needle && !list.length ? <div className="svh-empty">{s.noResults}</div> : null}
    </>
  );
}

export function MembersSide({ route }) {
  const hub = useHub();
  const sel = route.sel || defaultMemberId(hub);
  return (
    <>
      <Nav style={{ height: 18 }} />
      <Scroll style={{ padding: "0 14px" }}>
        <MemberList sel={sel} style={{ marginBottom: 6 }} onPick={(m) => hub.updateRoute(route.key, { sel: m.userId })} />
      </Scroll>
    </>
  );
}
function defaultMemberId(hub) {
  const list = sortMembers(hub.data.members || []);
  const other = list.find((m) => String(m.userId) !== String(hub.deps.me?.id) && presence(hub, m)) || list[0];
  return other?.userId || null;
}

/** "mb": iPhone list page; iPad = split (MembersSide | member body). */
export function MembersPage({ route }) {
  const hub = useHub();
  const { s } = hub;
  if (hub.tablet) {
    const sel = route.sel || defaultMemberId(hub);
    return (
      <>
        <Nav />
        <Scroll form>{sel ? <MemberBody key={sel} userId={sel} /> : <Spinner />}</Scroll>
      </>
    );
  }
  return (
    <PageFrame route={route} title={s.rMembers}>
      <MemberList chev style={{ margin: "2px 0 6px" }} onPick={(m) => hub.push({ id: "member", userId: m.userId })} />
    </PageFrame>
  );
}

/** "member": the member sheet (13). Standalone (opened from the member list) shows the close button. */
export function MemberPage({ route }) {
  const hub = useHub();
  const i = hub.stack.findIndex((x) => x.key === route.key);
  const standalone = i === 0;
  return (
    <>
      <Nav left={standalone ? null : hub.backFor(route)} right={standalone ? <XBtnLocal /> : null} />
      <Scroll form={hub.tablet}><MemberBody userId={route.userId} /></Scroll>
    </>
  );
}
function XBtnLocal() {
  const hub = useHub();
  return <button type="button" className="svh-xbtn" onClick={hub.close} aria-label={hub.s.close}><I n="x" s={15} w={2.6} /></button>;
}

export function MemberBody({ userId }) {
  const hub = useHub();
  const { s, f, server, data, deps } = hub;
  const { toast } = useToast();
  const rolesById = useRolesById();
  const [run, busy] = useRun();
  const [sheet, setSheet] = useState(null); // "more" | "kick"
  const [report, setReport] = useState(false);
  useBlockedUserIds();
  useEffect(() => { hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const m = (data.members || []).find((x) => String(x.userId) === String(userId));
  if (!m) return data.members ? <div className="svh-empty">{s.noResults}</div> : <Spinner />;

  const meId = deps.me?.id;
  const isSelf = meId && String(meId) === String(m.userId);
  const canAct = canActOnServerMember(server, m, meId);
  const has = (k) => serverHasPermission(server, k);
  const canNick = (isSelf && has("CHANGE_NICKNAME")) || (!isSelf && has("MANAGE_NICKNAMES") && canAct);
  const canRoles = has("MANAGE_ROLES");
  const canTimeout = !isSelf && has("MODERATE_MEMBERS") && canAct;
  const canKick = !isSelf && has("KICK_MEMBERS") && canAct;
  const canBan = !isSelf && has("BAN_MEMBERS") && canAct;
  const name = memberName(m);
  const p = presence(hub, m);
  const chips = (m.roleIds || []).map((id) => rolesById.get(String(id))).filter((r) => r && !r.isEveryone).sort(byPosDesc);
  const timeLeft = m.timeoutUntil ? timeLeftLabel(m.timeoutUntil, s) : null;
  const blocked = isBlockedByMe(m.userId);
  const user = userOf(m);

  const leaveTo = (fn) => { hub.close(); setTimeout(fn, 0); };
  const openNick = () => hub.push({
    id: "text", title: s.nickname, value: m.nickname || "", placeholder: m.displayName || m.username || s.nicknamePh, maxLength: 32, foot: s.nicknameFoot,
    onDone: async (v) => {
      const nickname = v || null;
      await updateMemberNickname(server.id, m.userId, nickname);
      patchMember(hub, m.userId, (x) => ({ ...x, nickname }));
      toast(s.nickSaved, "success");
    },
  });
  const openTimeout = () => hub.push({
    id: "pick", title: s.timeout, value: timeLeft ? "__on" : "__none",
    options: [
      ...TIMEOUT_OPTIONS.map((sec) => ({ id: sec, t: durationLabel(sec, s) })),
      ...(timeLeft ? [{ id: "__clear", t: s.timeoutRemove }] : []),
    ],
    onPick: async (id) => {
      if (id === "__clear") {
        await removeServerMemberTimeout(server.id, m.userId);
        patchMember(hub, m.userId, (x) => ({ ...x, timeoutUntil: null, timeoutReason: null }));
        toast(s.timeoutCleared, "success");
        return true;
      }
      const reason = await promptAction({ title: s.reasonOpt, placeholder: s.reasonOpt, confirmLabel: s.ok, cancelLabel: s.cancel });
      if (reason === null) return false;
      const { timeout } = await timeoutServerMember(server.id, m.userId, { durationSeconds: id, reason: reason.trim() || undefined });
      patchMember(hub, m.userId, (x) => ({ ...x, timeoutUntil: timeout?.until || new Date(Date.now() + id * 1000).toISOString(), timeoutReason: timeout?.reason || null }));
      toast(s.timeoutDone, "success");
      return true;
    },
  });
  const kick = async () => {
    const ok = await run(() => kickServerMember(server.id, m.userId), { ok: s.kickDone });
    if (ok) { setSheet(null); afterRemoved(); }
  };
  const afterRemoved = () => {
    hub.setData((d) => ({ ...d, members: (d.members || []).filter((x) => String(x.userId) !== String(m.userId)) }));
    if (hub.phone && hub.stack.length > 1) hub.pop(); else if (hub.phone) hub.close();
    else hub.updateRoute(hub.stack[hub.stack.length - 1].key, { sel: null });
  };
  const ban = async () => {
    hapticWarning();
    const reason = await promptAction({ title: f("banPrompt", { name }), placeholder: s.reasonOpt, confirmLabel: s.ban, cancelLabel: s.cancel });
    if (reason === null) return;
    const ok = await run(() => banServerMember(server.id, m.userId, reason.trim() || undefined), { ok: s.banDone });
    if (ok) { hub.load("bans", true); afterRemoved(); }
  };
  const toggleBlock = () => run(async () => {
    await setUserBlocked(m.userId, !blocked);
    toast(blocked ? s.unblocked : s.blocked, "success");
  });

  return (
    <>
      <div className="svh-hero">
        <Av user={user} name={name} s={84} dot={p ? PRESENCE_DOT[p] : null} />
        <div className="n">{name}</div>
        <div className="m">{f("memberFor", { handle: m.username || name, age: memberAge(m.joinedAt, s) || s.ageToday })}</div>
        {chips.length || m.isOwner ? (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {m.isOwner ? <Chip color="#FFD60A">{s.ownerRole}</Chip> : null}
            {chips.map((r) => <Chip key={r.id} color={roleHex(r)}>{r.name}</Chip>)}
          </div>
        ) : null}
      </div>
      <div className="svh-pillrow" style={{ margin: "16px 0 4px" }}>
        <Act i="msg" label={s.aMessage} disabled={isSelf || !deps.onStartDm} onClick={() => leaveTo(() => deps.onStartDm?.(user))} />
        <Act i="phone" label={s.aCall} disabled={isSelf || !deps.onStartCall} onClick={() => leaveTo(() => deps.onStartCall?.(user, "voice"))} />
        <Act i="user" label={s.aProfile} onClick={() => leaveTo(() => (deps.onOpenProfile ? deps.onOpenProfile(user) : window.dispatchEvent(new CustomEvent("descall:open-profile", { detail: { userId: m.userId, user } }))))} />
        <Act i="more" label={s.aMore} onClick={() => setSheet("more")} />
      </div>
      <Sec>{s.secOnServer}</Sec>
      <Group>
        <Row ico="pen" t={s.nickname} val={m.nickname || s.none} chev={canNick} onClick={canNick ? openNick : undefined} />
        <Row ico="shield" c="yellow" t={s.roles} val={String(chips.length)} chev={canRoles} onClick={canRoles ? () => hub.push({ id: "memberRoles", userId: m.userId }) : undefined} />
        {!isSelf && !m.isOwner ? <Row ico="clock" c="orange" t={s.timeout} val={timeLeft ? f("timeoutLeft", { t: timeLeft }) : s.none} chev={canTimeout} onClick={canTimeout ? openTimeout : undefined} /> : null}
      </Group>
      {canKick || canBan ? (
        <>
          <Sec>{s.secModeration}</Sec>
          <Group>
            {canKick ? <Row ico="boot" c="red" t={s.kick} red onClick={() => { hapticWarning(); setSheet("kick"); }} disabled={busy} /> : null}
            {canBan ? <Row ico="ban" c="red" t={s.ban} red onClick={ban} disabled={busy} /> : null}
          </Group>
        </>
      ) : null}
      {!isSelf ? (
        <>
          <Sec>{""}</Sec>
          <Group>
            <Row t={blocked ? s.unblock : s.block} red onClick={toggleBlock} disabled={busy} />
            <Row t={s.report} red onClick={() => setReport(true)} />
          </Group>
        </>
      ) : null}
      <AnimatePresence>
        {sheet === "more" ? (
          <ActionSheet key="more" title={name} onCancel={() => setSheet(null)} cancel={s.giveUp}
            actions={[
              { t: s.copyId, onClick: async () => { setSheet(null); await copyText(String(m.userId)); toast(s.copied, "success"); } },
              { t: s.copyName, onClick: async () => { setSheet(null); await copyText(m.username || name); toast(s.copied, "success"); } },
            ]} />
        ) : null}
        {sheet === "kick" ? (
          <AlertBox key="kick" title={f("kickTitle", { name })} msg={s.kickMsg} cancel={s.giveUp} confirm={s.kickShort} onCancel={() => setSheet(null)} onConfirm={kick} busy={busy} />
        ) : null}
      </AnimatePresence>
      <ReportUserModal open={report} onClose={() => setReport(false)} targetId={m.userId} targetUsername={m.username} contextType="server" contextId={server?.id} />
    </>
  );
}

/** "memberRoles": assign / remove roles right away (same as the old menu). */
export function MemberRolesPage({ route }) {
  const hub = useHub();
  const { s, server, data } = hub;
  const [run, busy] = useRun();
  const m = (data.members || []).find((x) => String(x.userId) === String(route.userId));
  const roles = (data.roles || []).filter((r) => !r.isEveryone).sort(byPosDesc);
  const toggle = (r) => {
    if (!m) return;
    const hasRole = (m.roleIds || []).map(String).includes(String(r.id));
    hapticSelection();
    run(async () => {
      if (hasRole) await removeMemberRole(server.id, m.userId, r.id);
      else await assignMemberRole(server.id, m.userId, r.id);
      patchMember(hub, m.userId, (x) => {
        const ids = new Set((x.roleIds || []).map(String));
        if (hasRole) ids.delete(String(r.id)); else ids.add(String(r.id));
        return { ...x, roleIds: [...ids], highestPosition: highestOf([...ids], data.roles) };
      });
    });
  };
  return (
    <PageFrame route={route} title={s.roles}>
      <Sec first>{m ? memberName(m) : ""}</Sec>
      {roles.length ? (
        <Group>
          {roles.map((r) => (
            <Row key={r.id} lead={<i style={{ width: 12, height: 12, borderRadius: "50%", background: roleHex(r) || "#8E8E93", margin: "0 9px", flex: "none" }} />} inset={44} t={r.name}
              check={(m?.roleIds || []).map(String).includes(String(r.id))} disabled={busy || !isAssignableServerRole(server, r)} onClick={() => toggle(r)} />
          ))}
        </Group>
      ) : <div className="svh-empty">{s.noRoles}</div>}
    </PageFrame>
  );
}

/* ───────────────────────── Roles (11-12) ───────────────────────── */

function memberCountOf(role, members, server) {
  if (role.isEveryone) return server?.memberCount || members?.length || 0;
  return (members || []).filter((m) => (m.roleIds || []).map(String).includes(String(role.id))).length;
}

function RoleItem({ role, sub, chev, sel, onClick, draggable, onDragEnd }) {
  const controls = useDragControls();
  const dragged = useRef(false);
  const grip = draggable ? (
    <span className="svh-grip" style={{ opacity: 0.35, touchAction: "none", display: "grid", placeItems: "center", width: 30, height: 40, margin: "0 -6px" }}
      onPointerDown={(e) => { dragged.current = false; e.stopPropagation(); controls.start(e); }}
      onClick={(e) => e.stopPropagation()} aria-hidden="true"><I n="grip" s={18} /></span>
  ) : null;
  const row = (
    <Row lead={<i style={{ width: 12, height: 12, borderRadius: "50%", background: roleHex(role) || "#8E8E93", margin: "0 9px", flex: "none" }} />}
      t={role.isEveryone ? "@everyone" : role.name} sub={sub} tail={grip} chev={chev} sel={sel} inset={44}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } onClick(); }} />
  );
  if (!draggable) return row;
  return (
    <Reorder.Item as="div" value={role} className="svh-ri" dragListener={false} dragControls={controls}
      onDragStart={() => { dragged.current = true; hapticSelection(); }} onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, zIndex: 3, backgroundColor: "rgba(44,46,66,.98)", boxShadow: "0 12px 30px rgba(0,0,0,.45)" }}>
      {row}
    </Reorder.Item>
  );
}

function RoleList({ sel, onPick, chev }) {
  const hub = useHub();
  const { s, f, server, data, deps } = hub;
  const { toast } = useToast();
  useEffect(() => { hub.load("roles"); hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const roles = data.roles || [];
  const custom = useMemo(() => roles.filter((r) => !r.isEveryone).sort(byPosDesc), [roles]);
  const everyone = roles.find((r) => r.isEveryone);
  const [order, setOrder] = useState(custom);
  const orderRef = useRef(order);
  orderRef.current = order;
  useEffect(() => setOrder(custom), [custom]);
  const canManage = serverHasPermission(server, "MANAGE_ROLES");

  const commit = async () => {
    const list = orderRef.current;
    const prev = new Map(custom.map((r) => [String(r.id), Number(r.position) || 0]));
    const actorPos = serverHighestPosition(server);
    const owner = serverIsOwner(server);
    const next = list.map((r, i) => {
      let position = list.length - i;
      if (!owner && Number.isFinite(actorPos)) position = Math.min(position, Math.max(0, actorPos - 1));
      return { ...r, position };
    });
    const changed = next.filter((r) => prev.get(String(r.id)) !== r.position && canEditServerRole(server, custom.find((x) => x.id === r.id)));
    if (!changed.length) { setOrder(custom); return; }
    const all = everyone ? [...next, everyone] : next;
    hub.setData((d) => ({ ...d, roles: all }));
    deps.onRolesChanged?.(all);
    try {
      await Promise.all(changed.map((r) => updateServerRole(server.id, r.id, { position: r.position })));
      toast(s.reorderSaved, "success");
    } catch (err) {
      toast(err?.message || "Error", "error");
      hub.load("roles", true);
    }
  };

  if (!data.roles) return data.rolesError ? <div className="svh-err">{data.rolesError}</div> : <Spinner />;
  return (
    <>
      <Sec first>{s.rolesSort}</Sec>
      <Reorder.Group as="div" axis="y" values={order} onReorder={setOrder} className="svh-group">
        {order.map((r) => (
          <RoleItem key={r.id} role={r} sub={f("nMembers", { n: memberCountOf(r, data.members, server) })} chev={chev} sel={sel != null && String(sel) === String(r.id)}
            draggable={canManage && canEditServerRole(server, r)} onDragEnd={commit} onClick={() => { hapticSelection(); onPick(r); }} />
        ))}
        {everyone ? (
          <RoleItem role={everyone} sub={f("everyoneAll", { n: memberCountOf(everyone, data.members, server) })} chev={chev} sel={sel != null && String(sel) === String(everyone.id)} onClick={() => { hapticSelection(); onPick(everyone); }} />
        ) : null}
      </Reorder.Group>
      {canManage ? (
        <Btn variant="gray" style={{ marginTop: 16, height: 46, color: "#8FA6FF" }} onClick={() => onPick({ id: "new" })}><I n="plus" s={18} /> {s.createRole}</Btn>
      ) : null}
      <Foot>{s.rolesFoot}</Foot>
    </>
  );
}

function defaultRoleId(data) {
  const custom = (data.roles || []).filter((r) => !r.isEveryone).sort(byPosDesc);
  return (custom[0] || (data.roles || [])[0])?.id || null;
}

export function RolesSide({ route }) {
  const hub = useHub();
  const sel = route.sel || defaultRoleId(hub.data);
  return (
    <>
      <Nav style={{ height: 18 }} />
      <Scroll style={{ padding: "0 14px" }}>
        <RoleList sel={sel} onPick={(r) => hub.updateRoute(route.key, { sel: r.id })} />
      </Scroll>
    </>
  );
}

/** "rl": iPhone list; iPad split (RolesSide | role editor). */
export function RolesPage({ route }) {
  const hub = useHub();
  const { s } = hub;
  if (hub.tablet) {
    const sel = route.sel || defaultRoleId(hub.data);
    if (!sel) return <><Nav /><Scroll form><Spinner /></Scroll></>;
    return <RoleEditor key={`${route.key}:${sel}`} route={route} roleId={sel} draftKey={`${route.key}:${sel}`} />;
  }
  return (
    <PageFrame route={route} title={s.rRoles}>
      <RoleList chev onPick={(r) => hub.push({ id: "role", roleId: r.id })} />
    </PageFrame>
  );
}

export function RoleEditPage({ route }) {
  return <RoleEditor route={route} roleId={route.roleId} draftKey={route.key} />;
}

function RoleEditor({ route, roleId, draftKey }) {
  const hub = useHub();
  const { s, f, server, data, deps } = hub;
  const { toast } = useToast();
  const isNew = roleId === "new";
  const role = isNew ? null : (data.roles || []).find((r) => String(r.id) === String(roleId));
  const editableKeys = useMemo(() => orderKeys(data.editable || [], ROLE_PERM_ORDER), [data.editable]);
  const init = () => (isNew
    ? { name: "", color: 0x5b8cff, hoist: false, mentionable: false, flags: Object.fromEntries(editableKeys.map((k) => [k, ["VIEW_CHANNEL", "SEND_MESSAGES", "CONNECT", "SPEAK"].includes(k)])) }
    : { name: role?.name || "", color: role?.color ?? 0, hoist: Boolean(role?.hoist), mentionable: Boolean(role?.mentionable), flags: permissionsToFlagMap(role?.permissions, editableKeys) });
  const [d, setD] = useRouteDraft({ key: `role:${draftKey}` }, init);
  const [run, busy] = useRun();
  const [del, setDel] = useState(false);
  if (!isNew && !role) return <><Nav left={hub.backFor(route)} /><Scroll form={hub.tablet}>{data.roles ? <div className="svh-empty">{s.noResults}</div> : <Spinner />}</Scroll></>;

  const editable = isNew || canEditServerRole(server, role);
  const locked = (k) => !editable || (role?.isEveryone && EVERYONE_LOCKED_KEYS.has(k)) || !canGrantServerPermission(server, k);
  const hex = colorToHex(d.color) || "#8E8E93";
  const membersWith = isNew ? [] : (data.members || []).filter((m) => (m.roleIds || []).map(String).includes(String(role.id)));
  const count = isNew ? 0 : memberCountOf(role, data.members, server);
  const title = isNew ? (d.name.trim() || s.newRole) : role.isEveryone ? "@everyone" : role.name;
  const setFlag = (k, v) => {
    if (locked(k)) return;
    hapticSelection();
    setD((x) => {
      const flags = { ...(x.flags || {}) };
      if (k === "ADMINISTRATOR") for (const key of editableKeys) { if (!locked(key) || key === "ADMINISTRATOR") flags[key] = v; }
      else { flags[k] = v; if (!v) flags.ADMINISTRATOR = false; }
      return { ...x, flags };
    });
  };
  const save = async () => {
    const name = d.name.trim();
    if (!name && !role?.isEveryone) { toast(s.roleNameNeeded, "error"); return; }
    const ok = await run(async () => {
      if (isNew) {
        const { role: created } = await createServerRole(server.id, { name, color: d.color, hoist: d.hoist, mentionable: d.mentionable, permissions: d.flags });
        const next = [...(data.roles || []).filter((r) => r.id !== created.id), created].sort(byPosDesc);
        hub.setData((x) => ({ ...x, roles: next }));
        deps.onRolesChanged?.(next);
        return created;
      }
      const patch = { color: d.color, hoist: d.hoist, mentionable: d.mentionable, permissions: d.flags };
      if (!role.isEveryone) patch.name = name;
      const { role: saved } = await updateServerRole(server.id, role.id, patch);
      const next = (data.roles || []).map((r) => (r.id === saved.id ? saved : r));
      hub.setData((x) => ({ ...x, roles: next }));
      deps.onRolesChanged?.(next);
      return saved;
    }, { ok: isNew ? s.roleCreated : s.roleSaved });
    if (!ok) return;
    hub.drafts.delete(`role:${draftKey}`);
    if (hub.tablet) hub.updateRoute(route.key, { sel: ok.id });
    else hub.pop();
  };
  const remove = async () => {
    const ok = await run(async () => {
      await deleteServerRole(server.id, role.id);
      const next = (data.roles || []).filter((r) => r.id !== role.id);
      hub.setData((x) => ({ ...x, roles: next, members: (x.members || []).map((m) => ({ ...m, roleIds: (m.roleIds || []).filter((id) => String(id) !== String(role.id)) })) }));
      deps.onRolesChanged?.(next);
    }, { ok: s.roleDeleted });
    if (!ok) return;
    setDel(false);
    if (hub.tablet) hub.updateRoute(route.key, { sel: null }); else hub.pop();
  };
  const names = membersWith.map(memberName);
  const membersVal = names.length ? (names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")) : s.noMembersYet;

  return (
    <>
      <Nav left={hub.tablet ? null : hub.backFor(route)} title={title} right={editable ? <DoneBtn label={s.save} onClick={save} disabled={busy} /> : null} />
      <Scroll form={hub.tablet}>
        <div className="svh-hero">
          <span className="svh-ico" style={{ width: 60, height: 60, borderRadius: 18, background: hex, color: "#fff" }}><I n={role?.isEveryone ? "users" : "shield"} s={30} w={2} /></span>
          <div className="n">{title}</div>
          <div className="m">{role?.isEveryone ? f("everyoneAll", { n: count }) : f("nMembers", { n: count })}</div>
        </div>
        {!editable ? <Foot>{s.roleLocked}</Foot> : null}
        <Sec>{s.secLook}</Sec>
        <Group>
          {role?.isEveryone ? null : (
            <Row t={s.name} val={d.name || s.newRole} chev={editable} disabled={!editable}
              onClick={editable ? () => hub.push({ id: "text", title: s.name, value: d.name, required: true, maxLength: 100, onDone: async (v) => setD((x) => ({ ...x, name: v })) }) : undefined} />
          )}
          <Row t={s.color} tail={(
            <span style={{ display: "flex", gap: 7 }} role="radiogroup" aria-label={s.color}>
              {ROLE_SWATCHES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={hex.toLowerCase() === c.toLowerCase()} aria-label={c} disabled={!editable}
                  className={`svh-swatch${hex.toLowerCase() === c.toLowerCase() ? " on" : ""}`} style={{ background: c, border: 0, padding: 0 }} data-press-scale="0.9"
                  onClick={() => { hapticSelection(); setD((x) => ({ ...x, color: hexToColor(c) })); }} />
              ))}
            </span>
          )} />
          <Row t={s.hoist} tg={d.hoist} disabled={!editable || role?.isEveryone} onClick={() => { hapticSelection(); setD((x) => ({ ...x, hoist: !x.hoist })); }} />
          <Row t={s.mentionable} tg={d.mentionable} disabled={!editable || role?.isEveryone} onClick={() => { hapticSelection(); setD((x) => ({ ...x, mentionable: !x.mentionable })); }} />
        </Group>
        {!isNew && !role.isEveryone ? (
          <>
            <Sec>{s.rMembers}</Sec>
            <Group>
              <Row ico="users" c="orange" t={s.rMembers} val={membersVal} chev disabled={!isAssignableServerRole(server, role)}
                onClick={() => hub.push({ id: "roleMembers", roleId: role.id })} />
            </Group>
          </>
        ) : null}
        <Sec>{s.secPerms}</Sec>
        <Group>
          {editableKeys.map((k) => (
            <Row key={k} t={s[`p_${k}`] || k} tg={Boolean(d.flags?.[k])} disabled={locked(k)} onClick={() => setFlag(k, !d.flags?.[k])} />
          ))}
        </Group>
        {!isNew && !role.isEveryone && editable ? (
          <>
            <Sec>{""}</Sec>
            <Group><Row t={s.deleteRole} red center onClick={() => { hapticWarning(); setDel(true); }} /></Group>
          </>
        ) : null}
        <AnimatePresence>
          {del ? <AlertBox key="del" title={f("delRoleTitle", { name: role.name })} msg={s.delRoleMsg} cancel={s.giveUp} confirm={s.deleteRole} onCancel={() => setDel(false)} onConfirm={remove} busy={busy} /> : null}
        </AnimatePresence>
      </Scroll>
    </>
  );
}

/** "roleMembers" (12): pick who has the role; Kaydet applies the diff. */
export function RoleMembersPage({ route }) {
  const hub = useHub();
  const { s, f, server, data } = hub;
  const role = (data.roles || []).find((r) => String(r.id) === String(route.roleId));
  const initial = useMemo(() => (data.members || []).filter((m) => (m.roleIds || []).map(String).includes(String(route.roleId))).map((m) => String(m.userId)), [data.members, route.roleId]);
  const [picked, setPicked] = useRouteDraft(route, () => initial);
  const [q, setQ] = useState("");
  const [run, busy] = useRun();
  const set = new Set(picked);
  const before = new Set(initial);
  const adds = picked.filter((id) => !before.has(id));
  const removes = initial.filter((id) => !set.has(id));
  const dirty = adds.length + removes.length > 0;
  const needle = lower(q.trim());
  const all = sortMembers(data.members || []);
  const current = all.filter((m) => before.has(String(m.userId)) && matches(m, needle));
  const others = all.filter((m) => !before.has(String(m.userId)) && matches(m, needle));
  const toggle = (m) => {
    hapticSelection();
    const id = String(m.userId);
    setPicked((x) => (x.includes(id) ? x.filter((v) => v !== id) : [...x, id]));
  };
  const save = async () => {
    if (!dirty || !role) return;
    const ok = await run(async () => {
      for (const id of adds) await assignMemberRole(server.id, id, role.id);
      for (const id of removes) await removeMemberRole(server.id, id, role.id);
      hub.setData((d) => ({
        ...d,
        members: (d.members || []).map((m) => {
          const id = String(m.userId);
          if (!adds.includes(id) && !removes.includes(id)) return m;
          const ids = new Set((m.roleIds || []).map(String));
          if (adds.includes(id)) ids.add(String(role.id)); else ids.delete(String(role.id));
          return { ...m, roleIds: [...ids], highestPosition: highestOf([...ids], d.roles) };
        }),
      }));
    }, { ok: s.roleSaved });
    if (ok) { hub.load("members", true); hub.pop(); }
  };
  const circle = <span style={{ width: 24, height: 24, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,.28)", flex: "none" }} />;
  const row = (m) => {
    const on = set.has(String(m.userId));
    return (
      <Row key={m.userId} av={<Av user={userOf(m)} name={memberName(m)} s={34} />} t={memberName(m)} sub={`@${m.username}`} inset={60}
        check={on} tail={on ? null : circle} onClick={() => toggle(m)} disabled={busy} />
    );
  };
  return (
    <PageFrame route={route} title={s.rMembers} right={<DoneBtn label={s.save} onClick={save} disabled={!dirty || busy} />}>
      <Field value={q} onChange={setQ} icon="search" placeholder={s.memberSearch} style={{ margin: "2px 0 6px" }} />
      <Sec>{f("roleMembersSec", { role: role?.name || "", n: initial.length })}</Sec>
      {current.length ? <Group>{current.map(row)}</Group> : <div className="svh-empty" style={{ padding: "14px 12px" }}>{s.noMembersYet}</div>}
      {others.length ? <><Sec>{s.addSec}</Sec><Group>{others.map(row)}</Group></> : null}
      <Foot>{f("roleMembersFoot", { role: role?.name || "" })}</Foot>
    </PageFrame>
  );
}

/* ───────────────────────── Ownership transfer (22) ───────────────────────── */

export function TransferPage({ route }) {
  const hub = useHub();
  const { s, f, data, dat, gen } = hub;
  const rolesById = useRolesById();
  const [q, setQ] = useState("");
  const [sel, setSel] = useRouteDraft(route, null);
  useEffect(() => { hub.load("members"); hapticWarning(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const candidates = useMemo(() => (data.members || []).filter((m) => !m.isOwner).sort((a, b) => (Number(b.highestPosition) || 0) - (Number(a.highestPosition) || 0) || memberName(a).localeCompare(memberName(b), "tr")), [data.members]);
  const needle = lower(q.trim());
  const visible = candidates.filter((m) => matches(m, needle));
  const picked = candidates.find((m) => String(m.userId) === String(sel)) || null;
  const pn = picked ? memberName(picked) : "";
  return (
    <PageFrame route={route} title={s.transfer}>
      <Sec first>{s.pickOwner}</Sec>
      <Field value={q} onChange={setQ} icon="search" placeholder={s.memberSearch} style={{ marginBottom: 8 }} />
      {!data.members ? <Spinner /> : candidates.length ? (
        <Group>
          {visible.map((m) => {
            const on = String(m.userId) === String(sel);
            return <Row key={m.userId} av={<Av user={userOf(m)} name={memberName(m)} s={34} />} t={memberName(m)} sub={memberRoleLine(m, rolesById, s) || `@${m.username}`} inset={60} check={on} sel={on}
              onClick={() => { hapticSelection(); setSel(m.userId); }} />;
          })}
        </Group>
      ) : <div className="svh-empty">{s.noCandidates}</div>}
      <div className="svh-group" style={{ marginTop: 18, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", background: "rgba(255,214,10,.1)", boxShadow: "inset 0 0 0 .5px rgba(255,214,10,.3)" }}>
        <span style={{ color: "#FFD60A", flex: "none", display: "grid" }}><I n="crown" s={22} /></span>
        <div style={{ fontSize: 14, lineHeight: 1.4, color: "rgba(255,240,200,.9)" }}>
          {picked ? <Rich text={f(route.leaveAfter ? "transferNoticeLeave" : "transferNotice", { name: pn, nameGen: gen(pn) })} /> : s.transferNoticeNone}
        </div>
      </div>
      <Btn style={{ marginTop: 20 }} disabled={!picked} onClick={() => hub.push({ id: "trConfirm", userId: picked.userId, leaveAfter: route.leaveAfter })}>
        {picked ? f("transferTo", { nameDat: dat(pn) }) : s.transfer}
      </Btn>
    </PageFrame>
  );
}

export function TransferConfirmPage({ route }) {
  const hub = useHub();
  const { s, f, server, data, deps, dat } = hub;
  const { toast } = useToast();
  const [d, setD] = useRouteDraft(route, { name: "", password: "" });
  const [pwRequired, setPwRequired] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    let alive = true;
    getOwnershipTransferInfo(server.id).then((r) => alive && setPwRequired(r?.passwordRequired !== false)).catch(() => {});
    return () => { alive = false; };
  }, [server.id]);
  const target = (data.members || []).find((m) => String(m.userId) === String(route.userId));
  const tn = target ? memberName(target) : "";
  const serverName = String(server?.name || "");
  const nameOk = confirmNameMatches(d.name, serverName);
  const canSubmit = Boolean(target) && nameOk && (!pwRequired || d.password.length > 0) && !busy;
  const submit = async () => {
    if (!canSubmit || busyRef.current) return;
    busyRef.current = true; setBusy(true); setErr("");
    try {
      const result = await transferServerOwnership(server.id, { userId: target.userId, confirmName: d.name.trim(), password: pwRequired ? d.password : undefined });
      toast(f("transferDone", { nameDat: dat(tn) }), "success");
      hub.close();
      await deps.onTransferred?.({ result, target, leaveAfter: Boolean(route.leaveAfter) });
    } catch (e) {
      const code = e?.code;
      setErr(code === "PASSWORD_REQUIRED" ? s.wrongPassword : code === "CONFIRM_NAME_REQUIRED" ? s.nameMismatch : e?.message || "Error");
      if (code === "PASSWORD_REQUIRED") setD((x) => ({ ...x, password: "" }));
      busyRef.current = false; setBusy(false);
    }
  };
  const ok = <span style={{ marginLeft: "auto", color: "#30D158", display: "grid" }}><I n="check" s={18} w={2.6} /></span>;
  return (
    <PageFrame route={route} title={s.transferConfirm}>
      <Foot style={{ margin: "2px 4px 6px", fontSize: 15 }}>{f("transferConfirmMsg", { nameDat: dat(tn) })}</Foot>
      <Sec>{s.delTypeName}</Sec>
      <Field value={d.name} onChange={(v) => setD((x) => ({ ...x, name: v }))} placeholder={serverName} autoFocus right={nameOk ? ok : null} onEnter={submit} label={s.delTypeName} />
      {pwRequired ? (
        <>
          <Sec>{s.password}</Sec>
          <Field type="password" autoComplete="current-password" value={d.password} onChange={(v) => setD((x) => ({ ...x, password: v }))} placeholder={s.passwordPh} onEnter={submit} label={s.password} />
        </>
      ) : null}
      {err ? <div className="svh-err" role="alert">{err}</div> : null}
      <Btn style={{ marginTop: 22 }} disabled={!canSubmit} onClick={submit}>{busy ? <Spinner /> : f("transferTo", { nameDat: dat(tn) })}</Btn>
    </PageFrame>
  );
}
