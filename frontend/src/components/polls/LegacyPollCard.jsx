import { BarChart3 } from "../ui/Icon.jsx";
import "./dsx.css";

import { parseLegacyPoll } from "../../lib/legacyPoll";
import { useT } from "../../context/LocaleContext";

export { isLegacyPollText } from "../../lib/legacyPoll";

export default function LegacyPollCard({ text }) {
  const t = useT();
  const { question, options } = parseLegacyPoll(text);
  return (
    <div className="dsx-card dsx-legacy-poll">
      <div className="lp-h">
        <BarChart3 className="dsx-ico" size={14} /> {t("polls.legacy.head")}
      </div>
      <h4>{t("polls.poll.aria", { question })}</h4>
      {options.length ? (
        <ol>
          {options.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
