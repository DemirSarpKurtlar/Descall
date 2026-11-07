/**
 * Sections of the five blog posts merged into stronger pages in Nov 2026 (see
 * seo/mergedPages.js). Each kept page shows them after its own copy, so no guidance was
 * lost with the 301. The English strings are the ones the posts had, so the existing
 * translations in src/site/i18n/<id>.js still apply.
 *
 * Kept out of seo/pageExtras.js on purpose: that module ships with every marketing page,
 * this one only with the pages that render it (DiscordAlternativeNichePage,
 * CompareDiscordPage) and with the prerender.
 */
import { PREFIXABLE_LOCALES, prefixedLocaleFromPath, stripPrefixedLocale } from "../siteLocales.js";

/** Kept English page -> { from: old post slug, sections: [{ h, p }] }. */
export const MERGED_GUIDES = {
  "/compare/discord": {
    from: "discord-vs-descall",
    sections: [
      {
        h: "Who each app is built for",
        p: "Discord grew into a general platform for communities of every size, from a handful of friends to servers with huge public audiences. That breadth is its strength, and it is also why the app can feel crowded when you only need a place to talk. Descall is smaller and newer. It is built by Demir Sarp Kurtlar in Türkiye and focuses on friend groups, gaming squads and small to medium communities. It does not try to be a discovery platform for millions of public servers.",
      },
      {
        h: "Text chat and direct messages",
        p: "On the everyday basics the two apps are close. Descall has direct messages, group chats, replies, reactions, pinned messages, polls, voice notes and slash commands. Search covers your whole message history, so an old link or decision is one query away instead of a long scroll. Discord's chat is mature and familiar to almost everyone. If your group's main complaint is clutter rather than missing features, a simpler layout is the difference you will notice first.",
      },
      {
        h: "Servers, roles and permissions",
        p: "Descall servers have roles, permissions, categories, and text, voice and stage channels. A channel can follow its category's permissions or use its own, which is the model Discord admins already know. Server templates give you a ready structure in a minute, and an owner who steps back can transfer ownership instead of deleting the server. Discord still goes deeper for very large servers, especially combined with its bot ecosystem for automated moderation, logging and onboarding. For a server of a few dozen to a few hundred people, Descall covers what most admins touch in a normal week.",
      },
      {
        h: "Voice, video and screen share",
        p: "Both apps offer one-on-one and group voice and video calls, server voice channels and screen share. Descall runs calls over WebRTC, adds a TURN relay for strict networks such as some school, dorm or mobile connections, and includes noise suppression. Screen share has quality presets, and group calls default to around 720p at about 20 frames per second so the stream stays smooth for everyone watching. Discord has years of tuning at very large scale and is the safer bet for big public events. For a squad call or a movie night with friends, Descall is built for exactly that size.",
      },
      {
        h: "Platforms and access",
        p: "Descall runs as a Windows desktop app, on iPhone and iPad from the App Store, on Android through an APK, and in any modern browser at descall.com/app. Discord covers more desktop operating systems, so check that everyone in your group has a supported device before you move. Access matters too. Public reports say Discord was blocked in Türkiye by a court order on 9 October 2024; we do not test this ourselves and it may have changed, so check the dated sources on our Turkish page “Discord açıldı mı?”. Descall works there and has a full Turkish and English interface. For mixed groups with friends in Türkiye, that can settle the question.",
      },
      {
        h: "Account security",
        p: "Descall supports two-step verification with an authenticator app or e-mail codes, an account security page, and a data export so you can download a copy of your account data. Discord also offers two-factor authentication and data requests. Whichever app you choose, make two-step verification a rule for anyone who owns or moderates a server, because those accounts are the ones worth stealing.",
      },
      {
        h: "How to decide in one evening",
        p: "Write down the three things your group does most, for example DMs, a private server and voice nights. Then list anything you cannot lose, such as a specific bot or a public server with thousands of members. If the second list is empty, run your next voice night on Descall and see how it feels. If it is not empty, keep Discord for those pieces and use Descall where it fits. You do not have to pick one app forever on day one.",
      },
    ],
  },
  "/apps-like-discord": {
    from: "apps-like-discord",
    sections: [
      {
        h: "Job one: a hangout for your friend group",
        p: "If your group mainly texts during the day and calls at night, you need good DMs, a group chat, presence so you can see who is around, and easy group calls. Descall is built around this case. You get direct messages, group chats, custom status, voice and video calls and screen share, all free. Messengers like WhatsApp or Telegram can carry the texting, but they do not give you the always-there server and voice room that made Discord feel like a hangout.",
      },
      {
        h: "Job two: a home for a community",
        p: "A community needs structure: channels for different topics, roles that decide who can do what, and a way to invite new members. Descall servers have roles, permissions, categories and text, voice and stage channels, plus templates to get started fast. That covers small to medium communities well. For very large public communities that depend on bots or public discovery, Discord is still the stronger choice, and open source options like Revolt or Element are worth a look if you want to self-host.",
      },
      {
        h: "Job three: a voice room that is always on",
        p: "Some groups barely use text and just want a room to talk in while they play or work. Classic voice tools like TeamSpeak and Mumble do this well, especially if someone in the group is happy to run a server. Descall server voice channels cover the same habit without hosting anything yourself: members join the channel when they are free and leave when they are done, with text channels right next to it.",
      },
      {
        h: "Job four: study and project groups",
        p: "For a workplace, Slack is designed for that environment and fits company tools. For a study group or a side project with friends, the needs are simpler: a shared chat, a place to pin resources, and a call with screen share when you work through something together. Descall handles that with pinned messages, search over the whole history, and screen share with quality presets so a document or code stays readable.",
      },
      {
        h: "Apps like Discord on your phone",
        p: "A Discord-style app has to work on phones, because that is where most messages are read. Descall is on the App Store for iPhone and iPad and available as an APK for Android. Voice notes help when typing is awkward, and you can join voice from your phone when you are away from your desk. Check that every platform in your group is covered before you move, since one friend left behind is often what ends a switch.",
      },
      {
        h: "Five questions before you pick",
        p: "Ask whether the core features you use are free or behind a subscription. Ask whether group voice works on your friends' real networks, including strict ones. Ask whether it runs on every device in your group. Ask whether you can organize people with roles and channels if you need to. And ask whether you could export your data or leave easily later. An app that passes all five is worth a one-week trial with your group. If it fails one, decide whether that gap matters for how you actually spend your time together.",
      },
    ],
  },
  "/discord-alternative-for-voice-chat": {
    from: "voice-chat-alternative-to-discord",
    sections: [
      {
        h: "Why voice decides whether a switch sticks",
        p: "Groups forgive a lot in a new chat app, but not bad voice. If the first call drops, echoes or lags, people go back to what they had. That is why a voice chat alternative to Discord has to get the call right before anything else. The good news is that most voice problems come from a few causes you can check, and the right app handles the hard ones for you.",
      },
      {
        h: "Calls versus voice channels",
        p: "There are two ways to talk on Descall. Calls are what you start from a DM or a group chat: one-on-one or group voice and video that rings the other people. Voice channels live inside a server: a room people join when they are free and leave when they are done, without anyone calling anyone. Most groups use both, calls for quick check-ins and a voice channel for the evening hangout. Video and screen share work in both, so you never have to move to a different tool halfway through a conversation.",
      },
      {
        h: "What happens on difficult networks",
        p: "Descall uses WebRTC, the same real-time technology used by many browser-based call tools. On most home networks, calls connect without any extra help. Some networks, such as school, dorm, office or certain mobile connections, block those direct paths. For those cases Descall uses a TURN relay that carries the call through a server instead, so the friend on a strict network can still join.",
      },
      {
        h: "Noise suppression and your setup",
        p: "Descall includes noise suppression to cut background sounds like fans, keyboards and traffic. It helps a lot, but your setup still matters. A headset or earphones stop your speakers from feeding back into your microphone, which is the most common cause of echo. Keep the mic a few centimeters from your mouth, and if one person keeps sounding distant, check which input device the app is using.",
      },
      {
        h: "Screen share that stays smooth",
        p: "Screen share is part of most voice nights, whether you are watching a match, reviewing a build or going through notes. Descall offers quality presets, and group calls default to around 720p at about 20 frames per second. That keeps the stream smooth for every viewer without asking too much of the sharer's connection. If your upload is weak, pick a lower preset rather than letting the whole stream stutter.",
      },
      {
        h: "Use the desktop app for long sessions",
        p: "The web app at descall.com/app is the fastest way to join, but for long evenings the Windows desktop app is more reliable. You cannot close a call by accident with a stray browser tab, and the app stays out of the way while you do other things. Friends on the go can join from the iPhone, iPad or Android app and switch back to desktop later.",
      },
      {
        h: "Voice-only tools compared",
        p: "TeamSpeak and Mumble are long-standing voice tools, and both can run on a server you control. They are a good fit if your group wants nothing but voice and has someone happy to host. The trade-off is less text chat, fewer social features and a server to maintain. Descall keeps voice, text chat, DMs and screen share in one free app, so you do not have to juggle a voice tool next to a separate messenger.",
      },
      {
        h: "A checklist for your first voice night",
        p: "Ask everyone to create an account and add each other as friends before the night. Set up a server with one voice channel and one text channel, or simply start a group call. Have each person test their microphone and headset in a short call first. Try one screen share at the default preset. If someone is on a strict network, let them join first so you know the relay works before the whole group arrives.",
      },
      {
        h: "When voice still feels off",
        p: "If someone sounds choppy, check their connection first; a busy Wi-Fi network is the usual culprit, and a cable or a closer router often fixes it. If there is echo, find the person without headphones. If screen share lags, lower the preset. If a friend cannot connect at all, try the desktop or mobile app instead of the browser. And if Discord does not work for you in Türkiye, where public reports describe a court-ordered block since 9 October 2024 (our Turkish page “Discord açıldı mı?” collects the dated sources, and the situation may have changed), Descall works there without extra steps.",
      },
    ],
  },
  "/discord-alternative-for-communities": {
    from: "discord-alternative-for-communities-guide",
    sections: [
      {
        h: "Most communities are smaller than you think",
        p: "When people hear community, they picture a server with tens of thousands of members. Most real communities are much smaller: a class, a club, a team, a creator's inner circle or a regular group of players. These spaces need structure and voice, but not the full machinery of a mega-server. That makes them good candidates for a lighter Discord alternative, as long as the basics of running a community are covered.",
      },
      {
        h: "Decide what your community needs to do",
        p: "Before you choose a platform, write down what happens in your community each week. Maybe you post announcements, run voice hangouts, host a monthly event, share resources and welcome new members. Each of those jobs needs a channel, a role or a feature. This list keeps you from rebuilding every channel you had on Discord, including the ones nobody used. It also tells you early whether anything on it depends on a bot, which is the one area where a lighter alternative will ask you to change how you work.",
      },
      {
        h: "Plan the structure with categories and channels",
        p: "Descall servers use categories to group channels, with text, voice and stage channels inside. A simple layout works for most communities: an information category with rules and announcements, a general category for everyday chat, a voice category for hangouts, and one or two topic areas. Start small. It is easier to add a channel when people ask for it than to clean up twenty empty ones later. Fewer channels also mean conversations stay in one place, which makes a small community feel busier and friendlier to newcomers.",
      },
      {
        h: "Roles and permissions that stay manageable",
        p: "Roles decide who can see, post, manage channels or moderate. Descall follows the model Discord admins know: a channel can use its category's permissions or set its own, and when several roles apply, an allow from any of them wins over a deny. Keep the number of roles low, for example owner, moderators, members and maybe a role for new arrivals. Give each role only what it needs, and test what a regular member can see before you open the doors.",
      },
      {
        h: "Start from a server template",
        p: "Server templates give you a ready layout with channels and roles in place, so you are not building from a blank screen. Pick the one closest to your community, then rename and remove what does not fit. This turns a long setup evening into a few minutes, and it gives you a sensible starting point for permissions that you can adjust as you learn how your members use the space.",
      },
      {
        h: "Invites and growing on purpose",
        p: "Descall does not have a huge public server directory like Discord. Your community grows through the invite codes you share: on your social profiles, in a newsletter, in a class group or with friends. For most small communities that is a feature. Members arrive because someone invited them, which keeps the tone closer to what you intended and reduces drive-by spam.",
      },
      {
        h: "Events with voice and stage channels",
        p: "Voice channels are where a community feels alive. Members drop in when they are free, and the channel list shows who is talking. For a talk, a Q and A or an announcement, a stage channel lets a few people speak while everyone else listens. Pair it with a text channel for questions and a poll to pick the next topic, and you have a simple event format that needs no extra tools.",
      },
      {
        h: "Moderation without a bot army",
        p: "Without a bot marketplace, moderation on Descall relies on good structure and people. Use roles to limit who can post in announcement channels, give moderators the permissions to remove messages, time out, kick or ban, and keep rules pinned where everyone sees them. Ask every moderator to turn on two-step verification with an authenticator app or e-mail codes. If you need complex automated moderation on day one, Discord with its bots will fit better.",
      },
      {
        h: "When to stay on Discord, and when to hand over",
        p: "Stay on Discord if public discovery, a large bot setup or a very big member base are central to your community. Many communities run a hybrid: a public Discord for reach and a Descall server for the core group. And if you ever step back from running your Descall server, transfer ownership to someone you trust instead of deleting it, so the community keeps its home.",
      },
    ],
  },
  "/discord-replacement": {
    from: "migrate-from-discord-to-descall",
    sections: [
      {
        h: "Before you start: take stock",
        p: "A migration goes faster when you know exactly what you are moving. Open your Discord server and list the channels people used in the last month, the roles you rely on, the links and notes that are pinned, and the voice habits your group has. Mark anything that depends on a bot. That list is your checklist for the next few days, and anything not on it can stay behind. Pick a target date for the first voice night on Descall too, so the move has a clear start instead of drifting.",
      },
      {
        h: "Day 1: create accounts and turn on security",
        p: "Register on Descall first, so you can set things up before inviting anyone. If you will own the server, turn on two-step verification right away with an authenticator app or e-mail codes, and ask your moderators to do the same. Install the Windows desktop app if you want, or use the web app at descall.com/app. Friends on phones can use the iPhone and iPad app or the Android APK.",
      },
      {
        h: "Day 1: invite your core group",
        p: "Start with the people who show up every week, not the whole member list. Send them a friend invite or the link to sign up, and post a short message on Discord explaining why you are trying Descall and for how long. Keep Discord open as a safety net for at least a week. Migrations fail when people feel stranded, not when the new app is missing a feature. A small, active group that arrives first also makes the new server feel lived in when everyone else shows up.",
      },
      {
        h: "Day 2: rebuild the server from a template",
        p: "Create your server from a template that is close to what you had, so the basic channels and roles appear ready. Then shape it with your checklist: rename channels, delete what you do not need and add categories for your topics. Add text, voice and stage channels as needed. Resist the urge to copy every channel from Discord; the ones nobody opened last month can wait.",
      },
      {
        h: "Day 2: map roles and permissions",
        p: "Recreate your roles in the order they matter, starting with moderators and members. Descall permissions work much like Discord's: a channel can follow its category's rules or use its own. Set permissions on the category first and only override a channel when you need to. Then check the server from a regular member's point of view, so private channels stay private before you share the invite code.",
      },
      {
        h: "Day 3: move the voice night",
        p: "The voice habit is what holds a group together, so move it early. Pick your usual evening, post the invite code in your Discord chat, and run the whole session on Descall: voice channel, chat next to it and screen share if you normally stream. Group screen share defaults to around 720p at about 20 frames per second, with presets if someone needs a lighter stream. One good night does more than any announcement.",
      },
      {
        h: "What happens to your Discord history",
        p: "There is no tool that imports Discord message history into Descall today. Your old messages stay on Discord, where you can still read them. Before you move, copy the important pieces by hand: rules, key links, guides and decisions. Pin them in the right Descall channels. From then on, search on Descall covers your whole message history, so new knowledge is easy to find.",
      },
      {
        h: "Week two: make Descall the default",
        p: "Once the core group is settled, invite everyone else with the server invite code. Post a pinned message in your Discord server pointing to the new home, and consider making old channels read-only so conversations move. Use a poll on Descall to settle open questions like channel names or event times. By the end of the second week, most friend groups and squads have stopped opening Discord for daily chat.",
      },
      {
        h: "What stays on Discord",
        p: "Be honest about what Descall does not replace. It has no bot marketplace, so a bot-heavy setup will need a rethink or can stay on Discord. It has no big public server directory, so public servers you follow stay where they are. Many groups keep a free Discord account for those and use Descall for their own server and calls. If your members are in Türkiye, where public reports describe Discord as blocked by a court order since 9 October 2024 (it may have changed; the dated sources are on our Turkish page “Discord açıldı mı?”), the new home also removes the workarounds they may have needed.",
      },
    ],
  },
};

/**
 * Sections of a route in its language: English for the English page, translated through
 * `text(s, locale)` for its /<prefix> twin, null for any other page (Turkish included).
 */
export function localizedMergedGuide(routePath, text = (s) => s) {
  const loc = prefixedLocaleFromPath(routePath, PREFIXABLE_LOCALES);
  const bare = loc ? stripPrefixedLocale(routePath, [loc]) : routePath;
  const guide = MERGED_GUIDES[bare];
  if (!guide) return null;
  return guide.sections.map((s) => ({ h: loc ? text(s.h, loc) : s.h, p: loc ? text(s.p, loc) : s.p }));
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Prerendered HTML of the merged sections ("" when the route has none). */
export function mergedGuideHtml(routePath, text) {
  const sections = localizedMergedGuide(routePath, text);
  if (!sections) return "";
  return `<section class="seo-extra">${sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join("\n")}</section>`;
}
