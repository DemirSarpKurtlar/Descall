import useVoiceActivity from "./useVoiceActivity";

/**
 * Voice-activity detector with hysteresis + hold times to avoid green flicker.
 * Samples come from the shared iOS-safe graph in lib/voiceActivity.js.
 */
export default function useSpeaking(stream, options = {}) {
  return useVoiceActivity(stream, options).speaking;
}
