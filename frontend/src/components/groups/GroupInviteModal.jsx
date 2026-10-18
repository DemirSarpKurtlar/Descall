import { useEffect, useState } from "react";
import { Link2, Copy, Check, RefreshCw, Share, AlertCircle, Users } from "lucide-react";
import GroupSheet from "./GroupSheet";
import GroupIcon from "./GroupIcon";
import { createGroupInviteLink } from "../../api/groups";
import { toPublicShareUrl } from "../../lib/referral";
import { useT } from "../../context/LocaleContext";
import { copyText } from "../../lib/copyText";
import { hapticSelection, hapticSuccess } from "../../lib/fluid/haptics";

const EXPIRY_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "1 day" },
  { hours: 24 * 7, label: "7 days" },
  { hours: 24 * 30, label: "30 days" },
  { hours: 0, label: "Never" },
];

/** Invite link sheet (Liquid Glass): group card, link, copy/share, expiry segmented control. */
export default function GroupInviteModal({ group, open, onClose }) {
  const t = useT();
  const [expiresInHours, setExpiresInHours] = useState(24 * 7);
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const create = async (hours) => {
    if (!group?.id) return;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const res = await createGroupInviteLink(group.id, { expiresInHours: hours || null, maxUses: null });
      setInvite(res.invite);
    } catch (err) {
      setError(err?.message ? t(err.message) : t("Could not create invite"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !group?.id) return;
    setInvite(null);
    create(expiresInHours);
    // Re-create only when the sheet opens for a group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, group?.id]);

  const url = toPublicShareUrl(invite?.url);

  const copy = async () => {
    if (!url) return;
    try {
      await copyText(url);
      hapticSuccess();
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("Could not copy to clipboard"));
    }
  };

  const share = async () => {
    if (!url || !canShare) return;
    try {
      await navigator.share({ title: group?.name || "Descall", url });
    } catch {
      /* dismissed */
    }
  };

  return (
    <GroupSheet
      open={Boolean(open && group)}
      onClose={onClose}
      title={t("Invite people")}
      testId="group-invite-sheet"
      closeLabel={t("Close")}
    >
      <div className="gs-hero">
        {group ? <GroupIcon group={group} size={72} radius={22} /> : null}
        <div className="gs-hero-name">{group?.name || t("Group")}</div>
        <div className="gs-row-sub" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Users size={12} />
          {group?.memberCount != null ? t("{count} members", { count: group.memberCount }) : t("Group chat")}
        </div>
      </div>

      <section className="gs-section">
        <h3 className="gs-section-title"><span>{t("Invite link")}</span></h3>
        <div className="gs-group">
          <div className="gs-row" data-testid="group-invite-link">
            <span className="gs-row-icon" style={{ color: "var(--gs-brand)" }}><Link2 size={18} /></span>
            <span className="gs-row-text">
              <span className="gs-row-title" style={{ fontWeight: 500, fontSize: 15 }}>
                {loading ? t("Creating link…") : url || "—"}
              </span>
            </span>
          </div>
          <button type="button" className="gs-row is-tint" onClick={() => create(expiresInHours)} disabled={loading}>
            <span className="gs-row-icon"><RefreshCw size={18} className={loading ? "gs-spin" : undefined} /></span>
            <span className="gs-row-text"><span className="gs-row-title">{t("Generate new link")}</span></span>
          </button>
        </div>
        <p className="gs-footnote"><span>{t("Share a link, friends can join this group instantly")}</span></p>
      </section>

      <section className="gs-section">
        <h3 className="gs-section-title"><span>{t("Expire after")}</span></h3>
        <div className="gs-segmented" role="radiogroup" aria-label={t("Expire after")}>
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={expiresInHours === opt.hours}
              className={expiresInHours === opt.hours ? "is-active" : ""}
              onClick={() => {
                if (expiresInHours === opt.hours) return;
                hapticSelection();
                setExpiresInHours(opt.hours);
                create(opt.hours);
              }}
            >
              {t(opt.label)}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="gs-banner is-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          className={`gs-primary${copied ? " is-done" : ""}`}
          onClick={copy}
          disabled={!url || loading}
          data-testid="group-invite-copy"
        >
          {copied ? <Check size={18} strokeWidth={2.6} /> : <Copy size={18} />}
          {copied ? t("Copied") : t("Copy link")}
        </button>
        {canShare ? (
          <button
            type="button"
            className="gs-primary"
            style={{ width: 56, flex: "0 0 56px", background: "rgba(255,255,255,0.12)", boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.16)" }}
            onClick={share}
            disabled={!url || loading}
            aria-label={t("Share")}
          >
            <Share size={18} />
          </button>
        ) : null}
      </div>
    </GroupSheet>
  );
}
