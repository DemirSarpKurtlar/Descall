import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getValorantSkinDetail } from "../../api/valorantStore";
import { useT } from "../../context/LocaleContext";

/**
 * Skin / market detail via GET /api/valorant/skins/:uuid.
 * Uses real Riot CDN streamedVideo only — never invents placeholder mp4s.
 * Photo shown when video URL is missing.
 */
export default function CompanionSkinDetail({ skinUuid, fallbackName, fallbackIcon, onClose }) {
  const t = useT();
  const [loading, setLoading] = useState(Boolean(skinUuid));
  const [error, setError] = useState(null);
  const [skin, setSkin] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!skinUuid) {
      setLoading(false);
      setSkin(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    setActiveVideo(null);
    getValorantSkinDetail(skinUuid)
      .then((body) => {
        if (cancelled) return;
        // Dimaru contract: { ok, skin: { displayIcon, levels, chromas } }
        setSkin(body?.skin || null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || t("valorantHub.skinDetailError"));
        setSkin(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skinUuid, t]);

  if (!skinUuid) return null;

  const title = skin?.displayName || fallbackName || t("valorantHub.loadoutSkin");
  const heroIcon = skin?.displayIcon || fallbackIcon || null;
  const levels = Array.isArray(skin?.levels) ? skin.levels : [];
  const chromas = Array.isArray(skin?.chromas) ? skin.chromas : [];

  return (
    <div className="valorant-skin-detail" role="dialog" aria-modal="true" aria-label={title} data-skin-uuid={skinUuid}>
      <div className="valorant-skin-detail-head">
        <div>
          <h5>{title}</h5>
          <p className="valorant-party-sub muted">{t("valorantHub.skinDetailLead")}</p>
        </div>
        <button
          type="button"
          className="valorant-auth-btn ghost"
          onClick={onClose}
          aria-label={t("valorantHub.skinDetailClose")}
        >
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="valorant-skin-detail-loading" aria-busy="true">
          <Loader2 size={16} className="spin" />
          <span>{t("valorantHub.skinDetailLoading")}</span>
        </div>
      ) : null}

      {error ? <div className="valorant-auth-error">{error}</div> : null}

      {!loading ? (
        <>
          <div className="valorant-skin-detail-hero">
            {activeVideo ? (
              <video
                key={activeVideo}
                className="valorant-skin-detail-video"
                src={activeVideo}
                controls
                autoPlay
                muted
                playsInline
                poster={heroIcon || undefined}
              />
            ) : heroIcon ? (
              <img src={heroIcon} alt="" className="valorant-skin-detail-photo" />
            ) : (
              <span className="valorant-store-thumb placeholder large" />
            )}
          </div>

          {levels.length ? (
            <div className="valorant-skin-detail-section">
              <h6>{t("valorantHub.skinDetailLevels")}</h6>
              <ul className="valorant-skin-detail-list">
                {levels.map((lvl) => {
                  const videoUrl =
                    typeof lvl.streamedVideo === "string" && lvl.streamedVideo.trim()
                      ? lvl.streamedVideo.trim()
                      : null;
                  const hasVideo = Boolean(videoUrl);
                  return (
                    <li key={lvl.uuid}>
                      <button
                        type="button"
                        className={`valorant-skin-media-chip${activeVideo && activeVideo === videoUrl ? " is-active" : ""}`}
                        onClick={() => setActiveVideo(hasVideo ? videoUrl : null)}
                        title={lvl.displayName || undefined}
                      >
                        {lvl.displayIcon ? (
                          <img src={lvl.displayIcon} alt="" />
                        ) : heroIcon ? (
                          <img src={heroIcon} alt="" />
                        ) : (
                          <span className="valorant-store-thumb placeholder tiny" />
                        )}
                        <span>
                          <strong>{lvl.displayName || t("valorantHub.skinDetailLevel")}</strong>
                          <em className="muted">
                            {hasVideo
                              ? t("valorantHub.skinDetailHasVideo")
                              : t("valorantHub.skinDetailPhotoOnly")}
                          </em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {chromas.length ? (
            <div className="valorant-skin-detail-section">
              <h6>{t("valorantHub.skinDetailChromas")}</h6>
              <ul className="valorant-skin-detail-list chroma">
                {chromas.map((ch) => {
                  const videoUrl =
                    typeof ch.streamedVideo === "string" && ch.streamedVideo.trim()
                      ? ch.streamedVideo.trim()
                      : null;
                  const hasVideo = Boolean(videoUrl);
                  return (
                    <li key={ch.uuid}>
                      <button
                        type="button"
                        className={`valorant-skin-media-chip${activeVideo && activeVideo === videoUrl ? " is-active" : ""}`}
                        onClick={() => setActiveVideo(hasVideo ? videoUrl : null)}
                        title={ch.displayName || undefined}
                      >
                        {ch.swatch ? (
                          <img src={ch.swatch} alt="" className="swatch" />
                        ) : ch.displayIcon ? (
                          <img src={ch.displayIcon} alt="" />
                        ) : heroIcon ? (
                          <img src={heroIcon} alt="" />
                        ) : (
                          <span className="valorant-store-thumb placeholder tiny" />
                        )}
                        <span>
                          <strong>{ch.displayName || t("valorantHub.skinDetailChroma")}</strong>
                          <em className="muted">
                            {hasVideo
                              ? t("valorantHub.skinDetailHasVideo")
                              : t("valorantHub.skinDetailPhotoOnly")}
                          </em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
