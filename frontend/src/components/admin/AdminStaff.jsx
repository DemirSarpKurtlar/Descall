/**
 * Yönetici Paneli › Yöneticiler (3.3.0, owner only). Who is an admin, and which
 * panel sections each admin may open. There is no moderator role: an admin
 * with only "Raporlar" is what a moderator used to be. The server enforces the
 * same list on every request (backend/lib/adminPermissions.js).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../api/adminHttp";
import { confirmAction } from "../../lib/glassConfirm";
import { useLocale } from "../../context/LocaleContext";
import GlassCheckbox from "../ui/GlassCheckbox";
import { Lock, Search, ShieldCheck, UserGear, X } from "../ui/Icon.jsx";
import { ADMIN_NAV_GROUPS } from "./adminNav";
import { formatAppDateTime } from "../../lib/datetime";
import "../../styles/admin-staff.css";

const GROUP_LABEL = {
  general: "admin.navGroupGeneral",
  people: "admin.navGroupPeople",
  content: "admin.navGroupContent",
  system: "admin.navGroupSystem",
};

/** Grantable sections grouped like the menu; overview is always on, staff never. */
export function staffGroups(grantable) {
  const allow = new Set(grantable || []);
  return ADMIN_NAV_GROUPS.map(([key, ids]) => ({ key, ids: ids.filter((id) => allow.has(id)) })).filter((g) => g.ids.length);
}

/** null (= every section, set before 3.3.0) → the full list, else the list. */
export function effectiveSections(sections, grantable) {
  return sections == null ? [...(grantable || [])] : [...sections];
}

function Avatar({ user }) {
  if (user.avatarUrl) return <img className="ast-av" src={user.avatarUrl} alt="" />;
  return <span className="ast-av is-letter" aria-hidden="true">{String(user.displayName || user.username || "?").slice(0, 1).toUpperCase()}</span>;
}

