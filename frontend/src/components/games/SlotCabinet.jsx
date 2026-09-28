import { useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { useT } from "../../context/LocaleContext";

const CELL = 68;

const SYMBOL_LABEL = {
  wild: "Wild",
  scatter: "Scatter",
  seven: "Seven",
  diamond: "Diamond",
  crown: "Crown",
  bell: "Bell",
  bar: "Bar",
  cherry: "Cherry",
  ace: "Ace",
  king: "King",
  queen: "Queen",
};

function SymbolFace({ id }) {
  switch (id) {
    case "wild":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <circle cx="32" cy="32" r="22" fill="#5c3d12" />
          <circle cx="32" cy="32" r="18" fill="#e2b34a" />
          <circle cx="26" cy="26" r="6" fill="#fff1c4" opacity="0.85" />
          <path d="M20 40 L26 22 H31 L32 28 L33 22 H38 L44 40 H39 L37.5 34 H26.5 L25 40 Z" fill="#3a2208" />
        </svg>
      );
    case "scatter":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M32 6 L37 24 H56 L41 35 L46 54 L32 43 L18 54 L23 35 L8 24 H27 Z" fill="#7ee0d6" />
          <circle cx="32" cy="32" r="6" fill="#08332f" />
        </svg>
      );
    case "seven":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M14 16 H50 L34 50 H26 L40 24 H14 Z" fill="#ff4d6a" />
          <path d="M18 16 H46 L33 44 H29 L39 22 H18 Z" fill="#ffd0d8" opacity="0.35" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M32 8 L52 26 L32 58 L12 26 Z" fill="#b9f3ff" />
          <path d="M32 8 L42 26 H22 Z" fill="#ffffff" opacity="0.7" />
          <path d="M12 26 H52 L32 58 Z" fill="#3aa0c8" opacity="0.45" />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M10 42 L14 22 L26 34 L32 16 L38 34 L50 22 L54 42 Z" fill="#f0c14d" />
          <rect x="12" y="42" width="40" height="8" rx="2" fill="#c4891a" />
          <circle cx="14" cy="20" r="3" fill="#fff6d8" />
          <circle cx="32" cy="14" r="3" fill="#fff6d8" />
          <circle cx="50" cy="20" r="3" fill="#fff6d8" />
        </svg>
      );
    case "bell":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M32 10 C22 10 16 22 16 34 V40 H48 V34 C48 22 42 10 32 10 Z" fill="#e6c27a" />
          <rect x="18" y="40" width="28" height="6" rx="2" fill="#a9782d" />
          <circle cx="32" cy="50" r="4" fill="#f3ddaa" />
        </svg>
      );
    case "bar":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <rect x="8" y="14" width="48" height="10" rx="2" fill="#c81e1e" />
          <rect x="8" y="27" width="48" height="10" rx="2" fill="#f4f4f4" />
          <rect x="8" y="40" width="48" height="10" rx="2" fill="#1d4e89" />
        </svg>
      );
    case "cherry":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <path d="M30 30 C30 16 36 12 40 8" stroke="#2f6b32" strokeWidth="3" fill="none" />
          <path d="M34 28 C34 16 30 12 26 8" stroke="#2f6b32" strokeWidth="3" fill="none" />
          <circle cx="24" cy="40" r="12" fill="#d3163a" />
          <circle cx="40" cy="42" r="12" fill="#ff3355" />
          <circle cx="20" cy="36" r="3" fill="#ffd0d8" />
        </svg>
      );
    case "ace":
    case "king":
    case "queen":
      return (
        <svg viewBox="0 0 64 64" className="slot-glyph">
          <rect x="12" y="8" width="40" height="48" rx="6" fill="#f6efe2" />
          <text x="32" y="40" textAnchor="middle" fontSize="22" fontFamily="Georgia, serif" fill="#6e1d2a">
            {id === "ace" ? "A" : id === "king" ? "K" : "Q"}
          </text>
        </svg>
      );
    default:
      return <span className="slot-glyph-fallback">{id}</span>;
  }
}

function formatPrize(profit, bet, t) {
  if (profit > 0) return `+${profit.toLocaleString()} ${t("credits")}`;
  if (profit === 0) return t("Stake returned");
  return `−${bet.toLocaleString()} ${t("credits")}`;
}

