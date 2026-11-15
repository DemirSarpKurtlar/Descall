/**
 * Yayın panosu (Draft C): five columns (Taslak, Onay bekliyor, Zamanlanmış,
 * Yayında, Bitti) and the pinned strip on top. Cards are dragged between
 * columns; each move that changes what people see asks first (publish,
 * schedule, take down with a reason, approve, bring back). Cards dragged on
 * the strip are pinned; the strip is reordered by dragging. Keyboard: every
 * card opens with Enter and its menu (Shift+F10 / context menu) has the same moves.
 */
import { useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { AnnTile } from "../../announcements/AnnGlyph.jsx";
import { BOARD_COLUMNS, LOCALES, LOCALE_CODE, agoParts, plainText, dropAction, fmtDateTime, fmtNumber, fmtPct, isEveryone, langSummary, seenRate } from "./announcementsModel.js";
import { Chip, Ic, Menu } from "./ui.jsx";

const LIMIT = { draft: 8, pending: 6, scheduled: 8, live: 6, ended: 5 };

export function agoText(iso, t) {
  const p = agoParts(iso);
  if (!p) return "";
  if (p.unit === "now") return t("annc.ago.now");
  if (p.unit === "yesterday") return t("annc.ago.yesterday");
  return t(`annc.ago.${p.unit}`, { n: p.n });
}

export function audienceText(a, t) {
  if (isEveryone(a)) return t("annc.aud.all");
  const parts = [];
  if (a?.premium === "member") parts.push(t("annc.aud.premiumMember"));
  if (a?.premium === "non_member") parts.push(t("annc.aud.premiumNon"));
  if (a?.langs?.length) parts.push(a.langs.map((l) => LOCALE_CODE[l]).join(", "));
  if (a?.platforms?.length) {
    const p = [...a.platforms].sort().join(",");
    parts.push(p === "android,ios" ? t("annc.aud.mobile") : a.platforms.map((x) => t(`annc.platform.${x}`)).join(", "));
  }
  if (a?.newDays) parts.push(t("annc.aud.newDaysShort", { n: a.newDays }));
  return parts.join(" · ");
}

function prioChip(p, t) {
  if (p === "urgent") return <Chip tone="red">{t("annc.prio.urgent")}</Chip>;
  if (p === "important") return <Chip tone="gold">{t("annc.prio.important")}</Chip>;
  return <Chip tone="gray">{t("annc.prio.normal")}</Chip>;
}

function Card({ item, onOpen, onMenu, dragging, setDragging, pendingDrop, t, locale, menuOpen }) {
  const ref = useRef(null);
  const s = langSummary(item.langStates || {});
  const rate = seenRate(item);
  const gray = item.status === "draft" || item.status === "ended";
  const audPill = !isEveryone(item.audience) ? audienceText(item.audience, t) : t("annc.aud.all");
  return (
    <div
      ref={ref}
      className={`an-kc${dragging === item.id ? " is-dragging" : ""}${pendingDrop ? " is-pend" : ""}${menuOpen ? " is-menu" : ""}`}
      draggable
      role="button"
      tabIndex={0}
      aria-label={item.title}
      data-testid={`an-card-${item.id}`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        setDragging(item.id);
      }}
      onDragEnd={() => setDragging(null)}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          onMenu(item, ref);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(item, ref);
      }}
    >
      {item.status === "pending" ? (
        <div className="an-appr">
          <Ic name="shield" size={14} />
          {t("annc.board.awaiting")}
        </div>
      ) : null}
      <div className="an-kc-h">
        <AnnTile item={item} color={gray ? "#7a7f93" : item.color} size="sm" />
        <b>{item.title}</b>
      </div>
      {!pendingDrop ? <p>{plainText(item.content)}</p> : null}
      <div className="an-kc-chips">
        {pendingDrop ? <Chip tone="red">{t("annc.board.removing")}</Chip> : null}
        {!pendingDrop && item.status === "scheduled" && item.startsAt ? <Chip tone="dash">{fmtDateTime(item.startsAt, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</Chip> : null}
        {!pendingDrop && item.status === "ended" ? <Chip tone="gray">{t("annc.board.endedOn", { when: fmtDateTime(item.endedAt || item.updatedAt, locale, { day: "numeric", month: "short" }) })}</Chip> : null}
        {!pendingDrop && item.status !== "ended" && item.status !== "scheduled" && !(item.status === "draft" && s.missing.length && s.missing.length < 6) ? prioChip(item.priority, t) : null}
        {!pendingDrop && item.status === "live" && item.pinned ? <Chip tone="amber">{t("annc.board.pinnedN", { n: item.pinOrder || 1 })}</Chip> : null}
        {!pendingDrop && item.status === "draft" && s.missing.length && s.missing.length < 6 ? (
          <>
            {LOCALES.filter((l) => !s.missing.includes(l)).slice(0, 3).map((l) => (
              <span key={l} className="an-lc">
                {LOCALE_CODE[l]}
              </span>
            ))}
            <span className="an-lc is-miss">{t("annc.board.langsMissing", { n: s.missing.length })}</span>
          </>
        ) : !pendingDrop && item.status !== "ended" ? (
          <Chip tone={isEveryone(item.audience) ? "gray" : "violet"}>{audPill}</Chip>
        ) : null}
      </div>
      {(item.status === "live" || item.status === "ended") && rate != null && !pendingDrop ? (
        <div className="an-pb" aria-hidden="true">
          <i style={{ width: `${Math.min(100, rate)}%` }} />
        </div>
      ) : null}
      <div className="an-kc-ft">
        {item.status === "live" || item.status === "ended" ? (
          <>
            <span>
              <Ic name="eye" size={13} />
              {rate == null ? "—" : t("annc.board.seenPct", { pct: fmtPct(rate, locale) })}
            </span>
            <span className="an-r">
              <Ic name="click" size={13} />
              {fmtNumber(item.stats?.clicked || 0, locale)}
            </span>
          </>
        ) : item.status === "scheduled" ? (
          <>
            <span>
              <Ic name="lang" size={13} />
              {t("annc.board.langsOf", { n: s.covered, total: s.total })}
            </span>
            <span className="an-r">
              <Ic name="users" size={13} />
              {item.audienceSize != null ? fmtNumber(item.audienceSize, locale) : "—"}
            </span>
          </>
        ) : item.status === "pending" ? (
          <>
            <span>
              <Ic name="user" size={13} />
              {t("annc.board.preparedBy", { who: item.author ? `@${item.author}` : "—" })}
            </span>
            <span className="an-r">{t("annc.board.approvedBy", { who: item.approvedByName ? `@${item.approvedByName}` : "—" })}</span>
          </>
        ) : (
          <>
            <span>
              <Ic name="note" size={13} />
              {item.updatedByName || item.author ? `@${item.updatedByName || item.author}` : ""} · {agoText(item.updatedAt || item.createdAt, t)}
            </span>
            {s.missing.length && s.missing.length < 6 ? <span className="an-r">{t("annc.board.langsOf", { n: s.covered, total: s.total })}</span> : null}
          </>
        )}
      </div>
    </div>
  );
}

