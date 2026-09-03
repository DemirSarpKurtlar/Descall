import { useCallback, useEffect, useState } from "react";
import { Search, FolderSearch } from "lucide-react";
import { adminFetch } from "../../api/adminHttp";
import { Avatar } from "../ui/Avatar";
import { useT } from "../../context/LocaleContext";
import AdminUserDossier from "./AdminUserDossier";

export default function AdminPeople({ selectedUserId, onSelectUser, onRefreshInbox }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);

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

  return (
    <section className="admin-section admin-section-full people-suite">
      <div className="mod-suite-head">
        <div>
          <h2>{t("admin.peopleTitle")}</h2>
          <p className="muted">{t("admin.peopleSubtitle")}</p>
        </div>
      </div>

      <div className="people-search">
        <Search size={16} />
        <input
          className="admin-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.peopleSearch")}
          autoFocus
        />
      </div>

      {hits.length > 0 && (
        <ul className="people-hits">
          {hits.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={`people-hit ${selectedUserId === u.id ? "active" : ""}`}
                onClick={() => {
                  onSelectUser?.(u.id);
                  setHits([]);
                  setQuery(u.username || "");
                }}
              >
                <Avatar name={u.displayName || u.username} size={32} user={{ avatarUrl: u.avatarUrl, username: u.username }} />
                <span>
                  <strong>{u.displayName || u.username}</strong>
                  <em>@{u.username}</em>
                </span>
                {u.isOnline ? <span className="people-online">{t("Online")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching ? <p className="muted">{t("common.loading")}</p> : null}

      {selectedUserId ? (
        <AdminUserDossier userId={selectedUserId} onRefreshInbox={onRefreshInbox} />
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
