/* A5: maps the sidebar's open/confirm flags to the 3.0.0 hub, sheets and menus on iPhone / iPad.
 * Desktop never renders this (useHubMode returns null), so the old modals stay there. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import ServerHub from "./ServerHub";
import { CreateServerSheet, JoinServerSheet, RulesGateSheet, LeaveAlert, OwnerLeaveSheet, DeleteServerSheet } from "./sheets";
import { VoiceMemberMenu, ServerLongPressMenu, FolderLongPressMenu } from "./menus";
import { DeleteChannelAlert } from "./pagesChannels";
import { AlertBox } from "./kit";
import { useSvh } from "./useSvh";
import { applyServerMute } from "./pagesGeneral";
import { getServerMute, isServerMuted, MUTE_DURATIONS } from "./serverMute";
import { setFolderColor } from "./folderColors";
import { promptAction } from "../../../lib/glassConfirm";
import { useToast } from "../../../context/ToastContext";
import { serverHasPermission } from "../../../lib/serverPermissions";
import { participantVolumePercent } from "../../../lib/voiceProfile";
import {
  createChannel, updateChannel, deleteChannel, markChannelRead, createServerFolder, updateServerFolder, deleteServerFolder, setServerFolder,
} from "../../../api/servers";

const same = (a, b) => a != null && b != null && String(a) === String(b);

/** Text-like channels with unread counts for one server. */
export function unreadChannelIds(server, channelUnread) {
  return (server?.channels || []).filter((c) => c.type === "text" && Number(channelUnread?.[c.id]) > 0).map((c) => c.id);
}

