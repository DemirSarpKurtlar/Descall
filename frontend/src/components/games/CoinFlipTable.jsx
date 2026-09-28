import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { useT } from "../../context/LocaleContext";

function CoinBody({ face, tossing, rotations }) {
  const land = face === "tails" ? 180 : 0;
  return (
    <div
      className={`cf-coin ${tossing ? "is-toss" : face ? "is-landed" : "is-idle"}`}
      style={{ "--turns": rotations || 6, "--land": land }}
    >
      <div className="cf-face cf-face--heads">
        <span className="cf-ring" />
        <strong>YAZI</strong>
        <em>★</em>
      </div>
      <div className="cf-face cf-face--tails">
        <span className="cf-ring cf-ring--tura" />
        <strong>TURA</strong>
        <em>♛</em>
      </div>
      {Array.from({ length: 24 }).map((_, index) => (
        <span
          key={index}
          className="cf-rim"
          style={{ transform: `rotateY(${index * 15}deg) translateZ(78px)` }}
        />
      ))}
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

  return (
    <div className={`cf-table ${reveal ? `is-${gameData.result}` : "is-live"}`}>
      <header className="cf-head">
        <div>
          <p className="cf-kicker">{t("Even money")}</p>
          <h3>{finished ? (reveal ? (won ? t("YOU WIN") : t("YOU LOSE")) : t("Spinning")) : t("Call it")}</h3>
          <p>
            @{gameData.username} · {t("Bet")} {Number(gameData.bet || 0).toLocaleString()}
            {callName ? ` · ${t("Called")} ${callName}` : ""}
          </p>
        </div>
        <div className="cf-bank">
          <Wallet size={14} />
          <strong>{Number(gameData.credits || 0).toLocaleString()}</strong>
        </div>
      </header>

      <div className="cf-stage">
        <div className="cf-shadow" />
        <CoinBody face={gameData.face} tossing={tossing} rotations={gameData.rotations} />
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
          {t("Again")} ({Number(gameData.bet || 0).toLocaleString()})
        </button>
      )}
    </div>
  );
}
