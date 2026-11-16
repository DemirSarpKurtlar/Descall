// Chat card for a Market 2.0 look share ("Arkadaşlarına göster"): the DM text holds a look
// link (lib/shop2Look.js); the card shows the real art, the name and "Mağazada gör", which
// opens the shop at that set or item. Rendered by chat/MessageList under the message text.
import { useEffect, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import shop2Api from "../../lib/shop2Api.js";
import { localText, normalizeItem, normalizeSet } from "../../lib/shop2Logic.js";
import { parseLookText, requestShop2Focus } from "../../lib/shop2Look.js";
import Shop2Art from "./Shop2Art.jsx";
import { assetSrc } from "./Shop2Preview.jsx";
import { cssUrl } from "../../lib/cssUrl";
import { Layers, Store } from "./shop2Icons.jsx";
import "../../styles/shop2-ui.css";

const cache = new Map();
let catalogPromise = null;

function loadLook(kind, ref) {
  const key = `${kind}:${ref}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.promise;
  let promise;
  if (kind === "set") {
    promise = shop2Api.set(ref).then((res) => ({ set: normalizeSet(res) }));
  } else {
    if (!catalogPromise) {
      catalogPromise = shop2Api.catalog().then((res) => (res?.items || []).map((x) => normalizeItem(x)).filter(Boolean));
      catalogPromise.catch(() => {
        catalogPromise = null;
      });
    }
    promise = catalogPromise.then((items) => ({ item: items.find((x) => String(x.id) === String(ref)) || null }));
  }
  promise = promise.catch(() => ({}));
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Opens the app's shop (react-router listens to popstate) at the look. */
function openShopAt(look) {
  requestShop2Focus(look);
  try {
    if (window.location.pathname !== "/settings/shop") {
      window.history.pushState({}, "", "/settings/shop");
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }
  } catch {
    /* no history (tests) */
  }
}

export function LookCard({ look }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null);
  useEffect(() => {
    let off = false;
    loadLook(look.kind, look.ref).then((d) => !off && setData(d || {}));
    return () => {
      off = true;
    };
  }, [look.kind, look.ref]);
  const set = data?.set || null;
  const item = data?.item || null;
  const name = set ? localText(set.name, locale) : item ? localText(item.name, locale) : "";
  const banner = set?.pieces?.find((p) => p.item.category === "banner")?.item;
  const art = banner ? assetSrc(banner) : null;
  const pal = set?.palette || [];
  return (
    <div className={`s2-look${data ? "" : " is-loading"}`} style={pal.length ? { "--lk-a": pal[0], "--lk-b": pal[1] || pal[0], "--lk-c": pal[2] || pal[1] || pal[0] } : undefined}>
      <div className="s2-look-art" style={art ? { backgroundImage: cssUrl(art) } : undefined}>
        {item ? <Shop2Art item={item} size="card" /> : null}
        {!item && !art ? <Layers size={24} /> : null}
      </div>
      <div className="s2-look-body">
        <span className="s2-look-eyebrow">{set ? t("shop2.look.newSet") : t("shop2.look.newItem")}</span>
        <b className="s2-look-name">{name || (data ? t("shop2.look.unknown") : "")}</b>
        <small className="s2-look-sub">
          {set ? t("shop2.look.setSub", { n: set.pieceCount || set.pieces.length || 8 }) : item ? t(`shop2.cat.${item.category}`) : ""}
        </small>
        {set?.pieces?.length ? (
          <span className="s2-look-pieces">
            {set.pieces.slice(0, 8).map((p) => <Shop2Art key={p.item.id} item={p.item} size="chip" />)}
          </span>
        ) : null}
        <button type="button" className="s2-look-btn" onClick={() => openShopAt(look)}>
          <Store size={15} />
          {t("shop2.look.open")}
        </button>
      </div>
    </div>
  );
}

/** Look card for a chat message text, or nothing when it has no look link. */
export default function LookCardFromText({ text }) {
  const look = parseLookText(text);
  return look ? <LookCard look={look} /> : null;
}
