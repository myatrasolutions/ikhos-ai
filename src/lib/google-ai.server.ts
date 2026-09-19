/**
 * Member B — Google Language & AI service layer.
 *
 * Every helper calls the dedicated Google Cloud API first and transparently
 * falls back to Gemini 2.5 Flash when that API is not enabled on the GCP
 * project. Each result reports which provider actually served it plus the
 * measured latency, so the Engine Control Panel can display real metrics.
 *
 * Server-only: never import this from a component.
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEN_LANG = "https://generativelanguage.googleapis.com/v1beta/models";

export type Provider =
  | "google-speech-to-text"
  | "google-translate"
  | "google-text-to-speech"
  | "google-vision"
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-tts"
  | "lovable-ai-tts";

export type PipelineResult<T> = {
  value: T;
  provider: Provider;
  latencyMs: number;
  fallbackReason?: string;
};

export const LANGUAGE_CODES: Record<string, string> = {
  Spanish: "es",
  Mandarin: "zh",
  Hindi: "hi",
  Vietnamese: "vi",
  Arabic: "ar",
  Nepali: "ne",
  Swahili: "sw",
};

export const TTS_VOICE_LOCALE: Record<string, string> = {
  Spanish: "es-US",
  Mandarin: "cmn-CN",
  Hindi: "hi-IN",
  Vietnamese: "vi-VN",
  Arabic: "ar-XA",
  Nepali: "hi-IN",
  Swahili: "sw-KE",
};

/** Dynamic context adapters applied to speech recognition. */
export const CONTEXT_ADAPTERS = [
  "inclusivity",
  "beamforming",
  "accessibility",
  "ADA compliance",
  "assistive listening",
  "commencement",
  "auditorium",
  "captioning",
];

function apiKey(): string {
  const key = process.env["GOOGLE_CLOUD_API_KEY"] ?? process.env["GOOGLE_LANGUAGE_API_KEY"];
  if (!key) {
    throw new Error(
      "GOOGLE_CLOUD_API_KEY is not configured. Add it in the project secrets before running the pipeline.",
    );
  }
  return key;
}

/** True when Google reports the API is disabled / blocked / not found for the project. */
function isServiceUnavailable(status: number, body: string): boolean {
  if (status === 403 || status === 404) return true;
  return /has not been used in project|is disabled|are blocked|SERVICE_DISABLED/i.test(body);
}

function shortReason(body: string, fallback: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message;
    if (message) return message.split(". Enable it")[0]!.slice(0, 220);
  } catch {
    /* non-JSON body */
  }
  return fallback;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function lovableKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY is not configured.");
  return key;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lovable AI transcription — used when the Google key is out of quota. */
async function lovableTranscribe(audioBase64: string, mimeType: string): Promise<string> {
  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  const clean = mimeType.split(";")[0] ?? "audio/webm";
  const safe = clean.startsWith("audio/") ? clean : "audio/webm";
  const ext =
    ({ "audio/wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "mp4", "audio/webm": "webm" } as Record<string, string>)[
      safe
    ] ?? "webm";
  form.append(
    "file",
    new Blob([base64ToBytes(audioBase64) as unknown as BlobPart], { type: safe }),
    `recording.${ext}`,
  );

  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey()}` },
    body: form,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Transcription failed (${response.status}): ${shortReason(body, body.slice(0, 200))}`);
  }
  const parsed = JSON.parse(body) as { text?: string };
  return (parsed.text ?? "").trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Lovable AI speech synthesis — used when the Google key is blocked or out of quota. */
