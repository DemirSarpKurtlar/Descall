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
};
