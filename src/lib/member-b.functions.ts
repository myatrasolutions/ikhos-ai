/**
 * Member B — server functions for the Speech & AI processing pipeline.
 * Additive only: nothing here is imported by Member A's existing UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LANGUAGES = [
  "Spanish",
  "Mandarin",
  "Hindi",
  "Vietnamese",
  "Arabic",
  "Nepali",
  "Swahili",
] as const;

const base64 = z.string().min(16, "Audio or image payload is empty.");

export const MOCK_STAGE_LINES = [
  "Welcome to the 2026 commencement ceremony here in the Grand Auditorium.",
  "Every seat in this venue receives the same isolated audio feed, free of crowd noise.",
  "Families seated in the upper sections can follow along in their preferred language.",
  "Our accessibility team is stationed at every entrance if you need an assistive receiver.",
  "Please silence your devices as we begin the presentation of candidates.",
];

/** Persist a processed chunk so Member A's realtime UI updates instantly. */
async function publishToStream(input: {
  attendeeName: string;
  language: string;
  original: string;
  translated: string;
  latencyMs: number;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Table constraint allows -96.0 .. 0 dB, so the -96.2 dB target is clamped.
  const { error } = await supabaseAdmin.from("active_streams").insert({
    attendee_name: input.attendeeName,
    selected_language: input.language,
    noise_suppression_db: -96.0,
    latency_ms: input.latencyMs,
    original_transcript: input.original,
    translated_transcript: input.translated,
    status: "active",
  });
  if (error) throw new Error(`Realtime sync failed: ${error.message}`);
}

const PipelineInput = z.object({
  source: z.enum(["mock", "live"]),
  language: z.enum(LANGUAGES),
  attendeeName: z.string().min(1).max(60).default("Member B Engine"),
  audioBase64: base64.optional(),
  audioMimeType: z.string().min(3).optional(),
  mockIndex: z.number().int().min(0).optional(),
  publish: z.boolean().default(true),
});

/** Speech-to-Text -> Translation -> Supabase realtime write. */
export const runSpeechPipeline = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PipelineInput.parse(input))
  .handler(async ({ data }) => {
    const { transcribeAudio, translateText } = await import("@/lib/google-ai.server");
    const steps: Array<{ step: string; provider: string; latencyMs: number; note?: string }> = [];

    let original: string;
    let sttLatency = 0;

    if (data.source === "live") {
      if (!data.audioBase64 || !data.audioMimeType) {
        throw new Error("Live mic mode requires a captured audio clip.");
      }
      const stt = await transcribeAudio(data.audioBase64, data.audioMimeType);
      original = stt.value;
      sttLatency = stt.latencyMs;
      steps.push({
        step: "Speech-to-Text",
        provider: stt.provider,
        latencyMs: stt.latencyMs,
        note: stt.fallbackReason,
      });
      if (!original) {
        return {
          original: "",
          translated: "",
          steps,
          totalLatencyMs: sttLatency,
          published: false,
          message: "No intelligible speech detected in that clip.",
        };
      }
    } else {
      const index = (data.mockIndex ?? 0) % MOCK_STAGE_LINES.length;
      original = MOCK_STAGE_LINES[index]!;
      steps.push({ step: "Speech-to-Text", provider: "simulated stage audio", latencyMs: 0 });
    }

    const translation = await translateText(original, data.language);
    steps.push({
      step: "Translation",
      provider: translation.provider,
      latencyMs: translation.latencyMs,
      note: translation.fallbackReason,
    });

    const totalLatencyMs = sttLatency + translation.latencyMs;
    let published = false;
    if (data.publish) {
      await publishToStream({
        attendeeName: data.attendeeName,
        language: data.language,
        original,
        translated: translation.value,
        latencyMs: Math.max(1, Math.round(totalLatencyMs)),
      });
      published = true;
      steps.push({ step: "Supabase realtime write", provider: "active_streams", latencyMs: 0 });
    }

    return { original, translated: translation.value, steps, totalLatencyMs, published };
  });

const SynthesisInput = z.object({
  text: z.string().min(1).max(2000),
  language: z.enum(LANGUAGES),
});

