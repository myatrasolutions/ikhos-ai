/**
 * Ikhos AI — neural target speaker extraction (browser side).
 *
 * A bandpass filter cannot tell two people apart when they share a pitch, so
 * isolation is done with a speaker-embedding model instead: the pinned voice is
 * reduced to a 192-dimensional voiceprint, every incoming audio window is
 * embedded the same way, and the cosine similarity between the two drives a
 * gain mask on the audio-worklet thread. Windows that do not match the pinned
 * voiceprint are attenuated toward silence before anything reaches transcription.
 *
 * The model runs fully on-device through ONNX Runtime Web (WASM).
 */

import type { InferenceSession, Tensor } from "onnxruntime-web";

/** Speaker-embedding model: 3D-Speaker CAM++, exported to ONNX. */
const MODEL_URL =
  "https://huggingface.co/onnx-community/campplus-voxceleb-ONNX/resolve/main/onnx/model.onnx";
/** The embedding network expects 16 kHz mono audio. */
export const MODEL_SAMPLE_RATE = 16000;
/** Seconds of audio captured to build the pinned speaker's voiceprint. */
export const VOICEPRINT_SECONDS = 3;
/** Seconds of audio scored against the voiceprint for each mask update. */
export const MATCH_WINDOW_SECONDS = 0.75;
/** Cosine similarity at or above this counts as the pinned speaker. */
const MATCH_THRESHOLD = 0.42;
/** Similarity below this is fully suppressed; between the two it fades. */
const REJECT_THRESHOLD = 0.2;

type Runtime = typeof import("onnxruntime-web");

function meanNormalize(input: Float32Array): Float32Array {
  let mean = 0;
  for (const value of input) mean += value;
  mean /= input.length || 1;
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) output[i] = input[i]! - mean;
  return output;
}

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

/** Simple linear resampler from the capture rate down to the model's rate. */
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
  private inputName = "";
  private outputName = "";
  private voiceprint: Float32Array | null = null;
  private busy = false;

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
   * cannot be fetched or the device cannot run it, so the caller can keep the
   * classic pitch filter running instead of losing translation entirely.
   */
  async init(): Promise<boolean> {
    if (this.session) return true;
    try {
      const ort = (await import("onnxruntime-web")) as Runtime;
      ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
      ort.env.wasm.simd = true;
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      this.runtime = ort;
      this.session = session;
      this.inputName = session.inputNames[0] ?? "feats";
      this.outputName = session.outputNames[0] ?? "embs";
      return true;
    } catch {
      this.runtime = null;
      this.session = null;
      return false;
    }
  }

  private async embed(samples16k: Float32Array): Promise<Float32Array | null> {
    if (!this.session || !this.runtime) return null;
    const audio = meanNormalize(samples16k);
    const tensor = new this.runtime.Tensor("float32", audio, [1, audio.length]);
    const result = await this.session.run({ [this.inputName]: tensor });
    const output = result[this.outputName] as Tensor | undefined;
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
  }

  /**
   * Scores one window against the pinned voiceprint and returns the gain the
   * worklet should apply: 1 keeps the window, 0 silences it.
   * Returns null when the model is busy with the previous window.
   */
  async maskFor(samples: Float32Array, sampleRate: number): Promise<number | null> {
    if (!this.voiceprint || this.busy) return null;
    this.busy = true;
    try {
      const embedding = await this.embed(resampleTo16k(samples, sampleRate));
      if (!embedding) return null;
      const similarity = cosine(this.voiceprint, embedding);
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
