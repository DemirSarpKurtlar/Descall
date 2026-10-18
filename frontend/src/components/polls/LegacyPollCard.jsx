import { BarChart3 } from "lucide-react";
import "./dsx.css";

import { parseLegacyPoll } from "../../lib/legacyPoll";

export { isLegacyPollText } from "../../lib/legacyPoll";

export default function LegacyPollCard({ text }) {
  const { question, options } = parseLegacyPoll(text);
  return (
    <div className="dsx-card dsx-legacy-poll">
      <div className="lp-h">
        <BarChart3 className="dsx-ico" size={14} /> Eski anket · oylama yok
      </div>
      <h4>Anket: {question}</h4>
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