/** Text-to-Speech at speakingRate 0.88 for elderly / non-native listeners. */
export const synthesizeTranslation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SynthesisInput.parse(input))
  .handler(async ({ data }) => {
    const { synthesizeSpeech } = await import("@/lib/google-ai.server");
    const result = await synthesizeSpeech(data.text, data.language);
    return {
      audioBase64: result.value.audioBase64,
      mimeType: result.value.mimeType,
      provider: result.provider,
      latencyMs: result.latencyMs,
      note: result.fallbackReason,
    };
  });

const OcrInput = z.object({
  imageBase64: base64,
  imageMimeType: z.string().min(3),
  language: z.enum(LANGUAGES),
  translate: z.boolean().default(true),
});

/** OCR a slide / schedule / handout, then translate the extracted text. */
export const runSlideOcr = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OcrInput.parse(input))
  .handler(async ({ data }) => {
    const { extractTextFromImage, translateText } = await import("@/lib/google-ai.server");
    const steps: Array<{ step: string; provider: string; latencyMs: number; note?: string }> = [];

    const ocr = await extractTextFromImage(data.imageBase64, data.imageMimeType);
    steps.push({
      step: "OCR extraction",
      provider: ocr.provider,
      latencyMs: ocr.latencyMs,
      note: ocr.fallbackReason,
    });

    let translated = "";
    if (data.translate && ocr.value) {
      const translation = await translateText(ocr.value, data.language);
      translated = translation.value;
      steps.push({
        step: "Translation",
        provider: translation.provider,
        latencyMs: translation.latencyMs,
        note: translation.fallbackReason,
      });
    }

    return { extracted: ocr.value, translated, steps };
  });

const SandboxInput = z.object({
  question: z.string().min(1).max(1000),
  language: z.enum(LANGUAGES).or(z.literal("English")),
  context: z.string().max(4000).optional(),
  imageBase64: base64.optional(),
  imageMimeType: z.string().min(3).optional(),
});

/** Multilingual Gemini Q&A over the presentation and optional slide image. */
export const askEngine = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SandboxInput.parse(input))
  .handler(async ({ data }) => {
    const { answerQuestion } = await import("@/lib/google-ai.server");
    const result = await answerQuestion({
      question: data.question,
      language: data.language,
      context: data.context,
      imageBase64: data.imageBase64,
      imageMimeType: data.imageMimeType,
    });
    return { answer: result.value, provider: result.provider, latencyMs: result.latencyMs };
  });

const SummaryInput = z.object({
  transcript: z.string().min(1).max(8000),
  language: z.enum(LANGUAGES).or(z.literal("English")),
});

/** On-demand presentation summary with technical terms simplified. */
export const summarizeSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SummaryInput.parse(input))
  .handler(async ({ data }) => {
    const { summarizePresentation } = await import("@/lib/google-ai.server");
    const result = await summarizePresentation(data.transcript, data.language);
    return { summary: result.value, provider: result.provider, latencyMs: result.latencyMs };
  });

/** Reports which Google services are live vs. falling back to Gemini. */
export const checkEngineHealth = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["GOOGLE_CLOUD_API_KEY"];
  if (!key) return { configured: false, services: [] as Array<{ name: string; ok: boolean }> };

  const probes: Array<{ name: string; url: string; body: unknown }> = [
    {
      name: "Speech-to-Text",
      url: `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
      body: { config: { languageCode: "en-US" }, audio: { content: "" } },
    },
    {
      name: "Translation",
      url: `https://translation.googleapis.com/language/translate/v2?key=${key}`,
      body: { q: "ok", target: "es" },
    },
    {
      name: "Text-to-Speech",
      url: `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      body: {
        input: { text: "ok" },
        voice: { languageCode: "en-US" },
        audioConfig: { audioEncoding: "MP3" },
      },
    },
    {
      name: "Vision OCR",
      url: `https://vision.googleapis.com/v1/images:annotate?key=${key}`,
      body: { requests: [] },
    },
    {
      name: "Gemini 2.5 Flash",
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      body: { contents: [{ parts: [{ text: "ok" }] }] },
    },
  ];

  const services = await Promise.all(
    probes.map(async (probe) => {
      try {
        const response = await fetch(probe.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(probe.body),
        });
        const text = await response.text();
        const disabled = /has not been used in project|is disabled|are blocked|SERVICE_DISABLED|PERMISSION_DENIED/i.test(
          text,
        );
        return { name: probe.name, ok: !disabled };
      } catch {
        return { name: probe.name, ok: false };
      }
    }),
  );

  return { configured: true, services };
});
