/**
 * Draft B query bar: filter tokens ("yapan @baran", "tür Yaptırımlar", "tarih son
 * 24 saat", "önem Kritik, Yüksek") + free text with suggestions. Ctrl K focuses
 * it (bound by the page); Enter picks the highlighted suggestion; Backspace on an
 * empty input removes the last token.
 */
import { useId, useMemo, useState } from "react";
import { Search, X } from "../../ui/Icon.jsx";
import { suggestionsFor, tokenText } from "./auditModel.js";

export default function AuditQueryBar({ tokens, onChange, admins, t, inputRef }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const sugg = useMemo(() => suggestionsFor(text, { admins, t }), [text, admins, t]);
  const open = focus && sugg.length > 0;

  const pick = (s) => {
    if (!s) return;
    let next = tokens;
    if (["actor", "cat", "sev", "action"].includes(s.kind)) {
      const cur = tokens.find((x) => x.kind === s.kind);
      const vals = cur ? (Array.isArray(cur.value) ? cur.value : [cur.value]) : [];
      next = cur ? tokens.map((x) => (x === cur ? { ...x, value: vals.includes(s.value) ? vals : [...vals, s.value] } : x)) : [...tokens, { kind: s.kind, value: [s.value] }];
    } else {
      next = [...tokens.filter((x) => x.kind !== s.kind || s.kind === "text"), { kind: s.kind, value: s.value }];
    }
    onChange(next);
    setText("");
    setHi(0);
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setHi((h) => (h + 1) % sugg.length);
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setHi((h) => (h <= 0 ? sugg.length - 1 : h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) pick(sugg[Math.min(hi, sugg.length - 1)]);
    } else if (e.key === "Escape") {
      if (text) {
        e.preventDefault();
        e.stopPropagation();
        setText("");
      }
    } else if (e.key === "Backspace" && !text && tokens.length) {
      onChange(tokens.slice(0, -1));
    }
  };

  return (
    <div className={`alg-qbar${focus ? " is-focus" : ""}`} onMouseDown={(e) => {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }}>
      <Search size={20} className="alg-qbar-ic" aria-hidden="true" />
      {tokens.map((tok, i) => {
        const tx = tokenText(tok, t);
        return (
          <span key={`${tok.kind}-${i}`} className="alg-tok" data-testid={`audit-token-${tok.kind}`}>
            <b>{tx.kindLabel}</b>
            <span className="alg-tok-v">{tx.valueLabel}</span>
            <button type="button" aria-label={t("auditLog.query.remove", { label: `${tx.kindLabel} ${tx.valueLabel}` })} onClick={() => onChange(tokens.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          </span>
        );
      })}
      <input
        ref={inputRef}
        className="alg-qbar-in"
        value={text}
        placeholder={tokens.length ? "" : t("auditLog.query.placeholder")}
        aria-label={t("auditLog.query.label")}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${Math.min(hi, sugg.length - 1)}` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setHi(0);
        }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 120)}
        onKeyDown={onKey}
        data-testid="audit-query-input"
      />
      <kbd className="alg-kbd">{t("auditLog.query.kbd")}</kbd>
      {open ? (
        <div className="alg-sugg" role="listbox" id={listId} aria-label={t("auditLog.query.suggestions")}>
          {sugg.map((s, i) => (
            <div
              key={`${s.kind}-${s.value}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              className={`alg-sugg-i${i === hi ? " is-hi" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span className="alg-sugg-k">{s.hint}</span>
              <span className="alg-sugg-v">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
