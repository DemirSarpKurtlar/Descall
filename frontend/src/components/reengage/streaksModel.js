/** Growth 3B "Seri ve görevler": pure text helpers (streaksModel.selftest.mjs). */
import { trDative } from "../../lib/trSuffix.js";

/** Turkish strings take the name already in the dative ("Ece'ye", "Kaan'a"). */
export function dat(name, locale) {
  return String(locale || "").startsWith("tr") ? trDative(name) || name : name;
}

/** Task title: always about one person ("Ece'ye mesaj at", "Kaan'a yaz, seriyi kurtar"). */
export function taskTitle(task, t, locale) {
  const name = dat(task?.target?.name || "", locale);
  if (task?.kind === "message") return t("rg3.tasks.message", { name });
  if (task?.kind === "save_streak") return t("rg3.tasks.saveStreak", { name });
  if (task?.kind === "voice") return t("rg3.tasks.voice", { minutes: task.goal || 10 });
  return "";
}

/** Second line: done time, the bonus, voice progress / who is in voice now. */
export function taskSub(task, t, locale) {
  if (task?.done && task.doneAt) return new Intl.DateTimeFormat(locale || "tr", { hour: "2-digit", minute: "2-digit" }).format(new Date(task.doneAt));
  if (task?.kind === "save_streak") return t("rg3.tasks.bonus", { bonus: task.bonus || 10 });
  if (task?.kind === "voice") {
    if (task.target?.name) return t("rg3.tasks.inVoiceNow", { name: task.target.name });
    return t("rg3.tasks.voiceProgress", { done: task.progress || 0, goal: task.goal || 10 });
  }
  if (task?.kind === "message") return t("rg3.tasks.messageSub");
  return "";
}

/** Shared streak line: "İkiniz de bugün yazdınız", "Kaan yazdı, seni bekliyor"... */
export function sharedSub(s, t) {
  if (s?.doneToday) return t("rg3.streaks.bothToday");
  if (s?.peerToday && !s?.meToday) return t("rg3.streaks.peerWaiting", { name: s.peer?.name || "" });
  if (s?.meToday && !s?.peerToday) return t("rg3.streaks.youWrote", { name: s.peer?.name || "" });
  if (!s?.count) return t("rg3.streaks.fresh");
  return t("rg3.streaks.neither");
}

export function doneCount(tasks = []) {
  return tasks.filter((x) => x.done).length;
}

/** Ring fill: a week is a full circle. */
export function ringPct(streak) {
  const n = Math.max(0, Number(streak) || 0);
  return n === 0 ? 0.02 : Math.min(1, ((n - 1) % 7) / 7 + 1 / 7);
}
