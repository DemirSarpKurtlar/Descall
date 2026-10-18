import { useEffect, useMemo, useRef, useState } from "react";
import { Search, XCircle, Check, Loader2, UserRoundPlus, AlertCircle } from "lucide-react";
import GroupSheet from "./GroupSheet";
import { Avatar } from "../ui/Avatar";
import { addMemberToGroup } from "../../api/groups";
import { resolveDisplayName } from "../../lib/userProfile";
import { hapticError, hapticSuccess } from "../../lib/fluid/haptics";
import { useT } from "../../context/LocaleContext";

const MAX_GROUP_SIZE = 15;

/**
 * Add member sheet. The friend list shows first; the search field only
 * focuses when tapped (no keyboard on open). Adding keeps the sheet open so
 * several friends can be added; each row shows Ekle → spinner → Eklendi.
 */
export default function GroupAddMemberSheet({ group, open, friends, onClose, onMemberAdded }) {
  const t = useT();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState({}); // friendId → "busy" | "done"
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setState({});
    setError("");
  }, [open, group?.id]);

  const memberIds = useMemo(
    () => new Set((group?.members || []).map((m) => m?.id).filter(Boolean)),
    [group?.members],
  );
  const added = Object.values(state).filter((s) => s === "done").length;
  const count = (group?.memberCount || memberIds.size || 0) + added;
  const full = count >= MAX_GROUP_SIZE;

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    const list = (friends || []).filter((f) => {
      if (!q) return true;
      return [f.username, f.displayName, resolveDisplayName(f)].some((s) => String(s || "").toLocaleLowerCase("tr").includes(q));
    });
    // Not-yet-members first, then alphabetical.
    return list.sort((a, b) => {
      const am = memberIds.has(a.id) ? 1 : 0;
      const bm = memberIds.has(b.id) ? 1 : 0;
      if (am !== bm) return am - bm;
      return resolveDisplayName(a).localeCompare(resolveDisplayName(b), "tr");
    });
  }, [friends, query, memberIds]);

  const add = async (friend) => {
    if (!group?.id || state[friend.id]) return;
    setError("");
    setState((s) => ({ ...s, [friend.id]: "busy" }));
    try {
      await addMemberToGroup(group.id, friend.id);
      hapticSuccess();
      setState((s) => ({ ...s, [friend.id]: "done" }));
      onMemberAdded?.(friend);
    } catch (err) {
      hapticError();
      setState((s) => {
        const next = { ...s };
        delete next[friend.id];
        return next;
      });
      setError(err?.message ? t(err.message) : t("Could not add member. Try again."));
    }
  };

  return (
    <GroupSheet
      open={open}
      onClose={onClose}
      title={t("Add Member")}
      subtitle={group?.name}
      testId="group-add-member-sheet"
      closeLabel={t("Close")}
      leading={null}
      trailing={(
        <button type="button" className="gs-text-btn is-primary" onClick={onClose}>
          {t("Done")}
        </button>
      )}
    >
      <label className="gs-search" onClick={() => searchRef.current?.focus()}>
        <Search size={17} />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search friends…")}
          aria-label={t("Search friends…")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-testid="group-add-search"
        />
        {query ? (
          <button type="button" className="gs-clear" aria-label={t("Clear")} onClick={() => setQuery("")}>
            <XCircle size={17} fill="currentColor" stroke="var(--g-deep, #1c1d26)" />
          </button>
        ) : null}
      </label>

      {error ? (
        <div className="gs-banner is-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="gs-section">
        <h3 className="gs-section-title">
          <span>{t("Friends")}</span>
          <span>{t("{count}/{max} members", { count, max: MAX_GROUP_SIZE })}</span>
        </h3>
        <div className="gs-group has-avatars">
          {rows.length === 0 ? (
            <div className="gs-empty">{(friends || []).length === 0 ? t("No friends to add") : t("No results")}</div>
          ) : rows.map((friend) => {
            const inGroup = memberIds.has(friend.id);
            const st = state[friend.id];
            const name = resolveDisplayName(friend);
            return (
              <div key={friend.id} className="gs-row" data-testid="group-add-row">
                <Avatar name={name} size={40} user={friend} />
                <span className="gs-row-text">
                  <span className="gs-row-title">{name}</span>
                  {friend.username && friend.username !== name ? <span className="gs-row-sub">@{friend.username}</span> : null}
                </span>
                {inGroup ? (
                  <span className="gs-pill is-muted" aria-disabled="true">{t("In group")}</span>
                ) : st === "done" ? (
                  <span className="gs-pill is-done"><Check size={15} strokeWidth={2.6} />{t("Added")}</span>
                ) : (
                  <button
                    type="button"
                    className="gs-pill"
                    disabled={st === "busy" || full}
                    onClick={() => add(friend)}
                    aria-label={`${t("Add")} ${name}`}
                  >
                    {st === "busy" ? <Loader2 size={15} className="gs-spin" /> : <UserRoundPlus size={15} />}
                    {t("Add")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {full ? <p className="gs-footnote"><span>{t("This group is full ({max} members).", { max: MAX_GROUP_SIZE })}</span></p> : null}
      </section>
    </GroupSheet>
  );
}
