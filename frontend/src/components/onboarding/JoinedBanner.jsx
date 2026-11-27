/**
 * Phone, inside the channel right after "Katıl ve gönder" (draft 2A phone 4): the "İlk Selam"
 * card with the DesCoin and the checklist count, and "Katıldın · Geri al N" for ten seconds.
 * Shown only in the channel the message went to; it folds away after the undo window and
 * once the celebration was seen.
 */
import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useOnboarding } from "./OnboardingContext";
import { Coin } from "./parts";
import { Award, Check, Heart, Reply, Undo2, X } from "../ui/Icon.jsx";

export default function JoinedBanner({ channelId }) {
  const t = useT();
  const o = useOnboarding();
  const [closed, setClosed] = useState(false);
  const s = o?.send;
  const here = s && s.phase === "sent" && s.channelId && String(s.channelId) === String(channelId || "");
  useEffect(() => {
    setClosed(false);
  }, [s?.messageId]);
  useEffect(() => {
    if (!here || o.undoSecondsLeft > 0) return undefined;
    const id = setTimeout(() => setClosed(true), 12000);
    return () => clearTimeout(id);
  }, [here, o?.undoSecondsLeft]);
  if (!here || closed) return null;
  const cl = o.data?.checklist;
  const tr = o.track || {};
  return (
    <div className="onb onb-joined" data-testid="onb-joined">
      {!s.joinedOnly && !s.helloBefore ? (
        <div className="badge" role="status">
          <span className="onb-badge-ico"><Award size={22} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{s.rewarded ? t("onb.joined.badgeDone") : t("onb.joined.badge")}</b>
            <small>
              <Coin size={12} />
              {t("onb.joined.badgeSub", { n: s.rewardAmount || 50, done: cl?.doneCount ?? 0, total: cl?.total ?? 5 })}
            </small>
          </div>
          {tr.reactions || tr.replies ? (
            <span className="onb-muted" style={{ display: "flex", gap: 8, fontSize: 12.5 }}>
              <span><Heart size={12} /> {tr.reactions || 0}</span>
              <span><Reply size={12} /> {tr.replies || 0}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="bar" role="status" aria-live="polite">
        <Check size={16} />
        <span>{t("onb.joined.bar", { name: s.name || "" })}</span>
        {o.undoSecondsLeft > 0 ? (
          <button type="button" onClick={() => void o.undo()}>
            <Undo2 size={14} />
            {t("onb.sent.undo", { n: o.undoSecondsLeft })}
          </button>
        ) : (
          <button type="button" onClick={() => setClosed(true)} aria-label={t("onb.preview.close")}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
