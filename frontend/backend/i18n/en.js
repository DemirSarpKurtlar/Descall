"use strict";

/**
 * English server-side catalog (source of truth for backend/i18n/<locale>.js).
 * Every live locale's file must have exactly this key tree and the same
 * {placeholders} (backend/i18n/backendI18n.selftest.cjs). Rendered with
 * lib/i18n.js bt(lang, key, vars).
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} is your Descall verification code",
      eyebrow: "Email verification",
      title: "Welcome to Descall, {name}!",
      titleNoName: "Welcome to Descall!",
      intro: "Your account is ready. One last step: enter the code below in the app to verify your email address.",
      preheader: "Your code: {code} · valid for {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "If you didn't create this account, you can ignore this email. The address isn't linked to any account until it's verified.",
    },
    email_verify: {
      subject: "{code} is your Descall verification code",
      eyebrow: "Email verification",
      title: "Verify your email address",
      intro: "Enter the code below in the app to add this email address to your Descall account.",
      preheader: "Your code: {code} · valid for {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "If you didn't request this, you can ignore this email. Your address won't be added to any account.",
    },
    "2fa_login": {
      subject: "{code} is your Descall sign-in code",
      eyebrow: "Sign-in code",
      codeLabel: "Your sign-in code",
      title: "Finish signing in",
      intro: "Enter this code in Descall to sign in to your account.",
      preheader: "Your sign-in code: {code} · valid for {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "If this wasn't you, someone may know your password. Change it now and turn on the authenticator app in Settings › Security.",
    },
    email_reauth: {
      subject: "{code} is your Descall confirmation code",
      eyebrow: "Account security",
      codeLabel: "Your confirmation code",
      title: "Is this you?",
      intro: "Enter this code to change the email address on your account.",
      preheader: "Your confirmation code: {code} · valid for {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "If you didn't ask for this, don't share the code and change your password. The address can't change without it.",
    },
    password_reset: {
      subject: "{code} is your Descall password reset code",
      eyebrow: "Password reset",
      codeLabel: "Your reset code",
      title: "Reset your password",
      intro: "Enter this code in Descall to choose a new password.",
      preheader: "Your reset code: {code} · valid for {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "If you didn't ask to reset your password, you can ignore this email; your password stays the same.",
    },
    common: {
      hi: "Hi {name},",
      codeLabel: "Your code",
      valid: "Valid for {minutes, plural, one {# minute} other {# minutes}}",
      copyHint: "You can select and copy the code.",
      never: "Descall staff will never ask for your code. Don't share it with anyone.",
      nextTitle: "What's next?",
      step1Title: "Add your friends",
      step1Body: "Find them by username or share your invite link.",
      step2Title: "Join a server",
      step2Body: "Join a community or create your own in seconds.",
      step3Title: "Start talking",
      step3Body: "Message, voice and video call, share your screen.",
      getApp: "Descall goes where you go",
      appWin: "Download for Windows",
      appIos: "Get it on the App Store",
      appWeb: "Open in browser",
      help: "Need help?",
      write: "Write to us:",
      privacy: "Privacy",
      terms: "Terms",
      why: "You received this email because of an action on your Descall account.",
      privacyPath: "/privacy",
      termsPath: "/terms",
      downloadPath: "/download",
      textCode: "Your code",
      textValid: "Valid for {minutes, plural, one {# minute} other {# minutes}}.",
    },
  },

  // Product-update opt-in (lib/marketingOptIn.js): mail + the confirm / unsubscribe pages.
  marketing: {
    subject: "Confirm Descall product updates",
    text: "Open this link to confirm product notes from Descall. If you do not confirm, we will not email you.",
    htmlLead: "Open the link below to confirm product notes from Descall. If you do not confirm, we will not email you.",
    confirmLabel: "Confirm subscription",
    pageConfirm: "You are confirmed. You can unsubscribe any time.",
    pageGone: "This link is invalid or has already been used.",
    pageUnsub: "You are unsubscribed. We will not send you product emails.",
    unsubscribeAnyTime: "Unsubscribe any time:",
    goToSite: "Go to descall.com",
  },

  // Native iOS alert push (lib/iosAlertPush.js) and web push (lib/webPush.js).
  push: {
    someone: "Someone",
    newMessage: "New message",
    voice: "🎤 Voice message",
    media: "📎 Sent an attachment",
    photo: "📷 Photo",
    video: "🎬 Video",
    group: "Group",
    mentioned: "{from} mentioned you",
    mentionedShort: "Mentioned you",
    friendTitle: "Friend Request",
    friendBody: "{from} wants to add you as a friend",
    calling: "{from} is calling",
    voiceCall: "Voice call",
    videoCall: "Video call",
    groupCallTitle: "{groupName} — Group Call",
    groupCallBody: "{from} started a group call",
    ownerTitle: "Server ownership",
    ownerBody: "You now own {serverName}",
    ownerServerFallback: "the server",
    feedbackTitle: "The Descall team replied",
    feedbackBody: "Your feedback got a reply",
    antibotTitle: "Anti-bot alert",
    antibotBody: "{count, plural, one {# account crossed} other {# accounts crossed}} the risk threshold (top {topScore})",
    antibotWatchBody: "{count, plural, one {# new watch list alert} other {# new watch list alerts}}",
    // Web push + FCM (browser and Android notifications)
    voicePlain: "Voice message",
    attachmentPlain: "Sent an attachment",
    incomingCall: "Incoming call",
    incomingCallBody: "Someone is calling you on Descall",
    missedCallFrom: "Missed call: {name}",
    answeredElsewhere: "The call was answered on another device.",
    declinedElsewhere: "The call was declined on another device.",
    missedCallBody: "You missed the call.",
    groupCall: "Group call",
    groupCallDefaultBody: "Someone started a group call on Descall",
    groupCallJoinVoice: "Join the voice call in your group.",
    groupCallJoinVideo: "Join the video call in your group.",
    messageRequestTitle: "Message request",
    messageRequestBody: "{from} sent you a message request",
  },

  // Default titles of maintenance windows (lib/maintenance.js).
  maintenance: {
    emergencyTitle: "Emergency maintenance",
    plannedTitle: "Planned maintenance",
  },

  // Names written into the database when a server is created (lib/starterChannelNames.js).
  starter: {
    textCategory: "Text Channels",
    text: "general",
    voiceCategory: "Voice Channels",
    voice: "Lobby",
  },

  // Account security notice (routes/auth.js notifyAccountChange).
  security: {
    passwordChangedSubject: "Your Descall password changed",
    passwordChangedBody: "The password of your Descall account was just changed. If this wasn't you, contact support.",
    emailChangeSubject: "Descall email change",
    emailChangeBody: "There is a request to change the email address on your Descall account. If this wasn't you, change your password now and contact support.",
  },

  // Personal data export file (lib/dataExport.js).
  dataExport: {
    note: "A copy of the personal data Descall keeps about this account (GDPR art. 15). Messages you sent are included; messages others sent you are their data and are not. Passwords, two-factor secrets, session and push keys are left out for security. Fraud and abuse prevention records are not disclosed so they cannot be gamed. Who reported you is not shown.",
    filePrefix: "descall-my-data",
    accountFallback: "account",
  },

  // Apple Watch previews (lib/watchApi.js).
  watch: {
    photo: "Photo",
    gif: "GIF",
    video: "Video",
    voice: "Voice message",
    file: "File",
    poll: "Poll",
    call: "Call",
  },

  // Admin sign-up statistics (lib/signupStats.js).
  stats: {
    weekOf: "Week of {date}",
    sourceDirect: "Direct",
    sourceGoogleOrganic: "Google (organic)",
    sourceReferral: "Friend invite",
    other: "Other",
    unknown: "Unknown",
    csvPeriod: "period",
    csvSignups: "signups",
    csvAverage: "average",
    csvFilePrefix: "signup-stats",
  },

  // Server templates: the English source is lib/serverTemplates.js itself (same tree).
  templates: require("../lib/serverTemplates").templateCatalog(),
};
