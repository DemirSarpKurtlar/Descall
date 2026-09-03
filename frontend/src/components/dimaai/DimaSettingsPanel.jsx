import { useState } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  Brain,
  NotebookPen,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useT } from "../../context/LocaleContext";

function Toggle({ value, onChange, label }) {
  return (
    <button
      className={`us-toggle${value ? " active" : ""}`}
      onClick={() => onChange(!value)}
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
    >
      <span className="us-toggle-knob" />
    </button>
  );
}

function SettingRow({ icon: Icon, title, description, tone, children }) {
  return (
    <div className="us-row">
      <div className="us-row-text">
        {Icon && (
          <span className={`us-row-icon${tone ? ` is-${tone}` : ""}`} aria-hidden>
            <Icon size={16} />
          </span>
        )}
        <div className="us-row-copy">
          <span className="us-row-title">{title}</span>
          {description && <span className="us-row-desc">{description}</span>}
        </div>
      </div>
      <div className="us-row-control">{children}</div>
    </div>
  );
}

export default function DimaSettingsPanel({
  me,
  settings,
  memories = [],
  isAdmin = false,
  onClose,
  onPatch,
  onSave,
  onRefreshMemories,
  onDeleteMemory,
}) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const instructions = String(settings?.customInstructions || "");
  const showNsfw = Boolean(isAdmin || Object.prototype.hasOwnProperty.call(settings || {}, "nsfwEnabled"));
  const displayName = me?.displayName || me?.username || "";

  const toggle = (key) => {
    const next = !settings?.[key];
    onPatch?.({ [key]: next });
    onSave?.({ [key]: next });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshMemories?.();
    } finally {
      setRefreshing(false);
    }
  };

  const removeMemory = async (id) => {
    setDeletingId(id);
    try {
      await onDeleteMemory?.(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="dima-settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dima-settings-title"
      onClick={onClose}
    >
      <div className="dima-settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="dima-settings-head">
          <div className="dima-settings-head-copy">
            <p className="dima-settings-kicker">{t("dimaai.settingsKicker")}</p>
            <h2 id="dima-settings-title">{t("dimaai.settings")}</h2>
          </div>
          <button
            type="button"
            className="us-icon-btn"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </header>

        <div className="dima-settings-body">
          <section className="dima-settings-hero">
            <span className="dima-settings-hero-mark" aria-hidden>
              <Sparkles size={18} />
            </span>
            <div>
              <strong>{displayName ? t("dimaai.settingsForUser", { name: displayName }) : t("dimaai.settings")}</strong>
              <p>{t("dimaai.settingsLead")}</p>
            </div>
          </section>

          <section className="us-section">
            <h3 className="us-section-label">{t("dimaai.sectionCapabilities")}</h3>
            <div className="us-card stack">
              <SettingRow
                icon={Bot}
                tone="agent"
                title={t("dimaai.agentOn")}
                description={t("dimaai.agentHint")}
              >
                <Toggle
                  value={Boolean(settings?.agentEnabled)}
                  onChange={() => toggle("agentEnabled")}
                  label={t("dimaai.agentOn")}
                />
              </SettingRow>
              <SettingRow
                icon={Brain}
                tone="memory"
                title={t("dimaai.memoryOn")}
                description={t("dimaai.memoryHint")}
              >
                <Toggle
                  value={Boolean(settings?.memoryEnabled)}
                  onChange={() => toggle("memoryEnabled")}
                  label={t("dimaai.memoryOn")}
                />
              </SettingRow>
              <SettingRow
                icon={Volume2}
                tone="voice"
                title={t("dimaai.ttsOn")}
                description={t("dimaai.ttsHint")}
              >
                <Toggle
                  value={Boolean(settings?.ttsEnabled)}
                  onChange={() => toggle("ttsEnabled")}
                  label={t("dimaai.ttsOn")}
                />
              </SettingRow>
              {showNsfw && (
                <SettingRow
                  icon={ShieldAlert}
                  tone="nsfw"
                  title={t("dimaai.nsfwOn")}
                  description={t("dimaai.nsfwHint")}
                >
                  <Toggle
                    value={Boolean(settings?.nsfwEnabled)}
                    onChange={() => toggle("nsfwEnabled")}
                    label={t("dimaai.nsfwOn")}
                  />
                </SettingRow>
              )}
            </div>
          </section>

          <section className="us-section">
            <h3 className="us-section-label">{t("dimaai.sectionPersonality")}</h3>
            <div className="us-card us-form dima-settings-notes">
              <label className="us-field">
                <span>
                  <NotebookPen size={12} />
                  {t("dimaai.customInstructions")}
                </span>
                <textarea
                  value={instructions}
                  rows={5}
                  maxLength={4000}
                  placeholder={t("dimaai.customInstructionsPlaceholder")}
                  onChange={(e) => onPatch?.({ customInstructions: e.target.value })}
                  onBlur={(e) => onSave?.({ customInstructions: e.target.value })}
                />
              </label>
              <div className="dima-settings-notes-meta">
                <p className="us-row-desc">{t("dimaai.customInstructionsHint")}</p>
                <span>{t("dimaai.instructionsCount", { n: instructions.length })}</span>
              </div>
            </div>
          </section>

          <section className="us-section">
            <div className="us-section-label-row">
              <h3 className="us-section-label">{t("dimaai.sectionMemory")}</h3>
              <button
                type="button"
                className="us-link-btn"
                onClick={refresh}
                disabled={refreshing}
              >
                <RefreshCw size={13} className={refreshing ? "dima-settings-spin" : undefined} />
                {t("common.refresh")}
              </button>
            </div>
            <div className="us-card dima-settings-memories">
              {!settings?.memoryEnabled && (
                <p className="dima-settings-banner">{t("dimaai.memoriesOffHint")}</p>
              )}
              {!memories.length ? (
                <div className="dima-settings-empty">
                  <Brain size={22} />
                  <strong>{t("dimaai.memoriesEmpty")}</strong>
                  <p>{t("dimaai.memoriesEmptyHint")}</p>
                </div>
              ) : (
                <ul className="dima-memory-list">
                  {memories.map((m) => (
                    <li key={m.id}>
                      <span>{m.fact}</span>
                      <button
                        type="button"
                        className="us-icon-btn"
                        disabled={deletingId === m.id}
                        onClick={() => removeMemory(m.id)}
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
