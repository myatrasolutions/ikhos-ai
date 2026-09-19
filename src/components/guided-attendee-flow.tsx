import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Gauge, Languages, LockKeyhole, Mic2, Sparkles, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoIsolationEngine } from "@/components/auto-isolation-engine";
import { IKHOS_LANGUAGES, useIkhosLanguage, type LanguageName } from "@/lib/ikhos-language";
import type { Tables } from "@/integrations/supabase/types";

type Stream = Tables<"active_streams">;
type Step = "welcome" | "calibrate" | "live";

const MIN_HZ = 100;
const MAX_HZ = 4000;

const PREVIEW_SNIPPETS: Array<[number, string]> = [
  [160, "...thank you all for joining us this evening..."],
  [240, "...welcome graduates of 2026..."],
  [320, "...please take your seats, the ceremony begins shortly..."],
  [700, "[crowd chatter · low intelligibility]"],
  [1600, "[applause and ambient hall reverb]"],
  [3000, "[HVAC and room tone]"],
];

function snippetFor(hz: number) {
  let best = PREVIEW_SNIPPETS[0];
  for (const item of PREVIEW_SNIPPETS) {
    if (Math.abs(item[0] - hz) < Math.abs(best[0] - hz)) best = item;
  }
  return best[1];
}

function hzToX(hz: number, width: number) {
  const ratio = (Math.log(hz) - Math.log(MIN_HZ)) / (Math.log(MAX_HZ) - Math.log(MIN_HZ));
  return ratio * width;
}

function xToHz(x: number, width: number) {
  const ratio = Math.max(0, Math.min(1, x / width));
  return Math.round(MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, ratio));
}

/** Animated spectral heatmap across 100 Hz – 4 kHz with hover preview and click-to-pin. */
function SpectrumHeatmap({ pinned, onPin }: { pinned: number | null; onPin: (hz: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ hz: number; x: number } | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let raf = 0;

    const draw = () => {
      frame += 1;
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const bars = 96;
      for (let i = 0; i < bars; i += 1) {
        const ratio = i / (bars - 1);
        const hz = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, ratio);
        // Stage-voice formants plus crowd energy.
        const voice = Math.exp(-Math.pow((hz - 240) / 90, 2)) * 0.95
          + Math.exp(-Math.pow((hz - 160) / 70, 2)) * 0.6
          + Math.exp(-Math.pow((hz - 320) / 80, 2)) * 0.5;
        const crowd = Math.exp(-Math.pow((hz - 900) / 700, 2)) * 0.35;
        const shimmer = 0.12 * Math.sin(frame / 7 + i / 3) + 0.1 * Math.sin(frame / 13 + i);
        let amp = Math.max(0.05, voice + crowd + shimmer * 0.5);
        if (pinnedRef.current !== null) {
          const focus = Math.exp(-Math.pow((hz - pinnedRef.current) / 70, 2));
          amp = amp * (0.12 + focus * 1.1);
        }
        amp = Math.min(1, amp);

        const x = (i / bars) * width;
        const barWidth = width / bars - 2;
        const barHeight = amp * (height - 26);
        const grad = ctx.createLinearGradient(0, height - 26, 0, height - 26 - barHeight);
        grad.addColorStop(0, "rgba(6, 182, 212, 0.18)");
        grad.addColorStop(1, amp > 0.7 ? "rgba(34, 211, 238, 0.95)" : "rgba(6, 182, 212, 0.6)");
        ctx.fillStyle = grad;
        ctx.fillRect(x, height - 26 - barHeight, barWidth, barHeight);
      }

      if (pinnedRef.current !== null) {
        const px = hzToX(pinnedRef.current, width);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height - 26);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(148, 163, 184, 0.85)";
      ctx.font = "11px ui-monospace, monospace";
      for (const tick of [100, 250, 500, 1000, 2000, 4000]) {
        const tx = Math.min(width - 28, hzToX(tick, width));
        ctx.fillText(tick >= 1000 ? `${tick / 1000}k` : String(tick), tx, height - 8);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    setHover({ hz: xToHz((x / rect.width) * 900, 900), x });
  };

  return (
    <div className="spectrum-wrap">
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        className="spectrum-canvas"
        role="img"
        aria-label="Live frequency heatmap from 100 hertz to 4 kilohertz. Select a frequency peak to pin the stage speaker signature."
        tabIndex={0}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onPin(xToHz(((event.clientX - rect.left) / rect.width) * 900, 900));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPin(240);
          }
        }}
      />
      {hover ? (
        <div className="spectrum-tooltip" style={{ left: `${hover.x}px` }} role="status">
          <strong>Hovering {hover.hz} Hz</strong>
          <span>“{snippetFor(hover.hz)}”</span>
        </div>
      ) : null}
      <div className="spectrum-hint">
        <Sparkles aria-hidden="true" />
        Hover any peak to preview what that voice is saying, then click it to pin the stage speaker.
      </div>
    </div>
  );
}