async function lovableSynthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [
        { role: "user", parts: [{ text: `Read this clearly and slowly for an accessibility audience: ${text}` }] },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Speech synthesis unavailable (${response.status}): ${shortReason(detail, detail.slice(0, 180))}`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "audio/wav";
  return { audioBase64: bytesToBase64(buffer), mimeType };
}

/** Lovable AI text/vision reasoning — used when the Google key is out of quota. */
async function callLovableAI(parts: GeminiPart[], systemInstruction?: string): Promise<string> {
  const content = parts.map((part) =>
    "text" in part
      ? { type: "input_text", text: part.text }
      : {
          type: "input_image",
          image_url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`,
        },
  );

  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": lovableKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      ...(systemInstruction ? { instructions: systemInstruction } : {}),
      input: [{ role: "user", content }],
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      store: false,
    }),
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`Lovable AI request failed (${response.status}): ${shortReason(body, body.slice(0, 200))}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { type?: string; delta?: string };
        if (event.type === "response.output_text.delta" && event.delta) text += event.delta;
      } catch {
        /* keep-alive chunk */
      }
    }
  }
  return text.trim();
}

/** True when the Google key is rate limited, out of quota, or rejected. */
function isGoogleKeyBlocked(message: string): boolean {
  return /\((429|401|403)\)|quota|rate limit|RESOURCE_EXHAUSTED|API key not valid/i.test(message);
}

async function callGemini(parts: GeminiPart[], systemInstruction?: string): Promise<string> {
  const audio = parts.find(
    (part): part is { inline_data: { mime_type: string; data: string } } =>
      "inline_data" in part && part.inline_data.mime_type.startsWith("audio/"),
  );

  try {
    const response = await fetch(`${GEN_LANG}/${GEMINI_MODEL}:generateContent?key=${apiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        generationConfig: { temperature: 0.2 },
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status}): ${shortReason(body, body.slice(0, 200))}`);
    }

    const parsed = JSON.parse(body) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new Error("Gemini returned an empty response.");
    return text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isGoogleKeyBlocked(message)) throw error;
    // Google key blocked (quota/billing) — keep the pipeline alive on Lovable AI.
    if (audio) return lovableTranscribe(audio.inline_data.data, audio.inline_data.mime_type);
    return callLovableAI(parts, systemInstruction);
  }
}

/* ------------------------------------------------------------------ */
/* Speech-to-Text                                                      */
/* ------------------------------------------------------------------ */

export async function transcribeAudio(
  audioBase64: string,
  mimeType: string,
): Promise<PipelineResult<string>> {
  const started = Date.now();
  let fallbackReason: string | undefined;

  const encoding = mimeType.includes("wav") || mimeType.includes("l16") ? "LINEAR16" : "WEBM_OPUS";
  try {
    const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          encoding,
          sampleRateHertz: encoding === "LINEAR16" ? 16000 : 48000,
          languageCode: "en-US",
          enableAutomaticPunctuation: true,
          model: "latest_long",
          useEnhanced: true,
          speechContexts: [{ phrases: CONTEXT_ADAPTERS, boost: 12 }],
        },
        audio: { content: audioBase64 },
      }),
    });
    const body = await response.text();
    if (response.ok) {
      const parsed = JSON.parse(body) as {
        results?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
      };
      const transcript = (parsed.results ?? [])
        .map((result) => result.alternatives?.[0]?.transcript ?? "")
        .join(" ")
        .trim();
      return {
        value: transcript,
        provider: "google-speech-to-text",
        latencyMs: Date.now() - started,
      };
    }
    if (!isServiceUnavailable(response.status, body)) {
      throw new Error(shortReason(body, `Speech-to-Text failed (${response.status})`));
    }
    fallbackReason = shortReason(body, "Cloud Speech-to-Text is not enabled on this Google project.");
  } catch (error) {
    if (fallbackReason === undefined) throw error;
  }

  const transcript = await callGemini(
    [
      { inline_data: { mime_type: mimeType, data: audioBase64 } },
      {
        text: "Transcribe this venue stage audio to English text. Return only the transcript, with punctuation and no commentary. If there is no intelligible speech, return an empty string.",
      },
    ],
    `You are a real-time venue captioning engine. Bias recognition toward this domain vocabulary: ${CONTEXT_ADAPTERS.join(", ")}.`,
  );

  return {
    value: transcript,
    provider: "gemini-2.5-flash",
    latencyMs: Date.now() - started,
    fallbackReason,
  };
}

/* ------------------------------------------------------------------ */
/* Translation                                                         */
/* ------------------------------------------------------------------ */

export async function translateText(
  text: string,
  targetLanguage: string,
): Promise<PipelineResult<string>> {
  const started = Date.now();
  const code = LANGUAGE_CODES[targetLanguage] ?? "es";
  let fallbackReason: string | undefined;

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: "en", target: code, format: "text" }),
      },
    );
    const body = await response.text();
    if (response.ok) {
      const parsed = JSON.parse(body) as {
        data?: { translations?: Array<{ translatedText?: string }> };
      };
      const translated = parsed.data?.translations?.[0]?.translatedText ?? "";
      return { value: translated, provider: "google-translate", latencyMs: Date.now() - started };
    }
    if (!isServiceUnavailable(response.status, body)) {
      throw new Error(shortReason(body, `Translation failed (${response.status})`));
    }
    fallbackReason = shortReason(body, "Cloud Translation is not enabled on this Google project.");
  } catch (error) {
    if (fallbackReason === undefined) throw error;
  }

  const translated = await callGemini(
    [{ text }],
    `Translate the user's English text into ${targetLanguage}. Preserve meaning and tone for a live venue audience. Return only the translation, no notes or quotes.`,
  );

  return {
    value: translated,
    provider: "gemini-2.5-flash",
    latencyMs: Date.now() - started,
    fallbackReason,
  };
}

/* ------------------------------------------------------------------ */
/* Text-to-Speech (speakingRate 0.88 for comprehension)                */
/* ------------------------------------------------------------------ */

