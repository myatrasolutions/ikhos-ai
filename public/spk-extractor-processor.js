/**
 * Ikhos AI — target speaker extraction worklet.
 *
 * Runs on the real-time audio thread. It does two jobs:
 *  1. Ships fixed-size PCM frames to the main thread, where the ONNX speaker
 *     model turns them into voiceprint embeddings.
 *  2. Applies the gain mask the main thread sends back, so audio that does not
 *     match the pinned voiceprint is attenuated toward silence sample by sample.
 *
 * No neural math happens here — the audio thread must never block.
 */

/** Samples per analysis frame shipped to the model (32 ms at 48 kHz). */
const FRAME_SIZE = 1536;
/** How fast the mask is allowed to move per sample (prevents zipper noise). */
const MASK_SLEW = 0.0008;

class TargetSpeakerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** Target mask requested by the main thread: 1 = pass, 0 = suppress. */
    this.targetMask = 1;
    /** Smoothly interpolated mask actually applied to samples. */
    this.currentMask = 1;
    /** True once a speaker is pinned; before that the audio passes through. */
    this.armed = false;
    this.buffer = new Float32Array(FRAME_SIZE);
    this.masked = new Float32Array(FRAME_SIZE);
    this.filled = 0;


    this.port.onmessage = (event) => {
      const data = event.data;
      if (data.type === "SET_MASK") {
        this.targetMask = Math.max(0, Math.min(1, data.mask));
      } else if (data.type === "ARM") {
        this.armed = Boolean(data.armed);
        if (!this.armed) this.targetMask = 1;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inputChannel = input[0];
    const outputChannel = output[0];

    for (let i = 0; i < inputChannel.length; i += 1) {
      const sample = inputChannel[i];

      // Glide toward the requested mask so gating never clicks.
      const delta = this.targetMask - this.currentMask;
      if (delta > MASK_SLEW) this.currentMask += MASK_SLEW;
      else if (delta < -MASK_SLEW) this.currentMask -= MASK_SLEW;
      else this.currentMask = this.targetMask;

      const cleaned = this.armed ? sample * this.currentMask : sample;
      outputChannel[i] = cleaned;

      // Collect raw frames (for voiceprint matching) and cleaned frames
      // (for transcription) regardless of the current mask state.
      this.buffer[this.filled] = sample;
      this.masked[this.filled] = cleaned;
      this.filled += 1;
      if (this.filled === FRAME_SIZE) {
        this.port.postMessage({
          type: "AUDIO_FRAME",
          frame: this.buffer.slice(0),
          cleaned: this.masked.slice(0),
          mask: this.currentMask,
        });
        this.filled = 0;
      }
    }


    return true;
  }
}

registerProcessor("target-speaker-processor", TargetSpeakerProcessor);
