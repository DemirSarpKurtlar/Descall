import { useEffect, useMemo, useRef, useState } from "react";
import { Search, XCircle, Check, Hash, Loader2 } from "../ui/Icon.jsx";
import GroupSheet from "../groups/GroupSheet";
import GroupIcon from "../groups/GroupIcon";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";
import { foldTr } from "../../lib/slashCommands";
import { displayText } from "../../lib/profanity";
import { mediaTypeLabel } from "../../lib/listPreview.js";
import { hapticSelection, hapticSuccess, hapticWarning } from "../../lib/fluid/haptics";
import { FORWARD_MAX_TARGETS, forwardTargets, planForward, runForwardPlan } from "../../lib/forwardMessage";
import ForwardGlyph from "./ForwardGlyph.jsx";
import "../../styles/messaging-sheets.css";

/**
 * "İlet" sheet (messaging phase 4): pick up to five chats (friends, groups,
 * the open server's text channels), add an optional note, send. Each target
 * gets a normal send with `forwarded: true`; the note follows as a separate
 * message. Phone: bottom sheet; desktop: centred glass card (GroupSheet).
 */
export default function ForwardSheet({ open, message, friends = [], groups = [], channels = [], emit, onClose, onDone }) {
  const t = useT();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setPicked([]);
    setNote("");
    setBusy(false);
  }, [open, message?.id]);

  const rows = useMemo(
    () => forwardTargets({ friends, groups, channels, query, fold: foldTr }),
    [friends, groups, channels, query],
  );
  const pickedKeys = useMemo(() => new Set(picked.map((p) => p.key)), [picked]);
  const full = picked.length >= FORWARD_MAX_TARGETS;

  const toggle = (row) => {
    if (busy) return;
    if (pickedKeys.has(row.key)) {
      hapticSelection();
      setPicked((list) => list.filter((p) => p.key !== row.key));
      return;
    }
    if (full) {
      hapticWarning();
      return;
    }
    hapticSelection();
    setPicked((list) => [...list, row]);
  };

  const send = async () => {
    if (!picked.length || busy || !message) return;
    setBusy(true);
    const plan = planForward(picked, message, note);
    await runForwardPlan(emit, plan);
    hapticSuccess();
    onDone?.(picked.length);
    onClose?.();
  };

  const preview = message
    ? (message.text ? displayText(String(message.text)).replace(/\s+/g, " ").slice(0, 90) : mediaTypeLabel(message.mediaType || message.media_type, t))
    : "";

  const section = (kind, label) => {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) return null;
    return (
      <section className="gs-section">
        <h3 className="gs-section-title"><span>{label}</span></h3>
        <div className="gs-group has-avatars">
          {list.map((row) => {
            const on = pickedKeys.has(row.key);
            return (
              <button
                key={row.key}
                type="button"
                className={`gs-row ms-pick-row${on ? " is-on" : ""}`}
                role="checkbox"
                aria-checked={on}
                disabled={busy || (!on && full)}
                onClick={() => toggle(row)}
                data-testid="forward-row"
              >
                {row.kind === "dm" ? (
                  <Avatar name={row.name} size={40} user={row.user} />
                ) : row.kind === "group" ? (
                  <GroupIcon group={row.group} size={40} radius={12} />
                ) : (
                  <span className="ms-channel-ico" aria-hidden="true"><Hash size={20} /></span>
                )}
                <span className="gs-row-text">
                  <span className="gs-row-title">{row.kind === "channel" ? row.name : displayText(row.name)}</span>
                  {row.sub ? <span className="gs-row-sub">{row.sub}</span> : null}
                </span>
                <span className={`ms-check${on ? " is-on" : ""}`} aria-hidden="true">
                  {on ? <Check size={14} strokeWidth={3} /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <GroupSheet
      open={open}
      onClose={busy ? undefined : onClose}
      title={t("msg4.forward.title")}
      subtitle={preview}
      testId="forward-sheet"
      closeLabel={t("Close")}
      className="ms-sheet"
    >
      <label className="gs-search" onClick={() => searchRef.current?.focus()}>
        <Search size={17} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("msg4.forward.search")}
          aria-label={t("msg4.forward.search")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {query ? (
          <button type="button" className="gs-clear" aria-label={t("Clear")} onClick={() => setQuery("")}>
            <XCircle size={17} fill="currentColor" stroke="var(--g-deep, #1c1d26)" />
          </button>
        ) : null}
      </label>

      {rows.length === 0 ? <div className="gs-empty">{t("No results")}</div> : null}
      {section("dm", t("msg4.forward.people"))}
      {section("group", t("msg4.forward.groups"))}
      {section("channel", t("msg4.forward.channels"))}

      <div className="ms-sheet-foot">
        <div className="gs-group">
          <label className="gs-field">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("msg4.forward.note")}
              aria-label={t("msg4.forward.note")}
              maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
          </label>
        </div>
        {/* Live: when the limit greys out the other rows, a screen reader hears why. */}
        <p className="gs-footnote" aria-live="polite">
          <span>{t("msg4.forward.limit", { max: FORWARD_MAX_TARGETS })}</span>
          {full ? <span className="a11y-sr">{` ${t("a11y.forward.limitReached", { max: FORWARD_MAX_TARGETS })}`}</span> : null}
        </p>
        <button type="button" className="gs-primary" disabled={!picked.length || busy} onClick={send} data-testid="forward-send">
          {busy ? <Loader2 size={18} className="gs-spin" /> : <ForwardGlyph size={18} />}
          {picked.length ? t("msg4.forward.sendCount", { count: picked.length }) : t("msg4.forward.send")}
        </button>
      </div>
    </GroupSheet>
  );
}
