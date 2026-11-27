/**
 * Query bar (İşlem kaydı Konsol language): tokens "son 28 gün", "platform Android",
 * "sürüm 4.1.4", "sayfa app/kanal", "cihaz Düşük", "bağlantı 3G", "ülke TR",
 * "kullanıcı #3f2a9c1e" + free text with suggestions. "/" or Ctrl K focuses it (page);
 * Enter picks, Backspace on empty removes the last token, Esc clears the text.
 */
import { useId, useMemo, useState } from "react";
import { Search, X } from "../../ui/Icon.jsx";
import { suggestionsFor } from "./perfAdminModel.js";

export default function PerfQueryBar({ tokens, onChange, onPick, facets, labels, tokenText, t, inputRef, placeholder, testId = "perf-query", staticTokens = null }) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const sugg = useMemo(() => (staticTokens ? [] : suggestionsFor(text, facets, labels)), [text, facets, labels, staticTokens]);
  const open = focus && sugg.length > 0;

  const pick = (s) => {
    if (!s) return;
    onPick(s.kind, s.value);
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
      else if (staticTokens && text.trim()) onPick("text", text.trim());
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
    <div
      className={`alg-qbar apf-qbar${focus ? " is-focus" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
      data-testid={testId}
    >
      <Search size={20} className="alg-qbar-ic" aria-hidden="true" />
      {tokens.map((tok, i) => {
        const tx = tokenText(tok);
        return (
          <span key={`${tok.kind}-${i}`} className={`alg-tok${tok.static ? " is-static" : ""}`} data-testid={`${testId}-token-${tok.kind}`}>
            <b>{tx.k}</b>
            <span className="alg-tok-v">{tx.v}</span>
            {tok.static ? null : (
              <button type="button" aria-label={t("perfAdmin.query.remove", { label: `${tx.k} ${tx.v}` })} onClick={() => onChange(tokens.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            )}
          </span>
        );
      })}
      <input
        ref={inputRef}
        className="alg-qbar-in"
        value={text}
        placeholder={placeholder}
        aria-label={t("perfAdmin.query.label")}
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
        data-testid={`${testId}-input`}
      />
      <kbd className="alg-kbd">/</kbd>
      {open ? (
        <div className="alg-sugg" role="listbox" id={listId} aria-label={t("perfAdmin.query.suggestions")}>
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
              <span className="alg-sugg-k">{t(`perfAdmin.tok.${s.kind}`)}</span>
              <span className="alg-sugg-v">{s.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
