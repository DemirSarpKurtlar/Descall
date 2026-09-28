import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { useT } from "../../context/LocaleContext";

const REEDS = 48;

function CoinBody({ face, tossing, rotations, headsLabel, tailsLabel }) {
  const land = face === "tails" ? 180 : 0;
  return (
    <div
      className={`cf-coin ${tossing ? "is-toss" : face ? "is-landed" : "is-idle"}`}
      style={{ "--turns": rotations || 6, "--land": land }}
    >
      <div className="cf-face cf-face--heads">
        <span className="cf-engrave" />
        <strong className={headsLabel.length > 4 ? "is-long" : ""}>{headsLabel}</strong>
        <em>★</em>
      </div>
      <div className="cf-face cf-face--tails">
        <span className="cf-engrave" />
        <strong className={tailsLabel.length > 4 ? "is-long" : ""}>{tailsLabel}</strong>
        <em>♛</em>
      </div>
      <div className="cf-edge" aria-hidden="true">
        {Array.from({ length: REEDS }, (_, index) => (
          <span
            key={index}
            style={{ transform: `rotateY(${index * (360 / REEDS)}deg) translateZ(var(--cf-r))` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CoinFlipTable({ gameData, isMine, busy, onCall, onAgain }) {
  const t = useT();
  const finished = gameData?.status === "finished";
  const [tossing, setTossing] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    if (!finished) {
      setTossing(false);
      setReveal(false);
      return undefined;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setTossing(false);
      setReveal(true);
      return undefined;
    }
    setTossing(true);
    setReveal(false);
    const timer = window.setTimeout(() => {
      setTossing(false);
      setReveal(true);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [gameData?.id, gameData?.face, finished]);

  const callName = gameData?.call === "heads" ? t("Heads") : gameData?.call === "tails" ? t("Tails") : null;
  const faceName = gameData?.face === "heads" ? t("Heads") : gameData?.face === "tails" ? t("Tails") : null;
  const won = gameData?.result === "win";
  const headsLabel = t("Heads").toLocaleUpperCase("tr");
  const tailsLabel = t("Tails").toLocaleUpperCase("tr");
  const bet = Number(gameData.bet || 0).toLocaleString();

  return (
    <div className={`cf-table ${reveal ? `is-${gameData.result}` : "is-live"}`}>
      <header className="cf-head">
        <div className="cf-head-top">
          <p className="cf-kicker">{t("Even money")}</p>
          <div className="cf-bank">
            <Wallet size={14} />
            <strong>{Number(gameData.credits || 0).toLocaleString()}</strong>
          </div>
        </div>
        <h3>{finished ? (reveal ? (won ? t("YOU WIN") : t("YOU LOSE")) : t("Spinning")) : t("Call it")}</h3>
        <p className="cf-meta">
          <span>@{gameData.username}</span>
          <span>{t("Bet")} {bet}</span>
          {callName ? <span>{t("Called")} {callName}</span> : null}
        </p>
      </header>

      <div className="cf-stage">
        <div className="cf-glow" />
        <div className="cf-shadow" />
        <CoinBody
          face={gameData.face}
          tossing={tossing}
          rotations={gameData.rotations}
          headsLabel={headsLabel}
          tailsLabel={tailsLabel}
        />
      </div>

      {reveal && (
        <div className={`cf-result ${won ? "is-win" : "is-loss"}`}>
          <strong>{t("Landed on")} {faceName}</strong>
          <span>
            {won
              ? `+${Number(gameData.profit || 0).toLocaleString()} ${t("credits")}`
              : `−${Number(gameData.bet || 0).toLocaleString()} ${t("credits")}`}
          </span>
        </div>
      )}

      {!finished && isMine && (
        <div className="cf-calls">
          <button type="button" disabled={busy} onClick={() => onCall("heads")}>
            {t("Heads")}
          </button>
          <button type="button" className="is-tura" disabled={busy} onClick={() => onCall("tails")}>
            {t("Tails")}
          </button>
        </div>
      )}

      {!finished && !isMine && <p className="cf-watch">{t("Waiting for the call…")}</p>}
      {finished && !isMine && <p className="cf-watch">{t("Watching this flip…")}</p>}

      {finished && reveal && isMine && (
        <button type="button" className="cf-again" disabled={busy} onClick={onAgain}>
          {t("Again")} · {bet}
        </button>
      )}
    </div>
  );
}
