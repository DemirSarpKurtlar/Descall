/** Channel permission notices: read-only channels, attachments, synced category rules, channel moves, user limit ("chperm.*", server audit P2 / P5). Same keys in every chperm.<locale>.js. */
export const CHPERM_EN = {
  "readOnlyChannel": "You can't send messages in this channel.",
  "readOnlyAnnouncement": "Only moderators can post in this announcement channel.",
  "noAttachments": "You can't attach files in this channel.",
  "noVoiceMessages": "You can't send voice messages in this channel.",
  "syncedWith": "Synced with the {name} category: these are the category's rules. Changing one here gives this channel its own rules.",
  "category": "category",
  "userLimit": "User limit",
  "userLimitSub": "How many people can join at once. 0 = no limit (up to 99).",
  "userLimitNone": "No limit",
  "userLimitInvalid": "Enter a number from 0 to 99.",
  "fromCategory": "From category",
  "moveSyncTitle": "Permissions in the new category",
  "moveSyncMsg": "#{channel} has its own permissions, and {category} has different ones. Which should it use?",
  "moveSyncUse": "Sync with {category}",
  "moveSyncKeep": "Keep its own permissions",
  "movedKeptOwn": "#{channel} kept its own permissions in {category}.",
};
