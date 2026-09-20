import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Gauge, Languages, LockKeyhole, Mic2, Radio, UserRound, Waves } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoIsolationEngine } from "@/components/auto-isolation-engine";
import { IKHOS_LANGUAGES, useIkhosLanguage, type LanguageName } from "@/lib/ikhos-language";
import type { Tables } from "@/integrations/supabase/types";

type Stream = Tables<"active_streams">;
type Step = "welcome" | "calibrate" | "live";

type HallSpeaker = { id: number; hz: number; x: number; y: number; direction: string; preview: string };

const HALL_SPEAKERS: HallSpeaker[] = [
  { id: 1, hz: 240, x: 50, y: 22, direction: "Center stage", preview: "Welcome graduates of 2026…" },
  { id: 2, hz: 176, x: 22, y: 48, direction: "Front left", preview: "Please move toward the east entrance…" },
  { id: 3, hz: 318, x: 78, y: 43, direction: "Front right", preview: "The ceremony will begin shortly…" },
  { id: 4, hz: 205, x: 31, y: 75, direction: "Rear left", preview: "Thank you for joining us this evening…" },
  { id: 5, hz: 362, x: 72, y: 72, direction: "Rear right", preview: "Ambient conversation nearby…" },
];

function EventHallMap({ selected, pinned, onSelect, onPin }: {
  selected: HallSpeaker | null;
  pinned: HallSpeaker | null;
  onSelect: (speaker: HallSpeaker) => void;
  onPin: () => void;
}) {
  return (
    <div className="hall-experience">
      <aside className="hall-guidance" aria-label="Speaker selection details">
        <div>
          <p className="eyebrow">Live acoustic map</p>
          <h2>Choose the voice that matters.</h2>
          <p>Each person is positioned by the direction their voice reaches you from. Select one to hear a preview.</p>
        </div>
        <div className="hall-selected-readout" aria-live="polite">
          {selected ? (
            <>
              <span className="hall-mini-person"><UserRound aria-hidden="true" /></span>
              <div>
                <small>Selected voice</small>
                <strong>Person {selected.id} · {selected.hz} Hz</strong>
                <span>{selected.direction}</span>
              </div>
              <blockquote>“{selected.preview}”</blockquote>
            </>
          ) : (
            <p>Select a person in the hall to preview their voice.</p>
          )}
        </div>
        <Button className="hall-pin-button" onClick={onPin} disabled={!selected} aria-label="Pin selected speaker and remove surrounding noise">
          <LockKeyhole aria-hidden="true" />
          {pinned ? `Pinned · Person ${pinned.id}` : "Pin selected speaker"}
        </Button>
      </aside>

      <div className="event-hall" aria-label="Event hall showing five detected people by sound direction">
        <div className="hall-stage"><span>UNT FRISCO LANDING</span><strong>Main stage</strong></div>
        <div className="hall-listener"><span>You</span></div>
        <div className="hall-direction-line" aria-hidden="true" />
        {HALL_SPEAKERS.map((speaker) => {
          const isSelected = selected?.id === speaker.id;
          const isPinned = pinned?.id === speaker.id;
          return (
            <Button
              key={speaker.id}
              variant="ghost"
              className="hall-person"
              data-selected={isSelected}
              data-pinned={isPinned}
              data-suppressed={pinned !== null && !isPinned}
               data-speaker={speaker.id}
              onClick={() => onSelect(speaker)}
              aria-pressed={isSelected}
              aria-label={`Select Person ${speaker.id}, ${speaker.hz} hertz, ${speaker.direction}`}
            >
              <span className="sound-ring ring-one" aria-hidden="true" />
              <span className="sound-ring ring-two" aria-hidden="true" />
              <span className="person-avatar"><UserRound aria-hidden="true" /></span>
              <strong>Person {speaker.id}</strong>
              <small>{speaker.hz} Hz · {speaker.direction}</small>
            </Button>
          );
        })}
        <div className="hall-status">
          <Radio aria-hidden="true" />
          {pinned ? "One voice isolated · surrounding sound removed" : "5 distinct voices detected"}
        </div>
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
  pinned: HallSpeaker | null; setPinned: (speaker: HallSpeaker) => void; onConfirm: () => void;
}) {
  const [selected, setSelected] = useState<HallSpeaker | null>(null);
  return (
    <section className="guided-screen animate-fade-in" aria-labelledby="guided-calibrate-heading">
      <div className="guided-hero compact">
        <p className="eyebrow">Step 2 of 3</p>
        <h1 id="guided-calibrate-heading" className="guided-title">Who would you like to hear?</h1>
        <p className="guided-body">Choose a person by where their voice is coming from. Pinning keeps only that voice for live translation.</p>
      </div>
      <div className="guided-card wide hall-card">
        <EventHallMap selected={selected} pinned={pinned} onSelect={setSelected} onPin={() => selected && setPinned(selected)} />
        {pinned !== null ? (
          <div className="signature-locked" role="status">
            <Check aria-hidden="true" />
            <div>
              <strong>Person {pinned.id} is pinned · {pinned.hz} Hz</strong>
              <span>Surrounding crowd noise removed • only this voice will be translated</span>
            </div>
          </div>
        ) : (
          <p className="guided-hintline"><LockKeyhole aria-hidden="true" />Select a person on the hall map, then pin their voice.</p>
        )}
        <Button className="guided-cta" onClick={onConfirm} disabled={pinned === null} aria-label="Confirm signature and start live translation">
          Confirm Signature &amp; Start Live Translation <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

function LiveScreen({ streams, pinned }: { streams: Stream[]; pinned: HallSpeaker | null }) {
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
    <section className="guided-screen live-reading-screen animate-fade-in" aria-labelledby="guided-live-heading">
      <div className="guided-hero compact live-reading-header">
        <p className="eyebrow"><span className="live-dot" />Live translation running</p>
        <h1 id="guided-live-heading" className="guided-title">Listening to Person {pinned?.id ?? 1}</h1>
        <p className="guided-body">A clear, uninterrupted translation in {language}.</p>
      </div>

      <div className="focus-stream" ref={scrollRef} aria-live="polite">
        <div className="focus-block raw">
          <p className="data-label"><Mic2 aria-hidden="true" /> Person {pinned?.id ?? 1} · English</p>
          {entries.length ? entries.map((entry) => (
            <p key={`fo-${entry.id}`} className="focus-raw-copy">“{entry.original_transcript}”</p>
          )) : <p className="focus-raw-copy">Listening for the stage speaker…</p>}
        </div>
        <div className="focus-block translated">
          <p className="data-label text-signal">Your live translation · {language}</p>
          {entries.length ? entries.map((entry) => (
            <p key={`ft-${entry.id}`} className="focus-translated-copy">“{entry.translated_transcript}”</p>
          )) : <p className="focus-translated-copy">Translation begins the moment the speaker starts.</p>}
        </div>
      </div>

      <div className="guided-card">
        <AutoIsolationEngine language={language} initialTargetHz={pinned?.hz ?? null} />
      </div>

      <div className="focus-telemetry" role="status">
        <span><Waves aria-hidden="true" />Isolation Engine: Target Speaker Extraction (TSE)</span>
        <span><LockKeyhole aria-hidden="true" />Target Vector Lock: Active · Person {pinned?.id ?? 1}</span>
        <span><Radio aria-hidden="true" />Crowd / TV / Radio Suppression: −96 dB</span>
        <span><Gauge aria-hidden="true" />{pinned?.hz ?? 240} Hz</span>
        <span><Check aria-hidden="true" />Latency: {latency}s</span>
      </div>
    </section>
  );
}

export function GuidedAttendeeFlow({ streams }: { streams: Stream[] }) {
  const [step, setStep] = useState<Step>("welcome");
  const [pinned, setPinned] = useState<HallSpeaker | null>(null);

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
