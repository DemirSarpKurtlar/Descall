import { useEffect, useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { useT } from "../../context/localeContextInstance";
import BirthDateInput from "./BirthDateInput";
import { setBirthDate } from "../../api/security";
import { getMe } from "../../api/auth";
import { getToken } from "../../lib/storage";
import { ageGroupOf, isEligibleBirthDate } from "../../lib/age";
import "../../styles/age-gate.css";

function formatDate(iso, locale) {
  const [y, m, d] = String(iso).split("-").map(Number);
  try {
    return new Date(y, m - 1, d).toLocaleDateString(locale || undefined, { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Shown over the app when the signed-in account has no date of birth yet
 * (accounts created before the age gate, or new Google sign-ups), and as a
 * lock screen when the stored date of birth is under 13.
 */
export default function BirthDateGate({ me, onBirthDateSaved, onLogout }) {
  const t = useT();
  const [known, setKnown] = useState(me?.birthDate);
  const [value, setValue] = useState("");
  const [step, setStep] = useState("ask"); // ask | confirm
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKnown(me?.birthDate);
  }, [me?.id, me?.birthDate]);

  // Some sign-in paths don't load birth_date; ask the server once.
  useEffect(() => {
    if (!me?.id || me.birthDate !== undefined) return;
    let cancelled = false;
    getMe(getToken())
      .then((data) => {
        if (cancelled) return;
        const bd = data?.user?.birthDate;
        if (bd !== undefined) {
          setKnown(bd);
          if (bd) onBirthDateSaved?.(bd);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, me?.birthDate]);

  if (!me?.id) return null;

  if (known && ageGroupOf(known) === "child") {
    return (
      <div className="age-gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
        <div className="age-gate-card">
          <div className="age-gate-icon age-gate-icon--warn"><ShieldCheck size={26} /></div>
          <h2 id="age-gate-title">{t("Descall is for ages 13 and up")}</h2>
          <p className="age-gate-text">
            {t("Your account can't be used because you're under 13. If you entered the wrong date, contact us at descall.com/contact.")}
          </p>
          <button type="button" className="age-gate-primary" onClick={() => onLogout?.()}>
            <LogOut size={16} />
            <span>{t("Log out")}</span>
          </button>
        </div>
      </div>
    );
  }

  if (known !== null) return null;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await setBirthDate(value);
      setKnown(res.birthDate);
      onBirthDateSaved?.(res.birthDate);
    } catch (err) {
      if (err?.code === "under_age" || err?.code === "birth_date_locked") {
        const bd = err?.code === "under_age" ? value : null;
        if (bd) {
          setKnown(bd);
          onBirthDateSaved?.(bd);
        } else {
          getMe(getToken()).then((d) => {
            if (d?.user?.birthDate) {
              setKnown(d.user.birthDate);
              onBirthDateSaved?.(d.user.birthDate);
            }
          }).catch(() => {});
        }
      } else {
        setError(t(err?.message || "Could not save your date of birth."));
        setStep("ask");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="age-gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <div className="age-gate-card">
        <div className="age-gate-icon"><ShieldCheck size={26} /></div>
        {step === "ask" ? (
          <>
            <h2 id="age-gate-title">{t("One quick thing: your date of birth")}</h2>
            <p className="age-gate-text">
              {t("We now ask everyone for their date of birth so we can keep Descall safe and show the right features for your age.")}
            </p>
            <BirthDateInput idPrefix="age-gate" value={value} onChange={setValue} variant="modal" />
            {error && <p className="birth-input-error" role="alert">{error}</p>}
            <button
              type="button"
              className="age-gate-primary"
              disabled={!value}
              onClick={() => setStep("confirm")}
            >
              {t("Continue")}
            </button>
            <button type="button" className="age-gate-secondary" onClick={() => onLogout?.()}>
              {t("Log out")}
            </button>
          </>
        ) : (
          <>
            <h2 id="age-gate-title">{t("Is this correct?")}</h2>
            <p className="age-gate-date">{formatDate(value, document?.documentElement?.lang)}</p>
            <p className="age-gate-text">
              {t("You can't change your date of birth later, so please make sure it's right.")}
            </p>
            {!isEligibleBirthDate(value) && (
              <p className="birth-input-error" role="alert">
                {t("You must be at least 13 years old to use Descall.")}
              </p>
            )}
            <button type="button" className="age-gate-primary" disabled={saving} onClick={save}>
              {saving ? t("Saving…") : t("Yes, save it")}
            </button>
            <button type="button" className="age-gate-secondary" disabled={saving} onClick={() => setStep("ask")}>
              {t("Go back")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
