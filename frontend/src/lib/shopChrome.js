/**
 * Glass shop chrome geometry.
 *
 * The header's laid-out height is safe-area (`--g-chrome-top` = inset − 2)
 * plus the 4px / 48px button / 8px padding in settings.css. The wallet row
 * sits on that bottom edge. A sticky `top: 0` inside the scroller left a gap
 * on device: the header grows with the Dynamic Island inset (59–62pt) and the
 * stuck row did not, so a card title showed between them and the row's own
 * blur read as a hard band. The wallet is pinned with the measured header
 * height (`--g-shop-header-h`); this formula is only the fallback before that
 * measurement, and it uses the same inset the header uses.
 */

export const SHOP_HEADER_CHROME_PX = 60; // 4px pad + 48px button + 8px pad
export const SHOP_WALLET_ROW_PX = 46;

/** Header block height for a top safe-area inset, in CSS px. */
export function shopHeaderHeight(safeAreaTop = 0) {
  const inset = Number.isFinite(safeAreaTop) ? safeAreaTop : 0;
  return inset - 2 + SHOP_HEADER_CHROME_PX;
}

/**
 * Where the wallet's top edge sits, relative to the settings pane.
 * `measuredHeader` is `getBoundingClientRect().height` of the real header
 * (wins on device when the inset and the laid-out header disagree).
 * The gap between header bottom and wallet top is always 0.
 */
export function shopChromeLayout({ safeAreaTop = 0, measuredHeader = null, walletH = SHOP_WALLET_ROW_PX } = {}) {
  const formula = shopHeaderHeight(safeAreaTop);
  const headerH = Number.isFinite(measuredHeader) && measuredHeader > 0 ? measuredHeader : formula;
  const walletTop = headerH;
  return {
    formula,
    headerH,
    walletTop,
    gap: walletTop - headerH,
    contentPad: headerH + walletH,
  };
}