export function PinStrip({ pinned, onReorder, onPinCard, onUnpin, dragging, t }) {
  const [over, setOver] = useState(null);
  const [drag, setDrag] = useState(null);
  const ids = pinned.map((p) => p.id);
  return (
    <div className="an-pinstrip" data-testid="an-pinstrip">
      <span className="an-cap is-amber">
        <Ic name="pin" size={16} />
        {t("annc.pins.title")}
      </span>
      {pinned.map((a, i) => (
        <div
          key={a.id}
          className={`an-pchip${over === i ? " is-over" : ""}${drag === a.id ? " is-dragging" : ""}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", `pin:${a.id}`);
            setDrag(a.id);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            const raw = e.dataTransfer.getData("text/plain");
            if (raw.startsWith("pin:")) {
              const id = raw.slice(4);
              const next = ids.filter((x) => x !== id);
              next.splice(i, 0, id);
              onReorder(next);
            } else if (raw) onPinCard(raw, i);
          }}
          title={a.title}
        >
          <Ic name="grip" size={15} />
          <span className="an-n">{i + 1}</span>
          <span className="an-ell">{a.title}</span>
          <span className="an-pchip-mv">
            <button type="button" aria-label={t("annc.pins.up")} disabled={i === 0} onClick={() => onReorder(moveId(ids, a.id, i - 1))}>
              <Ic name="up" size={13} />
            </button>
            <button type="button" aria-label={t("annc.pins.down")} disabled={i === ids.length - 1} onClick={() => onReorder(moveId(ids, a.id, i + 1))}>
              <Ic name="chev" size={13} />
            </button>
            <button type="button" aria-label={t("annc.pins.unpin")} onClick={() => onUnpin(a)}>
              <Ic name="x" size={13} />
            </button>
          </span>
        </div>
      ))}
      <div
        className={`an-pchip is-drop${over === "end" || dragging ? " is-live" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver("end");
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(null);
          const raw = e.dataTransfer.getData("text/plain");
          if (raw && !raw.startsWith("pin:")) onPinCard(raw, ids.length);
        }}
      >
        <Ic name="plus" size={15} />
        {t("annc.pins.drop")}
      </div>
      <span className="an-muted an-pin-hint">{t("annc.pins.hint")}</span>
    </div>
  );
}

function moveId(ids, id, to) {
  const list = ids.filter((x) => x !== id);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, id);
  return list;
}

export default function BoardView({ cols, onOpen, onDrop, onMenu, menuFor, onCompose, dragging, setDragging, pendingEnd, colRefs, onShowArchive, onColumnSort, sorts }) {
  const { t, locale } = useLocale();
  const [over, setOver] = useState(null);
  const [colMenu, setColMenu] = useState(null);
  const colBtn = useRef({});
  return (
    <div className="an-board" data-testid="an-board">
      {BOARD_COLUMNS.map((c) => {
        const list = cols[c.id] || [];
        const shown = list.slice(0, LIMIT[c.id]);
        const extra = list.length - shown.length;
        const pendCard = pendingEnd && c.id === "ended" ? pendingEnd : null;
        return (
          <section
            key={c.id}
            ref={(el) => {
              if (!colRefs.current[c.id]) colRefs.current[c.id] = { current: null };
              colRefs.current[c.id].current = el;
            }}
            className={`an-col${over === c.id ? " is-over" : ""}`}
            aria-label={t(`annc.col.${c.id}`)}
            onDragOver={(e) => {
              e.preventDefault();
              if (over !== c.id) setOver(c.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const raw = e.dataTransfer.getData("text/plain");
              if (raw && !raw.startsWith("pin:")) onDrop(raw, c.id);
              setDragging(null);
            }}
            data-testid={`an-col-${c.id}`}
          >
            <header className="an-col-h">
              <span className="an-dt" style={{ background: c.dot }} />
              {t(`annc.col.${c.id}`)}
              <em className="tnum">{list.length}</em>
              <span className="an-sp" />
              {c.id === "draft" ? (
                <button type="button" className="an-ibtn is-xs" onClick={onCompose} aria-label={t("annc.create")}>
                  <Ic name="plus" size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  className="an-ibtn is-xs"
                  ref={(el) => {
                    if (!colBtn.current[c.id]) colBtn.current[c.id] = { current: null };
                    colBtn.current[c.id].current = el;
                  }}
                  aria-label={t("annc.board.colMenu", { col: t(`annc.col.${c.id}`) })}
                  aria-haspopup="menu"
                  onClick={() => setColMenu(colMenu === c.id ? null : c.id)}
                >
                  <Ic name="more" size={17} />
                </button>
              )}
              {c.id !== "draft" ? (
                <Menu
                  open={colMenu === c.id}
                  anchorRef={colBtn.current[c.id]}
                  onClose={() => setColMenu(null)}
                  label={t(`annc.col.${c.id}`)}
                  width={230}
                  items={[
                    { id: "new", icon: "history", label: t("annc.board.sortNew"), active: (sorts?.[c.id] || "new") === "new", onSelect: () => onColumnSort(c.id, "new") },
                    { id: "seen", icon: "eye", label: t("annc.board.sortSeen"), active: sorts?.[c.id] === "seen", disabled: !["live", "ended"].includes(c.id), onSelect: () => onColumnSort(c.id, "seen") },
                    ...(c.id === "ended" ? ["sep", { id: "arch", icon: "archive", label: t("annc.board.openArchive"), onSelect: onShowArchive }] : []),
                  ]}
                />
              ) : null}
            </header>
            {pendCard ? <Card item={pendCard} onOpen={() => {}} onMenu={() => {}} dragging={null} setDragging={() => {}} pendingDrop t={t} locale={locale} /> : null}
            {shown
              .filter((i) => !pendCard || i.id !== pendCard.id)
              .map((item) => (
                <Card key={item.id} item={item} onOpen={onOpen} onMenu={onMenu} dragging={dragging} setDragging={setDragging} t={t} locale={locale} menuOpen={menuFor === item.id} />
              ))}
            {dragging && over === c.id ? <div className="an-ghost" aria-hidden="true" /> : null}
            {c.id === "pending" ? (
              <div className="an-note is-gold">
                <small>{t("annc.board.ruleTitle")}</small>
                {t("annc.board.rule")}
              </div>
            ) : null}
            {!list.length && c.id !== "pending" ? <p className="an-col-empty">{t(`annc.board.empty.${c.id}`)}</p> : null}
            {extra > 0 ? (
              <button type="button" className="an-more2" onClick={c.id === "ended" ? onShowArchive : () => onColumnSort(c.id, "list")}>
                {c.id === "ended" ? t("annc.board.moreArchive", { n: extra }) : t("annc.board.more", { n: extra })}
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export { dropAction };
