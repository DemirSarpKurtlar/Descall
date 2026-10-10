import { useMemo, useState } from "react";
import { Check, Coins, Copy, Gift, Link2, Share2 } from "lucide-react";
import { buildFriendInviteUrl, toPublicShareUrl } from "../../lib/referral";
import { Funnel } from "../../site/analytics";
import { useT } from "../../context/LocaleContext";
import { useGlassShell } from "../layout/glass/GlassShell";

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Shareable personal invite card with DesCoin reward copy.
 */
export default function InviteCard({ username, compact = false, onCopied, onShared, variant = "friends" }) {
  const t = useT();
  const glassShell = useGlassShell();
  const [copied, setCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const url = useMemo(() => toPublicShareUrl(buildFriendInviteUrl(username)), [username]);

  if (!username) return null;

  const markCopied = (method) => {
    Funnel.inviteGenerated({ method, username });
    setCopied(true);
    try {
      onCopied?.({ method, kind: "link" });
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setCopied(false), 2200);
  };

  const copy = async () => {
    const ok = await copyText(url);
    if (ok) markCopied("invite_card");
    return ok;
  };

  const share = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      if (typeof navigator.share === "function") {
        const base = { title: "Descall", url };
        const withText = {
          ...base,
          text: t("Join me on Descall — we both get DesCoin"),
        };
        // iOS / some WebViews reject { text + url }; pick a payload canShare accepts.
        let data = base;
        try {
          if (navigator.canShare?.(withText)) data = withText;
          else if (navigator.canShare?.(base)) data = base;
        } catch {
          data = base;
        }
        try {
          await navigator.share(data);
          Funnel.inviteGenerated({ method: "native_share", username });
          try {
            onShared?.({ method: "native_share" });
          } catch {
            /* ignore */
          }
          return;
        } catch (err) {
          // User dismissed the sheet — do not fall through to copy.
          if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
        }
      }

      const ok = await copyText(url);
      if (ok) {
        markCopied("clipboard_fallback");
        try {
          onShared?.({ method: "clipboard_fallback" });
        } catch {
          /* ignore */
        }
      }
    } finally {
      setShareBusy(false);
    }
  };

  if (glassShell && variant === "shop") {
    const shown = url.replace(/^https?:\/\//, "");
    return (
      <div className="g-invite-link">
        <div className="g-invite-link-head">
          <Gift size={18} aria-hidden />
          <div>
            <strong>{t("Invite friends")}</strong>
            <span>{t("You get 100 DesCoin · they get 50")}</span>
          </div>
        </div>
        <div className="g-invite-link-field" title={url}>{shown}</div>
        <div className="g-invite-link-actions">
          <button type="button" className="primary" onClick={copy}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied ? t("Copied") : t("Copy link")}
          </button>
          <button type="button" className="secondary" onClick={share} disabled={shareBusy}>
            <Share2 size={14} aria-hidden />
            {t("Share")}
          </button>
        </div>
      </div>
    );
  }

  if (glassShell) {
    return (
      <div className={`invite-card g-invite${compact ? " compact" : ""}`}>
        <div className="g-invite-mark" aria-hidden="true">
          <Link2 size={22} />
        </div>
        <div className="g-invite-copy">
          <strong>{t("Invite friends")}</strong>
          <span>{t("Join me on Descall — we both get DesCoin")}</span>
          <em>{t("You 100 · they 50 DesCoin")}</em>
        </div>
        <button type="button" className="g-invite-btn" onClick={copy}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t("Copied") : t("Copy")}
        </button>
        <button type="button" className="g-ib" onClick={share} disabled={shareBusy} aria-label={t("Share")} title={t("Share")}>
          <Share2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={`invite-card${compact ? " compact" : ""}`}>
      <div className="invite-card-header">
        <Gift size={16} aria-hidden />
        <div>
          <strong>{t("Invite friends")}</strong>
          <span>{t("You get 100 DesCoin · they get 50")}</span>
        </div>
      </div>
      <div className="invite-card-link" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </div>
      <div className="invite-card-actions">
        <button type="button" className="invite-card-btn primary" onClick={copy}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? t("Copied") : t("Copy link")}
        </button>
        <button
          type="button"
          className="invite-card-btn"
          onClick={share}
          disabled={shareBusy}
          aria-busy={shareBusy || undefined}
        >
          <Share2 size={14} aria-hidden />
          {t("Share")}
        </button>
      </div>
      {!compact && (
        <p className="invite-card-footnote">
          <Coins size={13} aria-hidden />
          {t("Rewards land when they register with your link")}
        </p>
      )}
    </div>
  );
}
