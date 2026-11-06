import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { addEntry, devicesOfKind, moveEntry, sameDevice } from "../audio/devicePreference.js";
import { Button, Row, Section, Select, Toggle, useAudioDevices } from "../ui/PremiumAudioKit.jsx";

export const key = "auto_device_switch";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;

function OrderList({ kind, order, devices, onChange, t }) {
  const present = devicesOfKind(devices, kind);
  const candidates = present.filter((d) => !(order || []).some((e) => sameDevice(e, d)));
  return (
    <>
      <ul className="pa-list">
        {(order || []).length === 0 ? <li className="pa-empty">{t("premiumAudio.autoSwitch.empty")}</li> : null}
        {(order || []).map((e, i) => {
          const live = present.some((d) => sameDevice(e, d));
          return (
            <li key={`${e.deviceId}-${e.label}`} className="pa-list-item">
              <span className="pa-badge tnum">{i + 1}</span>
              <div className="pa-list-main">
                <span className="pa-list-title">{e.label || t("premiumAudio.common.unnamedDevice")}</span>
                <span className="pa-list-sub">{live ? t("premiumAudio.autoSwitch.connected") : t("premiumAudio.autoSwitch.notConnected")}</span>
              </div>
              <Button label={t("premiumAudio.common.moveUp")} disabled={i === 0} onClick={() => onChange(moveEntry(order, i, i - 1))}>↑</Button>
              <Button label={t("premiumAudio.common.moveDown")} disabled={i === order.length - 1} onClick={() => onChange(moveEntry(order, i, i + 1))}>↓</Button>
              <Button kind="danger" onClick={() => onChange(order.filter((_, j) => j !== i))}>{t("premiumAudio.common.remove")}</Button>
            </li>
          );
        })}
      </ul>
      {candidates.length ? (
        <div className="pa-inline">
          <Select
            value=""
            label={t("premiumAudio.autoSwitch.add")}
            options={[{ value: "", label: t("premiumAudio.autoSwitch.add") }, ...candidates.map((d) => ({ value: d.deviceId, label: d.label || t("premiumAudio.common.unnamedDevice") }))]}
            onChange={(id) => {
              const d = candidates.find((x) => x.deviceId === id);
              if (d) onChange(addEntry(order, d));
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, AUDIO_DEFAULTS.auto_device_switch);
  const devices = useAudioDevices();
  return (
    <div className="pa-panel">
      <Section title={t("premiumAudio.autoSwitch.title")} hint={t("premiumAudio.autoSwitch.hint")}>
        <Row title={t("premiumAudio.autoSwitch.headsetFirst")} description={t("premiumAudio.autoSwitch.headsetFirstDesc")}>
          <Toggle value={s.headsetFirst !== false} onChange={(v) => update({ headsetFirst: v })} label={t("premiumAudio.autoSwitch.headsetFirst")} />
        </Row>
      </Section>
      <Section title={t("premiumAudio.autoSwitch.inputs")}>
        <OrderList kind="audioinput" order={s.inputOrder} devices={devices} onChange={(v) => update({ inputOrder: v })} t={t} />
      </Section>
      <Section title={t("premiumAudio.autoSwitch.outputs")}>
        <OrderList kind="audiooutput" order={s.outputOrder} devices={devices} onChange={(v) => update({ outputOrder: v })} t={t} />
      </Section>
    </div>
  );
}

export default Panel;
