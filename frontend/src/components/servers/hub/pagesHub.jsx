/* Hub root (03) + iPad side list + server search. */
import { useEffect, useMemo, useState } from "react";
import { Act, Av, Field, Group, Nav, Row, Scroll, Sec, Sq, XBtn, Foot } from "./kit";
import { PageFrame, useHub } from "./hubCore";
import { serverHasPermission, serverIsOwner } from "../../../lib/serverPermissions";
import { channelIcon, channelLabel, countServerChannels, inviteActive, memberName, presenceOf, rulesList } from "./hubData";
import { getServerMute } from "./serverMute";

export function usePerms(server) {
  return useMemo(() => {
    const has = (k) => serverHasPermission(server, k);
    return {
      owner: serverIsOwner(server),
      guild: has("MANAGE_GUILD"),
      channels: has("MANAGE_CHANNELS"),
      roles: has("MANAGE_ROLES"),
      invites: has("CREATE_INSTANT_INVITE"),
      bans: has("BAN_MEMBERS"),
      audit: has("VIEW_AUDIT_LOG"),
      kick: has("KICK_MEMBERS"),
      moderate: has("MODERATE_MEMBERS"),
      nicks: has("MANAGE_NICKNAMES"),
      admin: has("ADMINISTRATOR"),
    };
  }, [server]);
}

export function levelLabel(level, s) {
  if (level === "mentions") return s.lvlMentions;
  if (level === "muted") return s.lvlNone;
  return s.lvlAll;
}

export function onlineCountOf(members, onlineUsers, me) {
  if (!Array.isArray(members)) return null;
  return members.filter((m) => {
    if (me?.id && String(m.userId) === String(me.id)) return true;
    const p = presenceOf(onlineUsers, m.userId);
    return p === "online" || p === "idle" || p === "dnd";
  }).length;
}

/** Hero: server mark, name, "128 üye · 23 çevrimiçi · 4 seste". */
export function HubHero({ size = 76 }) {
  const { server, data, deps, f } = useHub();
  const online = onlineCountOf(data.members, deps.onlineUsers, deps.me);
  const members = server?.memberCount || data.members?.length || 1;
  const voice = deps.voiceCount || 0;
  return (
    <div className="svh-hero">
      <Sq server={server} s={size} />
      <div className="n">{server?.name}</div>
      <div className="m">{online == null ? f("heroMetaNoOnline", { members, voice }) : f("heroMeta", { members, online, voice })}</div>
    </div>
  );
}

/** Routes opened from a hub row. */
export const HUB_TARGETS = {
  ov: { id: "ov" }, ch: { id: "ch" }, cm: { id: "cm" }, ru: { id: "ru" }, mb: { id: "mb" }, rl: { id: "rl" }, iv: { id: "iv" },
  bn: { id: "mod", tab: "bans" }, au: { id: "mod", tab: "audit" }, nt: { id: "nt" }, fd: { id: "fd" }, tr: { id: "tr" },
};

