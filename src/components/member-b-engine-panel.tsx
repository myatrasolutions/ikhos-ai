import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CircleStop,
  FileImage,
  Loader2,
  Mic,
  MessageSquareText,
  Play,
  Radio,
  ScanText,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  askEngine,
  checkEngineHealth,
  runSlideOcr,
  runSpeechPipeline,
  simulateLivePayload,
  summarizeSession,
  synthesizeTranslation,
} from "@/lib/member-b.functions";
import { blobToBase64, garbleTranscript, startMicRecording, type MicRecorder } from "@/lib/member-b-audio";

const LANGUAGES = ["Spanish", "Mandarin", "Hindi", "Vietnamese", "Arabic", "Nepali", "Swahili"] as const;
type InputMode = "mock" | "live" | "ocr";

type LogEntry = { id: string; label: string; provider: string; latencyMs: number; note?: string; error?: boolean };

function useLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const push = useCallback((entry: Omit<LogEntry, "id">) => {
    setEntries((current) => [{ ...entry, id: `${Date.now()}-${Math.random()}` }, ...current].slice(0, 40));
  }, []);
  return { entries, push, clear: () => setEntries([]) };
}

function QaSandbox({ context, language }: { context: string; language: string }) {
  const ask = useServerFn(askEngine);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [image, setImage] = useState<{ data: string; mime: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await ask({
        data: {
          question,
          language,
          ...(context ? { context } : {}),
          ...(image ? { imageBase64: image.data, imageMimeType: image.mime } : {}),
        },
      });
      setAnswer(result.answer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The engine could not answer that question.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-11 w-full">
          <MessageSquareText aria-hidden="true" />
          Open Multilingual Q&amp;A Sandbox
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <p className="eyebrow">Gemini 2.5 Flash · multimodal</p>
          <DialogTitle className="font-display text-2xl">Attendee Q&amp;A Sandbox</DialogTitle>
          <DialogDescription>
            Ask about the presentation in {language}, optionally attaching a slide image for context.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="mb-question" className="data-label">
              Your question
            </label>
            <textarea
              id="mb-question"
              className="mb-field mt-2 min-h-24"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="¿Puede explicar qué significa aislamiento acústico?"
              aria-label="Question for the AI engine"
            />
          </div>
          <div>
            <label htmlFor="mb-qa-image" className="data-label">
              Attach a slide (optional)
            </label>
            <input
              id="mb-qa-image"
              type="file"
              accept="image/*"
              className="mb-field mt-2"
              aria-label="Upload a slide image for the question"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return setImage(null);
                setImage({ data: await blobToBase64(file), mime: file.type || "image/png", name: file.name });
              }}
            />
            {image ? <p className="mt-1 text-xs text-muted-foreground">Attached: {image.name}</p> : null}
          </div>
          <Button className="min-h-11 w-full" onClick={submit} disabled={busy || !question.trim()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {busy ? "Thinking…" : "Ask the engine"}
          </Button>
          {error ? (
            <p className="mb-error" role="alert">
              {error}
            </p>
          ) : null}
          {answer ? (
            <div className="mb-output" aria-live="polite">
              <p className="data-label text-signal">Simplified answer · {language}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{answer}</p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MemberBEnginePanel() {
  const runPipeline = useServerFn(runSpeechPipeline);
  const runOcr = useServerFn(runSlideOcr);
  const synthesize = useServerFn(synthesizeTranslation);
  const summarize = useServerFn(summarizeSession);
  const health = useServerFn(checkEngineHealth);
  const simulatePayload = useServerFn(simulateLivePayload);

  const [mode, setMode] = useState<InputMode>("mock");
  const [language, setLanguage] = useState<string>("Spanish");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [original, setOriginal] = useState("");
  const [translated, setTranslated] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [services, setServices] = useState<Array<{ name: string; ok: boolean }>>([]);
  const recorderRef = useRef<MicRecorder | null>(null);
  const mockIndexRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const log = useLog();

  useEffect(() => {
    let active = true;
    void health({})
      .then((result) => {
        if (active) setServices(result.services);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [health]);

  const record = (steps: Array<{ step: string; provider: string; latencyMs: number; note?: string | undefined }>) => {
    steps.forEach((step) =>
      log.push({
        label: step.step,
        provider: step.provider,
        latencyMs: step.latencyMs,
        ...(step.note ? { note: step.note } : {}),
      }),
    );
  };

  const handleFailure = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "The pipeline step failed.";
    setError(message);
    log.push({ label: "Pipeline error", provider: "engine", latencyMs: 0, note: message, error: true });
  };

  const runMock = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await runPipeline({
        data: {
          source: "mock",
          language,
          attendeeName: "Member B Engine",
          mockIndex: mockIndexRef.current,
          publish: true,
        },
      });
      mockIndexRef.current += 1;
      setOriginal(result.original);
      setTranslated(result.translated);
      record(result.steps);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const runSimulatedPayload = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await simulatePayload({ data: { language: language as never } });
      setOriginal(result.original);
      setTranslated(result.translated);
      record(result.steps);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    setError("");
    if (recording) {
      setRecording(false);
      setBusy(true);
      try {
        const blob = await recorderRef.current!.stop();
        recorderRef.current = null;
        if (blob.size < 2048) throw new Error("That clip was empty — please record again.");
        const result = await runPipeline({
          data: {
            source: "live",
            language,
            attendeeName: "Member B Live Mic",
            audioBase64: await blobToBase64(blob),
            audioMimeType: "audio/wav",
            publish: true,
          },
        });
        setOriginal(result.original);
        setTranslated(result.translated);
        record(result.steps);
        if ("message" in result && result.message) setError(result.message);
      } catch (caught) {
        handleFailure(caught);
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      recorderRef.current = await startMicRecording();
      setRecording(true);
    } catch {
      setError("Microphone access is needed to capture the live stage feed.");
    }
  };

  const handleSlide = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const result = await runOcr({
        data: {
          imageBase64: await blobToBase64(file),
          imageMimeType: file.type || "image/png",
          language,
          translate: true,
        },
      });
      setOriginal(result.extracted);
      setTranslated(result.translated);
      record(result.steps);
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const speak = async () => {
    if (!translated) return;
    setBusy(true);
    setError("");
    try {
      const result = await synthesize({ data: { text: translated, language: language as never } });
      log.push({
        label: "TTS synthesis (0.88× rate)",
        provider: result.provider,
        latencyMs: result.latencyMs,
        ...(result.note ? { note: result.note } : {}),
      });
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = `data:${result.mimeType};base64,${result.audioBase64}`;
      await audio.play();
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  const makeSummary = async () => {
    if (!original) return;
    setBusy(true);
    setError("");
    try {
      const result = await summarize({ data: { transcript: original, language: language as never } });
      setSummary(result.summary);
      log.push({ label: "Presentation summary", provider: result.provider, latencyMs: result.latencyMs });
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="mb-launcher" aria-label="Open Member B Speech and AI Engine Control Panel">
          <Waves aria-hidden="true" />
          <span className="hidden sm:inline">Engine Control Panel</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="mb-drawer w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <p className="eyebrow">Member B · isolated engine</p>
          <SheetTitle className="font-display text-2xl">Member B: Speech &amp; AI Engine Control Panel</SheetTitle>
          <SheetDescription>
            Google Speech-to-Text, Translation, Text-to-Speech, Vision OCR and Gemini 2.5 Flash, writing live results
            into the shared stream table.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          {services.length ? (
            <ul className="mb-service-grid" aria-label="Google service availability">
              {services.map((service) => (
                <li key={service.name} data-ok={service.ok}>
                  <span aria-hidden="true" />
                  {service.name}
                  <small>{service.ok ? "live" : "fallback"}</small>
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <p className="data-label">Audio / image input source</p>
            <div className="mb-mode-tabs mt-2" role="tablist" aria-label="Select pipeline input source">
              {(
                [
                  ["mock", "Simulated Stage Audio", Radio],
                  ["live", "Live Mic Stream", Mic],
                  ["ocr", "Slide OCR Scanner", ScanText],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  data-active={mode === value}
                  className="mb-mode-tab"
                  onClick={() => setMode(value)}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="mb-language" className="data-label">
              Attendee target language
            </label>
            <select
              id="mb-language"
              className="mb-field mt-2"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              aria-label="Target translation language"
            >
              {LANGUAGES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          {mode === "mock" ? (
            <Button className="min-h-11 w-full" onClick={runMock} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
              Process next simulated stage chunk
            </Button>
          ) : null}

          {mode === "live" ? (
            <Button
              className="min-h-11 w-full"
              variant={recording ? "destructive" : "default"}
              onClick={toggleRecording}
              disabled={busy && !recording}
              aria-pressed={recording}
            >
              {recording ? <CircleStop aria-hidden="true" /> : <Mic aria-hidden="true" />}
              {recording ? "Stop & process live capture" : "Start live mic capture"}
            </Button>
          ) : null}

          {mode === "ocr" ? (
            <div>
              <label htmlFor="mb-slide" className="data-label">
                Slide, schedule or handout image
              </label>
              <input
                id="mb-slide"
                type="file"
                accept="image/*"
                className="mb-field mt-2"
                aria-label="Upload a slide image to extract and translate"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleSlide(file);
                }}
              />
            </div>
          ) : null}

          {error ? (
            <p className="mb-error" role="alert">
              {error}
            </p>
          ) : null}

          <section aria-label="Quality comparison engine" className="mb-compare">
            <div>
              <p className="data-label text-alert">Raw Unfiltered Venue Feed</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {original ? garbleTranscript(original) : "Run the pipeline to capture a comparison sample."}
              </p>
            </div>
            <div>
              <p className="data-label text-signal">IKHOS Isolated DSP Feed</p>
              <p className="mt-2 text-sm">{original || "—"}</p>
              {translated ? <p className="mt-3 text-sm text-signal">{translated}</p> : null}
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="min-h-11" onClick={speak} disabled={busy || !translated}>
              <Volume2 aria-hidden="true" />
              Play translated audio
            </Button>
            <Button variant="outline" className="min-h-11" onClick={makeSummary} disabled={busy || !original}>
              <Sparkles aria-hidden="true" />
              Summarize &amp; simplify
            </Button>
          </div>

          {summary ? (
            <div className="mb-output" aria-live="polite">
              <p className="data-label text-signal">Presentation summary · {language}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{summary}</p>
            </div>
          ) : null}

          <QaSandbox context={original} language={language} />

          <section aria-label="Live metric monitor">
            <div className="flex items-center justify-between">
              <p className="data-label">
                <Activity className="inline size-4 align-text-bottom" aria-hidden="true" /> Live metric monitor
              </p>
              <button type="button" className="text-xs underline" onClick={log.clear}>
                Clear
              </button>
            </div>
            <ul className="mb-log mt-2" aria-live="polite">
              {log.entries.length === 0 ? <li className="text-muted-foreground">No pipeline runs yet.</li> : null}
              {log.entries.map((entry) => (
                <li key={entry.id} data-error={entry.error ?? false}>
                  <span>{entry.label}</span>
                  <span className="mb-log-provider">{entry.provider}</span>
                  <strong>{entry.latencyMs} ms</strong>
                  {entry.note ? <small>{entry.note}</small> : null}
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-muted-foreground">
            <FileImage className="inline size-3.5 align-text-bottom" aria-hidden="true" /> Every processed chunk is
            written to the shared live stream table at −96.0 dB isolation so the attendee and venue dashboards update in
            real time.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
