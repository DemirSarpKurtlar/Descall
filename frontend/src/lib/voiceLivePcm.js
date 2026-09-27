const OUTPUT_RATE = 16000;
const FRAME_SAMPLES = 1600;

/** Average-downsample float32 mic audio to 16-bit PCM at 16 kHz. */
export function downsampleFloatToInt16(input, inputRate, outputRate = OUTPUT_RATE) {
  if (!input?.length || !inputRate || !outputRate) {
    return { pcm: new Int16Array(0), rms: 0 };
  }
  const ratio = inputRate / outputRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(outLen);
  let sum = 0;
  for (let i = 0; i < outLen; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let acc = 0;
    let n = 0;
    for (let j = start; j < end; j += 1) {
      acc += input[j] || 0;
      n += 1;
    }
    const sample = n ? acc / n : 0;
    sum += sample * sample;
    const clipped = Math.max(-1, Math.min(1, sample));
    pcm[i] = clipped < 0 ? Math.round(clipped * 32768) : Math.round(clipped * 32767);
  }
  return { pcm, rms: Math.sqrt(sum / outLen) };
}

/** Pack a stream of PCM into fixed 100ms frames (1600 samples at 16 kHz). */
export function createPcmFramer(frameSamples = FRAME_SAMPLES) {
  let pending = new Int16Array(0);
  return {
    push(samples) {
      if (!samples?.length) return [];
      const next = new Int16Array(pending.length + samples.length);
      next.set(pending, 0);
      next.set(samples, pending.length);
      const frames = [];
      let offset = 0;
      while (next.length - offset >= frameSamples) {
        frames.push(next.slice(offset, offset + frameSamples));
        offset += frameSamples;
      }
      pending = offset ? next.slice(offset) : next;
      return frames;
    },
    reset() {
      pending = new Int16Array(0);
    },
  };
}

export { OUTPUT_RATE, FRAME_SAMPLES };
