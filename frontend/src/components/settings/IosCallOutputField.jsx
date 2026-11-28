import { useEffect, useState } from "react";
import { Headphones } from "../ui/Icon.jsx";
import { useLocale } from "../../context/LocaleContext";
import { useIosAudioRoute } from "../../hooks/useIosAudioRoute";
import { readIosCallAudioPreference, writeIosCallAudioPreference } from "../../lib/iosAudioRoute";
import { iosOutputFieldModel } from "../../lib/iosOutputField";

/**
 * Settings → Ses ve Görüntü on the iPhone app: the "Speaker" select listed
 * WKWebView output devices, which iOS never exposes (only "System default"),
 * so the earpiece could not be chosen there. This field drives the native
 * router instead: during a call / voice channel it switches the live route
 * (and shows what is really playing); otherwise it sets the default output
 * calls and voice channels start with (mirrored to native for calls answered
 * with the app closed).
 */
export default function IosCallOutputField() {
  const { t } = useLocale();
  const { iosAudioRoute, selectIosRoute } = useIosAudioRoute(true);
  const [pref, setPref] = useState(() => readIosCallAudioPreference());
  useEffect(() => setPref(readIosCallAudioPreference()), []);
  const model = iosOutputFieldModel(iosAudioRoute, pref, {
    speaker: t("Loudspeaker"),
    receiver: t("Earpiece"),
    systemDefault: t("System default"),
    now: t("uset.iosOutput.now"),
  });

  const onChange = (e) => {
    const id = e.target.value;
    if (id === "receiver" || id === "speaker" || id === "") {
      setPref(id);
      void writeIosCallAudioPreference(id);
    }
    if (model.live && id) selectIosRoute(id);
  };

  return (
    <label className="us-field">
      <span>
        <Headphones size={13} /> {t("uset.iosOutput.label")}
      </span>
      <select value={model.value} onChange={onChange}>
        {model.options.map((o) => (
          <option key={o.id || "default"} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <small className="us-row-desc">{t("uset.iosOutput.hint")}</small>
    </label>
  );
}
