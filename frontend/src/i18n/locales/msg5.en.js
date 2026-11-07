/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_EN = {
  roles: {
    section: "Roles",
    subRole: "Role · its members get notified",
    subRoleAdmin: "Role · only admins can mention it",
    subEveryone: "Notifies everyone who can see this channel",
    subHere: "Notifies people who are online right now",
    unknown: "unknown role",
    aria: "Role: {name}",
    popover: "Role · {name}",
    everyoneCooldown: "You can use @everyone or @here again in {wait} s.",
  },
  preview: {
    settingDesc: "When off, app, browser and phone notifications show only \"New message\" instead of the message text.",
    saveError: "Couldn't save. Try again in a moment.",
  },
  schedule: {
    addAttachment: "Add a file",
    attachmentHint: "One photo or file, up to 100 MB",
    attachment: "Attachment",
    attachmentKept: "The attachment stays; you can change the text and time.",
    removeAttachment: "Remove attachment",
    errAttachment: "This file can't be scheduled. Pick a photo, video or document.",
    errTooLarge: "The file is too large. The limit is 100 MB.",
    errAttachNotReady: "Scheduling with a file isn't on the server yet. Remove the file to schedule just the text.",
    errUpload: "The file couldn't be uploaded. Check your connection and try again.",
  },
};
