/**
 * Liquid Glass navigation inventory (2.9.154, Stage 2).
 * With html.glass-ui on iPhone the NavigationRail column is hidden; every rail
 * action and every classic list-header action must still be reachable from the
 * glass shell (tab bar · toolbar avatar → status menu · bgroup · +).
 * Run: node frontend/src/components/layout/glass/navInventory.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const match = (src, re, msg) => assert.ok(re.test(src), msg);
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const navConfig = read("../navConfig.js");
const layout = read("../AppLayout.jsx");
const rail = read("../NavigationRail.jsx");
const shell = read("./GlassShell.jsx");
const sidebar = read("../ServerSidebar.jsx");
const servers = read("../../servers/ServersSidebar.jsx");
const activity = read("../../activity/ActivitySidebar.jsx");
const css = read("../../../styles/glass/shell.css");
const index = read("../../../styles/glass/index.css");

/* 1. Primary destinations: the glass tab bar is built from the same source as the rail. */
const mainIds = [...navConfig.matchAll(/\{ id: "([a-z]+)", icon: [A-Za-z]+, label: [^}]+group: "main" \}/g)].map((m) => m[1]);
assert.deepEqual(mainIds, ["chat", "groups", "servers", "play", "friends", "activity", "calls"], "rail main items (tab order)");
match(rail, /filterMainNavItems\(buildMainNavItems\(t\), publicFeatures\)/, "rail items");
match(layout, /filterMainNavItems\(buildMainNavItems\(t\), publicFeatures\)/, "glass tab bar items = rail items (LFG off hides Oyna)");
match(layout, /<GlassTabBar[\s\S]*?items=\{glassTabItems\}[\s\S]*?onSelect=\{handleViewChange\}/, "tabs navigate like the rail");
match(layout, /\.\.\.navBadges/, "tab badges reuse the rail badges");

/* 2. Rail tool actions: exactly add + settings (a new rail tool must get a glass equivalent here). */
const toolActions = [...navConfig.matchAll(/action: "([a-z]+)"/g)].map((m) => m[1]);
assert.deepEqual(toolActions, ["add", "settings"], "rail tool actions changed — add the glass equivalent and update this test");
// add → every glass list header has a + that opens the same add flow
match(sidebar, /plus=\{[\s\S]*?setShowAddModal\(true\)/, "Chats/Groups/Friends + opens the add modal");
match(activity, /plus=\{\{ icon: UserPlus, label: t\("Add friend"\), onClick: \(\) => onAddFriend\?\.\(\) \}\}/, "Activity + adds a friend");
match(servers, /id: "create"[\s\S]*?setShowCreate\(true\)/, "Servers + → Create server");
// settings → status menu "User Settings" (rail avatar menu, still mounted)
match(rail, /setStatusOpen\(false\);\s*onUserClick\?\.\(\);/, "status menu → Kullanıcı Ayarları");

/* 3. Rail avatar (status picker) → toolbar me-btn → same picker. */
match(layout, /<NavigationRail[\s\S]*?glass=\{glassShell\}/, "rail stays mounted (owns the picker) in glass");
match(shell, /dispatchEvent\(new CustomEvent\(GLASS_STATUS_EVENT\)\)/, "me-btn opens the picker");
match(rail, /addEventListener\(GLASS_STATUS_EVENT, open\)/, "rail listens for the glass me-btn");
for (const c of ["GlassListHeader", "GlassMeButton"]) match(shell, new RegExp(`export function ${c}`), c);
match(shell, /<GlassMeButton \/>/, "every list header has the me-btn");

/* 4. Admin entry (rail logo) → status menu item for admins. */
match(rail, /glass && isAdmin \?[\s\S]*?onAdminClick\?\.\(\)/, "admin panel reachable without the rail logo");

/* 5. Classic list-header actions all exist in the glass headers. */
for (const id of ["search", "announcements", "feedback", "invite"]) match(sidebar, new RegExp(`id: "${id}"`), `Chats/Groups/Friends: ${id}`);
match(sidebar, /setShowAnnouncements\(!showAnnouncements\)/, "announcements toggles the modal");
match(sidebar, /id: "refresh"[\s\S]*?glassShell\.onRefresh/, "Calls: refresh");
for (const id of ["create", "join", "folder", "reorder"]) match(servers, new RegExp(`id: "${id}"`), `Servers: ${id}`);
match(servers, /id: "reorder-done"/, "Servers: leave reorder mode");
for (const id of ["search", "feedback"]) match(activity, new RegExp(`id: "${id}"`), `Activity: ${id}`);

/* 6. Classic tree untouched when glass is off. */
match(layout, /\{!glassShell && showMobileTabBar && \(\s*<nav className="mobile-tab-bar"/, "classic tab bar unchanged");
match(sidebar, /\{glassShell \? \([\s\S]*?\) : \(\s*<>[\s\S]{0,60}?<div className="sidebar-header">/, "classic sidebar header unchanged");
match(layout, /const glassShell = Boolean\(glassUi && isMobile\)/, "shell only on the iPhone glass mobile layout");

/* 7. CSS: shell wired + scoped; hidden rail; keyboard; Stage 3 DM-header contract. */
match(index, /@import '\.\/shell\.css';/, "shell.css imported");
match(css, /\.app-root\.g-shell \.app-sidebar-shell > \.nav-rail \{\s*display: none !important;/, "rail column hidden only in the glass shell");
match(css, /html\.glass-ui\.kb-open \.g-tabbar/, "bar hidden with the keyboard");
match(css, /\.g-peer-name-text \{[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis;/, "Stage 3 peer name: one line + ellipsis");
match(css, /\.g-peer-name \.dsc-admin-badge--inline \.dsc-admin-badge-label \{\s*display: none;/, "Stage 3 admin badge: icon-only on narrow iPhones");
match(css, /\.g-peer \{\s*flex: 1 1 auto;\s*min-width: 0;/, "Stage 3 peer capsule can shrink");

console.log("navInventory.selftest ok");
