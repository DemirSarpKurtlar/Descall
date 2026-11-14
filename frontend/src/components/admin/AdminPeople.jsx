import { useCallback, useEffect, useRef, useState } from "react";
import { Search, FolderSearch } from "../ui/Icon.jsx";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";
import AdminUserDossier from "./AdminUserDossier";
import "../../styles/admin-dossier.css";

/** Kullanıcı dosyası page: title + search on top (Draft A), the dossier below. */
export default function AdminPeople({ selectedUserId, onSelectUser, onRefreshInbox, dossierIntent = null }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  const search = useCallback(async (q) => {
    const text = String(q || "").trim();
    if (text.length < 1) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const data = await adminFetch(`/people/search?q=${encodeURIComponent(text)}`);
      setHits(data.users || []);
      setHi(0);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => search(query), 180);
    return () => clearTimeout(handle);
  }, [query, search]);

  // Ctrl+K / Cmd+K focuses the search (shown as a hint in the field).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const pick = (u) => {
    onSelectUser?.(u.id);
    setOpen(false);
    setHits([]);
    setQuery(u.username || "");
    inputRef.current?.blur();
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");

  return (
    <section className="admin-section admin-section-full people-suite dsr-page">
      <div className="dsr-top">
        <div>
          <h1>{t("dossier.title")}</h1>
          <p>{t("dossier.subtitle")}</p>
        </div>
        <div className="dsr-search" ref={boxRef}>
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (!hits.length) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((i) => (i + 1) % hits.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((i) => (i <= 0 ? hits.length - 1 : i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(hits[Math.min(hi, hits.length - 1)]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={t("admin.peopleSearch")}
            aria-label={t("admin.peopleSearch")}
            role="combobox"
            aria-expanded={open && hits.length > 0}
            aria-controls="dsr-search-hits"
            autoFocus={!selectedUserId}
          />
          <kbd>{isMac ? "Cmd K" : "Ctrl K"}</kbd>
          {open && (hits.length > 0 || searching) ? (
            <ul className="dsr-hits" id="dsr-search-hits" role="listbox">
              {searching && !hits.length ? <li className="dsr-hits-note">{t("common.loading")}</li> : null}
              {hits.map((u, i) => (
                <li key={u.id} role="option" aria-selected={i === hi}>
                  <button type="button" className={`dsr-hit${i === hi ? " is-hi" : ""}${selectedUserId === u.id ? " is-on" : ""}`} onMouseEnter={() => setHi(i)} onClick={() => pick(u)}>
                    <Avatar name={u.displayName || u.username} size={30} user={{ avatarUrl: u.avatarUrl, username: u.username }} />
                    <span>
                      <strong>{u.displayName || u.username}</strong>
                      <em>@{u.username}</em>
                    </span>
                    {u.isOnline ? <span className="dsr-hit-on">{t("Online")}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {selectedUserId ? (
        <AdminUserDossier userId={selectedUserId} onRefreshInbox={onRefreshInbox} intent={dossierIntent} onOpenPerson={onSelectUser} />
      ) : (
        <div className="people-empty">
          <FolderSearch size={28} />
          <h3>{t("admin.peopleEmptyTitle")}</h3>
          <p>{t("admin.peopleEmptyBody")}</p>
        </div>
      )}
    </section>
  );
}
