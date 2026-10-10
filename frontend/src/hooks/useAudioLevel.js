import useVoiceActivity from "./useVoiceActivity";

/** 0–1 smoothed level for the speaking ring. Same graph as useSpeaking. */
export default function useAudioLevel(stream, options = {}) {
  return useVoiceActivity(stream, options).level;
}