function AdminCard({ admin, grantable, labelOf, t, onSaved, onRemoved }) {
  const initial = useMemo(() => effectiveSections(admin.sections, grantable), [admin.sections, grantable]);
  const [picked, setPicked] = useState(() => new Set(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => setPicked(new Set(initial)), [initial]);

  const dirty = picked.size !== initial.length || initial.some((id) => !picked.has(id));
  const groups = staffGroups(grantable);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const sections = grantable.filter((id) => picked.has(id));
      await adminFetch(`/staff/${encodeURIComponent(admin.id)}/sections`, { method: "PUT", body: JSON.stringify({ sections }) });
      onSaved(admin.id, sections);
    } catch (e) {
      setErr(e?.message || t("admin.staffSaveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmAction({
      title: t("admin.staffRemoveTitle", { name: admin.username }),
      message: t("admin.staffRemoveBody"),
      confirmLabel: t("admin.staffRemove"),
      cancelLabel: t("Cancel"),
    });
    if (!ok) return;
    setBusy(true);
    setErr("");
    try {
      await adminFetch(`/remove-admin/${encodeURIComponent(admin.id)}`, { method: "PUT" });
      onRemoved(admin.id);
    } catch (e) {
      setErr(e?.message || t("admin.staffSaveFailed"));
      setBusy(false);
    }
  };

  const summary = admin.owner
    ? t("admin.staffOwnerAll")
    : admin.sections == null
      ? t("admin.staffLegacyAll")
      : t("admin.staffCount", { n: initial.length, total: grantable.length });

  return (
    <article className={`ast-card${admin.owner ? " is-owner" : ""}${open ? " is-open" : ""}`}>
      <header className="ast-card-head">
        <Avatar user={admin} />
        <div className="ast-who">
          <b>{admin.displayName || admin.username}</b>
          <span>
            @{admin.username}
            {admin.lastSeenAt ? ` · ${t("admin.staffLastSeen", { when: formatAppDateTime(admin.lastSeenAt) })}` : ""}
          </span>
        </div>
        <div className="ast-chips">
          {admin.owner ? <span className="ast-chip is-owner">{t("admin.roleOwner")}</span> : null}
          <span className={`ast-chip ${admin.twoFactor ? "is-ok" : "is-warn"}`}>
            {admin.twoFactor ? <ShieldCheck size={13} /> : <Lock size={13} />}
            {admin.twoFactor ? t("admin.staff2faOn") : t("admin.staff2faOff")}
          </span>
        </div>
        {!admin.owner ? (
          <button type="button" className="ast-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? t("admin.staffClose") : t("admin.staffEdit")}
          </button>
        ) : null}
      </header>
      <p className="ast-summary">{summary}</p>
      {open && !admin.owner ? (
        <div className="ast-edit">
          <div className="ast-quick">
            <button type="button" onClick={() => setPicked(new Set(grantable))}>{t("admin.staffAll")}</button>
            <button type="button" onClick={() => setPicked(new Set())}>{t("admin.staffNone")}</button>
            <span>{t("admin.staffOverviewNote")}</span>
          </div>
          <div className="ast-groups">
            {groups.map((g) => (
              <fieldset key={g.key} className="ast-group">
                <legend>{t(GROUP_LABEL[g.key])}</legend>
                {g.ids.map((id) => (
                  <label key={id} className="ast-opt">
                    <GlassCheckbox checked={picked.has(id)} onChange={() => toggle(id)} />
                    <span>{t(labelOf(id))}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {err ? <p className="ast-err" role="alert">{err}</p> : null}
          <div className="ast-actions">
            <button type="button" className="ast-danger" disabled={busy} onClick={remove}>{t("admin.staffRemove")}</button>
            <span className="ast-sp" />
            <button type="button" className="ast-ghost" disabled={busy || !dirty} onClick={() => setPicked(new Set(initial))}>{t("Cancel")}</button>
            <button type="button" className="ast-primary" disabled={busy || !dirty} onClick={save}>{busy ? t("admin.staffSaving") : t("Save")}</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AddAdmin({ t, onAdded }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRows([]);
      return undefined;
    }
    const id = setTimeout(() => {
      adminFetch(`/staff/candidates?q=${encodeURIComponent(term)}`)
        .then((d) => setRows(Array.isArray(d?.users) ? d.users : []))
        .catch(() => setRows([]));
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  const make = async (u) => {
    const ok = await confirmAction({
      title: t("admin.staffMakeTitle", { name: u.username }),
      message: t("admin.staffMakeBody"),
      confirmLabel: t("admin.staffMake"),
      cancelLabel: t("Cancel"),
      danger: false,
    });
    if (!ok) return;
    setErr("");
    try {
      await adminFetch(`/make-admin/${encodeURIComponent(u.id)}`, { method: "PUT" });
      setQ("");
      setRows([]);
      onAdded();
    } catch (e) {
      setErr(e?.message || t("admin.staffSaveFailed"));
    }
  };

  return (
    <section className="ast-add">
      <label className="ast-search">
        <Search size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("admin.staffSearch")} aria-label={t("admin.staffSearch")} />
        {q ? (
          <button type="button" aria-label={t("Clear")} onClick={() => setQ("")}>
            <X size={14} />
          </button>
        ) : null}
      </label>
      {rows.length ? (
        <ul className="ast-cands">
          {rows.map((u) => (
            <li key={u.id}>
              <Avatar user={u} />
              <span className="ast-who">
                <b>{u.displayName || u.username}</b>
                <span>@{u.username}</span>
              </span>
              <button type="button" className="ast-primary" onClick={() => make(u)}>{t("admin.staffMake")}</button>
            </li>
          ))}
        </ul>
      ) : null}
      {err ? <p className="ast-err" role="alert">{err}</p> : null}
    </section>
  );
}

export default function AdminStaff({ tabs = [] }) {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const labelOf = useCallback((id) => tabs.find((x) => x.id === id)?.label || id, [tabs]);

  const load = useCallback(() => {
    setErr("");
    adminFetch("/staff")
      .then((d) => setData({ admins: d?.admins || [], grantable: d?.grantable || [] }))
      .catch((e) => setErr(e?.message || t("admin.staffLoadFailed")));
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const onSaved = (id, sections) =>
    setData((d) => ({ ...d, admins: d.admins.map((a) => (a.id === id ? { ...a, sections } : a)) }));
  const onRemoved = (id) => setData((d) => ({ ...d, admins: d.admins.filter((a) => a.id !== id) }));

  return (
    <section className="ast">
      <div className="ast-head">
        <span className="ast-head-ic" aria-hidden="true"><UserGear size={20} /></span>
        <div>
          <h1>{t("admin.staff")}</h1>
          <p>{t("admin.staffLead")}</p>
        </div>
      </div>
      <AddAdmin t={t} onAdded={load} />
      {err ? <p className="ast-err" role="alert">{err}</p> : null}
      {!data && !err ? <p className="ast-muted">{t("Loading...")}</p> : null}
      {data ? (
        <div className="ast-list">
          {data.admins.map((a) => (
            <AdminCard key={a.id} admin={a} grantable={data.grantable} labelOf={labelOf} t={t} onSaved={onSaved} onRemoved={onRemoved} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
