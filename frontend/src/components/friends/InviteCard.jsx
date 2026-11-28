import { useMemo, useState } from "react";
import { Check, Copy, Gift, Share2 } from "../ui/Icon.jsx";
import { inviteShortUrl } from "../../lib/inviteShare.js";
import { Funnel } from "../../site/analytics";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { useGlassShell } from "../layout/glass/GlassShell";
import { copyText } from "../../lib/copyText.js";
import InviteBoard from "./InviteBoard.jsx";

/**
 * Shareable personal invite card. The friends sidebar shows InviteBoard (draft B
 * "Kazanç panosu": live invite numbers, the link with copy and share, pending friends,
 * the next milestone and Davet Merkezi); the store keeps its own link row.
 */
export default function InviteCard({ username, onCopied, onShared, variant = "friends" }) {
  const t = useT();
  const { toast } = useToast();
  const glassShell = useGlassShell();
  const [copied, setCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  // Davet Merkezi (growth 4A): the short personal link descall.com/r/<user> (?k= channel tags
  // come from the dashboard's share buttons); rewards unlock when the friend is active.
  const url = useMemo(() => inviteShortUrl(username), [username]);
  const openCenter = () => {
    void import("../invites/InviteCenterHost.jsx").then((m) => m.openInviteCenter()).catch(() => {});
  };
  const centerBtn = (cls) => (
    <button type="button" className={cls} onClick={openCenter} data-testid="invite-card-center">
      <Gift size={14} aria-hidden />
      {t("dvt.entry.open")}
    </button>
  );

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
    else toast(t("Could not copy to clipboard"), "error");
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
          text: t("Join me on Descall, we both get DesCoin"),
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
          // User dismissed the sheet, do not fall through to copy.
          if (err?.name === "AbortError" || err?.name === "NotAllowedError") return;
        }
      }

      const ok = await copyText(url);
      if (!ok) toast(t("Could not copy to clipboard"), "error");
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
          <span className="invite-card-mark" aria-hidden="true"><Gift size={18} /></span>
          <div>
            <strong>{t("Invite friends")}</strong>
            <span>{t("dvt.cardReward", { a: 100, b: 50 })}</span>
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
          {centerBtn("secondary")}
        </div>
      </div>
    );
  }

  // Friends sidebar (glass and classic shells): draft B "Kazanç panosu" (owner, 28 Nov 2026).
  return (
    <InviteBoard
      url={url}
      copied={copied}
      shareBusy={shareBusy}
      onCopy={copy}
      onShare={share}
      onOpenCenter={openCenter}
    />
  );
}
