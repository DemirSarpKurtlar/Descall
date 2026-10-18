import { useEffect, useRef, useState } from "react";
import { XCircle, AlertCircle, Loader2 } from "lucide-react";
import GroupSheet from "./GroupSheet";
import GroupIcon from "./GroupIcon";
import { GROUP_NAME_MAX, groupNameLength, renameErrorKey, validateGroupRename } from "../../lib/groupRename";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import { useT } from "../../context/LocaleContext";

/**
 * Rename sheet (replaces the old inline-styled dialog). In-app field, no
 * window.prompt (blocked in iOS WKWebView). Stays open and shows the server's
 * reason when the rename fails; closes on success.
 * `onSubmit(name)` must return a promise that rejects with an Error carrying `code`.
 */
export default function GroupRenameSheet({ group, open, onClose, onSubmit }) {
  const t = useT();
  const inputRef = useRef(null);
  const [value, setValue] = useState(group?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValue(group?.name || "");
    setError("");
    setBusy(false);
  }, [open, group?.id, group?.name]);

  const check = validateGroupRename(value, group?.name || "");
  const length = groupNameLength(value.trim());
  const canSave = check.ok && !busy;

  const submit = async () => {
    if (!canSave) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit?.(check.name);
      hapticSuccess();
      onClose?.();
    } catch (err) {
      hapticError();
      setError(t(renameErrorKey(err?.code)));
      setBusy(false);
    }
  };

  return (
    <GroupSheet
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      title={t("Rename Group")}
      testId="group-rename-sheet"
      initialFocusRef={inputRef}
      closeLabel={t("Close")}
      leading={(
        <button type="button" className="gs-text-btn" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </button>
      )}
      trailing={(
        <button type="button" className="gs-text-btn is-primary" onClick={submit} disabled={!canSave} data-testid="group-rename-save">
          {busy ? <Loader2 size={16} className="gs-spin" /> : null}
          {t("Save")}
        </button>
      )}
    >
      <div className="gs-hero">
        {group ? <GroupIcon group={group} size={76} radius={24} /> : null}
      </div>
      <form
        className="gs-section"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="gs-group">
          <div className="gs-field">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError("");
              }}
              maxLength={GROUP_NAME_MAX * 2}
              placeholder={t("Group name")}
              aria-label={t("Group name")}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              data-testid="group-rename-input"
            />
            {value ? (
              <button
                type="button"
                className="gs-clear"
                aria-label={t("Clear")}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue("");
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                <XCircle size={18} fill="currentColor" stroke="var(--g-deep, #1c1d26)" />
              </button>
            ) : null}
          </div>
        </div>
        <p className="gs-footnote">
          <span>{t("Everyone in the group sees the new name.")}</span>
          <span className={`is-count${length > GROUP_NAME_MAX ? " is-over" : ""}`}>{length}/{GROUP_NAME_MAX}</span>
        </p>
      </form>
      {error ? (
        <div className="gs-banner is-error" role="alert" data-testid="group-rename-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </GroupSheet>
  );
}
