import { IOS_NATIVE, callKitPlugin } from "./iosCallKit";

/** "speaker" | "receiver" | "system" (DescallAudioRouter.select). */
export function setCallAudioRoute(route) {
  if (!IOS_NATIVE || typeof callKitPlugin.setAudioRoute !== "function") return Promise.resolve();
  return callKitPlugin.setAudioRoute({ route }).catch(() => {});
}
