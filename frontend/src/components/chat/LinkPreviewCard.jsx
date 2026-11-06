import { useEffect, useState } from "react";
import { cachedPreview, fetchLinkPreview } from "../../lib/linkPreview";
import { displayText } from "../../lib/profanity";
import { useT } from "../../context/LocaleContext";

/**
 * Link preview card under a message (messaging phase 4). Loaded lazily, only
 * for messages that contain a link. Data comes from our server; the picture
 * is an inline data: URI, so opening a chat never contacts the linked site.
 * Nothing renders until the preview is known (no empty box), and a link
 * without a preview stays a plain link.
 */
export default function LinkPreviewCard({ url }) {
  const t = useT();
  const [preview, setPreview] = useState(() => cachedPreview(url) || null);

  useEffect(() => {
    let alive = true;
    const known = cachedPreview(url);
    if (known !== undefined) {
      setPreview(known);
      return undefined;
    }
    fetchLinkPreview(url).then((p) => { if (alive) setPreview(p); });
    return () => { alive = false; };
  }, [url]);

  if (!preview) return null;
  let host = "";
  try { host = new URL(preview.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
  return (
    <a
      className={`msg-link-preview${preview.image ? " has-image" : ""}`}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid="link-preview"
      aria-label={t("msg4.preview.open", { site: preview.siteName || host })}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="msg-link-preview-body">
        <span className="msg-link-preview-site">{displayText(preview.siteName || host)}</span>
        {preview.title ? <span className="msg-link-preview-title">{displayText(preview.title)}</span> : null}
        {preview.description ? <span className="msg-link-preview-desc">{displayText(preview.description)}</span> : null}
      </span>
      {preview.image ? <img className="msg-link-preview-img" src={preview.image} alt="" loading="lazy" decoding="async" /> : null}
    </a>
  );
}
