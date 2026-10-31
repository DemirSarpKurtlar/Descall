import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Ban, ChevronRight, Hash, Lock, MessageCircle, Search, Shield, Timer, Eraser, User, Users } from "../ui/Icon.jsx";
import {
  FREQUENT_COMMANDS, PERMISSION_LABELS, SLASH_GROUPS, SLASH_GROUP_BY_ID, groupSlashMatches,
} from "../../lib/slashCommands";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { Avatar } from "../ui/Avatar";
import { SLASH_ICONS } from "../polls/slashIconsMap";
import { presenceLabel, tNodes } from "../polls/dsxShared";
import { useLocale } from "../../context/LocaleContext";
import { formatDate, upper } from "../../i18n/format";
import { APP_TIMEZONE } from "../../lib/datetime";
import "../polls/dsx.css";
import "./SlashCommandMenu.css";

/**
 * 2.12.0 slash command menu (design/slash-commands-2026-10-18 · menu, menu-search,
 * menu-empty, ios-menu). Sections and the flat keyboard order come from the
 * composer (slashMenuSections) so the highlighted row is what Enter picks.
 */

/** Kept for older callers/tests: flat list in category order. */
export function orderSlashMatches(matches) {
  return groupSlashMatches(matches).flatMap((g) => g.items);
}

/** Category tabs; read `label` at render time (it follows the UI language). */
export const SLASH_CATEGORIES = [{ id: "all", labelKey: "slash.menu.all", color: null }, ...SLASH_GROUPS];

const iconFor = (cmd) => SLASH_ICONS[cmd?.name] || SLASH_ICONS.help;
const gradientFor = (cmd) => (SLASH_GROUP_BY_ID[cmd?.group] || SLASH_GROUP_BY_ID.general).gradient;
const argText = (a) => (a.optional ? `[${a.name}]` : `‹${a.name}›`);

function Marked({ text, ranges }) {
  const value = String(text || "");
  if (!ranges?.length) return value;
  const out = [];
  let at = 0;
  ranges.forEach(([s, e], i) => {
    if (s > at) out.push(value.slice(at, s));
    out.push(<mark key={i}>{value.slice(s, e)}</mark>);
    at = e;
  });
  if (at < value.length) out.push(value.slice(at));
  return out;
}

function CommandRow({ cmd, active, compact, onHover, onPick, index }) {
  const { t } = useLocale();
  const Icon = iconFor(cmd);
  const hl = cmd.highlight;
  const args = cmd.args || [];
  return (
    <button
      type="button"
      id={`scm-${cmd.id}`}
      role="option"
      aria-selected={active}
      aria-disabled={cmd.locked || undefined}
      className={`scm-row ${active ? "is-hi" : ""} ${cmd.locked ? "is-locked" : ""}`}
      onMouseMove={() => !active && onHover?.(index)}
      onClick={() => onPick?.(cmd)}
      title={cmd.locked ? cmd.lockReason : undefined}
    >
      <span className="ic" style={{ background: gradientFor(cmd) }}>
        <Icon />
      </span>
      <span className="bd">
        <span className="l1">
          <span className="cmd">/{hl?.field === "name" ? <Marked text={cmd.name} ranges={hl.ranges} /> : cmd.name}</span>
          <span className="lab">{hl?.field === "label" ? <Marked text={cmd.label} ranges={hl.ranges} /> : cmd.label}</span>
          {cmd.isNew ? <span className="dsx-badge dsx-b-new">{t("slash.menu.isNew")}</span> : null}
          {compact ? null : args.map((a) => <span key={a.name} className={`dsx-ah ${a.optional ? "opt" : ""}`}>{argText(a)}</span>)}
          {compact
            ? null
            : (cmd.aliases || []).map((al) => (
                <span key={al} className={`al ${cmd.matchedAlias === al ? "is-match" : ""}`}>
                  /{hl?.field === "alias" && hl.alias === al ? <Marked text={al} ranges={hl.ranges} /> : al}
                </span>
              ))}
        </span>
        <span className="d">
          {cmd.locked ? (
            cmd.lockReason
          ) : (
            <>
              {compact && args.length ? `${args.map(argText).join(" ")} · ` : null}
              {hl?.field === "description" ? <Marked text={cmd.description} ranges={hl.ranges} /> : cmd.description}
            </>
          )}
        </span>
      </span>
      {cmd.locked ? <Lock className="lock" aria-label={t("slash.menu.locked")} /> : null}
      {!cmd.locked && active && !compact ? <span className="ent dsx-kbd" aria-hidden="true">↵</span> : null}
      {!cmd.locked && compact ? <ChevronRight className="chev" aria-hidden="true" /> : null}
    </button>
  );
}

