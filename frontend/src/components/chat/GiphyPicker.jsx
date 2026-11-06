import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Loader2, WifiOff } from "../ui/Icon.jsx";
import EmptyState from "../ui/EmptyState";
import { useT } from "../../context/LocaleContext";
import useGlassUi from "../../hooks/useGlassUi";
import { useGlassDesktop } from "../../hooks/useGlassDesktop";
import { masonryColumns, masonryColumnCount, giphyThumb, gifRatio } from "../../lib/gifMasonry";
import "../../styles/gif-masonry.css";

export const GIPHY_API_KEY = "dtgxSdCkeVkjYcEeEpSYlqP4mmv4LQgi";
const GIPHY_API_URL = "https://api.giphy.com/v1/gifs";

export default function GiphyPicker({ isOpen, onClose, onSelectGif, anchorRef }) {
  const t = useT();
  const glass = useGlassUi();
  const desktopGlass = useGlassDesktop();
  /* iPhone keeps the bottom sheet. Desktop glass centres in the viewport;
     the attach-button anchor is what shoved the card left and down. */
  const centered = glass || desktopGlass;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchArmed, setSearchArmed] = useState(false);
  const searchArmedRef = useRef(false);
  const armSearch = () => {
    searchArmedRef.current = true;
    setSearchArmed(true);
  };
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("trending");
  const [panelPos, setPanelPos] = useState({ bottom: 72, left: 16, width: 400 });
  const searchInputRef = useRef(null);
  const panelRef = useRef(null);
  // Masonry column count follows the grid's real width (2 on a phone sheet, 3 in the popover).
  const gridRef = useRef(null);
  const [gridCols, setGridCols] = useState(3);

  const fetchTrending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${GIPHY_API_URL}/trending?api_key=${GIPHY_API_KEY}&limit=30&rating=g`);
      if (!res.ok) throw new Error("trending");
      const data = await res.json();
      setGifs(data.data || []);
    } catch {
      setError("trending");
    } finally {
      setLoading(false);
    }
  }, [t]);

  const searchGifs = useCallback(async (query) => {
    if (!query.trim()) {
      fetchTrending();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${GIPHY_API_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=30&rating=g`
      );
      if (!res.ok) throw new Error("search");
      const data = await res.json();
      setGifs(data.data || []);
    } catch {
      setError("search");
    } finally {
      setLoading(false);
    }
  }, [fetchTrending, t]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setActiveTab("trending");
      setSearchArmed(false);
      searchArmedRef.current = false;
      return;
    }
    fetchTrending();
    // iPhone opens the keyboard the moment this field is focused, which
    // covers the GIF grid. Trending stays up until the user taps search.
    if (glass) {
      const active = document.activeElement;
      if (active && active !== document.body && typeof active.blur === "function") active.blur();
      const blurSearch = () => searchInputRef.current?.blur();
      blurSearch();
      const timer = setTimeout(blurSearch, 80);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => searchInputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [isOpen, fetchTrending, glass]);

  useEffect(() => {
    if (!isOpen || centered) return undefined;
    const place = () => {
      const anchor = anchorRef?.current;
      const width = Math.min(420, window.innerWidth - 24);
      if (!anchor) {
        setPanelPos({ bottom: 72, left: 16, width });
        return;
      }
      const rect = anchor.getBoundingClientRect();
      let left = rect.left;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const bottom = Math.max(12, window.innerHeight - rect.top + 10);
      setPanelPos({ bottom, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen, anchorRef, centered]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchGifs(searchQuery);
        setActiveTab("search");
      } else if (activeTab === "search") {
        fetchTrending();
        setActiveTab("trending");
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, searchGifs, fetchTrending, activeTab]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    const el = gridRef.current;
    if (!isOpen || !el) return undefined;
    const measure = () => setGridCols(masonryColumnCount(el.clientWidth - 20, { target: 150, min: 2, max: 4 }));
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen, loading, gifs.length]);

  const handleSelect = (gif) => {
    const gifUrl = gif.images?.fixed_height?.url || gif.images?.original?.url;
    const previewUrl = gif.images?.fixed_height_small?.url || gif.images?.preview_gif?.url;
    if (!gifUrl) return;
    onSelectGif?.({
      url: gifUrl,
      previewUrl: previewUrl || gifUrl,
      title: gif.title,
      id: gif.id,
      source: "giphy",
    });
    onClose?.();
    setSearchQuery("");
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`giphy-overlay${glass ? " g-giphy-scrim" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            className={`giphy-panel${glass ? " g-giphy" : ""}`}
            role="dialog"
            aria-label={t("GIF picker")}
            style={centered ? undefined : {
              bottom: panelPos.bottom,
              left: panelPos.left,
              width: panelPos.width,
            }}
            initial={centered ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            animate={centered ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={centered ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="giphy-header">
              {/* UI audit #107: the title is what you pick, not the provider;
                  the GIPHY credit stays in the footer. */}
              <h2 className="giphy-title">{t("GIFs")}</h2>
              <button type="button" className="giphy-close" onClick={onClose} aria-label={t("Close")}>
                <X size={16} />
              </button>
            </header>

            <div className="giphy-search">
              <Search size={15} className="giphy-search-ico" />
              <input
                ref={searchInputRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                readOnly={glass && !searchArmed}
                placeholder={t("Search GIFs…")}
                value={searchQuery}
                onPointerDown={(event) => {
                  if (!glass || searchArmedRef.current) return;
                  armSearch();
                  event.currentTarget.readOnly = false;
                }}
                onFocus={(event) => {
                  if (glass && !searchArmedRef.current) event.currentTarget.blur();
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="giphy-search-clear"
                  onClick={() => {
                    setSearchQuery("");
                    fetchTrending();
                    setActiveTab("trending");
                  }}
                  aria-label={t("Clear search")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="giphy-grid" ref={gridRef}>
              {loading ? (
                <div className="giphy-state">
                  <Loader2 size={26} className="giphy-spin" />
                  <span>{t("Loading GIFs…")}</span>
                </div>
              ) : error ? (
                <EmptyState
                  compact
                  tone="error"
                  className="giphy-state is-error"
                  icon={WifiOff}
                  title={t("GIFs couldn't load")}
                  body={t("Check your connection and try again.")}
                  primary={{ label: t("Retry"), action: () => (searchQuery.trim() ? searchGifs(searchQuery) : fetchTrending()) }}
                />
              ) : gifs.length === 0 ? (
                <div className="giphy-state">{t("No GIFs found. Try another search.")}</div>
              ) : (
                /* Masonry by each GIF's real GIPHY width/height: constant gaps, no holes. */
                <div className="gif-masonry giphy-masonry">
                  {masonryColumns(gifs, gridCols, (gif) => gifRatio(giphyThumb(gif))).map((col, ci) => (
                    <div className="gif-masonry-col" key={ci}>
                      {col.map(({ item: gif, ratio }) => {
                        const thumb = giphyThumb(gif);
                        return (
                          <button
                            key={gif.id}
                            type="button"
                            className="giphy-cell"
                            style={{ paddingBottom: `${(ratio * 100).toFixed(3)}%` }}
                            title={gif.title} aria-label={gif.title}
                            onClick={() => handleSelect(gif)}
                          >
                            <img
                              src={thumb.url}
                              alt={gif.title || "GIF"}
                              loading="lazy"
                              decoding="async"
                              draggable={false}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="giphy-footer">{t("Powered by GIPHY")}</footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