export default function SlotCabinet({ gameData, isMine, busy, onAgain }) {
  const t = useT();
  const phases = gameData?.phases || [];
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [paytable, setPaytable] = useState(false);

  useEffect(() => {
    if (!phases.length) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setPhaseIndex(Math.max(0, phases.length - 1));
      setSpinning(false);
      return undefined;
    }
    const timers = [];
    let at = 0;
    phases.forEach((_, index) => {
      const spinFor = 1680 + 4 * 280;
      timers.push(window.setTimeout(() => {
        setPhaseIndex(index);
        setSpinning(true);
      }, at));
      timers.push(window.setTimeout(() => setSpinning(false), at + spinFor));
      at += spinFor + 820;
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [gameData?.id, phases.length]);

  const phase = phases[phaseIndex] || phases[0];
  const shownPrize = useMemo(() => {
    if (!phase) return 0;
    return phases.slice(0, phaseIndex + 1).reduce((sum, item) => sum + (spinning && item === phase ? 0 : item.prize || 0), 0);
  }, [phases, phase, phaseIndex, spinning]);

  if (!phase) return null;

  const winCells = new Set(
    spinning ? [] : (phase.wins || []).flatMap((win) => win.cells.map((cell) => `${cell.reel}:${cell.row}`))
  );

  const payRows = gameData.paytable
    ? Object.entries(gameData.paytable)
    : [];

  return (
    <div className={`slot-cabinet ${spinning ? "is-live" : `is-${gameData.result || "loss"}`}`}>
      <div className="slot-bulbs" aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <i key={i} style={{ "--i": i }} />
        ))}
      </div>
      <header className="slot-marquee">
        <div>
          <p className="slot-kicker">Descall Royale</p>
          <h3>{spinning ? t("Spinning") : formatPrize(gameData.profit, gameData.bet, t)}</h3>
          <p>
            @{gameData.username} · {t("Bet")} {Number(gameData.bet || 0).toLocaleString()}
            {phase.kind === "free"
              ? ` · ${t("Free spins")} ${phase.freeIndex}/${phase.freeTotal}`
              : gameData.freeSpins
                ? ` · ${t("Free spins")} ${gameData.freeSpins}`
                : ""}
          </p>
        </div>
        <div className="slot-bank">
          <Wallet size={14} />
          <strong>{Number(gameData.credits || 0).toLocaleString()}</strong>
        </div>
      </header>

      <div className="slot-window">
        {(phase.strips || []).map((strip, reel) => {
          const drop = Math.max(0, strip.length - 3) * CELL;
          const dur = 1.55 + reel * 0.32;
          return (
            <div className="slot-reel" key={`${gameData.id}-${phaseIndex}-${reel}`}>
              <div
                className={`slot-strip ${spinning ? "is-spinning" : "is-held"}`}
                style={{ "--drop": `-${drop}px`, "--dur": `${dur}s` }}
              >
                {strip.map((symbol, index) => {
                  const row = index - (strip.length - 3);
                  const visible = row >= 0;
                  const hot = visible && winCells.has(`${reel}:${row}`);
                  return (
                    <div key={`${symbol}-${index}`} className={`slot-cell ${hot ? "is-win" : ""} sym-${symbol}`}>
                      <SymbolFace id={symbol} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!spinning && (phase.wins || []).length > 0 && (
          <svg className="slot-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {phase.wins.map((win) => (
              <polyline
                key={win.line}
                points={win.cells
                  .map((cell) => `${((cell.reel + 0.5) / 5) * 100},${((cell.row + 0.5) / 3) * 100}`)
                  .join(" ")}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="slot-readout">
        <span>{t("Prize")} {shownPrize.toLocaleString()}</span>
        {!spinning && phase.scatterCount >= 3 && (
          <span>{t("Scatter")} ×{phase.scatterCount}</span>
        )}
        {!spinning && !(phase.wins || []).length && phase.scatterPay <= 0 && <span>{t("No win")}</span>}
      </div>

      {!spinning && (phase.wins || []).length > 0 && (
        <ul className="slot-hits">
          {phase.wins.slice(0, 4).map((win) => (
            <li key={`${win.line}-${win.symbol}`}>
              {t("Line")} {win.line} · {t(SYMBOL_LABEL[win.symbol] || win.symbol)} ×{win.count}
              <strong>{win.amount.toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      )}

      {paytable && (
        <ul className="slot-paytable">
          {payRows.map(([symbol, table]) => (
            <li key={symbol}>
              <SymbolFace id={symbol} />
              <span>{t(SYMBOL_LABEL[symbol] || symbol)}</span>
              <em>
                {Object.entries(table)
                  .map(([count, mult]) => `${count}× ${mult}`)
                  .join(" · ")}
              </em>
            </li>
          ))}
        </ul>
      )}

      <div className="slot-actions">
        <button type="button" className="slot-ghost" onClick={() => setPaytable((open) => !open)}>
          {t("Paytable")}
        </button>
        {isMine && !spinning && (
          <button type="button" className="slot-again" disabled={busy} onClick={onAgain}>
            {t("Again")} ({Number(gameData.bet || 0).toLocaleString()})
          </button>
        )}
      </div>
      {!isMine && <p className="slot-watch">{t("Watching this spin…")}</p>}
    </div>
  );
}
