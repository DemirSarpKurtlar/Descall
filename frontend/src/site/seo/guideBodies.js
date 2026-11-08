/**
 * How-to guides added in Nov 2026 (second content round): long-form bodies for the
 * posts in content/discordSeoContent.js BLOG_POSTS, merged into BLOG_BODIES by
 * seo/blogBodies.js. Turkish versions live in seo/trGuideBodies.js; the prefixed
 * languages translate these strings through the site catalog (scripts/site-i18n.mjs).
 *
 * Only describe what the app ships (checked against the code on 2026-11-07):
 * screen share quality panel (src/components/voice/ScreenShareQualityPanel.jsx,
 * src/lib/webrtcScreenShare.js), voice settings (src/components/layout/UserPanel.jsx,
 * src/lib/noiseSuppression.js), server templates (backend/lib/serverTemplates.js),
 * messaging options (src/i18n/locales/msg4.en.js, msg5.en.js), data export
 * (src/components/settings/DataExportCard.jsx) and the Descall+ / Ultra keys
 * (src/premium/features.js). No statistics, testimonials, prices or game titles.
 */

export const GUIDE_BODIES = {
  "screen-share-with-friends": {
    sections: [
      {
        h: "Where you can share your screen",
        p: "On Descall you can share your screen in three places: a one-to-one call started from a DM, a group call in a group chat, and a voice channel on a server. It is the same feature in all three, it is free, and nobody needs a membership to share or to watch. In a DM call it is just the two of you, so Descall starts the share at a higher quality. You share from the Windows app or from a browser on a computer. The iPhone and iPad app can watch other people's shares, but it cannot share your own screen.",
      },
      {
        h: "Start a share in a few clicks",
        p: "Join the call or the voice channel first, then press the screen share button in the call controls. A picker asks what to show: a whole screen, a single window or, in a browser, one tab. Before you go live, the quality panel opens so you can choose how the share should look. Press share, and everyone in the call can watch. To end it, press the same button again. If you change the quality while you are live, Descall restarts the share for a moment with the new settings, so there is no need to stop and start it by hand.",
      },
      {
        h: "Pick what you are sharing, not a number",
        p: "The quality panel starts with a plain question: what are you sharing? You can pick Games, video, Apps, or Text, code. Each choice sets a sensible starting resolution and frame rate, and tells the video encoder whether smooth motion or sharp detail matters more. Two rows below let you fine-tune it: resolution (480p, 720p, 1080p or 1440p) and frame rate (15, 20, 30 or 60 frames per second). The panel also shows a rough bitrate estimate, which is a good hint for how much upload speed the share will use.",
      },
      {
        h: "Settings that work in a group call",
        p: "In a group call, each person who watches receives the stream, so your upload has to carry more as the group grows. That is why Descall starts group shares at 720p and 20 frames per second, and shows a warning if you push resolution or frame rate higher in a busy call. Sixty frames per second is meant for one-to-one calls. If friends say the picture stutters, lower the resolution first and the frame rate second. For slides, documents or code, choose Text, code: sharp letters matter more than motion there, and 15 frames per second is plenty for a presentation.",
      },
      {
        h: "Sharing sound along with the picture",
        p: "In the Windows app, the sound of what you share goes out together with the picture, so friends can hear the clip or video you are showing. Descall leaves its own playback out of that sound, which means nobody hears the call echoed back to them. In a browser, whether sound is shared depends on the browser and on what you pick in its sharing dialog. Viewers stay in control too: in a server voice channel, open the menu on the person who is sharing and set the screen share volume separately from their voice, anywhere from silent to twice as loud.",
      },
      {
        h: "Share a window, not your whole screen",
        p: "A whole-screen share shows everything: pop-up notifications, other chats, a password manager or a tab you forgot about. When you only need to show one thing, pick that window or tab instead. It keeps the share private. Before you press share, close anything you would not want on a big screen in front of your friends. When you are done, stop the share straight away instead of leaving it running in the background.",
      },
      {
        h: "Ideas that work well",
        p: "Screen sharing is more than showing a game. Friends use it to walk someone through a settings menu, review a clip from last night, practise a presentation before class, solve homework together, plan a trip on a map, or look at a design and argue about colours. In a server voice channel, friends can drop in and out while you keep sharing. For a study session, one person can share notes while the rest follow along and ask questions in the channel chat.",
      },
      {
        h: "When the share stutters or freezes",
        p: "Most problems come from upload speed, not from the app. Lower the resolution or frame rate first. If you are on Wi-Fi, a cable or a spot closer to the router often helps. If only one viewer has trouble, the problem is usually their connection, and the others will still see a clean picture. A browser can slow down background tabs, so for long sessions the Windows app is the steadier choice. Calls use relay servers when a network blocks a direct connection, so even strict home or school networks can usually join.",
      },
      {
        h: "What it costs",
        p: "Nothing. Screen sharing, with sound in the Windows app, is part of the free app for everyone, in DMs, group calls and server voice channels. Descall also has two optional memberships, Descall+ and Descall Ultra, with extra tools that are mostly for the desktop app; Ultra, for example, adds an extra control for the level of the shared sound. You do not need either to share your screen. For now, memberships are given out by the Descall team and through codes, and no prices have been published.",
      },
    ],
  },

  "online-study-group-voice-chat": {
    sections: [
      {
        h: "Why a study group needs more than a group chat",
        p: "A group chat is great for a quick question, but it gets messy as soon as a study group gets serious. Exam dates, links and good explanations disappear under memes, and there is no obvious place to work together. A server fixes both problems. You get separate channels for subjects and resources, a pinned spot for deadlines, and voice rooms that stay open, so anyone can join a session without starting a call or waiting for the others to pick up.",
      },
      {
        h: "Start from the Study & campus template",
        p: "When you create a server on Descall, pick the Study & campus template. It sets up the whole structure in one go. The Campus category has announcements, rules and introductions. The Study category has general, homework-help, resources and accountability channels, with slowmode on the busy ones. Focus voice holds the voice rooms Silent Focus, Pomodoro Room, Group Project A and B, and an Office Hours stage channel. There is also a staff room for mentors and moderators. Roles come ready: Admin, Moderator, Mentor, Study Buddy and Student. The channel names are in English, and you can rename all of them.",
      },
      {
        h: "Keep the channel list short",
        p: "A template gives you more than a small group needs, and that is fine: delete what you will not use. For four to eight people, one channel per course, one resources channel and one or two voice rooms are usually enough. Pin the messages people look for again and again, such as exam dates, the reading list and the shared notes. Descall can search your whole message history, so a good explanation from three weeks ago is still easy to find.",
      },
      {
        h: "Pick a session format",
        p: "Groups that last usually settle on a simple format. In a silent focus session, everyone joins the voice room muted, works on their own and only talks during breaks; seeing who is in the room is often motivation enough. A Pomodoro session works in blocks, for example twenty-five minutes of work and a five-minute break, with someone keeping time. In an explain-it-back session, one person shares their screen and teaches a topic to the others, which is one of the best ways to find out what you have not understood yet. For a mentor-led question round, use the Office Hours stage channel, where a few people speak and everyone else listens.",
      },
      {
        h: "Share notes and solve problems on screen",
        p: "Screen sharing turns a voice room into a study table. When you share slides, a PDF or code, choose Text, code in the quality panel so letters stay sharp; fifteen frames per second is plenty. Others can follow along, ask questions in the channel chat and take their own notes. For handwritten work, a photo in the homework-help channel is often quicker than describing it. Voice messages work for explanations that are easier to say than to type.",
      },
      {
        h: "Plan sessions without endless back-and-forth",
        p: "Finding a time that suits everyone is where many study groups give up. Use a poll in the announcements channel and let the group vote instead of arguing in the chat. Once a time is set, write a reminder and schedule it: on Descall you can schedule a message up to a year ahead, so the reminder for the evening before an exam can be written today and sent automatically. In the template, mentors can mention the whole group when it matters; to keep pings rare, @everyone and @here only work for the owner, admins and roles that have that permission, and only once a minute per channel.",
      },
      {
        h: "Cut distractions without leaving",
        p: "A study server should not become another source of notifications. Each chat has its own notification setting, so you can choose All messages, Only @mentions or Nothing, and mute a chat for anywhere from an hour to a week. Set your status to Do Not Disturb while you work. If you study in a noisy room, turn on AI noise suppression in the voice settings to cut keyboard and fan noise, and in the desktop app you can use push-to-talk so the microphone only opens while you hold a key.",
      },
      {
        h: "Ground rules that keep a group alive",
        p: "The rules channel is not just for big communities. Three or four lines are enough: keep focus rooms quiet, no exam leaks or cheating, credit people when you share their notes, and use the subject channels for questions. You can ask new members to accept the server rules before they take part. Agree on a regular slot, even a short one, because a fixed weekly session survives busy weeks far better than a group that only meets when someone happens to suggest it.",
      },
      {
        h: "Free, and on the devices students already have",
        p: "Everything in this guide is free on Descall: servers, templates, voice rooms, screen share, polls and scheduled messages. You can join from a browser at descall.com/app, which is useful on a school computer where you cannot install software, or use the Windows app, the iPhone and iPad app or the Android app. Descall accounts are for people aged 13 and over, and under-18s need a parent's or guardian's permission. If your group is small and you only need calls, a group chat with up to 15 members and a group call may be all you need.",
      },
    ],
  },

  "better-mic-sound-voice-chat": {
    sections: [
      {
        h: "Start with headphones",
        p: "Most bad voice chat comes down to one thing: speakers. When you use speakers, your microphone picks up the voices of your friends and sends them straight back, so everyone hears an echo of themselves. Headphones fix that instantly, and even cheap earbuds are better than laptop speakers. Descall keeps echo cancellation on by default, which helps when someone has no headphones. Leave it on unless you wear headphones and your voice starts to sound hollow, which can happen when the processing has nothing to cancel.",
      },
      {
        h: "Pick the right microphone",
        p: "Laptops and webcams come with built-in microphones, and the app often picks one of them by default even when a headset is plugged in. Open the voice settings and choose your microphone and speaker by name instead of leaving them on System default. If you plug in a headset after the app has started and it does not show up, press Refresh devices. On the same page you can also choose your camera, which is useful when a webcam microphone is not the one you want to use.",
      },
      {
        h: "Test before the call",
        p: "The microphone test in the voice settings shows a level bar that moves while you talk, so you can see whether the right microphone is working before anyone else hears you. Turn on Hear yourself to listen to your own microphone while the test runs; use headphones for this, or you will hear a loop. Listen for hum, breathing and distance. A headset microphone sounds best a couple of finger widths from the corner of your mouth, slightly to the side, so breath does not hit it directly.",
      },
      {
        h: "Turn on noise suppression",
        p: "AI noise suppression in the voice settings cleans up keyboard clicks, fan noise and other steady background sound before your voice leaves your device. It is free for everyone. Descall uses the strongest method your device can run smoothly and switches to a lighter one on slower devices, so it does not slow down your computer during a game. When it is on, the browser's own noise suppression is switched off to avoid two filters fighting each other, which makes voices sound muddy. Noise suppression cannot remove someone talking right next to you, so it is not a replacement for a quiet room or push-to-talk.",
      },
      {
        h: "Set the input sensitivity",
        p: "Next to the speaking ring around your avatar, Descall uses an input sensitivity setting to decide when you are talking. If friends miss the start of your sentences or quiet speech, raise it. If the ring lights up from background noise while you are silent, lower it. Auto gain control keeps your voice at an even level, so you do not have to lean in for quiet parts. Change one thing at a time and test again, because sensitivity and gain affect each other.",
      },
      {
        h: "Use push-to-talk in noisy rooms",
        p: "If you share a room or your keyboard is loud, push-to-talk is the most reliable fix: your microphone only opens while you hold a key. In the Windows app, turn it on in the voice settings and pick the key; it works while Descall is the active window. Push-to-talk that also works while another app, such as a game, is in front is part of Descall+. Without a membership, the mute shortcut Ctrl+Shift+M and deafen shortcut Ctrl+Shift+D are a quick way to go silent while the app is in focus.",
      },
      {
        h: "Turn down the loud friend, not the whole call",
        p: "Every group has one person who is much louder or much quieter than everyone else. Instead of changing your system volume, set their volume on its own. In a server voice channel, open the menu on that person and move their volume slider anywhere from silent to twice as loud; there is a separate slider for their screen share sound. Only you hear the change. Be careful with the top of the range when you wear headphones, and start low if you are not sure.",
      },
      {
        h: "Fix the usual problems fast",
        p: "Choppy or robotic voice usually means a weak connection: move closer to the router, use a cable, or pause big downloads. An echo means someone is on speakers, so find out who has no headphones. If you sound too quiet, check that the right microphone is selected and raise the input sensitivity. If nobody hears you at all, check that you are not muted, that the browser has permission to use your microphone, and that your operating system's privacy settings allow it. Calls switch to relay servers when a network blocks direct connections, so strict networks can usually still connect.",
      },
      {
        h: "What is free and what is extra",
        p: "The tools in this guide are free: AI noise suppression, echo cancellation, auto gain control, input sensitivity, the microphone test, device choice, push-to-talk in the desktop app and per-person volume. Descall+ adds extra audio tools on top, such as a noise gate, microphone presets, a microphone monitor, audio device profiles and global push-to-talk and mute that work in any app. Ultra includes everything in Descall+. You do not need either for clear voice chat. For now, memberships are given out by the Descall team and through codes, with no published prices.",
      },
    ],
  },

  "set-up-a-community-server": {
    sections: [
      {
        h: "Decide what the server is for",
        p: "Before you create a single channel, write one sentence about why the server exists and who it is for: a local club, a fan group, a class year, a hobby with a few dozen regulars. That sentence decides almost everything else, from how many channels you need to how strict the rules should be. Most small communities grow through invite links shared by members, so think about who will bring the first people in. A clear purpose also makes it easier to say no to channels that nobody asked for.",
      },
      {
        h: "Start from a template or from scratch",
        p: "Descall has server templates that set up channels, roles and permissions in one click. Community & creators is built for groups that will grow: announcements, a support desk, events, a stage channel and a full staff ladder. Friends hangout suits a private group, with a lounge, a plans channel, music nights and always-on voice rooms. There are also Gaming hub, Study & campus and Streamer & content templates. If you prefer to build everything yourself, Start from scratch gives you an empty server with only the @everyone role. Templates are a starting point; you can rename, move or delete anything afterwards.",
      },
      {
        h: "Plan channels people will actually use",
        p: "New server owners almost always create too many channels. Start with an announcements channel, a general chat, one or two topic channels, a help or questions channel, one voice room and, if you plan events, a stage channel. Group them into categories so the list stays readable. Give every channel a short topic that tells newcomers what belongs there. If a channel gets busy, slowmode makes people wait a few seconds between messages, which calms things down without closing the channel. You can always add channels later when members ask for them.",
      },
      {
        h: "Roles: start with three",
        p: "For a small community, three roles are enough at the start: Admin for the people who own the server, Moderator for the people who keep it friendly, and a Member role for everyone else. Each role can have a colour, can be shown separately in the member list and can be made mentionable, so members can call the moderators with one mention. Roles sit in a hierarchy, and higher roles manage the ones below them. Give staff only the permissions they need; it is easier to add a permission later than to clean up after a mistake.",
      },
      {
        h: "Channel permissions: the two overrides you need",
        p: "Most servers only need two kinds of channel override. For an announcements channel, deny Send messages to @everyone and allow it for your staff roles, so news does not get buried under replies. For a staff room, deny View channel to @everyone and allow it for Moderator and Admin, so the team can talk about reports in private. This is exactly how the templates set things up, so if you start from one you can open the channel settings and see a working example before you build your own.",
      },
      {
        h: "Write short rules and turn them on",
        p: "A rules channel with five clear lines does more than a long policy that nobody reads. Cover the basics: be respectful, no spam or self-promotion without asking, keep content suitable for the community, use the right channels, and follow what moderators say. On Descall you can ask members to accept the server rules before they take part, so nobody can say they never saw them. Review the rules after the first month; real problems tell you what is missing better than guesses do.",
      },
      {
        h: "Invites that do not get out of hand",
        p: "Members with the invite permission can create invite links. When you create one, you can set when it expires and how many times it can be used, which is useful for a link you post somewhere public. Someone who opens an invite sees a preview of the server and joins after signing in or creating a free account. For a private group, keep invite permission with the staff; for a growing community, let members invite and watch the audit log for anything unusual.",
      },
      {
        h: "Moderation for a small team",
        p: "Moderators on Descall can delete messages, time members out, kick them or ban them, and every staff action lands in the audit log, so the team can see who did what and why. Use timeouts for heated moments and bans for real abuse. Mentions are part of moderation too: members can mention roles that are marked mentionable, while @everyone and @here only work for the owner, admins and roles that have that permission, and only once a minute per channel. That keeps the whole server from being pinged by accident.",
      },
      {
        h: "Run your first event",
        p: "Events give a new community a reason to come back. Post the plan in announcements and run a poll to pick the time. Schedule a reminder message for the day before, so it goes out even if you forget. On the day, use the stage channel for a talk or a question round, where a few people speak and everyone else listens, or a normal voice channel with screen share for something hands-on. Everything in this guide, from templates to stage channels, is free on Descall. After a month, look at which channels are quiet and remove or merge them.",
      },
    ],
  },

  "private-group-chat-guide": {
    sections: [
      {
        h: "Three questions to ask any chat app",
        p: "Privacy claims in chat apps are often vague, so it helps to ask three concrete questions. Who can read your messages while they travel over the internet? Who can read them once they are stored on the company's servers? And what happens to your data when you leave? Every app answers these differently, and an honest app answers them plainly. This guide explains what the terms mean, how Descall answers each question, and which settings are worth changing today.",
      },
      {
        h: "Encryption in transit and end-to-end encryption",
        p: "Encryption in transit means messages are scrambled between your device and the server, so people on the same Wi-Fi or along the network cannot read them. End-to-end encryption goes further: only the devices in the conversation can read the messages, and the server cannot. Descall uses HTTPS and TLS for the app and its servers, and WebRTC with DTLS and SRTP encryption for voice and video calls. Messages are encrypted in transit and stored on Descall's servers, so your chat history loads on every device you sign in on. Descall does not claim default end-to-end encryption for message history. If you need that for a sensitive conversation, use an app that is built for it.",
      },
      {
        h: "What is stored, and why",
        p: "To work at all, a chat app with history has to keep some data: your account details, the messages and files you send, and basic information about calls. Descall keeps messages so you can search old conversations and pick up on a new phone where you left off. The privacy policy lists what is collected, how long it is kept and which services process it. One detail worth knowing: when a message contains a link, Descall's server fetches the page title and image for the preview, so your device does not connect to that site just because a friend posted a link.",
      },
      {
        h: "Settings worth changing today",
        p: "A few switches make a big difference. In the privacy settings you can turn off read receipts; then people do not see when you have read their messages, and you do not see theirs either. You can turn off message preview for notifications on each device, so app, browser and phone notifications only say New message instead of showing the text on your lock screen. Your status can be Online, Idle, Do Not Disturb or Invisible, and Invisible lets you use the app without showing up as online.",
      },
      {
        h: "Decide who can reach you",
        p: "Messages from people who are not your friends arrive as message requests, which you can accept or decline before a conversation starts. If someone bothers you, block them and the conversation is blocked. In busy servers and group chats, set notifications to Only @mentions or Nothing, or mute the chat for a while. You can leave any server or group whenever you like. None of these settings costs anything.",
      },
      {
        h: "Protect the account itself",
        p: "The best privacy settings do not help if someone else can log in as you. Use a password you do not use anywhere else; Descall stores passwords hashed, never in plain text. You can also sign in with Google. Turn on two-step verification with an authenticator app, so a stolen password alone is not enough to get into your account. Sensitive actions, such as downloading your data, ask for your password or your authenticator code again. Never share a code with someone who messages you, even if they claim to be from support.",
      },
      {
        h: "Download or delete your data",
        p: "You can ask Descall for a copy of your data at any time with Download my data in the settings. It arrives as one file with your profile, settings, sessions, friends, the messages you sent, your DesCoin and shop history, badges and actions taken on your account; your password and security keys are not in it. You can download it up to three times a day. If you want to leave for good, you can delete your account from the settings. Related data is then deleted or anonymised according to the retention policy, and this cannot be undone.",
      },
      {
        h: "Group chats have a human side",
        p: "Technology only covers part of privacy in a group. Anyone in a chat can take a screenshot, and messages can be forwarded; on Descall a forwarded message is marked Forwarded, but it still leaves the original chat. Screen sharing can show more than you meant to, such as other chats or notifications. So agree on simple norms with your group: what stays in the chat, and what is fine to share. For topics that only a few people should see, create a private channel on your server and limit it with role permissions.",
      },
      {
        h: "Analytics and ads",
        p: "On the Descall website, analytics only load after you accept cookies, and accounts of people under 16 are never measured, even if they accept. The iOS app does not use advertising or tracking tools. On the website and the desktop app, and only after you accept, a conversion tag may measure sign-ups that came from ads. The privacy policy explains all of this in detail, including your rights to access and delete your data. If any of it is unclear, you can write to contact@descall.com and ask.",
      },
    ],
  },

  "descall-on-every-device": {
    sections: [
      {
        h: "One account, four ways in",
        p: "Descall runs as a Windows desktop app, as an app for iPhone and iPad from the App Store, as an Android app, and in any modern browser at descall.com/app. All of them use the same free account. Your servers, friends, groups and messages follow you, because your chat history is stored on Descall's servers and loads on whichever device you sign in on. You can have the app open on a computer and a phone at the same time and switch between them in the middle of a conversation.",
      },
      {
        h: "Windows app: for long sessions",
        p: "If you spend evenings on a Windows PC, the desktop app is the steadiest option. It runs in the background without the tab slowdowns browsers apply, so voice stays steady while you play or study. You can turn on push-to-talk for the moments you need it, and when you share your screen you can pick a single screen or window and send its sound along, without the call itself. The app updates itself when a new version is released. Windows SmartScreen may ask you to confirm the installer the first time, because Descall is an independent app. There is no desktop app for macOS or Linux; on those computers, use the browser.",
      },
      {
        h: "Browser: nothing to install",
        p: "The web app at descall.com/app is the full app, not a cut-down version: messages, servers, voice and video calls and screen sharing all work there. It is the easiest way to bring in a friend who just wants to try Descall, and it is handy on a school or work computer where you cannot install software. The browser asks for microphone permission the first time you join a voice channel. Keep the Descall tab open during calls; browsers can slow down tabs in the background, which is the main reason to switch to the desktop app for long sessions.",
      },
      {
        h: "iPhone and iPad",
        p: "The iPhone and iPad app from the App Store covers messaging, voice messages, one-to-one and group voice and video calls, servers with voice rooms you join with one tap, and moderation tools for server staff. One-to-one calls ring on the iPhone call screen, and push notifications tell you about new messages and calls. You can watch screen shares from friends, but the iPhone and iPad app cannot share your own screen; use a computer for that. The app shows your membership status if you have Descall+ or Ultra, but you never need a membership to use it.",
      },
      {
        h: "Android",
        p: "On Android you can join voice channels, DMs and servers and get notifications for new messages. The Android app is published as an APK with each release on the Descall GitHub releases page, linked from the download page. Because it is not installed from an app store, Android asks you once to allow installs from the browser or file manager you used. Messages, servers and friends are the same as on every other device, so a friend on Android and a friend on iPhone can sit in the same voice channel without noticing any difference.",
      },
      {
        h: "Mixing devices in one group",
        p: "Most groups end up mixing devices, and that works well. A common setup is the Windows app at the desk for long voice evenings and screen sharing, and a phone for messages during the day. If you have to step away from your computer, leave the call there and join the same voice channel from your phone. Someone on a borrowed laptop can join from the browser in a minute. Because history lives on the servers, a message you send from your phone is waiting on your computer when you sit back down.",
      },
      {
        h: "Notifications without the noise",
        p: "Running Descall on several devices should not mean every notification three times. Each chat has its own setting: All messages, Only @mentions or Nothing, and you can mute any chat for an hour, a day or up to a week. The message preview setting is per device, so you can hide message text on your phone's lock screen while keeping full notifications on your computer. Setting your status to Do Not Disturb also tells friends that now is not a good time.",
      },
      {
        h: "Which one should you install first?",
        p: "If your group meets in the evening on a Windows PC, start with the desktop app and add the phone app later. If you mostly chat during the day and join calls from wherever you are, start with the iPhone or Android app. If you are not sure Descall is for you yet, open it in the browser first; nothing to install, and you can sign in on the apps later with the same account. If you use a Mac or Linux computer, the browser is your desktop app.",
      },
      {
        h: "Free on every platform",
        p: "Chat, servers, voice, video and screen sharing are free on every platform. Descall+ and Descall Ultra are optional memberships whose extra tools are mostly for the desktop app, such as mini mode, always-on-top windows and global shortcuts. For now, memberships are given out by the Descall team and through codes, with no published prices; on iPhone and iPad the app only shows your membership status. Cosmetics in the shop are optional and paid with DesCoin that you earn in the app.",
      },
    ],
  },
  // Nov 8 2026 guides (fourth content round). Checked against the code on 2026-11-08:
  // server templates (backend/lib/serverTemplates.js), invites with expiry and use limit
  // (backend/routes/servers.js), built-in slash commands (backend/lib/slashCommands.js),
  // voice settings and their defaults (src/components/layout/UserPanel.jsx,
  // src/lib/voiceProfile.js, src/lib/noiseSuppression.js, src/lib/adaptiveBitrate.js),
  // stage channels and the Stream and camera permission (backend/socket/serverVoiceHandlers.js),
  // screen share presets (src/lib/webrtcScreenShare.js) and game activity (src/hooks/useActivity.js).
  "move-discord-community-to-descall": {
    sections: [
      {
        h: "What moves, and what stays behind",
        p: "Moving a community is mostly about people, not data. There is no tool that copies a Discord server into Descall: channels, roles and settings are rebuilt by hand, and the message history stays where it is. That sounds like a lot of work, but most servers are smaller than their channel list suggests, and rebuilding is the moment to drop everything nobody uses. Your members can still read the old server for reference while the new one fills up. What really has to move is the habit of meeting in one place, and that is what the steps below are built around.",
      },
      {
        h: "Step 1: write down what your community really uses",
        p: "Open the old server and look at the last month. Which channels had messages, which voice rooms were busy and on which evenings, who did the moderation, and which bots did real work? Write it down as a short list: for many communities it is an announcements channel, a general chat, two or three topic channels, a couple of voice rooms and one staff room. Note the jobs your bots did as well, such as welcome messages, polls, timeouts or clearing spam, because you will want to know which of those jobs still need doing. This list is your plan, and anything not on it can wait until someone asks for it.",
      },
      {
        h: "Step 2: create the server from a template",
        p: "On Descall, a template sets up channels, categories, roles and permissions in one go, which saves an evening of clicking. Gaming hub fits clans and gaming groups, Community & creators fits public communities with events and a support desk, Friends hangout fits a private group, Study & campus fits classes and study groups, and Streamer & content fits a creator and their audience. Start from scratch gives you an empty server with only the @everyone role if you want to copy your old layout exactly. Whatever you pick, you can rename, move or delete every channel and role afterwards, so choose the template that is closest and adjust it.",
      },
      {
        h: "Step 3: map your channels and categories",
        p: "Go through your list and give each old channel a home in the new server. Keep the channel names your members know, because familiar names make the first days easier. Group them into categories, give each text channel a short topic so newcomers know what belongs there, and turn on slowmode in a channel that tends to get flooded. Descall has text, voice and stage channels: use voice channels for rooms people drop into, and a stage channel for talks and question rounds where a few people speak and everyone else listens. Resist the urge to recreate every archive channel. If an old channel was mainly for reading, link to it from your announcements instead.",
      },
      {
        h: "Step 4: rebuild roles and permissions",
        p: "Start with the roles that carry responsibility: owner team, admins, moderators, and maybe one or two member roles that change what people can do. Each role can have a colour, can be shown separately in the member list and can be made mentionable, and higher roles manage the ones below them. Most servers need only two kinds of channel override. In an announcements channel, deny Send messages for @everyone and allow it for staff. In a staff room, deny View channel for @everyone and allow it for your moderators. A channel without its own overrides follows its category, so setting permissions on a category is often enough. Cosmetic roles can come later, once people have settled in.",
      },
      {
        h: "Step 5: rules, moderation and the jobs bots used to do",
        p: "Write your rules in a rules channel and ask new members to accept them before they take part; Descall can require that. Moderators can delete messages, time members out, kick or ban, and every staff action is written to the audit log. Several jobs that need a bot elsewhere are built in as slash commands: /poll for a quick vote, /timeout, /kick and /ban for moderation, /purge to clear a burst of spam, and /nick to change a nickname. Mass mentions are limited by default, because @everyone and @here only work for the owner, admins and roles with that permission, and only once a minute per channel. Descall has no bot marketplace, so if your community depends on a custom bot, keep that part where it is for now.",
      },
      {
        h: "Step 6: invites you stay in control of",
        p: "Create an invite link for the move and decide how open it should be. When you create a link you can set when it expires and how many times it can be used, so a link posted somewhere public does not stay valid for ever. Someone who opens the link sees a preview of the server and joins after signing in or creating a free account with an e-mail address or a Google account. Descall accounts are for people aged 13 and over. Pin the link in the old server's announcements and in any group chat your community uses, so nobody has to ask for it twice.",
      },
      {
        h: "Step 7: move the first voice night",
        p: "Do not invite everyone on day one. Ask your most active members, five to ten people, to join the new server first and hold one normal voice evening there. They find the rough edges, set up their microphones and become the people who help others later. Ask everyone to use headphones and to try the microphone test in the voice settings before the call, and to keep AI noise suppression on. People can join from the Windows app, the iPhone and iPad app, the Android app or a browser at descall.com/app, so nobody is left out because of their device.",
      },
      {
        h: "Step 8: announce the move and run both for a short while",
        p: "Once the first evening worked, post the move in the old server: why you are moving, the invite link, the date when the voice nights switch, and who to ask for help. Then run both servers for a week or two. Hold every event and voice night on Descall, and leave the old server for reading and for people who have not made the jump yet. Schedule a reminder message for the evening before your first big event; Descall can send scheduled messages up to a year ahead. A clear date works better than a slow fade, because people move when they know where everyone else will be.",
      },
      {
        h: "After the switch: tidy up",
        p: "After a month, look at which channels stayed quiet and merge or delete them, and check that the moderators still have the permissions they need and no more. Invite links you no longer use can be deleted. Keep the old server's announcement pinned to the new link for latecomers. Everything in this guide, from templates and roles to stage channels, invites and moderation, is free on Descall. Descall is not affiliated with Discord Inc.; this guide only describes how to rebuild a community on Descall.",
      },
    ],
  },

  "descall-voice-settings-guide": {
    sections: [
      {
        h: "Where the voice settings live",
        p: "Every voice setting in Descall is on one page: open the settings and choose Voice & Video. The same settings are used in DM calls, group calls and server voice channels. They are saved on the device you change them on, so a headset setup on your desktop does not change how your phone sounds, and it is worth checking the page once on each device you use. This guide goes through the page from top to bottom, says what each setting does and what it is set to by default, and ends with ready-made setups for the most common situations.",
      },
      {
        h: "Microphone, speaker and camera",
        p: "The first block picks your devices. Choose your microphone and speaker by name instead of leaving them on System default, because laptops and webcams often bring a built-in microphone that the system prefers even when a headset is plugged in. If you connect a headset after the app has started and it is not in the list, press Refresh devices. If the microphone you selected disappears during a call, for example because you unplugged it, Descall switches to another microphone so the call keeps going. The camera choice on the same page is used for video calls.",
      },
      {
        h: "AI noise suppression: Off, On or Strong",
        p: "AI noise suppression removes keyboard clicks, fan noise and other steady background sound before your voice leaves your device. It has three levels. On is the default and suits most rooms. Strong adds a firmer gate on top, so quiet background sound between your sentences is cut more decisively; use it in a noisy room, and switch back to On if friends say the start of your words gets lost. Off sends your microphone without this processing. Descall runs the strongest method your device can handle smoothly and uses a lighter one on slower devices, and while suppression is on the browser's own noise filter is switched off, so two filters do not fight and make you sound muddy. If the cleaned-up signal stays silent while you are clearly talking, Descall falls back to your plain microphone so you are not cut off.",
      },
      {
        h: "Echo cancellation and auto gain control",
        p: "Echo cancellation is on by default. It stops your friends' voices, coming out of your speakers, from going back into your microphone. Leave it on whenever anyone might use speakers. If you wear closed headphones and your voice starts to sound hollow, you can try turning it off, because the processing has nothing to cancel. Auto gain control, also on by default, keeps your voice at an even level, so you do not have to lean in for quiet sentences and do not blast everyone when you laugh. Turn it off only if you use a good microphone with a fixed level, for example through an audio interface, and set the level yourself.",
      },
      {
        h: "Input sensitivity",
        p: "Input sensitivity decides when Descall treats you as speaking and lights the ring around your avatar. It goes from 0 to 100 and starts at 45, which suits normal speech on a laptop or phone microphone. Raise it if people miss the start of your sentences or your quiet speech. Lower it if the ring lights up from background noise while you are silent. Change it in small steps and test after each change, because sensitivity, gain and noise suppression affect each other.",
      },
      {
        h: "Test before you join",
        p: "The microphone test shows a level bar that moves while you talk, so you can see that the right microphone is working before anyone hears you. Turn on Hear yourself to listen to your own microphone while the test runs; wear headphones for this, or you will hear a loop. Listen for hum, breathing and distance. A headset microphone sounds best about two finger widths from the corner of your mouth, slightly to the side. Press Stop when you are done, because the test keeps the microphone open.",
      },
      {
        h: "Push-to-talk in the Windows app",
        p: "In the Windows app the page also has a push-to-talk switch. With it on, your microphone only opens while you hold the key, which is the most reliable fix for a loud keyboard or a shared room. You can choose between three keys: Ctrl+Shift+M, Ctrl+Shift+Space and Alt+Shift+M. In the free app, push-to-talk works while Descall is the active window. Push-to-talk that also works while a game or another app is in front is part of the optional Descall+ membership, together with a global mute key.",
      },
      {
        h: "Ready-made setups",
        p: "Gaming headset at a desk: pick the headset by name for both microphone and speaker, noise suppression On, echo cancellation and auto gain on, sensitivity at 45, and push-to-talk if your keyboard is loud. Laptop in a quiet room: built-in microphone, noise suppression On, echo cancellation on, because laptop speakers feed back easily, and wear earbuds if you can. Noisy shared room or dorm: noise suppression Strong, push-to-talk on in the Windows app, and sensitivity a little lower. Phone: on iPhone and iPad the system's own voice processing handles echo and noise, so a pair of earbuds is the best upgrade you can make.",
      },
      {
        h: "A five-minute checklist",
        p: "If you bought a new headset, switched computers or friends say they cannot hear you well, go through this in order. First pick your microphone and speaker by name on the Voice & Video page, and press Refresh devices if the list is incomplete. Start the microphone test, turn on Hear yourself and say a few sentences at your normal volume. If the bar does not move, the wrong microphone is selected or the operating system has not given the app microphone permission. If you sound hollow, check echo cancellation; if there is hum, check the noise suppression level. If the ring lights up while you are silent, lower the sensitivity a little. Finally, stop the test and make a short DM call with a friend, because a real call shows at once what the settings page cannot.",
      },
      {
        h: "When the connection is the problem",
        p: "In a server voice channel, the small connection indicator next to a person tells you how their link is doing. When a connection gets worse, Descall lowers the voice bitrate and, on a poor link, adds extra redundancy so speech survives lost packets instead of breaking up; the receiving side also buffers a little more audio. If you sound robotic to others, the settings page will not fix it: move closer to the router, use a cable, or pause big downloads. Calls switch to relay servers when a network blocks direct connections, so strict home or school networks can usually still connect.",
      },
      {
        h: "What is free and what is extra",
        p: "Everything on the Voice & Video page is free: device choice, the three noise suppression levels, echo cancellation, auto gain control, input sensitivity, the microphone test and push-to-talk in the Windows app. In a server voice channel, per-person volume from silent to twice as loud is free too. Descall+ adds audio tools on top, such as a noise gate with your own threshold, microphone presets, a microphone monitor, audio device profiles, automatic device switching and push-to-talk and mute that work in any app. Ultra includes everything in Descall+. For now, memberships are given out by the Descall team and through codes, with no published prices.",
      },
    ],
  },

  "game-team-voice-setup": {
    sections: [
      {
        h: "Two kinds of team, two kinds of voice",
        p: "A Minecraft crew and a five-person shooter team want very different things from voice chat. A building or survival server runs for hours, people drift in and out, and the talk is relaxed. A shooter team plays short, tense rounds where a callout has to arrive at once and nobody should talk over it. One Descall server can handle both, because voice channels stay open and people simply drop in. This guide sets up a server for a gaming group, then tunes the microphone and the rooms for each style of play.",
      },
      {
        h: "Start from the Gaming hub template",
        p: "Create a server and pick the Gaming hub template. It sets up a Welcome category with announcements, rules and introductions, a Community category with general, squad-up, clips-and-highlights and memes, and a Voice lobbies category with Lobby, Duo Queue, Five Stack, AFK / Chill and a Tournament Stage stage channel. There is also a staff area with a private chat, mod logs and Staff Voice. Roles come ready: Admin, Moderator, Helper, VIP and Member. Rename anything to fit your group; the template is a starting point, not a rule.",
      },
      {
        h: "Rooms for a Minecraft crew",
        p: "For a long-running Minecraft world, a few named voice rooms work better than one big lobby. Rename the lobbies after what people do, for example a building room, a room for exploring and one for chatting while someone farms, so friends can see at a glance where to join. Keep AFK / Chill for people who want to listen without talking. Use a text channel for coordinates, server addresses and plans, and pin the messages people look for again and again. When someone finishes a build, they can share their screen in the voice room with the Games, video setting and walk everyone through it.",
      },
      {
        h: "Rooms for a shooter team",
        p: "A competitive team usually needs fewer rooms with clearer rules. Use Five Stack for the active team during a match, Duo Queue for two people warming up, and Lobby for everyone else. Agree that the match room is for callouts only: short, calm, and nothing else while a round is live. Moderators and Helpers can mute members in voice and move them between rooms (give a captain role the same two permissions), which keeps the match room clean when someone joins at the wrong moment. For a scrim or tournament night with viewers, the Tournament Stage stage channel lets a few people talk while everyone else listens, and listeners can request to speak.",
      },
      {
        h: "Microphone settings for callouts",
        p: "Open the settings, choose Voice & Video, and pick your headset by name for both microphone and speaker. Keep AI noise suppression On so keyboard and mouse clicks stay out of the call, or set it to Strong if your setup is loud. Run the microphone test once so you know the right microphone is working. In the free Windows app, push-to-talk works while Descall is the active window, and in a shooter the game is in front, so most players use voice activation instead: tune the input sensitivity until the ring around your avatar lights up for speech and stays dark for clicks. Push-to-talk and mute that work while the game is in front are part of the optional Descall+ membership.",
      },
      {
        h: "Hear everyone at the right volume",
        p: "Every team has one friend who is twice as loud as everyone else. In a server voice channel, open the menu on that person and move their volume slider anywhere from silent to twice as loud; only you hear the change, and it does not touch your game volume. There is a separate slider for the sound of their screen share, so a loud stream does not drown out the callouts. Wear headphones: with speakers, your microphone picks the call up again and everyone hears an echo of themselves.",
      },
      {
        h: "Review rounds and builds together",
        p: "Screen sharing is how a team learns. After a match, one person can share a replay or a clip in the voice room while the others point out mistakes. For fast motion, choose Games, video in the quality panel. In a group call, Descall starts shares at 720p and 20 frames per second and warns you if you push it higher in a busy call; for one-to-one coaching in a DM call, the share starts at a higher quality and 60 frames per second is meant for exactly that. In the Windows app, the game's sound goes out with the picture, so the others hear what you hear.",
      },
      {
        h: "Show what you are playing",
        p: "In the Windows app, Descall can show your friends which game you are playing, so they know when to join. You find the switch under Privacy, Activity Status, Game activity, and you can turn it off at any time. Set your status to Do Not Disturb when you want to play without notifications, or set the clips channel to Only @mentions so it does not ping you during a match. Polls in the squad-up channel are a quick way to agree on a time for the next session.",
      },
      {
        h: "Keep voice smooth while you play",
        p: "Voice and the game share your connection. A cable beats Wi-Fi, and pausing big downloads and updates before a match helps both. Descall lowers the voice bitrate when a link gets worse and adds extra redundancy on a poor one, so callouts survive lost packets; the connection indicator next to each person shows how their link is doing. If one friend sounds robotic, the problem is usually their connection, not the app. Calls switch to relay servers when a network blocks a direct connection, so strict networks can usually still join. For long sessions, the Windows app is steadier than a browser tab.",
      },
      {
        h: "A checklist for the first team night",
        p: "Before the first evening, make sure everyone has done the following. Install the Windows app or open descall.com/app in a browser, join the server with the invite link and pick their headset by name on the Voice & Video page. Run the microphone test once and leave noise suppression On. Agree in advance who talks in the match room, how callouts are said and when there is time to chat between rounds. Then spend the first ten minutes on setup only: everyone talks in turn, per-person volumes get fixed, and the loud friend gets turned down on each listener's side. This short preparation takes far less time than hunting for a microphone in the middle of a match.",
      },
      {
        h: "What it costs",
        p: "Everything in this guide is free: the Gaming hub template, voice and stage channels, noise suppression, push-to-talk while Descall is in focus, per-person volume, screen share with game sound in the Windows app and game activity. Descall+ adds extras for players, such as push-to-talk and mute that work in any app and notifications that stay quiet while you are in a game except for the important ones. Ultra includes everything in Descall+. For now, memberships are given out by the Descall team and through codes, with no published prices.",
      },
    ],
  },

  "screen-share-online-classes": {
    sections: [
      {
        h: "Pick the right room for the lesson",
        p: "A class on Descall can happen in three kinds of room, and picking the right one avoids most problems. For a lecture or a talk with many listeners, use a stage channel: a few people speak and share, everyone else listens and can ask to speak. For a small study group or a workshop where everyone talks, use a normal voice channel. For one-to-one tutoring, a DM call is the simplest and starts screen shares at a higher quality, because only two people watch. All three are free and work the same way when you share a screen.",
      },
      {
        h: "Set up a class server in minutes",
        p: "Create a server with the Study & campus template. It brings a Campus category with announcements, rules and introductions, a Study category with general, homework-help, resources and accountability channels, and a Focus voice category with Silent Focus, Pomodoro Room, Group Project A and B and an Office Hours stage channel. Roles come ready: Admin, Moderator, Mentor, Study Buddy and Student. For a course, rename Mentor to Teacher or Tutor and keep Student for the class. The channel names are in English in the template, and you can rename every one of them, for example after your subjects.",
      },
      {
        h: "Decide who can share",
        p: "In a class, usually only the teacher should share a screen. The permission behind it is called Stream and camera. Open the permissions of your lecture channel, deny Stream and camera for @everyone and allow it for the Teacher role; students can still listen, watch and chat. In a stage channel this is partly built in: only people on stage can share, and listeners join as audience. In study rooms where everyone works together, leave the permission on so anyone can show their notes or code.",
      },
      {
        h: "Run a lecture in a stage channel",
        p: "In a stage channel, everyone who joins starts in the audience with their microphone off, so latecomers never interrupt. A student who has a question presses Request to Speak. Anyone with the Move members permission, such as the teacher or a moderator, can bring that student on stage to talk, and move them back with Move to Audience when they are done. That gives you a raised-hand system without extra tools. Give the Teacher role Move members in the class server, and the Office Hours channel from the template works as a lecture hall straight away.",
      },
      {
        h: "Settings for slides, documents and code",
        p: "When you press the screen share button, the quality panel asks what you are sharing. For slides, PDFs, spreadsheets and code, choose Text, code: it tells the encoder that sharp letters matter more than smooth motion. Fifteen or twenty frames per second is plenty for a presentation, and 1080p keeps small text readable; drop to 720p if students on weak connections see a blurry or frozen picture. For a video clip in the lesson, switch to Games, video. If you change the quality while you are live, Descall restarts the share for a moment with the new settings, so you do not have to stop and start it by hand.",
      },
      {
        h: "Share a window, not your whole screen",
        p: "A whole-screen share shows everything, including pop-up notifications, other chats and open tabs. Teaching from one window or one browser tab keeps the lesson focused and private. Before class, close what you would not show to a room full of students, and set your status to Do Not Disturb so message notifications stay quiet while you present. When the lesson ends, stop the share straight away instead of leaving it running.",
      },
      {
        h: "Sound in the lesson",
        p: "If you play a video or an audio example, the Windows app sends the sound of what you share together with the picture, and leaves Descall's own playback out, so students do not hear the call echoed back. In a browser, whether sound is shared depends on the browser and on what you choose in its sharing dialog; a browser tab is often the easiest way to share a video with sound. In a server voice channel, each student can set the volume of your screen share separately from your voice.",
      },
      {
        h: "Students can join from anything",
        p: "Students join from the Windows app, from the iPhone and iPad app, from the Android app, or from any modern browser at descall.com/app, which is useful on a school computer where nothing can be installed. Phones and tablets can watch a share. The iPhone and iPad app cannot share its own screen, so a student who wants to present needs a computer. Descall accounts are for people aged 13 and over, and under-18s need a parent's or guardian's permission.",
      },
      {
        h: "Use the text chat during the lesson",
        p: "Not everyone wants to ask a question out loud. Keep the lecture channel's text chat open and ask students to type short questions there, then answer them together when a part of the lesson is done. Writing down a link, a formula or a homework date instead of saying it also leaves a record for students who look for it later. In a big class, slowmode keeps dozens of messages arriving at once from burying the questions.",
      },
      {
        h: "Before and after class",
        p: "Use the announcements channel for the timetable and keep it read-only for students by denying Send messages for @everyone and allowing it for teachers. Schedule the reminder for the next lesson right after the current one; Descall can send scheduled messages up to a year ahead. A quick poll helps you pick a time for an extra session. Put slides, links and homework in the resources channel and pin what students need again, and because Descall can search the whole message history, last month's explanation is still easy to find.",
      },
      {
        h: "A checklist for the first lesson",
        p: "A day before the first lesson, do a five-minute rehearsal. Set up the server, give yourself the Teacher role and set the Stream and camera permission in the lecture channel. On the Voice & Video page, pick your microphone by name, run the microphone test and leave noise suppression On. Then join the stage channel with a second account or a friend and share your screen with Text, code: can the slides be read, does the sound come through, does Request to Speak work? Create the invite link with an expiry and a use limit and send it to the students through the channel the school already uses. At the start of the lesson, spend a minute on the ground rules: Request to Speak for questions, the channel chat for short notes.",
      },
      {
        h: "When students cannot see well",
        p: "If several students say the picture stutters, lower the resolution first and the frame rate second. If only one student has trouble, the problem is usually their connection, and the others still see a clean picture. A cable or a spot closer to the router helps the person sharing most of all. Calls switch to relay servers when a network blocks a direct connection, so strict school networks can usually still join. Everything in this guide is free on Descall, for teachers and students alike.",
      },
    ],
  },
};