export async function synthesizeSpeech(
  text: string,
  language: string,
): Promise<PipelineResult<{ audioBase64: string; mimeType: string }>> {
  const started = Date.now();
  const locale = TTS_VOICE_LOCALE[language] ?? "es-US";
  let fallbackReason: string | undefined;

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: locale, ssmlGender: "FEMALE" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.88, pitch: 0 },
        }),
      },
    );
    const body = await response.text();
    if (response.ok) {
      const parsed = JSON.parse(body) as { audioContent?: string };
      return {
        value: { audioBase64: parsed.audioContent ?? "", mimeType: "audio/mpeg" },
        provider: "google-text-to-speech",
        latencyMs: Date.now() - started,
      };
    }
    if (!isServiceUnavailable(response.status, body)) {
      throw new Error(shortReason(body, `Text-to-Speech failed (${response.status})`));
    }
    fallbackReason = shortReason(body, "Cloud Text-to-Speech is not enabled on this Google project.");
  } catch (error) {
    if (fallbackReason === undefined) throw error;
  }

  const response = await fetch(`${GEN_LANG}/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Read this clearly and slowly for an accessibility audience: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    // Google key blocked or out of quota — fall back to Lovable AI speech.
    const lovable = await lovableSynthesize(text);
    return {
      value: lovable,
      provider: "lovable-ai-tts",
      latencyMs: Date.now() - started,
      fallbackReason: fallbackReason ?? shortReason(body, `Google speech unavailable (${response.status})`),
    };
  }
  const parsed = JSON.parse(body) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const inline = parsed.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  if (!inline?.data) throw new Error("Speech synthesis returned no audio.");

  const mime = inline.mimeType ?? "audio/L16;rate=24000";
  // Gemini returns raw signed 16-bit PCM, which no browser can play directly.
  // Wrap it in a WAV container so <audio> accepts it.
  const isPcm = /L16|pcm/i.test(mime);
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);

  return {
    value: isPcm
      ? { audioBase64: pcmToWavBase64(inline.data, rate), mimeType: "audio/wav" }
      : { audioBase64: inline.data, mimeType: mime },
    provider: "gemini-2.5-flash-tts",
    latencyMs: Date.now() - started,
    fallbackReason,
  };
}

/** Wrap raw 16-bit mono PCM (base64) in a WAV header and return base64. */
function pcmToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = base64ToBytes(pcmBase64);
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const writeString = (pos: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(pos + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);

  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < out.length; i += step) {
    binary += String.fromCharCode(...out.subarray(i, i + step));
  }
  return btoa(binary);
}

/* ------------------------------------------------------------------ */
/* OCR & visual document analysis                                      */
/* ------------------------------------------------------------------ */

export async function extractTextFromImage(
  imageBase64: string,
  mimeType: string,
): Promise<PipelineResult<string>> {
  const started = Date.now();
  let fallbackReason: string | undefined;

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    });
    const body = await response.text();
    if (response.ok) {
      const parsed = JSON.parse(body) as {
        responses?: Array<{ fullTextAnnotation?: { text?: string }; error?: { message?: string } }>;
      };
      const first = parsed.responses?.[0];
      if (first?.error?.message) throw new Error(first.error.message);
      return {
        value: (first?.fullTextAnnotation?.text ?? "").trim(),
        provider: "google-vision",
        latencyMs: Date.now() - started,
      };
    }
    if (!isServiceUnavailable(response.status, body)) {
      throw new Error(shortReason(body, `Vision OCR failed (${response.status})`));
    }
    fallbackReason = shortReason(body, "Cloud Vision is not enabled on this Google project.");
  } catch (error) {
    if (fallbackReason === undefined) throw error;
  }

  const extracted = await callGemini(
    [
      { inline_data: { mime_type: mimeType, data: imageBase64 } },
      {
        text: "Extract every piece of text visible in this presentation slide, schedule or handout. Preserve reading order and line breaks. Return only the extracted text.",
      },
    ],
  );

  return {
    value: extracted,
    provider: "gemini-2.5-flash",
    latencyMs: Date.now() - started,
    fallbackReason,
  };
}

/* ------------------------------------------------------------------ */
/* Gemini reasoning: summaries, simplification, multilingual Q&A       */
/* ------------------------------------------------------------------ */

export async function answerQuestion(input: {
  question: string;
  language: string;
  context?: string | undefined;
  imageBase64?: string | undefined;
  imageMimeType?: string | undefined;
}): Promise<PipelineResult<string>> {
  const started = Date.now();
  const parts: GeminiPart[] = [];
  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ inline_data: { mime_type: input.imageMimeType, data: input.imageBase64 } });
  }
  parts.push({
    text: input.context
      ? `Presentation context:\n${input.context}\n\nAttendee question: ${input.question}`
      : input.question,
  });

  const answer = await callGemini(
    parts,
    `You help attendees at a live public venue understand a presentation. Answer in ${input.language}. Use plain, simple wording suited to elderly and non-native listeners, explain any technical terms, and keep the answer under 120 words.`,
  );

  return { value: answer, provider: "gemini-2.5-flash", latencyMs: Date.now() - started };
}

export async function summarizePresentation(
  transcript: string,
  language: string,
): Promise<PipelineResult<string>> {
  const started = Date.now();
  const summary = await callGemini(
    [{ text: transcript }],
    `Summarize this presentation transcript in ${language} as 3 short bullet points, simplifying any technical terms for elderly and non-native listeners. Return only the bullets.`,
  );
  return { value: summary, provider: "gemini-2.5-flash", latencyMs: Date.now() - started };
}
