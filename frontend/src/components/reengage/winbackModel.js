/** Growth 3B "Arkadaştan çağrı": the default message, in the caller's own words (editable). */
export function defaultCallMessage(s, t) {
  const name = s?.target?.name || "";
  const reward = s?.reward || 50;
  return s?.serverName ? t("rg3.winback.defaultMsgServer", { name, server: s.serverName, amount: reward }) : t("rg3.winback.defaultMsg", { name, amount: reward });
}