export function HubRows({ sel, compact, firstSec = true }) {
  const hub = useHub();
  const { server, s, f, data, deps, tablet } = hub;
  const p = usePerms(server);
  const open = (k) => {
    const r = HUB_TARGETS[k];
    if (!r) return;
    if (tablet) hub.reset(r);
    else hub.push(r);
  };
  const S = (k) => sel === k;
  const rules = rulesList(server?.rulesText).length;
  const roleCount = Array.isArray(data.roles) ? data.roles.length : null;
  const activeInvites = Array.isArray(data.invites) ? data.invites.filter((i) => inviteActive(i)).length : null;
  const bans = Array.isArray(data.bans) ? data.bans.length : null;
  const folder = (deps.serverFolders || []).find((x) => String(x.id) === String(server?.folderId));
  const level = server?.notificationLevel || "all";
  const muted = getServerMute(server?.id);

  const serverRows = [
    p.guild && <Row key="ov" ico="gear" c="gray" t={s.rOverview} sub={compact ? null : s.rOverviewSub} chev sel={S("ov")} onClick={() => open("ov")} />,
    p.channels && <Row key="ch" ico="hash" c="brand" t={s.rChannels} val={String(countServerChannels(server))} chev sel={S("ch")} onClick={() => open("ch")} />,
    p.guild && <Row key="cm" ico="globe" c="green" t={s.rCommunity} val={server?.isPublic ? s.on : s.off} chev sel={S("cm")} onClick={() => open("cm")} />,
    p.guild && <Row key="ru" ico="book" c="teal" t={s.rRules} val={rules ? f("rRulesVal", { n: rules }) : s.none} chev sel={S("ru")} onClick={() => open("ru")} />,
  ].filter(Boolean);
  const memberRows = [
    <Row key="mb" ico="users" c="orange" t={s.rMembers} val={String(server?.memberCount || data.members?.length || 1)} chev sel={S("mb")} onClick={() => open("mb")} />,
    p.roles && <Row key="rl" ico="shield" c="yellow" t={s.rRoles} val={roleCount == null ? null : String(roleCount)} chev sel={S("rl")} onClick={() => open("rl")} />,
    p.invites && <Row key="iv" ico="link" c="blue" t={s.rInvites} val={activeInvites == null ? null : f("rInvitesVal", { n: activeInvites })} chev sel={S("iv")} onClick={() => open("iv")} />,
  ].filter(Boolean);
  const modRows = [
    p.bans && <Row key="bn" ico="ban" c="red" t={s.rBans} val={bans == null ? null : String(bans)} chev sel={S("bn")} onClick={() => open("bn")} />,
    p.audit && <Row key="au" ico="list" c="indigo" t={s.rAudit} chev sel={S("au")} onClick={() => open("au")} />,
  ].filter(Boolean);
  const order = [
    serverRows.length ? [s.secServer, serverRows] : null,
    [s.secMembers, memberRows],
    modRows.length ? [s.secModeration, modRows] : null,
    [s.secForYou, [
      <Row key="nt" ico={muted ? "belloff" : "bell"} c="pink" t={s.rNotif} val={levelLabel(level, s)} chev sel={S("nt")} onClick={() => open("nt")} />,
      <Row key="fd" ico="folder" c="mint" t={s.rFolder} val={folder?.name || s.noFolder} chev sel={S("fd")} onClick={() => open("fd")} />,
    ]],
  ].filter(Boolean);
  return (
    <>
      {order.map(([title, rows], i) => (
        <div key={title}>
          <Sec first={firstSec && i === 0}>{title}</Sec>
          <Group>{rows}</Group>
        </div>
      ))}
      <Sec>{""}</Sec>
      <Group>
        {p.owner ? <Row t={s.transfer} blue sel={S("tr")} onClick={() => open("tr")} /> : null}
        <Row t={s.leave} red onClick={() => deps.onLeave?.()} />
        {p.owner ? <Row t={s.del} red sel={S("del")} onClick={() => deps.onDelete?.()} /> : null}
      </Group>
    </>
  );
}

/** iPad left column (kit side()). */
export function HubSide({ sel }) {
  return (
    <>
      <Nav style={{ height: 18 }} />
      <Scroll><HubHero size={60} /><HubRows sel={sel} compact /></Scroll>
    </>
  );
}

/** iPhone hub root (03). */
export function RootPage() {
  const hub = useHub();
  const { s, server } = hub;
  const p = usePerms(server);
  return (
    <>
      <Nav right={<XBtn onClick={hub.close} label={s.close} />} />
      <Scroll>
        <HubHero />
        <div className="svh-pillrow" style={{ margin: "14px 0 2px" }}>
          <Act i="user" label={s.qInvite} onClick={() => hub.push({ id: "iv" })} disabled={!p.invites} />
          <Act i="bell" label={s.qNotif} onClick={() => hub.push({ id: "nt" })} />
          <Act i="plus" label={s.qAddChannel} onClick={() => hub.push({ id: "chCreate" })} disabled={!p.channels} />
          <Act i="search" label={s.qSearch} onClick={() => hub.push({ id: "search" })} />
        </div>
        <HubRows firstSec={false} />
      </Scroll>
    </>
  );
}

/** "Ara": channels and members of this server. */
export function SearchPage({ route }) {
  const hub = useHub();
  const { s, f, server, data, deps } = hub;
  const [q, setQ] = useState("");
  useEffect(() => { hub.load("members"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLocaleLowerCase("tr");
  const channels = (server?.channels || []).filter((c) => c.type !== "category" && (!needle || c.name.toLocaleLowerCase("tr").includes(needle))).slice(0, 30);
  const members = needle ? (data.members || []).filter((m) => [m.nickname, m.displayName, m.username].some((x) => x && String(x).toLocaleLowerCase("tr").includes(needle))).slice(0, 30) : [];
  return (
    <PageFrame route={route} title={s.qSearch}>
      <Field value={q} onChange={setQ} placeholder={f("searchInN", { n: server?.memberCount || data.members?.length || 1 })} icon="search" autoFocus style={{ margin: "2px 0 6px" }} />
      {channels.length ? <><Sec>{s.rChannels}</Sec><Group>{channels.map((c) => { const ic = channelIcon(c); return <Row key={c.id} ico={ic.n} c={ic.c} t={channelLabel(c)} chev onClick={() => { hub.close(); deps.onSelectChannel?.(c); }} />; })}</Group></> : null}
      {members.length ? <><Sec>{s.rMembers}</Sec><Group>{members.map((m) => <Row key={m.userId} av={<Av user={{ ...m, id: m.userId }} s={32} />} inset={58} t={memberName(m)} sub={`@${m.username}`} chev onClick={() => hub.push({ id: "member", userId: m.userId })} />)}</Group></> : null}
      {needle && !channels.length && !members.length ? <Foot>{s.noResults}</Foot> : null}
    </PageFrame>
  );
}
