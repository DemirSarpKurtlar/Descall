import { useEffect, useMemo, useState } from "react";
import { Cake } from "lucide-react";
import { useT } from "../../context/localeContextInstance";
import { ageFromBirthDate, MIN_AGE } from "../../lib/age";
import BirthSelect from "./BirthSelect";
import "../../styles/age-gate.css";

const MONTH_KEYS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function daysIn(year, month) {
  if (!month) return 31;
  return new Date(Date.UTC(Number(year) || 2000, Number(month), 0)).getUTCDate();
}

/**
 * Day / month / year pickers (styled dropdowns, see BirthSelect).
 * Calls onChange("YYYY-MM-DD") when complete and valid, otherwise onChange("").
 */
export default function BirthDateInput({ value = "", onChange, idPrefix = "birth", variant = "app", showHint = true }) {
  const t = useT();
  const initial = useMemo(() => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { y: m[1], mo: String(Number(m[2])), d: String(Number(m[3])) } : { y: "", mo: "", d: "" };
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [day, setDay] = useState(initial.d);
  const [month, setMonth] = useState(initial.mo);
  const [year, setYear] = useState(initial.y);

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => {
    const out = [];
    for (let y = thisYear; y >= thisYear - 100; y -= 1) out.push(y);
    return out;
  }, [thisYear]);
  const maxDay = daysIn(year, month);

  useEffect(() => {
    if (day && Number(day) > maxDay) setDay(String(maxDay));
  }, [day, maxDay]);

  const iso = day && month && year && Number(day) <= maxDay ? `${year}-${pad(month)}-${pad(day)}` : "";
  const age = iso ? ageFromBirthDate(iso) : null;
  const tooYoung = age != null && age < MIN_AGE;
  const invalid = age != null && (age < 0 || age > 120);

  useEffect(() => {
    onChange?.(iso && !invalid ? iso : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, invalid]);

  return (
    <fieldset className={`birth-input birth-input--${variant}`} aria-describedby={`${idPrefix}-hint`}>
      <legend className="birth-input-legend">
        <Cake size={15} aria-hidden="true" />
        <span>{t("Date of birth")}</span>
      </legend>
      <div className="birth-input-row">
        <BirthSelect
          id={`${idPrefix}-day`}
          label={t("Day")}
          placeholder={t("Day")}
          value={day}
          onChange={setDay}
          variant={variant}
          options={Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
        />
        <BirthSelect
          id={`${idPrefix}-month`}
          label={t("Month")}
          placeholder={t("Month")}
          value={month}
          onChange={setMonth}
          variant={variant}
          options={MONTH_KEYS.map((m, i) => ({ value: String(i + 1), label: t(m) }))}
        />
        <BirthSelect
          id={`${idPrefix}-year`}
          label={t("Year")}
          placeholder={t("Year")}
          value={year}
          onChange={setYear}
          variant={variant}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>
      {tooYoung ? (
        <p id={`${idPrefix}-hint`} className="birth-input-error" role="alert">
          {t("You must be at least 13 years old to use Descall.")}
        </p>
      ) : showHint ? (
        <p id={`${idPrefix}-hint`} className="birth-input-hint">
          {t("Not shown on your profile. Some features, like casino games, are only for users 18 and over.")}
        </p>
      ) : null}
    </fieldset>
  );
}
