/* Route registry for the server hub: page component, nav title, iPhone medium height, iPad size. */
import { HubSide, RootPage, SearchPage } from "./pagesHub";
import { TextPage, PickPage } from "./hubCore";
import { OverviewPage, CommunityPage, RulesPage, NotificationsPage, FolderPage } from "./pagesGeneral";
import {
  ChannelsPage, ChannelCreatePage, CategoryCreatePage, ChannelEditPage, AccessPage, AccessSide, PermPage, AddTargetPage, findChannel,
} from "./pagesChannels";
import {
  MembersPage, MembersSide, MemberPage, MemberRolesPage, RolesPage, RolesSide, RoleEditPage, RoleMembersPage, TransferPage, TransferConfirmPage,
} from "./pagesPeople";
import { InvitePage, InviteDetailPage, ModerationPage } from "./pagesMisc";
import { channelLabel, memberName } from "./hubData";

const roleTitle = (id, ctx) => {
  if (id === "new") return ctx.s.newRole;
  const r = (ctx.data.roles || []).find((x) => String(x.id) === String(id));
  return r ? (r.isEveryone ? "@everyone" : r.name) : ctx.s.rRoles;
};
const defaultRole = (ctx) => {
  const custom = (ctx.data.roles || []).filter((r) => !r.isEveryone).sort((a, b) => (Number(b.position) || 0) - (Number(a.position) || 0));
  return (custom[0] || (ctx.data.roles || [])[0])?.id;
};
const memberTitle = (id, ctx) => {
  const m = (ctx.data.members || []).find((x) => String(x.userId) === String(id));
  return m ? memberName(m) : ctx.s.rMembers;
};

export const ROUTES = {
  root: { Page: RootPage, title: "" },
  search: { Page: SearchPage, title: (r, c) => c.s.qSearch },
  ov: { Page: OverviewPage, title: (r, c) => c.s.rOverview },
  ch: { Page: ChannelsPage, title: (r, c) => c.s.rChannels },
  chCreate: { Page: ChannelCreatePage, title: (r, c) => c.s.createChannel },
  catCreate: { Page: CategoryCreatePage, title: (r, c) => c.s.createCategory, medium: (r) => (r.standalone ? 400 : null), size: (r) => (r.standalone ? { w: 540, h: 400 } : { w: 940, h: 740 }), noSide: (r) => Boolean(r.standalone) },
  chEdit: { Page: ChannelEditPage, title: (r, c) => channelLabel(findChannel(c.server, r.channelId)) },
  access: { Page: AccessPage, title: (r, c) => channelLabel(findChannel(c.server, r.channelId)) },
  perm: { Page: PermPage, title: (r, c) => (r.targetType === "member" ? memberTitle(r.targetId, c) : roleTitle(r.targetId, c)) },
  addTarget: { Page: AddTargetPage, title: (r, c) => c.s.addRoleOrMember },
  cm: { Page: CommunityPage, title: (r, c) => c.s.rCommunity },
  ru: { Page: RulesPage, title: (r, c) => c.s.rRules },
  mb: { Page: MembersPage, title: (r, c) => (c.tablet ? memberTitle(r.sel, c) : c.s.rMembers), size: () => ({ w: 940, h: 760 }) },
  member: { Page: MemberPage, title: (r, c) => memberTitle(r.userId, c), size: () => ({ w: 940, h: 760 }) },
  memberRoles: { Page: MemberRolesPage, title: (r, c) => c.s.roles },
  rl: { Page: RolesPage, title: (r, c) => (c.tablet ? roleTitle(r.sel || defaultRole(c), c) : c.s.rRoles), size: () => ({ w: 980, h: 740 }) },
  role: { Page: RoleEditPage, title: (r, c) => roleTitle(r.roleId, c) },
  roleMembers: { Page: RoleMembersPage, title: (r, c) => c.s.rMembers },
  iv: { Page: InvitePage, title: (r, c) => c.s.inviteTitle },
  inviteDetail: { Page: InviteDetailPage, title: (r) => r.code },
  mod: { Page: ModerationPage, title: (r, c) => c.s.moderation },
  nt: { Page: NotificationsPage, title: (r, c) => c.s.rNotif },
  fd: { Page: FolderPage, title: (r, c) => c.s.rFolder },
  tr: { Page: TransferPage, title: (r, c) => c.s.transfer },
  trConfirm: { Page: TransferConfirmPage, title: (r, c) => c.s.transferConfirm },
  text: { Page: TextPage, title: (r) => r.title || "" },
  pick: { Page: PickPage, title: (r) => r.title || "" },
};

/** iPad routes whose left column is their own list instead of the hub list. */
export const SPLIT_ROUTES = {
  rl: { Side: RolesSide },
  mb: { Side: MembersSide },
  access: { Side: AccessSide },
};

const SECTION = {
  ov: "ov", ch: "ch", chCreate: "ch", catCreate: "ch", chEdit: "ch", access: "ch", perm: "ch", addTarget: "ch",
  cm: "cm", ru: "ru", mb: "mb", member: "mb", memberRoles: "mb", rl: "rl", role: "rl", roleMembers: "rl",
  iv: "iv", inviteDetail: "iv", nt: "nt", fd: "fd", tr: "tr", trConfirm: "tr",
};

/** Which hub row is highlighted on iPad: the nearest route in the stack that belongs to a section. */
export function sectionOf(stack, top) {
  const list = [...(stack || [])].reverse();
  if (top && !list.includes(top)) list.unshift(top);
  for (const r of list) {
    if (r.id === "mod") return r.tab === "audit" ? "au" : "bn";
    if (SECTION[r.id]) return SECTION[r.id];
  }
  return null;
}

export { HubSide };
