/**
 * Ikhos AI — neural target speaker extraction (browser side).
 *
 * A bandpass filter cannot tell two people apart when they share a pitch, so
 * isolation is driven by a speaker-embedding network instead. The pinned voice
 * is reduced to a 192-dimensional voiceprint; every short window of incoming
 * audio is embedded the same way and compared against it. The cosine similarity
 * becomes a gain mask applied on the audio-worklet thread, so windows belonging
 * to the other nine sources in the room are attenuated toward silence before
 * anything reaches transcription.
 *
 * Model: CAM++ (3D-Speaker / WeSpeaker lineage), ONNX, run on-device through
 * ONNX Runtime Web (WASM). Input `x` is `[1, frames, 80]` log-mel filterbank at
 * 16 kHz; output `embedding` is `[1, 192]`.
 */

import type { InferenceSession, Tensor } from "onnxruntime-web";

import { computeFbank, FBANK_DIM, FBANK_SAMPLE_RATE } from "./fbank";

const MODEL_URL = "https://huggingface.co/Luigi/campplus-zh-en-onnx/resolve/main/campplus_zh_en_fp32.onnx";

/** The embedding network expects 16 kHz mono audio. */
export const MODEL_SAMPLE_RATE = FBANK_SAMPLE_RATE;
/** Seconds of audio captured to build the pinned speaker's voiceprint. */
export const VOICEPRINT_SECONDS = 3;
/** Seconds of audio scored against the voiceprint for each mask update. */
export const MATCH_WINDOW_SECONDS = 1;
/** Cosine similarity at or above this counts as the pinned speaker. */
const MATCH_THRESHOLD = 0.7;
/** Similarity at or below this is suppressed to the noise floor; between the two it fades. */
const REJECT_THRESHOLD = 0.45;
/** Residual gain applied to rejected frames (crowd, TV, radio) — effectively silence. */
const REJECT_GAIN = 0.05;

type Runtime = typeof import("onnxruntime-web");

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Linear resampler from the capture rate down to the model's 16 kHz. */
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === MODEL_SAMPLE_RATE) return input;
  const ratio = inputRate / MODEL_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    output[i] = input[index]! * (1 - fraction) + input[next]! * fraction;
  }
  return output;
}

export class TargetSpeakerExtractor {
  private runtime: Runtime | null = null;
  private session: InferenceSession | null = null;
  private voiceprint: Float32Array | null = null;
  private busy = false;

  /** Similarity of the most recent scored window, for UI feedback. */
  lastSimilarity = 0;

  /** True once the neural engine is loaded and usable. */
  get ready(): boolean {
    return this.session !== null;
  }

  /** True once a pinned voiceprint exists and masking can run. */
  get armed(): boolean {
    return this.voiceprint !== null;
  }

  /**
   * Loads ONNX Runtime and the embedding model. Resolves false when the model
   * cannot be fetched or the device cannot run it, so the caller can fall back
   * to the classic pitch filter rather than lose translation entirely.
   */
  async init(): Promise<boolean> {
    if (this.session) return true;
    try {
      const ort = (await import("onnxruntime-web")) as Runtime;
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      this.runtime = ort;
      this.session = session;
      return true;
    } catch {
      this.runtime = null;
      this.session = null;
      return false;
    }
  }

  private async embed(samples16k: Float32Array): Promise<Float32Array | null> {
    if (!this.session || !this.runtime) return null;
    const fbank = computeFbank(samples16k);
    if (!fbank || fbank.frames < 20) return null;
    const tensor = new this.runtime.Tensor("float32", fbank.data, [1, fbank.frames, FBANK_DIM]);
    const result = await this.session.run({ x: tensor });
    const output = result["embedding"] as Tensor | undefined;
    if (!output) return null;
    return new Float32Array(output.data as Float32Array);
  }

  /** Builds the pinned speaker's voiceprint from a short captured sample. */
  async captureVoiceprint(samples: Float32Array, sampleRate: number): Promise<boolean> {
    const embedding = await this.embed(resampleTo16k(samples, sampleRate)).catch(() => null);
    if (!embedding) return false;
    this.voiceprint = embedding;
    return true;
  }

  /** Forgets the pinned voice so audio passes through unmasked again. */
  reset(): void {
    this.voiceprint = null;
    this.lastSimilarity = 0;
  }

  /**
   * Scores one window against the pinned voiceprint and returns the gain the
   * worklet should apply: 1 keeps the window, 0 silences it. Returns null when
   * the model is still busy with the previous window.
   */
  async maskFor(samples: Float32Array, sampleRate: number): Promise<number | null> {
    if (!this.voiceprint || this.busy) return null;
    this.busy = true;
    try {
      const embedding = await this.embed(resampleTo16k(samples, sampleRate));
      if (!embedding) return null;
      const similarity = cosine(this.voiceprint, embedding);
      this.lastSimilarity = similarity;
      if (similarity >= MATCH_THRESHOLD) return 1;
      if (similarity <= REJECT_THRESHOLD) return 0;
      return (similarity - REJECT_THRESHOLD) / (MATCH_THRESHOLD - REJECT_THRESHOLD);
    } catch {
      return null;
    } finally {
      this.busy = false;
    }
  }
}
