/**
 * Public server directory pages, English (/communities, /communities/<slug>), item 8.
 * Same keys as dirSeo.tr.js. The directory pages are served in English and Turkish only
 * (src/site/directory/directoryPaths.js); the in-app Discover strings are the dir.*
 * namespace in every live locale. Titles <= 60, descriptions <= 160 characters
 * (scripts/seo-validate.mjs). ICU messages are formatted with src/i18n/message.js.
 */
export const DIR_SEO_EN = {
  home: {
    crumb: "Communities",
    title: "Descall Communities: Find Servers to Join",
    description:
      "Browse public Descall servers by topic: Minecraft, FPS games, CS2, League of Legends, study groups, music, art, anime and more. Free to join.",
    h1: "Find a community on Descall",
    lead: "Public servers, listed by their owners and sorted by topic. Every server here has at least 3 members. Pick a category, open a server and join it with your free account.",
  },
  ui: {
    home: "Home",
    breadcrumb: "Breadcrumb",
    categoriesTitle: "Browse by topic",
    popularTitle: "Popular communities",
    listTitle: "Servers in this category",
    categoryCount: "{count, plural, =0 {No servers yet} one {# server} other {# servers}}",
    members: "{count, plural, one {# member} other {# members}}",
    online: "{count} online",
    join: "Join",
    joinWorking: "Opening the invite...",
    joinFailed: "Could not open the invite. Try again in a moment.",
    sortLabel: "Sort by",
    sortMembers: "Most members",
    sortOnline: "Online now",
    sortNewest: "Newest",
    searchLabel: "Search this list",
    searchPlaceholder: "Name, description or tag",
    noMatch: "No server matches your search.",
    emptyTitle: "No servers listed here yet",
    emptyBody:
      "Own a server about this topic? Open its settings, go to Community and Discovery and list it in the Descall directory. It appears here once it has 3 members.",
    unavailable: "The directory could not be reached right now. Try again in a moment.",
    showMore: "Show more",
    languageLabel: "Language",
    tagsLabel: "Tags",
    allTopics: "All topics",
    otherLanguage: "Turkish-language communities (Türkçe)",
    howTitle: "How the directory works",
    how: [
      "Owners and administrators choose to list their server, pick a topic and a main language, and write a short description and up to five tags.",
      "A server appears once it has at least 3 members. Servers that Descall moderation has hidden, and servers of banned or deleted accounts, are never shown.",
      "Only the name, icon, description, tags and member counts are public. Channels, member lists and messages stay private, and joining still follows the server's own rules and verification level.",
    ],
    ctaTitle: "Start your own community",
    ctaBody: "Create a server with text and voice channels, roles and a ready-made template, then list it here when you are ready.",
    ctaStart: "Start free",
    ctaDownload: "Download Descall",
    languageNames: {
      tr: "Turkish",
      en: "English",
      de: "German",
      es: "Spanish",
      fr: "French",
      "pt-BR": "Portuguese",
      ru: "Russian",
      other: "Other language",
    },
  },
  cat: {
    "gaming-minecraft": {
      label: "Minecraft",
      title: "Minecraft Servers and Communities | Descall",
      description:
        "Find Minecraft communities on Descall: survival, SMP, skyblock and building groups with voice channels. Browse listed servers and join for free.",
      h1: "Minecraft servers and communities",
      intro: "Minecraft groups use Descall for SMP chat, build planning and voice while they play. Each server below is listed by its owner.",
    },
    "gaming-fps": {
      label: "FPS and shooters",
      title: "FPS and Shooter Game Communities | Descall",
      description:
        "FPS and shooter communities on Descall: ranked and casual groups, tactical shooters and battle royales, with voice channels for every match. Join free.",
      h1: "FPS and shooter game communities",
      intro: "Servers for competitive and casual shooters, from tactical games to battle royales, with voice channels to play together.",
    },
    "gaming-cs2": {
      label: "Counter-Strike 2",
      title: "Counter-Strike 2 Communities and Servers | Descall",
      description:
        "Counter-Strike 2 communities on Descall: groups for Premier, FACEIT and casual matches, with voice channels and roles. Browse listed servers and join free.",
      h1: "Counter-Strike 2 communities",
      intro: "CS2 servers for playing together, practising utility and talking strategy between rounds.",
    },
    "gaming-lol": {
      label: "League of Legends",
      title: "League of Legends Communities | Descall",
      description:
        "League of Legends communities on Descall: ranked, ARAM and Clash groups that talk in voice while they play. Browse listed servers and join for free.",
      h1: "League of Legends communities",
      intro: "Ranked, ARAM and Clash groups that play together in voice. These League of Legends servers are listed by their owners.",
    },
    "gaming-other": {
      label: "Other games",
      title: "Gaming Communities and Servers | Descall",
      description:
        "Gaming communities on Descall for every other game: co-op groups, indie titles, mobile games and game nights with voice channels. Browse and join.",
      h1: "Gaming communities",
      intro: "Servers for games that do not have their own category yet, from co-op squads to mobile game clans.",
    },
    study: {
      label: "Study",
      title: "Study Groups and Study Servers | Descall",
      description:
        "Study groups on Descall: focus rooms, exam prep and homework help with voice channels and screen sharing. Find a study server and join for free.",
      h1: "Study groups and study servers",
      intro: "Study together with a timer, a quiet voice room or a screen share. These study servers are listed by their owners.",
    },
    music: {
      label: "Music",
      title: "Music Communities and Servers | Descall",
      description:
        "Music communities on Descall: producers, bands, listeners and karaoke nights with voice channels. Browse listed music servers and join for free.",
      h1: "Music communities",
      intro: "Share tracks, get feedback on a mix or hang out in a listening room.",
    },
    art: {
      label: "Art",
      title: "Art and Drawing Communities | Descall",
      description:
        "Art communities on Descall: drawing, digital painting, design and photography groups that share work and give feedback. Browse servers and join.",
      h1: "Art and drawing communities",
      intro: "Post your work, join a drawing challenge or sketch together on a screen share.",
    },
    tech: {
      label: "Tech",
      title: "Tech and Programming Communities | Descall",
      description:
        "Tech communities on Descall: programming, game development, hardware and open source groups with voice rooms and screen share. Browse and join.",
      h1: "Tech and programming communities",
      intro: "Ask a coding question, pair on a bug over screen share or follow a hardware build.",
    },
    anime: {
      label: "Anime",
      title: "Anime Communities and Servers | Descall",
      description:
        "Anime communities on Descall: watch parties, manga talk, fan art and seasonal discussion with voice channels. Browse listed anime servers and join.",
      h1: "Anime communities",
      intro: "Talk about this season, plan a watch party or share fan art with people who like the same shows.",
    },
    sports: {
      label: "Sports",
      title: "Sports Communities and Fan Servers | Descall",
      description:
        "Sports communities on Descall: football fan groups, fantasy leagues, fitness and esports talk with voice channels for match nights. Browse and join.",
      h1: "Sports communities and fan servers",
      intro: "Watch the match together in voice, run a fantasy league or keep each other on a training plan.",
    },
    "chat-friends": {
      label: "Chat and friends",
      title: "Chat Servers to Make Friends | Descall",
      description:
        "Chat communities on Descall where you can meet new people: hangout servers, voice chat lounges and friendly groups. Browse listed servers and join.",
      h1: "Chat servers to make friends",
      intro: "Hangout servers for chatting, voice lounges and meeting people with the same interests.",
    },
    other: {
      label: "Other",
      title: "Other Communities and Servers | Descall",
      description:
        "More public communities on Descall that do not fit one topic: hobbies, local groups, clubs and projects. Browse listed servers and join for free.",
      h1: "Other communities",
      intro: "Hobby groups, local clubs, projects and everything else that does not fit one topic.",
    },
  },
};
