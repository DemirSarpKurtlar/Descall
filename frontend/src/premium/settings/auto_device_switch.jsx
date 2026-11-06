import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { AUDIO_DEFAULTS } from "../audio/premiumAudioRuntime.js";
import { addEntry, devicesOfKind, moveEntry, sameDevice } from "../audio/devicePreference.js";
import { useAudioDevices } from "../ui/PremiumAudioKit.jsx";
import { Btn, Group, Ico, IconBtn, Item, List, Note, SetRow, Switch } from "../story/kit.jsx";

export const key = "auto_device_switch";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = false;
const ds = (s) => `${key}.${s}`;

/** Ordered device list: numbered rows, move up / down, remove, and one button per device to add. */
function OrderList({ kind, order, devices, onChange, t, field }) {
  const present = devicesOfKind(devices, kind);
  const list = order || [];
  const candidates = present.filter((d) => !list.some((e) => sameDevice(e, d)));
  const icon = kind === "audioinput" ? "mic" : "head";
  return (
    <>
      <List ds={ds(field)} empty={list.length === 0 ? t("premiumAudio.autoSwitch.empty") : null}>
        {list.map((e, i) => {
          const live = present.some((d) => sameDevice(e, d));
          return (
            <Item
              key={`${e.deviceId}-${e.label}`}
              num={i + 1}
              icon={icon}
              title={e.label || t("premiumAudio.common.unnamedDevice")}
              sub={live ? t("premiumAudio.autoSwitch.connected") : t("premiumAudio.autoSwitch.notConnected")}
              active={i === 0 && live}
            >
              <span className="ps-mv" data-s={ds("move")}>
                <IconBtn icon="up" label={t("premiumAudio.common.moveUp")} disabled={i === 0} onClick={() => onChange(moveEntry(list, i, i - 1))} />
                <IconBtn icon="down" label={t("premiumAudio.common.moveDown")} disabled={i === list.length - 1} onClick={() => onChange(moveEntry(list, i, i + 1))} />
              </span>
              <Btn className="is-danger" ds={ds("remove")} onClick={() => onChange(list.filter((_, j) => j !== i))}>{t("premiumAudio.common.remove")}</Btn>
            </Item>
          );
        })}
      </List>
      {candidates.length ? (
        <div className="ps-adds" data-s={ds("add")} role="group" aria-label={t("premiumAudio.autoSwitch.add")}>
          {candidates.map((d) => (
            <button key={d.deviceId} type="button" className="ps-add" onClick={() => onChange(addEntry(list, d))}>
              <Ico n="plus" size={13} />{d.label || t("premiumAudio.common.unnamedDevice")}
            </button>
          ))}
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
    <>
      <Group title={t("premiumAudio.autoSwitch.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.autoSwitch.hint")}</Note>
        <SetRow icon="plug" label={t("premiumAudio.autoSwitch.headsetFirst")} desc={t("premiumAudio.autoSwitch.headsetFirstDesc")}>
          <Switch checked={s.headsetFirst !== false} onChange={(v) => update({ headsetFirst: v })} label={t("premiumAudio.autoSwitch.headsetFirst")} ds={ds("headsetFirst")} />
        </SetRow>
      </Group>
      <Group title={t("premiumAudio.autoSwitch.inputs")}>
        <OrderList kind="audioinput" field="inputOrder" order={s.inputOrder} devices={devices} onChange={(v) => update({ inputOrder: v })} t={t} />
      </Group>
      <Group title={t("premiumAudio.autoSwitch.outputs")}>
        <OrderList kind="audiooutput" field="outputOrder" order={s.outputOrder} devices={devices} onChange={(v) => update({ outputOrder: v })} t={t} />
      </Group>
    </>
  );
}

export default Panel;
