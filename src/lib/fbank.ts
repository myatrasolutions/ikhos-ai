/**
 * Kaldi-compatible log-mel filterbank front-end.
 *
 * The speaker-embedding network does not take raw audio: it expects the same
 * 80-band log-mel features Kaldi/WeSpeaker produce (25 ms window, 10 ms hop,
 * Povey window, 16 kHz mono). This module reproduces that front-end in plain
 * TypeScript so voiceprints can be computed entirely in the browser.
 */

const SAMPLE_RATE = 16000;
const FRAME_LENGTH = 400; // 25 ms
const FRAME_SHIFT = 160; // 10 ms
const FFT_SIZE = 512;
const NUM_MEL = 80;
const LOW_HZ = 20;
const HIGH_HZ = 7600;
const PREEMPHASIS = 0.97;
const EPSILON = 1.1920928955078125e-7;

function hzToMel(hz: number): number {
  return 1127 * Math.log(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.exp(mel / 1127) - 1);
}

/** Povey window — Kaldi's default for filterbank features. */
const window = (() => {
  const values = new Float32Array(FRAME_LENGTH);
  for (let i = 0; i < FRAME_LENGTH; i += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_LENGTH - 1));
    values[i] = Math.pow(hann, 0.85);
  }
  return values;
})();

/** Triangular mel filterbank over the FFT bins, built once. */
const melBanks = (() => {
  const bins = FFT_SIZE / 2 + 1;
  const binHz = SAMPLE_RATE / FFT_SIZE;
  const lowMel = hzToMel(LOW_HZ);
  const highMel = hzToMel(HIGH_HZ);
  const points: number[] = [];
  for (let i = 0; i < NUM_MEL + 2; i += 1) {
    points.push(melToHz(lowMel + ((highMel - lowMel) * i) / (NUM_MEL + 1)));
  }
  const banks: { start: number; weights: Float32Array }[] = [];
  for (let m = 0; m < NUM_MEL; m += 1) {
    const left = points[m]!;
    const centre = points[m + 1]!;
    const right = points[m + 2]!;
    const startBin = Math.max(0, Math.ceil(left / binHz));
    const endBin = Math.min(bins - 1, Math.floor(right / binHz));
    const weights = new Float32Array(Math.max(0, endBin - startBin + 1));
    for (let bin = startBin; bin <= endBin; bin += 1) {
      const hz = bin * binHz;
      const weight = hz <= centre ? (hz - left) / (centre - left) : (right - hz) / (right - centre);
      weights[bin - startBin] = Math.max(0, weight);
    }
    banks.push({ start: startBin, weights });
  }
  return banks;
})();

/** Bit-reversal permutation table and twiddle factors for the radix-2 FFT. */
const reverse = (() => {
  const table = new Uint32Array(FFT_SIZE);
  const bits = Math.log2(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    let value = 0;
    for (let bit = 0; bit < bits; bit += 1) if (i & (1 << bit)) value |= 1 << (bits - 1 - bit);
    table[i] = value;
  }
  return table;
})();

/** In-place iterative radix-2 FFT; returns the power spectrum. */
function powerSpectrum(frame: Float32Array): Float32Array {
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) real[i] = frame[reverse[i]!] ?? 0;

  for (let size = 2; size <= FFT_SIZE; size *= 2) {
    const half = size / 2;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < FFT_SIZE; i += size) {
      for (let j = 0; j < half; j += 1) {
        const angle = step * j;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const a = i + j;
        const b = a + half;
        const tr = real[b]! * cos - imag[b]! * sin;
        const ti = real[b]! * sin + imag[b]! * cos;
        real[b] = real[a]! - tr;
        imag[b] = imag[a]! - ti;
        real[a] = real[a]! + tr;
        imag[a] = imag[a]! + ti;
      }
    }
  }

  const bins = FFT_SIZE / 2 + 1;
  const power = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) power[i] = real[i]! * real[i]! + imag[i]! * imag[i]!;
  return power;
}

/**
 * Turns 16 kHz mono audio into `[frames][80]` log-mel features with per-utterance
 * mean normalization, matching the CAM++ training front-end.
 */
export function computeFbank(samples: Float32Array): { frames: number; data: Float32Array } | null {
  if (samples.length < FRAME_LENGTH) return null;
  const frames = 1 + Math.floor((samples.length - FRAME_LENGTH) / FRAME_SHIFT);
  const data = new Float32Array(frames * NUM_MEL);
  const frame = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f += 1) {
    const offset = f * FRAME_SHIFT;
    frame.fill(0);

    // Kaldi scales float audio back to 16-bit range before windowing.
    let mean = 0;
    for (let i = 0; i < FRAME_LENGTH; i += 1) mean += samples[offset + i]! * 32768;
    mean /= FRAME_LENGTH;

    // Pre-emphasis then windowing, exactly as Kaldi orders them.
    for (let i = FRAME_LENGTH - 1; i >= 0; i -= 1) {
      const current = samples[offset + i]! * 32768 - mean;
      const previous = i > 0 ? samples[offset + i - 1]! * 32768 - mean : current;
      frame[i] = (current - PREEMPHASIS * previous) * window[i]!;
    }


    const power = powerSpectrum(frame);
    for (let m = 0; m < NUM_MEL; m += 1) {
      const bank = melBanks[m]!;
      let energy = 0;
      for (let i = 0; i < bank.weights.length; i += 1) {
        energy += bank.weights[i]! * power[bank.start + i]!;
      }
      data[f * NUM_MEL + m] = Math.log(Math.max(energy, EPSILON));
    }
  }

  // Cepstral mean normalization across the utterance.
  for (let m = 0; m < NUM_MEL; m += 1) {
    let sum = 0;
    for (let f = 0; f < frames; f += 1) sum += data[f * NUM_MEL + m]!;
    const mean = sum / frames;
    for (let f = 0; f < frames; f += 1) data[f * NUM_MEL + m] = data[f * NUM_MEL + m]! - mean;
  }

  return { frames, data };
}

export const FBANK_DIM = NUM_MEL;
export const FBANK_SAMPLE_RATE = SAMPLE_RATE;
