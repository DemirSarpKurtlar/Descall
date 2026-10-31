/** Long-form blog bodies keyed by slug. Keep unique; no keyword-spam clones. */

export const BLOG_BODIES = {
  "discord-vs-descall": {
    sections: [
      {
        h: "The short answer",
        p: "Pick Descall if your group mostly lives in DMs, a private server and nightly voice, and you want all of that for free. Keep Discord if your community depends on a large bot setup, public server discovery or a member base in the thousands. Plenty of people run both: Discord for the big public spaces they follow, Descall for the friends they actually call. The rest of this comparison walks through each area, so you can decide with your own group in mind instead of a feature checklist.",
      },
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
        h: "Pricing and what is free",
        p: "On Descall, chat, voice, video and screen share are free. There is an optional shop with cosmetic items such as profile banners, card colors, name effects, avatar effects and country flags. You pay for them with DesCoin that you earn inside the app, and none of them unlock call quality or core features. Discord pairs a free tier with a paid Nitro subscription that bundles extras on top. If subscription fatigue is the reason you searched for a Discord alternative, this is the clearest difference between the two.",
      },
      {
        h: "Platforms and access",
        p: "Descall runs as a Windows desktop app, on iPhone and iPad from the App Store, on Android through an APK, and in any modern browser at descall.com/app. Discord covers more desktop operating systems, so check that everyone in your group has a supported device before you move. Access matters too. Discord has been blocked in Turkey by court order since 9 October 2024, while Descall works there and has a full Turkish and English interface. For mixed groups with friends in Türkiye, that alone can settle the question.",
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
  "leave-nitro-keep-voice-chat": {
    sections: [
      {
        h: "Why groups end up paying for Nitro",
        p: "Most friend groups do not sit down and decide to subscribe. One person buys Nitro for a perk, another follows to match, and a year later several people are paying every month for a voice chat they could have for free. Nitro is a reasonable product if you use its extras. The question worth asking is whether your group uses them, or whether you mainly want to talk, share a screen and keep a running chat.",
      },
      {
        h: "Audit what your group actually uses",
        p: "Open your server and look at the last month honestly. Which channels had messages, who joined voice, how often did someone share a screen, and which paid perks did anyone notice? Most groups find the answer is short: a group chat, one or two voice rooms, the occasional stream and a lot of memes. Ask the people who pay, too, because they often cannot name a perk they used last week. That short list is your real requirement, and it is the only thing a replacement needs to match.",
      },
      {
        h: "What stays free on Descall",
        p: "Descall keeps the parts you use every night free. Direct messages, group chats, servers with roles and channels, one-on-one and group voice and video calls, server voice channels and screen share all cost nothing. Search over your whole message history, replies, reactions, polls, pinned messages and voice notes are included too. There is no paid tier that improves call quality or unlocks screen share. Group screen share starts at around 720p and about 20 frames per second, with presets if someone needs a lighter or sharper stream, and the same rules apply to everyone in the call.",
      },
      {
        h: "Where cosmetics fit",
        p: "If part of the fun of Nitro was a nicer profile, Descall has an optional shop for that. You can pick profile banners, card colors, name effects, avatar effects and country flags. They are paid with DesCoin, which you earn by using the app, not with a monthly subscription. Nothing in the shop changes how calls sound or what you can do in a server, so friends who never touch it miss nothing.",
      },
      {
        h: "Week one: move the evening call",
        p: "Do not try to move everything at once. Pick the one habit that matters most, usually the evening voice call, and run it on Descall for a week. Create accounts, add each other as friends and start a group call when people come online. Use screen share the way you normally would. Keep Discord open in the background so nobody feels cut off while the new habit forms.",
      },
      {
        h: "Week two: move the server",
        p: "Once the call feels normal, recreate your server. Start from a template, rename the channels to match what you had, set up two or three roles and send the invite code in your old group chat. Move pinned links and important notes by hand, since there is no tool that imports Discord history. By the end of the second week most groups notice that nobody has opened Discord for the call in days.",
      },
      {
        h: "What you give up, honestly",
        p: "Descall is smaller and newer than Discord. There is no bot marketplace, so a group that relies on a music bot or a custom moderation bot will miss it. There is no huge public server directory either, and your old message history stays on Discord. If those things are central to your group, keep a free Discord account for them and move only the private calls. Dropping the subscription does not require deleting anything.",
      },
      {
        h: "Getting the holdouts on board",
        p: "Every group has one person who will not install another app. Send them the web link, descall.com/app, so they can join the call from a browser in a minute. Friends on iPhone, iPad or Android can install the mobile app later, and the Windows app is there for long sessions. If someone in your group lives in Turkey, where Discord has been blocked by court order since 9 October 2024, Descall also removes the workarounds they may have needed.",
      },
      {
        h: "Cancel on your own schedule",
        p: "There is no need to cancel Nitro on day one. Let the current period run out while you test the move. When the renewal date comes, check whether anyone still opened Discord for the call that month. If not, cancel and keep the free account for the public servers you follow. Your voice nights stay the same, and nobody in the group is paying for them anymore.",
      },
    ],
  },
  "best-discord-alternatives-2026": {
    sections: [
      {
        h: "How we judged this shortlist",
        p: "We make Descall, so read this list with that in mind. To keep it useful, we judged every app on the same five questions. Are chat and calls free at the core? Does group voice hold up on ordinary home and mobile networks? Can you organize people into spaces with roles? Does it run on the devices your friends actually use? And can a real group switch to it within a week? Feature count was not a criterion, because a long list rarely predicts whether people will keep using an app.",
      },
      {
        h: "Descall: free voice, video and servers for friend groups",
        p: "Descall is the closest match if you want what most groups use Discord for, without a subscription. You get DMs, group chats, servers with roles and permissions, text, voice and stage channels, group voice and video calls and screen share with quality presets. It runs on Windows, iPhone and iPad, Android and the web, in Turkish and English, and it works in Turkey. Its limits are real: it is smaller and newer, has no bot marketplace and no big public server discovery. It fits friend groups, gaming squads and small to medium communities best.",
      },
      {
        h: "TeamSpeak: voice first, with your own server",
        p: "TeamSpeak has been a voice tool for a long time, and its core idea is still the same: a server you or a host run, with channels people drop into. Groups that care about controlling where their voice server lives like that model. The trade-off is that text chat, mobile use and social features are secondary to voice, and someone has to manage the server. It suits groups who mainly want an always-on voice room.",
      },
      {
        h: "Mumble: open source and lightweight",
        p: "Mumble is an open source voice chat app that you can self-host. It is light on resources and is known for low-latency voice, which is why it has stayed popular with technical groups. It does not try to be a social app, so you will not get the profiles, rich chat and media of Discord. If you have someone comfortable running a server and you only need voice, Mumble is a solid, free choice.",
      },
      {
        h: "Guilded and Revolt: community-style alternatives",
        p: "Guilded built its pitch around organized gaming communities, with tools for teams, events and structured servers. Revolt is an open source project with a layout that will feel familiar to Discord users. Both are worth a look if you want something close to the Discord model from a different provider. As with any smaller platform, Descall included, check the current state of the apps your friends would need before you move a whole community.",
      },
      {
        h: "Element and Matrix: decentralized and self-hostable",
        p: "Element is the best-known app for Matrix, an open, decentralized messaging protocol. You can use a public server or host your own, and rooms on different servers can talk to each other. Groups that care about running their own infrastructure often land here. The experience is more complex than a single hosted app, and voice and video work differently from Discord-style drop-in rooms, so test calls with your group first.",
      },
      {
        h: "Slack, Telegram, WhatsApp and Signal: great at other jobs",
        p: "These apps show up in many lists of Discord alternatives, but each one was built for a different job. Slack is designed for workplaces and organized around company workspaces. Telegram is strong at large broadcast channels and groups. WhatsApp is where many families and friends already text. Signal focuses on private messaging. All of them can carry a group chat, and some handle group calls, but none recreates the feel of servers with drop-in voice channels.",
      },
      {
        h: "Discord: when staying is the right answer",
        p: "Discord is still the default for large public communities. If your server runs on bots, depends on public discovery or has thousands of active members, moving is a big project with real costs. Many people keep Discord for those spaces and move only their private friend calls. That split is a fine outcome, and it is often the easiest way to try an alternative without pressure.",
      },
      {
        h: "Which one should you try first?",
        p: "If you want free chat, voice and servers for friends or a squad, start with Descall. If you only need an always-on voice room and have someone to run it, try TeamSpeak or Mumble. If self-hosting and an open protocol matter most, look at Element. If your community lives on bots and public discovery, stay on Discord and move only what makes sense. Whatever you pick, test it with your real group for a week before you call the move done.",
      },
    ],
  },
  "apps-like-discord": {
    sections: [
      {
        h: "What people mean by apps like Discord",
        p: "When someone asks for apps like Discord, they usually want three things together: a persistent chat that does not vanish, a shared space for a group, and voice they can drop into without scheduling a call. Some also want screen share and video. Very few apps combine all of these, which is why it helps to start from the job you need done rather than from a generic top ten list.",
      },
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
        h: "Websites like Discord: no install needed",
        p: "Not everyone wants to install an app to try something new. Descall runs fully in the browser at descall.com/app, including chat, calls and screen share in supported browsers. That makes it easy to test with a group before anyone commits. When people want a more permanent setup, they can move to the Windows desktop app, which is better for long sessions because a closed browser tab cannot end your call.",
      },
      {
        h: "Apps like Discord on your phone",
        p: "A Discord-style app has to work on phones, because that is where most messages are read. Descall is on the App Store for iPhone and iPad and available as an APK for Android. Voice notes help when typing is awkward, and you can join voice from your phone when you are away from your desk. Check that every platform in your group is covered before you move, since one friend left behind is often what ends a switch.",
      },
      {
        h: "Five questions before you pick",
        p: "Ask whether the core features you use are free or behind a subscription. Ask whether group voice works on your friends' real networks, including strict ones. Ask whether it runs on every device in your group. Ask whether you can organize people with roles and channels if you need to. And ask whether you could export your data or leave easily later. An app that passes all five is worth a one-week trial with your group. If it fails one, decide whether that gap matters for how you actually spend your time together.",
      },
      {
        h: "Where Descall fits, and where it does not",
        p: "Descall is an app like Discord for friend groups, gaming squads and small to medium communities. It is built in Türkiye with a full Turkish and English interface and works in Turkey, where Discord has been blocked by court order since 9 October 2024. It is smaller and newer, with no bot marketplace and no giant public server directory. If those are not what you use Discord for, it is a practical place to start.",
      },
    ],
  },
  "discord-competitors": {
    sections: [
      {
        h: "What it takes to compete with Discord",
        p: "Discord is hard to compete with head-on. It has a huge network of existing servers, a large bot ecosystem, public discovery, and years of work on its clients. A new app cannot match all of that at once. So the real Discord competitors in 2026 each pick a part of what Discord does and try to do that part better, cheaper or in a different way. Seeing the market as a set of segments makes it much easier to judge who actually competes for your group.",
      },
      {
        h: "Segment one: lighter apps for friends and squads",
        p: "These apps go after the private side of Discord: friend groups, gaming squads and small servers that mainly want chat and voice. They compete on simplicity, free core features and a calmer interface. Their bet is that most people never used the parts of Discord that make it heavy, and would trade them for an app that opens fast and asks for nothing. Descall sits here. It offers DMs, group chats, servers with roles, group voice and video calls and screen share without a subscription, and it adds full servers on top for groups that need structure.",
      },
      {
        h: "Segment two: community platforms",
        p: "Apps like Guilded and Revolt compete on the community side, offering servers and channels in a model that will feel familiar to Discord users. Guilded has focused on organized gaming communities, while Revolt is an open source project. They are the most direct like-for-like Discord competitors, so the useful questions are about maturity, mobile support and whether the people you want to bring along will join. A familiar layout lowers the cost of switching, but it does not move a community on its own.",
      },
      {
        h: "Segment three: voice-first classics",
        p: "TeamSpeak and Mumble were around long before Discord and still compete on one thing: voice. Both can run on a server you control, and Mumble is open source. They tend to win with groups that care about hosting their own voice server and do not need much text chat or social features. They compete with Discord for voice time, not for whole communities. For a group that already texts somewhere else and only needs a place to talk, that narrow focus can be exactly right.",
      },
      {
        h: "Segment four: open and decentralized networks",
        p: "Element, built on the open Matrix protocol, competes on ownership. You can host your own server, connect with rooms on other servers, and avoid depending on a single company. That appeals to technical communities and organizations. The trade-off is a more complex setup and a different feel from Discord's drop-in voice rooms. For a casual friend group the extra control is rarely worth the effort, but for a project that wants to own its data and history it can be the deciding factor.",
      },
      {
        h: "Overlap, not competition: messengers and work chat",
        p: "Slack, Telegram, WhatsApp and Signal are often named as Discord competitors, but they only overlap on some jobs. Slack is built for workplaces. Telegram is strong at broadcast channels and large groups. WhatsApp and Signal are personal messengers. Your group can use any of them for texting, yet none offers the server-plus-voice-channel structure that defines Discord, so they rarely replace it completely.",
      },
      {
        h: "Where Descall competes",
        p: "Descall competes directly with Discord for friend groups and small to medium communities. Its main arguments are free voice, video and screen share, servers with roles and permissions, server templates, search across the whole message history, and an interface in Turkish and English. It also works in Turkey, where Discord has been blocked by court order since 9 October 2024, which matters for any group with members there. Account security is covered with two-step verification and a data export, so you are not locked in.",
      },
      {
        h: "Where Descall does not compete",
        p: "Descall does not try to match Discord's bot marketplace or its public server discovery, and it is not built for servers with very large audiences. Its desktop app is for Windows; on other computers you use the web app. If your community depends on those things, Discord is still the better tool, and saying so plainly is more useful than pretending otherwise.",
      },
      {
        h: "How to judge any Discord competitor",
        p: "Start with your must-haves, such as voice quality, servers, mobile apps or self-hosting. Check whether those features are free. Look for signs that the app is actively maintained and that you can protect accounts with two-step verification and export your data. Then run a real test: use it with your actual group for seven nights. The competitor worth keeping is the one people open without being reminded.",
      },
    ],
  },
  "discord-alternative-for-communities-guide": {
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
  "voice-chat-alternative-to-discord": {
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
        p: "If someone sounds choppy, check their connection first; a busy Wi-Fi network is the usual culprit, and a cable or a closer router often fixes it. If there is echo, find the person without headphones. If screen share lags, lower the preset. If a friend cannot connect at all, try the desktop or mobile app instead of the browser. And if Discord does not work for you because you are in Turkey, where it has been blocked by court order since 9 October 2024, Descall works there without extra steps.",
      },
    ],
  },
  "migrate-from-discord-to-descall": {
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
        p: "Be honest about what Descall does not replace. It has no bot marketplace, so a bot-heavy setup will need a rethink or can stay on Discord. It has no big public server directory, so public servers you follow stay where they are. Many groups keep a free Discord account for those and use Descall for their own server and calls. If your members are in Turkey, where Discord has been blocked by court order since 9 October 2024, the new home also removes the workarounds they needed.",
      },
    ],
  },
};