function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  const { language, setLanguage } = useIkhosLanguage();
  return (
    <section className="guided-screen animate-fade-in" aria-labelledby="guided-welcome-heading">
      <div className="guided-hero">
        <p className="eyebrow"><span className="live-dot" />Live session · Grand Auditorium</p>
        <h1 id="guided-welcome-heading" className="guided-title">Welcome to UNT Frisco Landing</h1>
        <p className="guided-tagline">Never Miss a Word That Matters.</p>
        <p className="guided-body">
          Experience crystal-clear real-time audio isolation and live translation tailored directly to your preferred language.
        </p>
      </div>
      <div className="guided-card">
        <label className="guided-field" htmlFor="guided-language">
          <span className="data-label"><Languages aria-hidden="true" /> Choose your listening language</span>
          <select
            id="guided-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value as LanguageName)}
            aria-label="Choose your listening language"
          >
            {IKHOS_LANGUAGES.map((item) => <option key={item.code}>{item.name}</option>)}
          </select>
        </label>
        <Button className="guided-cta" onClick={onContinue} aria-label="Continue to audio lock">
          Continue to Audio Lock <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function CalibrateScreen({ pinned, setPinned, onConfirm }: {
  pinned: number | null; setPinned: (hz: number) => void; onConfirm: () => void;
}) {
  return (
    <section className="guided-screen animate-fade-in" aria-labelledby="guided-calibrate-heading">
      <div className="guided-hero compact">
        <p className="eyebrow">Step 2 of 3</p>
        <h1 id="guided-calibrate-heading" className="guided-title">Stage Speaker Calibration</h1>
        <p className="guided-body">Find the voice you want to hear, then pin its frequency signature to strip the crowd away.</p>
      </div>
      <div className="guided-card wide">
        <SpectrumHeatmap pinned={pinned} onPin={setPinned} />
        {pinned !== null ? (
          <div className="signature-locked" role="status">
            <Check aria-hidden="true" />
            <div>
              <strong>[ Locked: {pinned} Hz Stage Speaker Centroid ]</strong>
              <span>Stage PA Signature Locked • 95% Crowd Noise Stripped</span>
            </div>
          </div>
        ) : (
          <p className="guided-hintline"><LockKeyhole aria-hidden="true" />No signature pinned yet — click a bright peak near 240 Hz.</p>
        )}
        <Button className="guided-cta" onClick={onConfirm} disabled={pinned === null} aria-label="Confirm signature and start live translation">
          Confirm Signature &amp; Start Live Translation <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function LiveScreen({ streams, pinned }: { streams: Stream[]; pinned: number | null }) {
  const { language } = useIkhosLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => {
    const matching = streams.filter((stream) => stream.selected_language === language);
    return (matching.length ? matching : streams).slice(0, 10).reverse();
  }, [streams, language]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const latest = streams[0];
  const latency = latest ? (latest.latency_ms / 1000).toFixed(1) : "1.4";

  return (
    <section className="guided-screen animate-fade-in" aria-labelledby="guided-live-heading">
      <div className="guided-hero compact">
        <p className="eyebrow"><span className="live-dot" />Live translation running</p>
        <h1 id="guided-live-heading" className="guided-title">Live Neural Translation · {language}</h1>
      </div>

      <div className="focus-stream" ref={scrollRef} aria-live="polite">
        <div className="focus-block raw">
          <p className="data-label"><Mic2 aria-hidden="true" /> Stage Speaker (English Raw)</p>
          {entries.length ? entries.map((entry) => (
            <p key={`fo-${entry.id}`} className="focus-raw-copy">“{entry.original_transcript}”</p>
          )) : <p className="focus-raw-copy">Listening for the stage speaker…</p>}
        </div>
        <div className="focus-block translated">
          <p className="data-label text-signal">Live Neural Translation ({language})</p>
          {entries.length ? entries.map((entry) => (
            <p key={`ft-${entry.id}`} className="focus-translated-copy">“{entry.translated_transcript}”</p>
          )) : <p className="focus-translated-copy">Translation begins the moment the speaker starts.</p>}
        </div>
      </div>

      <div className="guided-card">
        <AutoIsolationEngine language={language} />
      </div>

      <div className="focus-telemetry" role="status">
        <span><Waves aria-hidden="true" />Isolation: −96 dB</span>
        <span><Gauge aria-hidden="true" />Target: {pinned ?? 240} Hz</span>
        <span><Check aria-hidden="true" />Latency: {latency}s</span>
      </div>
    </section>
  );
}

export function GuidedAttendeeFlow({ streams }: { streams: Stream[] }) {
  const [step, setStep] = useState<Step>("welcome");
  const [pinned, setPinned] = useState<number | null>(null);

  return (
    <div className="page-shell guided-shell">
      <ol className="guided-steps" aria-label="Guided setup progress">
        {(["welcome", "calibrate", "live"] as Step[]).map((item, index) => (
          <li key={item} data-active={step === item} data-done={(["welcome", "calibrate", "live"] as Step[]).indexOf(step) > index}>
            <span>{index + 1}</span>
            {item === "welcome" ? "Language" : item === "calibrate" ? "Pin speaker" : "Live translation"}
          </li>
        ))}
      </ol>

      {step === "welcome" ? <WelcomeScreen onContinue={() => setStep("calibrate")} /> : null}
      {step === "calibrate" ? (
        <CalibrateScreen pinned={pinned} setPinned={setPinned} onConfirm={() => setStep("live")} />
      ) : null}
      {step === "live" ? <LiveScreen streams={streams} pinned={pinned} /> : null}

      {step !== "welcome" ? (
        <div className="guided-back">
          <Button variant="ghost" className="min-h-11" onClick={() => setStep(step === "live" ? "calibrate" : "welcome")}>
            ← Back a step
          </Button>
        </div>
      ) : null}
    </div>
  );
}
