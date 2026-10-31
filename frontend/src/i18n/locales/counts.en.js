/**
 * Count words placed after a number the code renders itself ("{n} roles"). Pass the
 * same number as {n} so every language picks the right plural form (Russian has
 * one / few / many), e.g. `${count} ${t("counts.roles", { n: count })}`.
 */
export const COUNTS_EN = {
  credits: "{n, plural, one {credit} other {credits}}",
  creditsTo: "{n, plural, one {credit to} other {credits to}}",
  uses: "{n, plural, one {use} other {uses}}",
  members: "{n, plural, one {member} other {members}}",
  roles: "{n, plural, one {role} other {roles}}",
  channels: "{n, plural, one {channel} other {channels}}",
  categories: "{n, plural, one {category} other {categories}}",
  replyingTo: "Replying to {name}",
};