function Detail({ cmd }) {
  const { t } = useLocale();
  if (!cmd) return <div className="scm-det" />;
  const Icon = iconFor(cmd);
  const where = [
    { id: "server", label: t("slash.menu.whereServer"), icon: Hash, on: true },
    { id: "group", label: t("slash.menu.whereGroup"), icon: Users, on: !cmd.serverOnly },
    { id: "dm", label: t("slash.menu.whereDm"), icon: MessageCircle, on: !cmd.serverOnly && Boolean(cmd.dm || cmd.casino) },
  ];
  const perm = cmd.permission && cmd.permission !== "USE_APPLICATION_COMMANDS"
    ? t("slash.menu.permPlusApp", { perm: PERMISSION_LABELS[cmd.permission] || cmd.permission })
    : t("slash.menu.appCommands");
  const optionalArg = (cmd.args || []).find((a) => a.optional);
  return (
    <div className="scm-det" aria-live="polite">
      <span className="big" style={{ background: gradientFor(cmd) }}>
        <Icon />
      </span>
      <h4>
        /{cmd.name}
        <span>{cmd.label}</span>
      </h4>
      <p>{cmd.detail || cmd.description}</p>
      {cmd.usage?.length ? (
        <div>
          <div className="k">{t("slash.menu.usage")}</div>
          <div className="scm-code">
            {cmd.usage.map(([code, note], i) => (
              <div key={i}>
                {code}
                {note ? (
                  <>
                    <br />
                    <span className="c">{note}</span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {optionalArg && !cmd.usage?.length ? (
        <div>
          <div className="k">{t("slash.menu.argument")}</div>
          <div className="scm-code">
            [{optionalArg.name}] <span className="c">· {t("slash.menu.optional")}</span>
          </div>
        </div>
      ) : null}
      {cmd.aliases?.length ? (
        <div>
          <div className="k">{t("slash.menu.aliases")}</div>
          <div className="scm-ctxs">
            {cmd.aliases.map((a) => (
              <span key={a} className="scm-chipx">/{a}</span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="k">{t("slash.menu.worksIn")}</div>
        <div className="scm-ctxs">
          {where.map((w) => (
            <span key={w.id} className={`scm-chipx ${w.on ? "" : "is-off"}`}>
              <w.icon /> {w.label}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="k">{t("slash.menu.permission")}</div>
        <span className="scm-chipx" style={{ height: 28 }}>
          {cmd.locked ? <Lock /> : <Shield />} {perm}
        </span>
        {cmd.locked ? <p style={{ marginTop: 8, color: "#ffb88a" }}>{cmd.lockReason}</p> : null}
      </div>
    </div>
  );
}

function useMenuMotion() {
  const reduce = useReducedMotion();
  return reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: REDUCED_MOTION_FADE }
    : {
        initial: { opacity: 0, y: 10, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 6, scale: 0.98 },
        transition: framerSpring(SPRINGS.materialize || SPRINGS.default),
      };
}

export default function SlashCommandMenu({
  sections = [],
  flat = [],
  activeIndex = 0,
  onHover,
  onPick,
  query = "",
  category = "all",
  onCategory,
  compact = false,
  showDetail = true,
  menuRef,
  allCommands = [],
  onPickFrequent,
}) {
  const { t, locale } = useLocale();
  const listRef = useRef(null);
  const motionProps = useMenuMotion();
  const q = String(query || "");
  const empty = flat.length === 0;
  const noResults = empty && q.trim().length > 0;

  useEffect(() => {
    const el = listRef.current?.querySelector(".scm-row.is-hi");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flat.length]);

  const title = noResults ? t("slash.menu.noResults") : q.trim() ? t("slash.menu.resultsFor", { query: q }) : t("slash.menu.title");
  const count = `${t("slash.menu.count", { count: flat.length })}${q.trim() ? "" : ` · ${t("slash.menu.typeToFilter")}`}`;
  const frequent = FREQUENT_COMMANDS.map((n) => allCommands.find((c) => c.name === n)).filter(Boolean);
  const detailOn = showDetail && !compact && !noResults;

  let n = -1;
  return (
    <motion.div
      ref={menuRef}
      className={`slash-command-menu scm dsx-heavy ${compact ? "is-compact" : ""} ${detailOn ? "" : "is-single"}`}
      role="listbox"
      aria-label={t("slash.menu.aria")}
      aria-activedescendant={flat[activeIndex] ? `scm-${flat[activeIndex].id}` : undefined}
      onMouseDown={(e) => e.preventDefault()}
      {...motionProps}
    >
      <div className="lcol">
        <div className="scm-head">
          <Search className="dsx-ico" />
          <b>{title}</b>
          <span>{count}</span>
        </div>
        {noResults ? null : (
          <div className="scm-cats" role="tablist" aria-label={t("slash.menu.category")}>
            {SLASH_CATEGORIES.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`scm-cat ${category === c.id ? "is-on" : ""}`}
                style={c.color ? { "--c": c.color } : undefined}
                onClick={() => onCategory?.(c.id)}
                title={compact ? undefined : `⌘${i + 1}`}
              >
                {c.color ? <i /> : null}
                {c.labelKey ? t(c.labelKey) : c.label}
              </button>
            ))}
          </div>
        )}
        <div className="scm-list" ref={listRef}>
          {noResults ? (
            <div className="scm-empty">
              <span className="eic">
                <Search />
              </span>
              <b>{t("slash.menu.noCommand", { query: q })}</b>
              <p>
                {t("slash.menu.enterSends")}
                <br />
                {tNodes(t, "slash.menu.seeAll", { help: <b style={{ fontSize: 13, color: "var(--dsx-t1)" }}>/help</b> })}
              </p>
              {frequent.length ? (
                <>
                  <div className="sect">{t("slash.menu.frequent")}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                    {frequent.map((c) => {
                      const Icon = iconFor(c);
                      return (
                        <button key={c.name} type="button" className="scm-chipx" style={{ height: 30, padding: "0 11px" }} onClick={() => onPickFrequent?.(c)}>
                          <span style={{ color: SLASH_GROUP_BY_ID[c.group]?.color, display: "inline-flex" }}>
                            <Icon />
                          </span>
                          /{c.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : empty ? (
            <div className="scm-empty">
              <p>{t("slash.menu.emptyCategory")}</p>
            </div>
          ) : (
            sections.map((s) => (
              <div key={s.id} role="group" aria-label={s.label}>
                <div className="dsx-sg">{upper(s.label, locale)}</div>
                {s.items.map((cmd) => {
                  n += 1;
                  return (
                    <CommandRow key={`${s.id}-${cmd.id}`} cmd={cmd} index={n} active={n === activeIndex} compact={compact} onHover={onHover} onPick={onPick} />
                  );
                })}
              </div>
            ))
          )}
        </div>
        {compact ? null : (
          <div className="scm-foot" aria-hidden="true">
            <span><b className="dsx-kbd">↑</b><b className="dsx-kbd">↓</b> {t("slash.menu.kNavigate")}</span>
            <span><b className="dsx-kbd">↵</b> {t("slash.menu.kSelect")}</span>
            <span><b className="dsx-kbd">⇥</b> {t("slash.menu.kComplete")}</span>
            <span><b className="dsx-kbd">⌘</b><b className="dsx-kbd">1–5</b> {t("slash.menu.kCategory")}</span>
            <span className="r"><b className="dsx-kbd">esc</b> {t("slash.menu.kClose")}</span>
          </div>
        )}
      </div>
      {detailOn ? <Detail cmd={flat[activeIndex] || flat[0]} /> : null}
    </motion.div>
  );
}

/* ---------------- argument pickers ---------------- */
function Pres({ status }) {
  if (!status) return null;
  return <i className={`dsx-pres sm ${status}`} />;
}

function markPrefix(text, q) {
  const v = String(text || "");
  if (!q) return v;
  const i = v.toLocaleLowerCase("tr").indexOf(q.toLocaleLowerCase("tr"));
  if (i < 0) return v;
  return (
    <>
      {v.slice(0, i)}
      <mark>{v.slice(i, i + q.length)}</mark>
      {v.slice(i + q.length)}
    </>
  );
}

/** "Choose a user · “yi”": recent people here / all members (+ yourself when the arg is optional). */
export function UserPicker({ query = "", sections = [], activeIndex = 0, onHover, onPick, compact = false, self = null, menuRef }) {
  const { t } = useLocale();
  const motionProps = useMenuMotion();
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.querySelector(".dsx-pr-row.is-sel")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);
  let n = -1;
  const total = sections.reduce((s, x) => s + x.items.length, 0);
  return (
    <motion.div ref={menuRef} className={`slash-command-menu scm-picker dsx-heavy ${compact ? "is-compact" : ""}`} role="listbox" aria-label={t("slash.picker.user")} onMouseDown={(e) => e.preventDefault()} {...motionProps}>
      <div className="dsx-pk-h">
        <User className="dsx-ico" size={16} />
        <b>{t("slash.picker.user")}</b>
        {query ? ` · “${query}”` : null}
        {compact ? null : <span className="r">{`↑↓ ${t("slash.menu.kNavigate")} · ↵ ${t("slash.menu.kSelect")} · ⇥ ${t("slash.menu.kComplete")}`}</span>}
      </div>
      <div className="dsx-pk-list" ref={listRef}>
        {sections.map((s) => (
          <div key={s.id}>
            <div className="dsx-sg" style={{ margin: "4px 18px 4px" }}>{s.label}</div>
            {s.items.map((it) => {
              n += 1;
              const idx = n;
              const active = idx === activeIndex;
              const u = it.user;
              const name = u.nickname || u.displayName || u.username;
              return (
                <button key={u.id} type="button" role="option" aria-selected={active} className={`dsx-pr-row ${active ? "is-sel" : ""}`} onMouseMove={() => !active && onHover?.(idx)} onClick={() => onPick?.(it)}>
                  <span className="av">
                    <Avatar size={38} name={name} user={u} imageUrl={u.avatarUrl || undefined} animate="never" />
                    <Pres status={it.presence} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm" style={it.roleColor ? { color: it.roleColor } : undefined}>{markPrefix(name, query)}</div>
                    <div className="un">
                      @{markPrefix(u.username, query)} · {it.status || presenceLabel(t, it.presence)}
                    </div>
                  </div>
                  <div className="r">
                    {it.roleName && !compact ? (
                      <span className="dsx-rolepill" style={{ "--c": it.roleColor || "#8a93a8" }}>
                        <i />
                        {it.roleName}
                      </span>
                    ) : null}
                    {active && !compact ? <span className="dsx-kbd">↵</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {!total ? <div className="dsx-line" style={{ margin: "8px 18px", color: "var(--dsx-t3)" }}>{t("slash.picker.noMembers")}</div> : null}
        {self ? (
          <div className="dsx-pr-row" style={{ opacity: 0.8, cursor: "default" }}>
            <span className="av">
              <Avatar size={38} name={self.displayName || self.username} user={self} imageUrl={self.avatarUrl || undefined} animate="never" />
              <Pres status="online" />
            </span>
            <div>
              <div className="nm">{t("slash.picker.self")}</div>
              <div className="un">{t("slash.picker.selfHint")}</div>
            </div>
          </div>
        ) : null}
        <div style={{ height: 8 }} />
      </div>
    </motion.div>
  );
}

/** "Choose a duration" for /timeout, with the effect spelled out. */
export function DurationPicker({ durations = [], activeIndex = 0, onPick, onHover, target = null, reason = "", compact = false, menuRef }) {
  const { t, locale } = useLocale();
  const motionProps = useMenuMotion();
  const d = durations[activeIndex] || durations[0];
  const until = d ? new Date(Date.now() + d.seconds * 1000) : null;
  const untilLabel = until
    ? d.seconds >= 86400
      ? formatDate(until, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE })
      : formatDate(until, locale, { hour: "2-digit", minute: "2-digit", timeZone: APP_TIMEZONE })
    : "";
  const tname = target ? target.nickname || target.displayName || target.username : null;
  return (
    <motion.div ref={menuRef} className={`slash-command-menu scm-picker dsx-heavy ${compact ? "is-compact" : ""}`} role="listbox" aria-label={t("slash.picker.duration")} onMouseDown={(e) => e.preventDefault()} {...motionProps}>
      <div className="dsx-pk-h">
        <Timer className="dsx-ico" size={16} />
        <b>{t("slash.picker.duration")}</b>
        {compact ? null : <span className="r">{`←→ ${t("slash.menu.kNavigate")} · ↵ ${t("slash.menu.kSelect")}`}</span>}
      </div>
      <div className="dsx-durs">
        {durations.map((x, i) => (
          <button key={x.token} type="button" role="option" aria-selected={i === activeIndex} className={`dsx-dur ${i === activeIndex ? "is-on" : ""}`} onMouseMove={() => i !== activeIndex && onHover?.(i)} onClick={() => onPick?.(x)}>
            {x.label}
          </button>
        ))}
      </div>
      {d ? (
        <div className="warn">
          {target ? <Avatar size={36} name={tname} user={target} imageUrl={target.avatarUrl || undefined} animate="never" /> : null}
          <div>
            {tNodes(t, "slash.picker.timeoutEffect", {
              name: tname ? <b style={{ color: target.roleColor || "var(--dsx-t1)" }}>{tname}</b> : t("slash.picker.member"),
              until: <b className="t">{t("slash.picker.until", { time: untilLabel })}</b>,
            })}
          </div>
        </div>
      ) : null}
      <div className="dsx-lbl" style={{ margin: "0 18px 6px" }}>
        {t("polls.reason")} <i>{t("slash.picker.reasonNote")}</i>
      </div>
      <div className={`reason ${reason ? "" : "is-empty"}`}>{reason || t("slash.picker.reasonPlaceholder")}</div>
    </motion.div>
  );
}

/** /purge: how many messages. */
export function CountPicker({ counts = [], activeIndex = 0, onPick, onHover, compact = false, menuRef }) {
  const { t } = useLocale();
  const motionProps = useMenuMotion();
  return (
    <motion.div ref={menuRef} className={`slash-command-menu scm-picker dsx-heavy ${compact ? "is-compact" : ""}`} role="listbox" aria-label={t("slash.picker.countAria")} onMouseDown={(e) => e.preventDefault()} {...motionProps}>
      <div className="dsx-pk-h">
        <Eraser className="dsx-ico" size={16} />
        <b>{t("slash.picker.countTitle")}</b>
        {compact ? null : <span className="r">{`←→ ${t("slash.menu.kNavigate")} · ↵ ${t("slash.menu.kSelect")} · 1–100`}</span>}
      </div>
      <div className="dsx-durs" style={{ paddingBottom: 16 }}>
        {counts.map((c, i) => (
          <button key={c} type="button" role="option" aria-selected={i === activeIndex} className={`dsx-dur ${i === activeIndex ? "is-on" : ""}`} onMouseMove={() => i !== activeIndex && onHover?.(i)} onClick={() => onPick?.(c)}>
            {c}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export { Ban as BanIcon };
