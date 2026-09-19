/** Member B — browser mic capture encoded as complete 16 kHz mono WAV files. */

function downsample(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (targetRate >= inputRate) return input;
  const ratio = inputRate / targetRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += input[j]!;
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

export function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000): Blob {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const samples = downsample(merged, sampleRate, targetRate);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (pos: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(pos + i, value.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let pos = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < buffer.length; i += step) {
    binary += String.fromCharCode(...buffer.subarray(i, i + step));
  }
  return btoa(binary);
}

export type MicRecorder = {
  stop: () => Promise<Blob>;
};

export async function startMicRecording(): Promise<MicRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];

  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(context.destination);

  return {
    stop: async () => {
      stream.getTracks().forEach((track) => track.stop());
      processor.disconnect();
      source.disconnect();
      const blob = encodeWav(chunks, context.sampleRate);
      await context.close();
      return blob;
    },
  };
}

/** Simulated crowd-noise corruption of a clean transcript, for the comparison panel. */
export function garbleTranscript(text: string): string {
  const noise = ["[crowd noise]", "[cheering]", "[unclear]", "[PA feedback]", "[applause]"];
  const words = text.split(/\s+/).filter(Boolean);
  const output: string[] = [];
  words.forEach((word, index) => {
    if (index % 4 === 0) output.push(noise[index % noise.length]!);
    output.push(index % 3 === 1 ? `${word.slice(0, Math.max(1, word.length - 2))}…` : word);
  });
  return output.join(" ");
}
