import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { getLocale } from "../../i18n/runtime";
import { formatNumber, upper } from "../../i18n/format";
import { coinFaceSvg } from "./coinflip/coinArt";
import {
  TOSS,
  faceAngle,
  isFreshRound,
  landingAngle,
  tossFrame,
} from "../../lib/coinTossMotion";
import { hapticImpactLight, hapticSelection, hapticSuccess, hapticWarning } from "../../lib/fluid/haptics";

/**
 * Coinflip v2 (design/coinflip-v2): Liquid Glass card, real 3D DesCoin,
 * segmented Yazı / Tura picker, physical toss (spec.md).
 * Data is the server round: { bet, call, face, rotations, result, winAmount,
 * profit, credits, username, status }. Nothing here changes payouts.
 */

const SLICES = 44;
const COIN_SIZE = 196;
const SIDES = [
  { key: "heads", face: "yazi", labelKey: "Heads", hintKey: "Number side" },
  { key: "tails", face: "tura", labelKey: "Tails", hintKey: "Logo side" },
];
// Rounds already animated in this window, so a remount (scroll, chat switch) does not re-toss.
const animatedRounds = new Set();

function usePrefix() {
  const id = useId();
  return useMemo(() => `cf${id.replace(/[^a-zA-Z0-9]/g, "")}`, [id]);
}

function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

const fmt = (n) => formatNumber(n || 0, getLocale());

