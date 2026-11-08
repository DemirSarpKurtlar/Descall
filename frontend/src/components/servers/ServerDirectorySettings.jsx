import { useEffect, useState } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { getDirectoryListing, saveDirectoryListing } from "../../api/directory";
import { serverMessage } from "../../i18n/serverText.js";
import { serverHasPermission } from "../../lib/serverPermissions";
import {
  DIRECTORY_CATEGORIES,
  DIRECTORY_DESCRIPTION_MAX,
  DIRECTORY_LANGUAGES,
  DIRECTORY_TAG_LEN_MAX,
  DIRECTORY_TAGS_MAX,
  parseDirectoryTags,
} from "../../lib/serverDirectory.js";
import "../../styles/server-directory.css";

function defaultLanguage(locale) {
  return DIRECTORY_LANGUAGES.includes(locale) ? locale : "other";
}

/** Status line of the listing (why it is or is not public right now). */
function statusText(t, state) {
  if (!state) return "";
  if (!state.available) return t("dir.settings.unavailable");
  if (state.visible) return t("dir.settings.visible");
  switch (state.reason) {
    case "too_few_members":
      return t("dir.settings.fewMembers", { min: state.minMembers, count: state.memberCount });
    case "moderation":
      return t("dir.settings.hidden");
    case "owner_unavailable":
      return t("dir.settings.ownerUnavailable");
    case "no_category":
      return t("dir.settings.needCategory");
    default:
      return t("dir.settings.off");
  }
}

/**
 * "List in Descall directory" (item 8), in Community and Discovery settings. Owner or
 * ADMINISTRATOR only, the same rule the API applies. Saves on its own button, separate
 * from the rest of the form, through PUT /api/directory/manage/:serverId.
 */
export default function ServerDirectorySettings({ server }) {
  const t = useT();
  const { locale } = useLocale();
  const { toast } = useToast();
  const allowed = Boolean(server?.isOwner || serverHasPermission(server, "ADMINISTRATOR"));
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [listed, setListed] = useState(false);
  const [category, setCategory] = useState("");
  const [language, setLanguage] = useState(defaultLanguage(locale));
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");

  const apply = (data) => {
    setState(data);
    const l = data?.listing || {};
    setListed(Boolean(l.listed));
    setCategory(l.category || "");
    setLanguage(l.language || defaultLanguage(locale));
    setDescription(l.description || "");
    setTagsText((l.tags || []).join(", "));
  };

  useEffect(() => {
    if (!server?.id || !allowed) return undefined;
    let cancelled = false;
    setLoadError("");
    getDirectoryListing(server.id)
      .then((data) => {
        if (!cancelled) apply(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(serverMessage(err?.body) || t("dir.settings.loadError"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id, allowed]);

  if (!server?.id) return null;
  if (!allowed) {
    return (
      <section className="dir-settings" aria-labelledby="dir-settings-title">
        <h4 id="dir-settings-title">{t("dir.settings.title")}</h4>
        <p className="dir-muted">{t("dir.settings.ownerOnly")}</p>
      </section>
    );
  }

  const parsed = parseDirectoryTags(tagsText);
  const tagsInvalid = parsed.tooMany || parsed.tooLong;
  const unavailable = state && !state.available;

  const save = async () => {
    if (listed && !category) {
      toast(t("dir.settings.needCategory"), "error");
      return;
    }
    if (tagsInvalid) {
      toast(t("dir.settings.tooManyTags", { max: DIRECTORY_TAGS_MAX, len: DIRECTORY_TAG_LEN_MAX }), "error");
      return;
    }
    setBusy(true);
    try {
      const data = await saveDirectoryListing(server.id, {
        listed,
        category: category || null,
        language,
        description: description.trim(),
        tags: parsed.tags,
      });
      apply(data);
      toast(t("dir.settings.saved"), "success");
    } catch (err) {
      toast(serverMessage(err?.body) || t("dir.settings.loadError"), "error");
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !state || unavailable;

  return (
    <section className="dir-settings" aria-labelledby="dir-settings-title">
      <h4 id="dir-settings-title">{t("dir.settings.title")}</h4>
      <p className="dir-muted">{t("dir.settings.lead")}</p>
      {loadError ? <p className="server-modal-error">{loadError}</p> : null}
      <div className="server-community-option">
        <span className="server-community-option-label">{t("dir.settings.toggle")}</span>
        <button
          type="button"
          role="switch"
          aria-checked={listed}
          aria-label={t("dir.settings.toggle")}
          disabled={disabled}
          className={`us-toggle${listed ? " active" : ""}`}
          onClick={() => setListed((v) => !v)}
        >
          <span className="us-toggle-knob" />
        </button>
      </div>
      <div className="dir-settings-grid">
        <label className="server-field">
          <span>{t("dir.settings.category")}</span>
          <select value={category} disabled={disabled} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("dir.settings.categoryPick")}</option>
            {DIRECTORY_CATEGORIES.map((id) => (
              <option key={id} value={id}>
                {t(`dir.cat.${id}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="server-field">
          <span>{t("dir.settings.language")}</span>
          <select value={language} disabled={disabled} onChange={(e) => setLanguage(e.target.value)}>
            {DIRECTORY_LANGUAGES.map((id) => (
              <option key={id} value={id}>
                {t(`dir.lang.${id}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="server-field">
        <span>{t("dir.settings.description")}</span>
        <textarea
          value={description}
          disabled={disabled}
          rows={3}
          maxLength={DIRECTORY_DESCRIPTION_MAX}
          placeholder={t("dir.settings.descriptionPh")}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="server-modal-sub dir-count">{t("dir.settings.count", { count: description.length, max: DIRECTORY_DESCRIPTION_MAX })}</p>
      </label>
      <label className="server-field">
        <span>{t("dir.settings.tags")}</span>
        <input
          value={tagsText}
          disabled={disabled}
          maxLength={160}
          placeholder={t("dir.settings.tagsPh")}
          aria-invalid={tagsInvalid}
          onChange={(e) => setTagsText(e.target.value)}
        />
        <p className={`server-modal-sub${tagsInvalid ? " dir-invalid" : ""}`}>
          {tagsInvalid
            ? t("dir.settings.tooManyTags", { max: DIRECTORY_TAGS_MAX, len: DIRECTORY_TAG_LEN_MAX })
            : t("dir.settings.tagsHint", { max: DIRECTORY_TAGS_MAX })}
        </p>
      </label>
      <p className={`dir-status${state?.visible ? " is-on" : ""}`} role="status">
        {statusText(t, state)}
      </p>
      <p className="dir-muted">{t("dir.settings.privacy")}</p>
      <div className="server-modal-actions">
        <button type="button" className="server-primary-btn" disabled={disabled} onClick={save}>
          {busy ? t("dir.settings.saving") : t("dir.settings.save")}
        </button>
      </div>
    </section>
  );
}