export default function HubHost({ mode, b, servers, activeServer, serverFolders, channelUnread, onlineUsers, me, friends,
  ownedCount, maxOwned, serverVoice, voiceCount, cb }) {
  const { s, f } = useSvh();
  const { toast } = useToast();
  const phone = mode === "phone";
  const [hub, setHub] = useState(null); // { serverId, initial, n }
  const [rulesSkip, setRulesSkip] = useState(() => new Set());
  const [delCh, setDelCh] = useState(null); // channel (from the sidebar row menu)
  const [delFolder, setDelFolder] = useState(null);

  const byId = useCallback((id) => (servers || []).find((x) => same(x.id, id)) || (same(activeServer?.id, id) ? activeServer : null), [servers, activeServer]);
  const hubServer = hub ? (same(activeServer?.id, hub.serverId) ? activeServer : byId(hub.serverId)) : null;

  const openHub = useCallback((server, routes) => {
    if (!server?.id) return;
    const list = Array.isArray(routes) ? routes : [routes];
    setHub((h) => ({ serverId: server.id, initial: list, n: (h?.n || 0) + 1 }));
  }, []);
  const P = useCallback((r) => (phone ? [{ id: "root" }, r] : [r]), [phone]);
  const closeHub = useCallback(() => setHub(null), []);

  /* Sidebar flags → hub routes (each flag is consumed immediately). */
  useEffect(() => {
    const sv = activeServer;
    if (!sv) return;
    if (b.menuOpen) { b.setMenuOpen(false); openHub(sv, phone ? [{ id: "root" }] : [{ id: "ov", nosel: true }]); }
    else if (b.showSettings) { b.setShowSettings(false); openHub(sv, P({ id: "ov" })); }
    else if (b.showRoles) { b.setShowRoles(false); openHub(sv, P({ id: "rl" })); }
    else if (b.showInvite) { b.setShowInvite(false); openHub(sv, P({ id: "iv" })); }
    else if (b.showCommunity) { b.setShowCommunity(false); openHub(sv, P({ id: "cm" })); }
    else if (b.showModeration) { const tab = b.showModeration; b.setShowModeration(null); openHub(sv, P({ id: "mod", tab })); }
    else if (b.channelAccess) { const ch = b.channelAccess; b.setChannelAccess(null); openHub(sv, P({ id: "access", channelId: ch.id })); }
    else if (b.channelModal) {
      const m = b.channelModal;
      b.setChannelModal(null);
      if (m.mode === "create") {
        if (m.defaultType === "category") openHub(sv, [{ id: "catCreate", standalone: true, cancel: true }]);
        else openHub(sv, [{ id: "chCreate", defaultType: m.defaultType || "text", parentId: m.parentId || undefined, ...(phone ? { cancel: true } : null) }]);
      } else if (m.mode === "edit" && m.channel) openHub(sv, P({ id: "chEdit", channelId: m.channel.id }));
      else if (m.mode === "delete" && m.channel) setDelCh(m.channel);
    }
  }, [b.menuOpen, b.showSettings, b.showRoles, b.showInvite, b.showCommunity, b.showModeration, b.channelAccess, b.channelModal, activeServer, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Ownership transfer → hub "tr" page; on iPad the owner's leave goes straight there (mockup 22 iPad). */
  useEffect(() => {
    if (!b.transfer?.server) return;
    const { server, leaveAfter } = b.transfer;
    b.setTransfer(null);
    openHub(server, P({ id: "tr", leaveAfter: Boolean(leaveAfter) }));
  }, [b.transfer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = b.confirm;
    if (!c || phone || c.mode !== "leave" || !c.server?.isOwner) return;
    b.setConfirm(null);
    openHub(c.server, [{ id: "tr", leaveAfter: true }]);
  }, [b.confirm, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The rules gate re-arms when the server rejects a send. */
  useEffect(() => {
    if (!b.rulesPrompt || !activeServer?.id) return;
    setRulesSkip((st) => { if (!st.has(String(activeServer.id))) return st; const n = new Set(st); n.delete(String(activeServer.id)); return n; });
  }, [b.rulesPrompt, activeServer?.id]);

  const onlineOf = useCallback((id) => {
    const u = (onlineUsers || []).find?.((x) => same(x?.id ?? x?.userId, id));
    return u?.status || (u ? "online" : null);
  }, [onlineUsers]);

  /* Channel ops: the active server goes through App (navigation + state); another server talks to the API directly. */
  const channelOps = useMemo(() => {
    const isActive = (sv) => same(sv?.id, activeServer?.id);
    return (sv) => ({
      onCreateChannel: async (payload) => {
        if (isActive(sv)) return cb.onCreateChannel?.(payload);
        const { beforeOpen, ...body } = payload || {};
        const { channel } = await createChannel(sv.id, body);
        if (!channel) return null;
        if (beforeOpen) await beforeOpen(channel);
        cb.onServerUpdated?.({ ...sv, channels: [...(sv.channels || []), channel] });
        return channel;
      },
      onUpdateChannel: async (channelId, patch) => {
        if (isActive(sv)) return cb.onUpdateChannel?.(channelId, patch);
        const { channel } = await updateChannel(sv.id, channelId, patch);
        if (channel) cb.onServerUpdated?.({ ...sv, channels: (sv.channels || []).map((c) => (same(c.id, channel.id) ? { ...c, ...channel } : c)) });
        return channel;
      },
      onDeleteChannel: async (channelId) => {
        if (isActive(sv)) return cb.onDeleteChannel?.(channelId);
        await deleteChannel(sv.id, channelId);
        cb.onServerUpdated?.({ ...sv, channels: (sv.channels || []).filter((c) => !same(c.id, channelId)).map((c) => (same(c.parentId, channelId) ? { ...c, parentId: null } : c)) });
      },
      onRolesChanged: (roles) => (isActive(sv) ? cb.onRolesChanged?.(roles) : cb.onServerUpdated?.({ ...sv, roles: roles || [] })),
      onSelectChannel: (ch) => (isActive(sv) ? cb.onSelectChannel?.(ch) : cb.onSelectServer?.(sv)),
    });
  }, [activeServer?.id, cb]);

  const moveToFolder = useCallback(async (server, folderId) => {
    if (cb.onMoveServerToFolder) await cb.onMoveServerToFolder(server.id, folderId);
    else { await setServerFolder(server.id, folderId); cb.onServerUpdated?.({ ...server, folderId }); }
  }, [cb]);
  const newFolderFor = useCallback(async (server) => {
    const name = await promptAction({ title: s.folderNamePh, confirmLabel: s.create, cancelLabel: s.cancel, placeholder: s.folderNamePh });
    if (!name?.trim()) return;
    try {
      const { folder } = await createServerFolder(name.trim());
      if (!folder) throw new Error(s.failed);
      cb.onServerFoldersChange?.([...(serverFolders || []), folder]);
      await moveToFolder(server, folder.id);
      toast(s.folderCreated, "success");
    } catch (err) { toast(err?.message || s.failed, "error"); }
  }, [s, cb, serverFolders, moveToFolder, toast]);

  const markRead = useCallback(async (list) => {
    const jobs = [];
    const ids = [];
    for (const sv of list) for (const id of unreadChannelIds(sv, channelUnread)) { ids.push(id); jobs.push(markChannelRead(sv.id, id).catch(() => null)); }
    if (!ids.length) return;
    window.dispatchEvent(new CustomEvent("descall:server-mark-read", { detail: { channelIds: ids } }));
    await Promise.all(jobs);
    toast(s.markedRead, "success");
  }, [channelUnread, s, toast]);

  const hubDeps = useMemo(() => {
    if (!hubServer) return null;
    const sv = hubServer;
    return {
      me, friends, onlineUsers, serverFolders,
      voiceCount: same(sv.id, activeServer?.id) ? voiceCount : 0,
      folderIdOf: (id) => byId(id)?.folderId ?? null,
      onServerUpdated: cb.onServerUpdated,
      ...channelOps(sv),
      onLeave: () => b.setConfirm({ mode: "leave", server: sv }),
      onDelete: () => b.setConfirm({ mode: "delete", server: sv }),
      onTransferred: async ({ result, target, leaveAfter }) => {
        const newOwnerId = result?.ownerId || target?.userId;
        setHub(null);
        cb.onServerUpdated?.({ ...sv, ...(result?.server || {}), ownerId: newOwnerId, isOwner: false });
        if (leaveAfter) {
          try { await cb.onLeaveServer?.(sv.id); } catch (err) { toast(err?.message || s.failed, "error"); }
        }
      },
      onMoveToFolder: (fid) => moveToFolder(sv, fid),
      onFolderCreated: (folder) => cb.onServerFoldersChange?.([...(serverFolders || []), folder]),
      onChannelMuteChanged: cb.onChannelMuteChanged,
      onStartDm: cb.onStartDm, onStartCall: cb.onStartCall, onOpenProfile: cb.onOpenProfile, onSendDm: cb.onSendDm,
    };
  }, [hubServer, me, friends, onlineUsers, serverFolders, voiceCount, activeServer?.id, byId, cb, channelOps, b, moveToFolder, toast, s.failed]);

  /* ── confirm flows (20 / 21 / 22) ── */
  const c = b.confirm;
  const confirmNode = (() => {
    if (!c?.server) return null;
    const sv = byId(c.server.id) || c.server;
    const cancel = () => b.setConfirm(null);
    if (c.mode === "leave" && !sv.isOwner) {
      return <LeaveAlert key="leave" server={sv} onCancel={cancel} onConfirm={async () => { b.setConfirm(null); setHub(null); await cb.onLeaveServer?.(sv.id); }} />;
    }
    if (c.mode === "leave" && sv.isOwner) {
      if (!phone) return null; // handled by the effect above
      return <OwnerLeaveSheet key="owner-leave" server={sv} onCancel={cancel}
        onTransfer={() => { b.setConfirm(null); openHub(sv, [{ id: "root" }, { id: "tr", leaveAfter: true }]); }}
        onDelete={() => b.setConfirm({ mode: "leave-delete", server: sv })} />;
    }
    const leaving = c.mode === "leave-delete";
    return <DeleteServerSheet key="delete" mode={mode} server={sv} onCancel={cancel}
      onTransfer={sv.isOwner ? () => { b.setConfirm(null); openHub(sv, P({ id: "tr", leaveAfter: leaving })); } : undefined}
      onConfirm={async (name) => {
        if (leaving) await cb.onLeaveServer?.(sv.id, name);
        else await cb.onDeleteServer?.(sv.id, name);
        b.setConfirm(null);
        setHub(null);
      }} />;
  })();

  /* ── 17 rules gate ── */
  const rulesNeeded = Boolean(activeServer && (b.needsRulesAccept || b.rulesPrompt) && !rulesSkip.has(String(activeServer.id)) && activeServer.rulesText);

  /* ── 14 voice member ── */
  const vm = b.voiceMenu;
  const vmNode = vm?.user ? (() => {
    const uid = vm.user.id;
    const sid = activeServer?.id;
    const voice = (activeServer?.channels || []).filter((x) => x.type === "voice" || x.type === "stage");
    const volume = participantVolumePercent(serverVoice?.participantVolumes?.[String(uid)], uid);
    const safe = (fn, ok) => async () => { try { await fn(); if (ok) toast(ok, "success"); } catch (err) { toast(err?.message || s.failed, "error"); } };
    return (
      <VoiceMemberMenu key="vm" mode={mode} menu={vm} presence={onlineOf(uid) || "online"} channels={voice}
        canMute={!vm.isSelf && b.canMuteMembers} canDeafen={!vm.isSelf && b.canDeafenMembers} canMove={b.canMoveMembers}
        volume={volume}
        onVolume={serverVoice?.setParticipantVolume ? (v) => serverVoice.setParticipantVolume(uid, v / 100) : undefined}
        onToggleLocalMute={serverVoice?.toggleParticipantMute ? () => serverVoice.toggleParticipantMute(uid) : undefined}
        screen={{ show: Boolean(vm.user.isScreenSharing || vm.user.screenStream), value: serverVoice?.screenVolumes?.[String(uid)] ?? 100, onChange: (v) => serverVoice?.setScreenShareVolume?.(uid, v) }}
        onProfile={() => (cb.onOpenProfile ? cb.onOpenProfile(vm.user) : window.dispatchEvent(new CustomEvent("descall:open-profile", { detail: { user: vm.user } })))}
        onMessage={cb.onStartDm ? () => cb.onStartDm(vm.user) : undefined}
        onServerMute={safe(() => serverVoice?.serverMute?.(sid, vm.channelId, uid, !vm.user.serverMuted))}
        onDeafen={safe(() => serverVoice?.serverDeafen?.(sid, vm.channelId, uid, !vm.user.serverDeafened))}
        onMove={(ch) => safe(() => serverVoice?.moveMember?.(sid, uid, vm.channelId, ch.id))()}
        onDisconnect={safe(() => serverVoice?.disconnectMember?.(sid, vm.channelId, uid))}
        onStage={safe(() => serverVoice?.setStageParticipantRole?.(sid, vm.channelId, uid, vm.user.stageRole === "speaker" ? "audience" : "speaker"))}
        onClose={() => b.setVoiceMenu(null)} />
    );
  })() : null;

  /* ── 24 server long-press ── */
  const sm = b.serverMenu;
  const smNode = sm?.server && sm.rect ? (() => {
    const sv = byId(sm.server.id) || sm.server;
    const unread = unreadChannelIds(sv, channelUnread).reduce((n, id) => n + (Number(channelUnread[id]) || 0), 0);
    const close = () => b.setServerMenu(null);
    const safe = (fn) => async (...a) => { try { await fn(...a); } catch (err) { toast(err?.message || s.failed, "error"); } };
    return (
      <ServerLongPressMenu key={`sm-${sv.id}`} rect={sm.rect} server={sv} unread={isServerMuted(sv.id) ? 0 : unread} online={sm.online ?? null}
        folders={serverFolders} canInvite={serverHasPermission(sv, "CREATE_INSTANT_INVITE")} onClose={close}
        onMarkRead={safe(() => markRead([sv]))}
        onMute={safe(async (id) => { await applyServerMute(sv, MUTE_DURATIONS[id], { onServerUpdated: cb.onServerUpdated }); toast(s.mutedDone, "success"); })}
        onUnmute={safe(async () => { await applyServerMute(sv, null, { onServerUpdated: cb.onServerUpdated, unmute: true }); toast(s.unmutedDone, "success"); })}
        onNotifications={() => openHub(sv, P({ id: "nt" }))}
        onInvite={() => openHub(sv, P({ id: "iv" }))}
        onMoveToFolder={safe(async (fid) => { await moveToFolder(sv, fid); toast(fid ? s.folderMoved : s.movedOut, "success"); })}
        onNewFolder={() => newFolderFor(sv)}
        onSettings={() => openHub(sv, phone ? [{ id: "root" }] : [{ id: "ov", nosel: true }])}
        onLeave={() => b.setConfirm({ mode: "leave", server: sv })} />
    );
  })() : null;

  /* ── 23 folder long-press ── */
  const fm = b.folderMenu;
  const fmNode = fm?.folder && fm.rect ? (() => {
    const folder = fm.folder;
    const list = (servers || []).filter((x) => same(x.folderId, folder.id));
    const allMuted = list.length > 0 && list.every((x) => getServerMute(x.id));
    const anyUnread = list.some((x) => unreadChannelIds(x, channelUnread).length);
    const close = () => b.setFolderMenu(null);
    const safe = (fn) => async () => { try { await fn(); } catch (err) { toast(err?.message || s.failed, "error"); } };
    return (
      <FolderLongPressMenu key={`fm-${folder.id}`} rect={fm.rect} folder={folder} count={list.length} allMuted={allMuted} anyUnread={anyUnread} onClose={close}
        onRename={safe(async () => {
          const name = await promptAction({ title: s.renamePrompt, confirmLabel: s.save, cancelLabel: s.cancel, placeholder: folder.name, defaultValue: folder.name });
          const n = name?.trim();
          if (!n || n === folder.name) return;
          const r = await updateServerFolder(folder.id, { name: n });
          const next = r?.folder || { ...folder, name: n };
          cb.onServerFoldersChange?.((serverFolders || []).map((x) => (same(x.id, folder.id) ? { ...x, ...next } : x)));
          toast(s.saved, "success");
        })}
        onColor={(color) => setFolderColor(folder.id, color)}
        onMarkAllRead={safe(() => markRead(list))}
        onMuteAll={safe(async () => { for (const x of list) if (!getServerMute(x.id)) await applyServerMute(x, null, { onServerUpdated: cb.onServerUpdated }); toast(s.mutedDone, "success"); })}
        onUnmuteAll={safe(async () => { for (const x of list) if (getServerMute(x.id)) await applyServerMute(x, null, { onServerUpdated: cb.onServerUpdated, unmute: true }); toast(s.unmutedDone, "success"); })}
        onUngroup={safe(async () => {
          for (const x of list) await moveToFolder(x, null);
          await deleteServerFolder(folder.id);
          cb.onServerFoldersChange?.((serverFolders || []).filter((x) => !same(x.id, folder.id)));
          toast(s.ungrouped, "success");
        })}
        onDelete={() => setDelFolder({ folder, list })} />
    );
  })() : null;

  return (
    <>
      <AnimatePresence>
        {hub && hubServer && hubDeps ? (
          <ServerHub key={`hub-${hub.serverId}-${hub.n}`} server={hubServer} mode={mode} initial={hub.initial} onClose={closeHub} deps={hubDeps} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {b.showCreate ? (
          <CreateServerSheet key="create" mode={mode} me={me} ownedCount={ownedCount} maxOwned={maxOwned}
            onClose={() => b.setShowCreate(false)}
            onOpenJoin={() => { b.setShowCreate(false); b.setShowJoin(true); }}
            onCreate={async (payload) => { await cb.onCreateServer?.(payload); b.setShowCreate(false); }} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {b.showJoin ? (
          <JoinServerSheet key="join" mode={mode} initialCode={typeof b.showJoin === "string" ? b.showJoin : ""}
            onClose={() => b.setShowJoin(false)}
            onJoined={(server) => { cb.onJoinServer?.(server); b.setShowJoin(false); }} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {rulesNeeded ? (
          <RulesGateSheet key={`rules-${activeServer.id}`} mode={mode} server={activeServer}
            onClose={() => { b.setRulesPrompt(false); setRulesSkip((st) => new Set(st).add(String(activeServer.id))); }}
            onAccepted={(rulesAcceptedAt) => { b.setRulesPrompt(false); cb.onServerUpdated?.({ ...activeServer, rulesAcceptedAt }); }} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>{confirmNode}</AnimatePresence>
      <AnimatePresence>
        {delCh && activeServer ? (
          <DeleteChannelAlert key="delch" server={activeServer} channel={delCh} s={s} f={f} onCancel={() => setDelCh(null)}
            onDelete={(id) => cb.onDeleteChannel?.(id)} onDeleted={() => setDelCh(null)} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {delFolder ? (
          <AlertBox key="delfolder" title={f("delFolderTitle", { name: delFolder.folder.name })} msg={s.delFolderMsg} cancel={s.giveUp} confirm={s.deleteFolder}
            onCancel={() => setDelFolder(null)}
            onConfirm={async () => {
              const { folder } = delFolder;
              try {
                await deleteServerFolder(folder.id);
                cb.onServerFoldersChange?.((serverFolders || []).filter((x) => !same(x.id, folder.id)));
                for (const x of delFolder.list) cb.onServerUpdated?.({ ...x, folderId: null });
                toast(s.folderDeleted, "success");
              } catch (err) { toast(err?.message || s.failed, "error"); }
              setDelFolder(null);
            }} />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>{vmNode}</AnimatePresence>
      <AnimatePresence>{smNode}</AnimatePresence>
      <AnimatePresence>{fmNode}</AnimatePresence>
    </>
  );
}
