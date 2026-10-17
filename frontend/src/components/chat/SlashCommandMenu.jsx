import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useT } from "../../context/LocaleContext";
import { groupSlashMatches } from "../../lib/slashCommands";
import "./SlashCommandMenu.css";

/**
 * Slash command popover (design/coinflip-v2/d-command-menu.png): Liquid Glass,
 * grouped (Oyunlar / Kredi / Genel / Moderasyon), alias chips, keyboard row.
 * `items` must already be in grouped order (see orderSlashMatches) so the
 * keyboard index matches what is drawn.
 */
export function orderSlashMatches(matches) {
  return groupSlashMatches(matches).flatMap((g) => g.items);
}

export default function SlashCommandMenu({ items, activeIndex, onHover, onPick, menuRef }) {
  const t = useT();
  const reduce = useReducedMotion();
  const listRef = useRef(null);
  const groups = groupSlashMatches(items);

  useEffect(() => {
    const el = listRef.current?.querySelector(".slash2-it.is-hi");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, items.length]);

  let flat = -1;
  return (
    <motion.div
      ref={menuRef}
      className="slash-command-menu slash-menu-v2"
      role="listbox"
      aria-label={t("Slash commands")}
      aria-activedescendant={items[activeIndex] ? `slash2-${items[activeIndex].id}` : undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98, filter: "blur(6px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.985, filter: "blur(4px)" }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.3 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="slash2-top">
        <h5>{t("Commands")}</h5>
        <span>{t("{count} commands · type to filter", { count: items.length })}</span>
      </div>
      <div className="slash2-list" ref={listRef}>
        {groups.map((g, gi) => (
          <div key={g.id} role="group" aria-label={t(g.label)} className={gi ? "slash2-group has-sep" : "slash2-group"}>
            <div className="slash2-grp">{t(g.label)}</div>
            {g.items.map((cmd) => {
              flat += 1;
              const idx = flat;
              const active = idx === activeIndex;
              const Icon = cmd.Icon;
              return (
                <button
                  key={cmd.id}
                  id={`slash2-${cmd.id}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`slash2-it ${active ? "is-hi" : ""}`}
                  onMouseMove={() => !active && onHover(idx)}
                  onClick={() => onPick(cmd)}
                >
                  <span className="slash2-ico">{Icon ? <Icon size={18} strokeWidth={1.7} /> : null}</span>
                  <span className="slash2-bd">
                    <span className="slash2-l1">
                      <span className="slash2-cmd">/{cmd.name}</span>
                      {cmd.args ? <span className="slash2-args">{t(cmd.args)}</span> : null}
                      {(cmd.aliases || []).map((a) => (
                        <span key={a} className={`slash2-alias ${cmd.matchedAlias === a ? "is-match" : ""}`}>
                          /{a}
                        </span>
                      ))}
                    </span>
                    <span className="slash2-d">{t(cmd.hint)}</span>
                  </span>
                  {active ? (
                    <span className="slash2-kbd" aria-hidden="true">
                      ↵
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="slash2-foot" aria-hidden="true">
        <span>
          <b>↑</b>
          <b>↓</b>
          {t("navigate")}
        </span>
        <span>
          <b>↵</b>
          {t("select")}
        </span>
        <span>
          <b>⇥</b>
          {t("complete")}
        </span>
        <span className="slash2-r">
          <b>esc</b>
          {t("dismiss")}
        </span>
      </div>
    </motion.div>
  );
}