export function MiniCoin({ face, size = 26, className = "" }) {
  const prefix = usePrefix();
  const html = useMemo(() => coinFaceSvg(face, prefix, { simple: true, size }), [face, prefix, size]);
  return (
    <span
      className={`cf2-mini ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Coin3D({ bodyRef, size = COIN_SIZE }) {
  const prefix = usePrefix();
  const yazi = useMemo(() => coinFaceSvg("yazi", `${prefix}y`), [prefix]);
  const tura = useMemo(() => coinFaceSvg("tura", `${prefix}t`), [prefix]);
  const r = size / 2;
  const thick = Math.round(size * 0.068);
  const w = (2 * Math.PI * r) / SLICES + 0.8;
  return (
    <div className="cf2-coin" style={{ width: size, height: size }} aria-hidden="true">
      <div className="cf2-coin-body" ref={bodyRef}>
        <div className="cf2-face" style={{ transform: `translateZ(${thick / 2}px)` }}>
          <span className="cf2-face-art" dangerouslySetInnerHTML={{ __html: yazi }} />
          <i className="cf2-face-dim" />
        </div>
        <div className="cf2-face" style={{ transform: `rotateX(180deg) translateZ(${thick / 2}px)` }}>
          <span className="cf2-face-art" dangerouslySetInnerHTML={{ __html: tura }} />
          <i className="cf2-face-dim" />
        </div>
        <div className="cf2-edge">
          {Array.from({ length: SLICES }, (_, i) => {
            const a = (i * 360) / SLICES;
            const lit = 0.55 + 0.4 * Math.cos(((a - 300) * Math.PI) / 180);
            return (
              <span
                key={i}
                style={{
                  width: w,
                  height: thick,
                  marginLeft: -w / 2,
                  marginTop: -thick / 2,
                  transform: `rotateZ(${a}deg) translateY(${-r + 0.6}px) rotateX(90deg)`,
                  filter: `brightness(${lit.toFixed(2)})`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function applyPose(body, shadow, { y = 0, theta, scale = 1, rotZ = 0, squash = 1, light = 1, shadow: sh }) {
  if (body) {
    body.style.transform =
      `translate3d(0, ${y.toFixed(2)}px, 0) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(4)}) ` +
      `scaleY(${squash}) rotateX(${(theta + TOSS.restTiltDeg).toFixed(2)}deg)`;
    body.style.setProperty("--cf2-dim", (1 - light).toFixed(3));
  }
  if (shadow && sh) {
    shadow.style.transform = `translateX(-50%) scale(${sh.scale.toFixed(3)})`;
    shadow.style.opacity = sh.opacity.toFixed(3);
    shadow.style.filter = `blur(${sh.blur.toFixed(1)}px)`;
  }
}

const REST_SHADOW = { scale: 1, opacity: 0.55, blur: 3 };

export default function CoinFlipTable({ gameData, isMine, busy, onCall, onAgain }) {
  const t = useT();
  const finished = gameData?.status === "finished";
  const roundId = gameData?.id || null;
  const bet = Number(gameData?.bet || 0);
  const won = gameData?.result === "win";
  const sideName = (s) => (s === "heads" ? t("Heads") : s === "tails" ? t("Tails") : "");

  const bodyRef = useRef(null);
  const shadowRef = useRef(null);
  const cardRef = useRef(null);
  const angleRef = useRef(faceAngle("tails"));
  const rafRef = useRef(0);
  const prespinTimer = useRef(0);
  const fadeTimer = useRef(0);
  const pendingTimer = useRef(0);

  const alreadyShown = finished && roundId && animatedRounds.has(roundId);
  const initiallySettled = finished && (alreadyShown || !isFreshRound(gameData?.updatedAt, Date.now(), 15000));
  const [phase, setPhase] = useState(() => (initiallySettled ? "result" : "idle"));
  const tossedRef = useRef(initiallySettled ? roundId : null);
  const [picked, setPicked] = useState(null);
  const [balanceShown, setBalanceShown] = useState(() => Number(gameData?.credits || 0));
  const [pulse, setPulse] = useState(false);
  // Count the balance up only right after a toss seen in this card, not for an old round.
  const countUpRef = useRef(false);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (prespinTimer.current) clearTimeout(prespinTimer.current);
    prespinTimer.current = 0;
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = 0;
  }, []);

  // Rest pose (no animation): idle shows Tura, a settled round shows its face.
  useLayoutEffect(() => {
    if (phase === "result" || phase === "idle") {
      const theta = finished && gameData?.face ? faceAngle(gameData.face) : faceAngle("tails");
      angleRef.current = theta;
      applyPose(bodyRef.current, shadowRef.current, { theta, shadow: REST_SHADOW });
    }
  }, [phase, finished, gameData?.face]);

  useEffect(
    () => () => {
      stop();
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    [stop]
  );

  const prespin = useCallback(() => {
    let last = performance.now();
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      angleRef.current += TOSS.prespinTurnsPerS * 360 * dt;
      applyPose(bodyRef.current, shadowRef.current, {
        theta: angleRef.current,
        light: 0.84 + 0.16 * Math.abs(Math.cos((angleRef.current * Math.PI) / 180)),
        shadow: REST_SHADOW,
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const finishRound = useCallback(
    (animated) => {
      if (roundId) animatedRounds.add(roundId);
      countUpRef.current = Boolean(animated);
      setPhase("result");
      if (animated) {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 360);
      }
      if (isMine) (won ? hapticSuccess : hapticWarning)();
    },
    [roundId, isMine, won]
  );

  // Server result arrived → toss (or reduced-motion cross-fade). Runs once per round.
  useEffect(() => {
    if (!finished) {
      if (phase === "result" || phase === "flying" || phase === "fade") setPhase("idle");
      return;
    }
    if (tossedRef.current === roundId) return;
    tossedRef.current = roundId;
    stop();
    if (animatedRounds.has(roundId) || !isFreshRound(gameData?.updatedAt, Date.now(), 15000)) {
      setPhase("result");
      return;
    }
    if (prefersReducedMotion()) {
      setPhase("fade");
      fadeTimer.current = window.setTimeout(() => finishRound(false), 150);
      return;
    }
    const start = angleRef.current;
    const end = landingAngle(start, gameData.face, gameData.rotations);
    const wobbleDir = gameData.face === "heads" ? 1 : -1;
    const t0 = performance.now();
    let contacted = false;
    setPhase("flying");
    const step = (now) => {
      const f = tossFrame(now - t0, { start, end, wobbleDir });
      angleRef.current = f.theta;
      applyPose(bodyRef.current, shadowRef.current, f);
      if (!contacted && f.phase !== "flight") {
        contacted = true;
        hapticImpactLight();
      }
      if (f.done) {
        rafRef.current = 0;
        finishRound(true);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, roundId, gameData?.face, phase]);

  // New round (rematch) → reset local pick.
  useEffect(() => {
    if (!finished) setPicked(null);
  }, [roundId, finished]);

  // Balance: escrowed value while in the air, counts to the settled value on reveal.
  const credits = Number(gameData?.credits || 0);
  const winAmount = Number(gameData?.winAmount || 0);
  useEffect(() => {
    if (!finished) {
      setBalanceShown(credits);
      return undefined;
    }
    const from = credits - winAmount;
    if (phase !== "result") {
      setBalanceShown(from);
      return undefined;
    }
    if (from === credits || !countUpRef.current || prefersReducedMotion()) {
      setBalanceShown(credits);
      return undefined;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / 400);
      const e = 1 - Math.pow(1 - u, 3);
      setBalanceShown(Math.round(from + (credits - from) * e));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, finished, credits, winAmount]);

  const call = (side) => {
    if (busy || finished || picked) return;
    setPicked(side);
    setPhase("pending");
    if (!prefersReducedMotion()) {
      prespinTimer.current = window.setTimeout(prespin, TOSS.prespinDelayMs);
    }
    // Refused or lost call (notice, offline): stop spinning and let them pick again.
    pendingTimer.current = window.setTimeout(() => {
      stop();
      setPicked(null);
      setPhase((p) => (p === "pending" ? "idle" : p));
    }, 5000);
    onCall?.(side);
  };

  const again = (side) => {
    if (busy) return;
    hapticSelection();
    onAgain?.(side);
  };

  const chosen = gameData?.call || picked;
  const inAir = phase === "pending" || phase === "flying" || phase === "fade";
  const reveal = finished && phase === "result";
  const name = gameData?.username || "";

  let status;
  if (reveal) {
    status = (
      <div className="cf2-result">
        <span className={`cf2-pill ${won ? "is-win" : "is-loss"}`}>
          {isMine ? (won ? t("You win") : t("You lose")) : won ? t("@{user} won", { user: name }) : t("@{user} lost", { user: name })}
        </span>
        <div className={`cf2-net ${won ? "" : "is-loss"}`}>
          {won ? "+" : "−"}
          {fmt(bet)}
        </div>
        <p>
          {t("{side} landed", { side: sideName(gameData.face) })} · {isMine ? t("Your call") : t("Their call")}{" "}
          <b>{sideName(gameData.call)}</b>
        </p>
      </div>
    );
  } else if (inAir) {
    status = (
      <>
        <h4>{t("In the air…")}</h4>
        <p>
          {isMine ? (
            <>
              {t("Your call")} <b>{sideName(chosen)}</b> · {t("{amount} bet", { amount: fmt(bet) })}
            </>
          ) : (
            <>{t("@{user} called {side}", { user: name, side: sideName(chosen) })} · {t("{amount} bet", { amount: fmt(bet) })}</>
          )}
        </p>
      </>
    );
  } else {
    status = isMine ? (
      <>
        <h4>{t("Call it")}</h4>
        <p>{t("A correct call doubles your bet")}</p>
      </>
    ) : (
      <>
        <h4>{t("@{user} is choosing", { user: name })}</h4>
        <p>{t("You're watching")}</p>
      </>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`cf2-card ${pulse ? "is-pulse" : ""} ${reveal ? (won ? "is-win" : "is-loss") : ""} ${phase === "fade" ? "is-fade" : ""}`}
      data-phase={phase}
    >
      <header className="cf2-head">
        <div className="cf2-title">
          <h3>{t("Heads or tails")}</h3>
          <p>
            {t("Even money")} · {t("If you win")} <b>2×</b>
          </p>
        </div>
        <div className="cf2-chips">
          <span className="cf2-chip">
            <small>{t("Bet")}</small>
            <span className="cf2-num">{fmt(bet)}</span>
          </span>
          <span className="cf2-chip" title={`@${name}`}>
            <span className="cf2-avatar">{upper(name[0] || "?", getLocale())}</span>
            <span className="cf2-chip-name">{name}</span>
          </span>
        </div>
      </header>

      <div className={`cf2-stage ${reveal ? "is-compact" : ""}`}>
        <div className="cf2-spot" />
        <div className="cf2-floor" ref={shadowRef} />
        <Coin3D bodyRef={bodyRef} />
      </div>

      <div className="cf2-status" aria-live="polite">{status}</div>

      {reveal && (
        <div className="cf2-payout">
          <div>
            <small>{t("Bet")}</small>
            <b>{fmt(bet)}</b>
          </div>
          <div>
            <small>{t("Payout")} · 2×</small>
            <b className={won ? "is-win" : ""}>{fmt(winAmount)}</b>
          </div>
        </div>
      )}

      {isMine && (!finished || inAir) && (
        <div className="cf2-seg" role="group" aria-label={t("Call it")}>
          {SIDES.map((s) => {
            const sel = chosen === s.key;
            return (
              <button
                key={s.key}
                type="button"
                className={`${sel ? "is-sel" : ""} ${chosen && !sel ? "is-off" : ""}`}
                aria-pressed={sel}
                disabled={busy || Boolean(chosen)}
                onPointerDown={() => hapticSelection()}
                onClick={() => call(s.key)}
              >
                <MiniCoin face={s.face} />
                <span className="cf2-lbl">
                  {t(s.labelKey)}
                  <small>{t(s.hintKey)}</small>
                </span>
                <span className="cf2-x">2×</span>
              </button>
            );
          })}
        </div>
      )}

      {isMine && reveal && (
        <>
          <div className="cf2-rehead">
            {t("Play again")} · <b>{fmt(bet)}</b>
          </div>
          <div className="cf2-seg is-again" role="group" aria-label={t("Play again")}>
            {SIDES.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={busy}
                onPointerDown={() => hapticSelection()}
                onClick={() => again(s.key)}
              >
                <MiniCoin face={s.face} />
                <span className="cf2-lbl">
                  {t(s.labelKey)}
                  <small>
                    {gameData.call === s.key ? t("Again {side}", { side: t(s.labelKey) }) : t("{side} this time", { side: t(s.labelKey) })}
                  </small>
                </span>
                <span className="cf2-x">2×</span>
              </button>
            ))}
          </div>
        </>
      )}

      <footer className="cf2-foot">
        {isMine ? (
          <span className="cf2-bal">
            <MiniCoin face="yazi" size={14} />
            {t("Balance")} <b>{fmt(balanceShown)}</b>
            {reveal && <span className={`cf2-delta ${won ? "is-win" : "is-loss"}`}>{won ? "+" : "−"}{fmt(bet)}</span>}
          </span>
        ) : (
          <span className="cf2-bal">@{name}</span>
        )}
        <span className="cf2-fair">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          {t("Drawn on the server")}
        </span>
      </footer>
    </div>
  );
}
