import { useMemo } from "react";
import GroupSheet from "../groups/GroupSheet";
import { useT } from "../../context/LocaleContext";
import { isMacPlatform, keyCaps, shortcutSections } from "../../lib/shortcuts";
import "../../styles/messaging-sheets.css";

const GROUP_TITLES = {
  general: "msg4.keys.groupGeneral",
  chats: "msg4.keys.groupChats",
  composer: "msg4.keys.groupComposer",
  voice: "msg4.keys.groupVoice",
  app: "msg4.keys.groupApp",
};

/** Ctrl+/ help sheet (messaging phase 4): every keyboard shortcut, grouped. */
export default function ShortcutsSheet({ open, onClose }) {
  const t = useT();
  const mac = useMemo(() => isMacPlatform(), []);
  const sections = useMemo(() => shortcutSections(), []);
  return (
    <GroupSheet
      open={open}
      onClose={onClose}
      title={t("msg4.keys.title")}
      subtitle={t("msg4.keys.subtitle", { keys: keyCaps({ mod: true, key: "/" }, mac).join(mac ? "" : "+") })}
      testId="shortcuts-sheet"
      closeLabel={t("Close")}
      className="ms-sheet ms-keys-sheet"
    >
      {sections.map((sec) => (
        <section key={sec.group} className="gs-section">
          <h3 className="gs-section-title"><span>{t(GROUP_TITLES[sec.group])}</span></h3>
          <div className="gs-group">
            {sec.rows.map((row) => (
              <div key={row.id} className="gs-row ms-keys-row" data-shortcut={row.id}>
                <span className="gs-row-text"><span className="gs-row-title">{t(row.label)}</span></span>
                <span className="ms-keys">
                  {row.keys.map((combo, ci) => (
                    <span key={ci} className="ms-keys">
                      {ci > 0 ? <span className="ms-keys-plus">/</span> : null}
                      {keyCaps(combo, mac).map((cap, i) => (
                        <span key={i} className="ms-key">{cap}</span>
                      ))}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </GroupSheet>
  );
}
