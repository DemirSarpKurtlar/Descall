/** Passkeys ("passkey.*"): sign-in entry, Settings > Security (control center, draft A), sign-in states, post-sign-in suggestion, "not me" page, re-auth, errors, desktop handoff page. Same keys in every passkey.<locale>.js. */
export const PASSKEY_EN = {
  "signIn": {
    "button": "Sign in with a passkey",
    "busy": "Waiting for your passkey…",
    "handoffTitle": "Continue in your browser",
    "handoffLead": "Descall opened in your browser. Check that the code there is {code}, then confirm with your passkey.",
    "handoffReopen": "Open the page again",
    "cancel": "Cancel",
    "autofillHint": "Tap the username field to see your saved passkeys too."
  },
  "settings": {
    "title": "Passkeys",
    "lead": "Your password always stays. A passkey is an extra, faster and safer way to sign in with your fingerprint, face or device PIN.",
    "empty": "You have not added a passkey yet.",
    "add": "Add a passkey",
    "nameLabel": "Passkey name",
    "namePlaceholder": "Name (optional), for example Work laptop",
    "created": "Added: {date}",
    "lastUsed": "Last used: {date}",
    "neverUsed": "Not used yet",
    "synced": "Synced",
    "thisDevice": "Single device",
    "suspended": "Turned off: it may have been copied. Remove it and add a new one.",
    "rename": "Rename",
    "save": "Save",
    "cancel": "Cancel",
    "remove": "Remove",
    "removeTitle": "Remove this passkey?",
    "removeLead": "You can no longer sign in with \"{name}\". Your password and other passkeys keep working. You can also delete the copy on your device in its password settings.",
    "added": "Passkey added.",
    "removed": "Passkey removed.",
    "renamed": "Name saved.",
    "unavailableHere": "This device or browser does not support passkeys. You can add one from a supported device.",
    "loadFailed": "Could not load your passkeys.",
    "sessionMethod": "Passkey",
    "retry": "Try again",
    "count": "{count, plural, one {# passkey} other {# passkeys}}",
    "platform": {
      "web": "Web",
      "ios": "iPhone / iPad",
      "android": "Android",
      "windows": "Windows",
      "electron": "Desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Other"
    }
  },
  "reauth": {
    "title": "Confirm it is you first",
    "lead": "To add a passkey, confirm that this account is yours.",
    "password": "Current password",
    "code": "6-digit code",
    "sendCode": "Email me a code",
    "codeSent": "A code was sent to {email}.",
    "withPasskey": "Confirm with an existing passkey",
    "totpHint": "You can also enter the code from your authenticator app.",
    "continue": "Continue"
  },
  "err": {
    "cancelled": "Cancelled.",
    "no_credential": "There is no Descall passkey on this device. Sign in with your password, then add one in Settings > Security.",
    "timeout": "Time ran out. Try again.",
    "already_registered": "You already have a Descall passkey on this device.",
    "unsupported": "This device does not support passkeys.",
    "security": "This device has not verified the Descall domain yet. Try again in a bit.",
    "busy": "Another passkey request is open.",
    "aborted": "Cancelled.",
    "network": "Can't reach Descall. Check your connection.",
    "server": "Something went wrong. Try again.",
    "unknown": "The passkey request could not finish. Try again.",
    "uvRequired": "Your device did not confirm it is you (PIN, fingerprint or face). Try again, or sign in with your password.",
    "unknownCredential": "This passkey is no longer on your account. Sign in with your password.",
    "suspended": "This passkey was turned off because it may have been copied. Sign in with your password and remove it in Settings > Security.",
    "unavailable": "Passkeys are not available right now. Sign in with your password.",
    "reauthRequired": "Confirm it is you first.",
    "limit": "You have reached the maximum number of passkeys. Remove one first.",
    "handoffExpired": "The link expired. Start again.",
    "badPassword": "Incorrect password.",
    "badCode": "Incorrect code.",
    "badName": "Enter a name.",
    "rateLimited": "Too many attempts. Wait a bit."
  },
  "desktop": {
    "title": "Passkey for the Descall desktop app",
    "signinLead": "Use your passkey to sign in to the Descall app.",
    "registerLead": "Add a passkey to @{username} from this browser or your phone.",
    "matchLabel": "Code in the app",
    "matchHint": "If this code is not the one you see in the Descall app, do not continue.",
    "signinButton": "Confirm with passkey",
    "registerButton": "Create passkey",
    "doneSignin": "Done. You can go back to the Descall app.",
    "doneRegister": "Passkey added. You can go back to the Descall app.",
    "expired": "This link expired or was already used. Start again in the Descall app.",
    "noCode": "This page opens from the Descall desktop app.",
    "unsupported": "This browser does not support passkeys. Open it in a current Chrome, Edge, Safari or Firefox.",
    "loading": "Loading…"
  },
  "login": {
    "button": {
      "passkey": "Sign in with a passkey",
      "face": "Sign in with Face ID",
      "finger": "Sign in with fingerprint",
      "hello": "Sign in with Windows Hello"
    },
    "note": "Face ID, fingerprint or Windows Hello. Your password always works too."
  },
  "state": {
    "method": {
      "windows": "Windows Hello",
      "ios": "Face ID",
      "android": "Fingerprint",
      "web": "Passkey"
    },
    "waitTitle": {
      "windows": "Waiting for Windows Hello",
      "ios": "Waiting for Face ID",
      "android": "Waiting for fingerprint",
      "web": "Waiting for your passkey"
    },
    "waitLead": {
      "windows": "Use your face, fingerprint or PIN in the system window.",
      "ios": "Use Face ID in the system window.",
      "android": "Use your fingerprint or screen lock in the system window.",
      "web": "Pick your passkey in the browser window and confirm."
    },
    "okTitle": "Welcome, {name}",
    "okTitleNoName": "Welcome",
    "okLead": "You signed in with {method}. This counts as two-step verification, so no code.",
    "okProgress": "Opening your servers",
    "cancelTitle": "Sign-in cancelled",
    "cancelLead": "No problem. Try again or sign in with your password.",
    "retry": "Try again",
    "password": "Use password",
    "errTitle": "Passkey not verified",
    "errLead": "This passkey may have been removed from your account, or the request timed out.",
    "errDetail": "Details: {detail}",
    "noneTitle": "No passkey on this device",
    "noneLead": "Your Descall passkey may be on another device.",
    "optPhone": "Sign in with your phone",
    "optPhoneSub": "Scan the code with the phone that has the passkey",
    "optKey": "Security key",
    "optKeySub": "USB or NFC",
    "optPassword": "Sign in with password",
    "optPasswordSub": "You can add a passkey to this device afterwards",
    "label": {
      "wait": "System window open",
      "ok": "Success",
      "cancel": "Cancelled",
      "err": "Error",
      "none": "No passkey on this device"
    },
    "foot": {
      "windows": {
        "wait": "The Windows Hello window is open (face, fingerprint or PIN).",
        "ok": "The app opens a moment later.",
        "cancel": "Cancel was pressed in the Windows window.",
        "err": "The server did not recognize the passkey, or time ran out.",
        "none": "Windows found no Descall passkey on this computer."
      },
      "ios": {
        "wait": "The iOS sheet and the Face ID animation are open.",
        "ok": "A haptic tap, then your chats open.",
        "cancel": "The system sheet was closed.",
        "err": "The server did not recognize the passkey, or time ran out.",
        "none": "There is no Descall passkey in iCloud Keychain."
      },
      "android": {
        "wait": "The Google Password Manager sheet is open.",
        "ok": "A short vibration, then your chats open.",
        "cancel": "The sheet was closed with the back button.",
        "err": "The server did not recognize the passkey, or time ran out.",
        "none": "There is no Descall passkey on this phone."
      }
    }
  },
  "os": {
    "winHeader": "Windows Security",
    "winTitle": "Sign in with your passkey",
    "winText": "Use Windows Hello to sign in to {site}.",
    "winRecognizing": "Making sure it's you",
    "winMore": "More choices",
    "cancel": "Cancel",
    "qrTitle": "Sign in with your phone",
    "qrText": "Scan this code with the camera of the phone that has your passkey.",
    "usbTitle": "Use your security key",
    "usbText": "Insert your security key into the USB port and touch it.",
    "usbWait": "Waiting for the key",
    "gpmHeader": "Google Password Manager",
    "gpmTitle": "Use your saved passkey",
    "gpmText": "For descall.com. Confirm with your computer's screen lock.",
    "webText": "Pick your passkey in {provider} and confirm.",
    "iosTitle": "Sign In",
    "iosText": "Do you want to sign in to descall.com with your saved passkey?",
    "iosSub": "iCloud Keychain · Passkey",
    "continue": "Continue",
    "nfcTitle": "Security key",
    "nfcText": "Hold the key near the top of your phone.",
    "nfcSub": "Over NFC",
    "nfcWait": "Waiting",
    "andText": "To sign in to Descall",
    "andSub": "Passkey · Google Password Manager",
    "andTouch": "Touch the fingerprint sensor"
  },
  "preview": {
    "title": "What you see when you sign in",
    "live": "Live",
    "selected": "Selected: {name}. The window this passkey opens at sign-in:",
    "desktop": "Desktop · Windows",
    "phone": "Phone",
    "text": {
      "windows": "A Windows Hello passkey lives only on this computer. Phones do not see it; there you use your password or the phone's own passkey.",
      "ios": "iCloud Keychain: one tap on iPhone, iPad and Mac. On Windows you scan the code with your iPhone and confirm.",
      "mac": "iCloud Keychain: one tap on Mac, iPhone and iPad. On Windows you scan the code with your iPhone and confirm.",
      "android": "Google Password Manager: shows on Android and in Chrome.",
      "key": "Security key: works on every device, over USB on computers and NFC on phones.",
      "web": "{provider}: shows in the browsers and phones where this manager is installed."
    },
    "idle": "{count, plural, one {Not used for # day.} other {Not used for # days.}}",
    "states": "States",
    "platform": "Platform",
    "plat": {
      "windows": "Windows",
      "ios": "iPhone",
      "android": "Android"
    }
  },
  "time": {
    "today": "Today {time}",
    "yesterday": "Yesterday {time}",
    "yesterdayShort": "Yesterday",
    "daysAgo": "{count, plural, one {# day ago} other {# days ago}}",
    "never": "Never used",
    "now": "now"
  },
  "center": {
    "crumbLabel": "Location",
    "crumbSecurity": "Security",
    "lead": "Fast sign-in without a password. Your password keeps working.",
    "kpi": {
      "count": "Passkeys",
      "platforms": "{count, plural, one {on # platform} other {on # platforms}}",
      "share": "Passkey sign-ins",
      "basis": "Based on your last {count} sessions",
      "mixLabel": "Passkey {passkey}%, password {password}%, Google and Apple {social}%",
      "noData": "No data yet",
      "speed": "Average sign-in",
      "seconds": "{s} s",
      "passwordSpeed": "With password: {s} s",
      "noMeasure": "Not measured yet",
      "decimal": ".",
      "security": "Security",
      "methods": "{count, plural, one {# method} other {# methods}}"
    },
    "level": {
      "excellent": "Excellent",
      "good": "Good",
      "fair": "Fair",
      "weak": "Weak"
    },
    "check": {
      "password": "Password or a verified sign-in",
      "email": "Verified e-mail",
      "secondFactor": "Two-step verification",
      "passkey": "At least one passkey",
      "backup": "A second passkey on another platform",
      "fresh": "No unused or turned-off passkey"
    },
    "chip": {
      "password": "Password",
      "alwaysOn": "Always on",
      "none": "None",
      "app": "Authenticator app",
      "email2fa": "E-mail code",
      "on": "On",
      "off": "Off",
      "passkey": "Passkey",
      "registered": "{count} saved"
    },
    "stale": "The passkey \"{name}\" has not been used for {count} days. If you no longer use that device, remove it.",
    "suspendedShort": "was turned off because it may have been copied. Remove it and add a new one.",
    "review": "Review",
    "offline": "You are offline. Changes work again once you are connected; the list refreshes then.",
    "col": {
      "passkey": "Passkey",
      "last": "Last used",
      "added": "Added",
      "usage": "30 days"
    },
    "pill": {
      "thisDevice": "This device",
      "days": "{count} days",
      "off": "Off",
      "counts2fa": "Counts as 2FA",
      "localOnly": "This device only",
      "synced": "Synced",
      "noSync": "Not synced"
    },
    "kind": {
      "windows": "Windows Hello",
      "ios": "iCloud Keychain",
      "mac": "iCloud Keychain",
      "android": "Google Password Manager",
      "key": "Security key",
      "web": "Passkey"
    },
    "client": {
      "web": "Web",
      "ios": "iPhone",
      "android": "Android",
      "windows": "Desktop",
      "electron": "Desktop",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Other"
    },
    "via": {
      "web": "Web",
      "ios": "iPhone app",
      "android": "Android app",
      "windows": "Desktop app",
      "electron": "Desktop app",
      "macos": "Mac",
      "linux": "Linux",
      "other": "Other"
    },
    "sync": {
      "local": "This device only",
      "icloud": "Syncs with iPhone, iPad and Mac",
      "google": "Syncs with Android and Chrome",
      "key": "USB / NFC, not synced",
      "manager": "Syncs with {provider}",
      "synced": "Syncs across your devices"
    },
    "drawer": {
      "sync": "Sync",
      "created": "Created",
      "where": "Where",
      "lastUsed": "Last used",
      "place": "Location",
      "placeUnknown": "Unknown",
      "total": "Total sign-ins",
      "last30": "Last 30 days",
      "count30": "{count, plural, one {# sign-in} other {# sign-ins}}",
      "info": "Signing in with this passkey asks for no code; it counts as two-step verification.",
      "rename": "Rename"
    },
    "remove": {
      "title": "Remove \"{name}\"?",
      "lead": "You can no longer sign in with this passkey. Your password and other passkeys are not affected.",
      "current": "You signed in with this passkey; this session stays open.",
      "reason": "Reason",
      "reasons": {
        "lost": "I lost the device",
        "unused": "I don't use it anymore",
        "readd": "I'll add it again",
        "other": "Other"
      },
      "endSessions": "Also end the other sessions this passkey opened",
      "sessionsEnded": "{count, plural, one {# session ended.} other {# sessions ended.}}"
    },
    "added": {
      "title": "Passkey added",
      "sub": "{provider} · this device",
      "name": "Name",
      "undo": "Undo",
      "undone": "Undone, the passkey was removed."
    },
    "names": {
      "home": "Home computer",
      "work": "Work computer",
      "laptop": "Laptop",
      "gaming": "Gaming PC",
      "macbook": "MacBook",
      "iphone": "My iPhone",
      "ipad": "iPad",
      "phone": "My phone",
      "tablet": "Tablet",
      "keyMain": "Main key",
      "keyBackup": "Backup key",
      "keyChain": "Keychain key"
    },
    "add": {
      "ready": "Ready. Continue and your device's passkey window opens.",
      "thisDevice": {
        "passkey": "This device or your browser's password manager",
        "face": "This iPhone · Face ID",
        "finger": "This phone · fingerprint",
        "hello": "This computer · Windows Hello"
      },
      "prefer": {
        "remoteDevice": "On your phone: scan the code, save it with your phone",
        "securityKey": "Security key: USB or NFC"
      }
    },
    "activity": {
      "title": "Recent activity",
      "all": "All",
      "empty": "No activity yet.",
      "signin": "Signed in with {name}",
      "added": "{name} added",
      "renamed": "Renamed to {name}",
      "removed": "{name} removed",
      "new_place": "{name} used from a new place",
      "suspended": "{name} turned off",
      "report_confirmed": "{name}: answered \"It was me\"",
      "report_revoked": "{name}: \"This wasn't me\", sessions ended"
    },
    "backup": {
      "cap": "Backup advice",
      "title": "Add a second passkey",
      "lead": "If you lose one device, you sign in with the other. Another platform is safest.",
      "remoteDevice": "Add on your phone",
      "remoteDeviceSub": "Scan the code, save it with your phone",
      "securityKey": "Security key",
      "securityKeySub": "USB or NFC",
      "computer": "Add on your computer",
      "computerSub": "descall.com › Settings › Security › Passkeys"
    },
    "email": {
      "cap": "Security e-mail",
      "title": "A new passkey was added to your account",
      "body": "\"{name}\"{provider} was added on {when} {from}. If this wasn't you, remove it right away and change your password.",
      "fromPlace": "from {place}",
      "fromSomewhere": "from an unknown place",
      "notMe": "This wasn't me",
      "itWasMe": "It was me",
      "lead": "You get this e-mail when a passkey is added or used from a new place. \"This wasn't me\" removes the passkey and ends every session.",
      "noEmail": "Your e-mail address is not verified, so these e-mails cannot reach you. Verify it under Security."
    },
    "alert": {
      "cap": "Unusual use",
      "titleCity": "{name} was used from a new city",
      "titleCountry": "{name} was used from a new country",
      "signin": "Sign-in: {place}",
      "before": "Before only {places}",
      "firstFar": "First time this passkey was used here",
      "usual": "Usual place",
      "me": "It was me",
      "revoke": "Remove and end sessions",
      "confirmTitle": "Remove the passkey and end the other sessions?",
      "confirmLead": "\"{name}\" is removed and every session except this device ends. Changing your password afterwards is a good idea.",
      "doneMe": "Done, the alert is closed.",
      "doneRevoke": "{count, plural, one {Passkey removed, # session ended.} other {Passkey removed, # sessions ended.}}",
      "noneTitle": "No unusual use",
      "noneLead": "If a passkey signs in from a city it never used, we warn you here and by e-mail.",
      "countryOnly": "On this connection the location is known by country only; the alert comes for a new country."
    },
    "empty": {
      "title": "No passkeys yet",
      "lead": {
        "passkey": "Add a passkey to this device; next time you type no password and no code.",
        "face": "Add a passkey with Face ID; next time you type no password and no code.",
        "finger": "Add a passkey with your fingerprint; next time you type no password and no code.",
        "hello": "Add a passkey with Windows Hello; next time you type no password and no code."
      }
    },
    "suggestToggle": "Suggest a passkey after a password sign-in",
    "suggestToggleSub": "For this device only",
    "entry": {
      "title": "Passkeys",
      "desc": "{count} saved · Security {score}",
      "none": "Fast sign-in without a password. No passkey yet.",
      "alerts": "{count, plural, one {# alert} other {# alerts}}"
    }
  },
  "suggest": {
    "title": {
      "windows": "Next time, sign in with Windows Hello",
      "ios": "Next time, sign in with Face ID",
      "android": "Next time, sign in with your fingerprint",
      "web": "Next time, sign in with a passkey"
    },
    "phoneTitle": {
      "windows": "Sign in faster with Windows Hello",
      "ios": "Sign in faster with Face ID",
      "android": "Sign in faster with your fingerprint",
      "web": "Sign in faster with a passkey"
    },
    "lead": "No password and no code, in about 2 seconds.",
    "phoneLead": "No password and no code next time. Your password keeps working.",
    "c1": "Your password stays; a passkey is an extra, faster way in.",
    "c2": "A passkey sign-in counts as two-step verification, so no code.",
    "c2short": "Counts as two-step verification.",
    "c3": "Your face or fingerprint never leaves this device.",
    "c3ios": "Works on your iPad and Mac too, with iCloud Keychain.",
    "c3android": "Works on your other Android devices too, with Google Password Manager.",
    "later": "Remind me later",
    "notNow": "Not now",
    "never": "Don't ask again on this device",
    "mini": "Passkey suggestion",
    "expand": "Open the passkey suggestion",
    "done": "Passkey added. Next time, sign in with {method}.",
    "needsReauth": "Confirm it's you in Settings to add it.",
    "openSettings": "Add in Settings",
    "signedIn": {
      "password": "Signed in with password",
      "2fa": "Signed in with password and verification code",
      "google": "Signed in with Google",
      "apple": "Signed in with Apple"
    }
  },
  "report": {
    "loading": "Loading…",
    "invalidTitle": "Link not valid",
    "invalid": "This link is not valid or was copied incompletely. Tap the button in the e-mail again.",
    "expiredTitle": "Link expired",
    "expired": "This link expired. Sign in and check Settings > Security > Passkeys.",
    "network": "Descall can't be reached. Check your connection and try again.",
    "title": {
      "added": "A new passkey was added to your account",
      "newPlace": "Your passkey was used from a new place"
    },
    "passkey": "Passkey",
    "when": "Time",
    "place": "Location",
    "device": "Device",
    "question": "Was this you?",
    "notMe": "This wasn't me",
    "revokeLead": "\"{name}\" is removed from your account and every session of your account ends. Then sign in with your password and change it.",
    "revokeLeadGone": "The passkey was already removed. We end every session of your account; then change your password.",
    "revokeButton": "Remove and end all sessions",
    "itWasMe": "It was me",
    "confirmLead": "Nothing changes; we close the alert.",
    "confirmButton": "Yes, it was me",
    "doneRevokedTitle": "Your account is safe",
    "doneRevoked": "{count, plural, one {Passkey removed and # session ended. Change your password now.} other {Passkey removed and # sessions ended. Change your password now.}}",
    "doneConfirmedTitle": "Thank you",
    "doneConfirmed": "We closed the alert.",
    "alreadyRevoked": "This link was already used: the passkey was removed and the sessions ended.",
    "alreadyConfirmed": "This alert was already answered: \"It was me\".",
    "openApp": "Go to Descall",
    "changePassword": "Sign in and change your password"
  }
};
