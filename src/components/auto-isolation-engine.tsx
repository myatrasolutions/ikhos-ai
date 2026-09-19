import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, LockKeyhole, MicOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { encodeWav, blobToBase64 } from "@/lib/member-b-audio";
import { runSpeechPipeline, synthesizeTranslation } from "@/lib/member-b.functions";
import type { LanguageName } from "@/lib/ikhos-language";

type EngineState = "starting" | "listening" | "running" | "denied";

type NoiseSource = { hz: number; level: number; id: number; label: string };

/** Length of every autonomous capture window, in milliseconds. */
const WINDOW_MS = 6000;
/** Bandpass sharpness around the locked speaker pitch. */
const LOCK_Q = 8;

/** How close two peaks must be (Hz) to count as the same speaker. */
const SAME_SPEAKER_HZ = 45;

function describePitch(hz: number): string {
  if (hz < 140) return "Low / male stage voice";
  if (hz < 220) return "Mid / stage PA";
  if (hz < 320) return "High / female stage voice";
  return "Crowd & ambient chatter";
}

/**
 * Continuous, hands-free isolation engine.
 *
 * Captures every ambient source the moment the screen opens, ranks the distinct
 * pitch signatures in the room, locks on to one of them (strongest by default,
 * or whichever the attendee picks), and then keeps translating and speaking the
 * isolated voice in the attendee's language without any further interaction.
 */
export function AutoIsolationEngine({
  language,
  onHighNoise,
  initialTargetHz,
}: {
  language: LanguageName;
  onHighNoise?: (high: boolean) => void;
  initialTargetHz?: number | null;
}) {
  const runPipeline = useServerFn(runSpeechPipeline);
  const synthesize = useServerFn(synthesizeTranslation);

  const [state, setState] = useState<EngineState>("starting");
  const [level, setLevel] = useState(0);
  const [sources, setSources] = useState<NoiseSource[]>([]);
  const [lockedHz, setLockedHz] = useState<number | null>(initialTargetHz ?? null);
  const [lockedId, setLockedId] = useState<number | null>(null);
  const [pinned, setPinned] = useState(initialTargetHz !== null && initialTargetHz !== undefined);
  const [status, setStatus] = useState("Sampling the room for distinct voices…");
  const [lastTranslation, setLastTranslation] = useState("");

  const filterRef = useRef<BiquadFilterNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const lockedRef = useRef<number | null>(initialTargetHz ?? null);
  /** Identity of the pinned person; survives frequency drift. */
  const lockedIdRef = useRef<number | null>(null);
  const pinnedRef = useRef(initialTargetHz !== null && initialTargetHz !== undefined);
  const initialTargetRef = useRef(initialTargetHz ?? null);
  const busyRef = useRef(false);
  const highRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  /** Stable "Person N" identities, matched to peaks by nearest frequency. */
  const speakersRef = useRef<{ id: number; hz: number; level: number }[]>([]);
  const languageRef = useRef(language);
  const playerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  /** Send one captured window through translation + speech synthesis. */
  const processWindow = useCallback(async () => {
    if (busyRef.current || lockedRef.current === null) return;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const samples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (samples < sampleRateRef.current) return; // less than a second of audio

    let peak = 0;
    for (const chunk of chunks) for (const sample of chunk) peak = Math.max(peak, Math.abs(sample));
    if (peak < 0.01) return; // silence inside the locked band

    busyRef.current = true;
    try {
      const blob = encodeWav(chunks, sampleRateRef.current);
      const result = await runPipeline({
        data: {
          source: "live",
          language: languageRef.current,
          attendeeName: "Active Attendee",
          audioBase64: await blobToBase64(blob),
          audioMimeType: "audio/wav",
          publish: true,
        },
      });

      if (!result.original) {
        setStatus("Listening — no speech in the locked voice band yet.");
        return;
      }

      setLastTranslation(result.translated);
      setStatus(`Translated in ${Math.round(result.totalLatencyMs)} ms · ${languageRef.current}`);

      const speech = await synthesize({
        data: { text: result.translated, language: languageRef.current },
      });
      const audio = playerRef.current ?? new Audio();
      playerRef.current = audio;
      audio.src = `data:${speech.mimeType};base64,${speech.audioBase64}`;
      await audio.play().catch(() => {
        setStatus("Translation published — tap anywhere to allow spoken playback.");
      });
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "That window could not be processed.");
    } finally {
      busyRef.current = false;
    }
  }, [runPipeline, synthesize]);

  /**
   * Lock on to one *person* (stable id), not a raw frequency reading.
   * The tracked pitch keeps drifting slightly, so the filter follows the
   * person's smoothed centroid while the identity stays pinned.
   */
  const lockSpeaker = useCallback((id: number, hz: number, pin = false) => {
    lockedIdRef.current = id;
    lockedRef.current = hz;
    if (pin) pinnedRef.current = true;
    setLockedId(id);
    setLockedHz(hz);
    setPinned((current) => current || pin);
    chunksRef.current = [];
    if (filterRef.current) {
      filterRef.current.frequency.value = hz;
      filterRef.current.Q.value = pinnedRef.current || pin ? LOCK_Q * 1.5 : LOCK_Q;
    }
    setState("running");
    setStatus(
      pin || pinnedRef.current
        ? `Person ${id} pinned at ${Math.round(hz)} Hz — signature held, crowd stripped.`
        : `Locked on Person ${id} (${Math.round(hz)} Hz) — translating continuously.`,
    );
  }, []);
  const lockPitch = lockSpeaker;
  const lockPitchRef = useRef(lockPitch);
  lockPitchRef.current = lockPitch;

  useEffect(() => {
    let disposed = false;

    const start = async () => {
      let stream: MediaStream;
      try {
        // Raw far-field capture: disable browser near-field suppression (AEC/AGC/NS)
        // so distant stage voices are not dropped before our DSP pipeline sees them.
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 2 },
          },
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          // Some MEMS hardware rejects stereo requests — fall back to mono.
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          });
        }
      } catch {
        if (!disposed) {
          setState("denied");
          setStatus("Microphone access is needed to isolate the stage voice.");
        }
        return;
      }
      if (disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const context = new AudioContext();
      await context.resume().catch(() => {});
      sampleRateRef.current = context.sampleRate;

      const source = context.createMediaStreamSource(stream);

      // Far-field normalization: compensate the 1/r^2 SPL drop-off so a voice
      // 6–12 ft away (adjacent desk / stage) reaches processing threshold, while
      // the compressor prevents the near-field voice from clipping the ADC range.
      const farFieldBoost = context.createGain();
      farFieldBoost.gain.value = 4; // ~+12 dB for distant speakers
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-24, context.currentTime);
      compressor.knee.setValueAtTime(30, context.currentTime);
      compressor.ratio.setValueAtTime(12, context.currentTime);
      compressor.attack.setValueAtTime(0.003, context.currentTime);
      compressor.release.setValueAtTime(0.25, context.currentTime);
      source.connect(farFieldBoost);
      farFieldBoost.connect(compressor);

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      compressor.connect(analyser);

      // Isolation chain: everything the engine transcribes passes the bandpass.
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = initialTargetRef.current ?? 180;
      filter.Q.value = initialTargetRef.current === null ? 1 : LOCK_Q * 1.5;
      filterRef.current = filter;
      source.connect(filter);

      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        if (lockedRef.current === null) return;
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      filter.connect(processor);
      const mute = context.createGain();
      mute.gain.value = 0;
      processor.connect(mute);
      mute.connect(context.destination);

      const spectrum = new Uint8Array(analyser.frequencyBinCount);
      const waveform = new Uint8Array(analyser.fftSize);
      const binHz = context.sampleRate / analyser.fftSize;
      let elapsed = 0;

      const detect = window.setInterval(() => {
        analyser.getByteTimeDomainData(waveform);
        let sum = 0;
        for (const sample of waveform) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / waveform.length);
        const db = Math.max(30, Math.min(110, 30 + 20 * Math.log10(Math.max(rms, 0.0005)) + 80));
        setLevel(Math.round(db));
        const isHigh = db > 65;
        if (isHigh !== highRef.current) {
          highRef.current = isHigh;
          onHighNoise?.(isHigh);
        }

        // Rank distinct pitch peaks between 80 Hz and 1 kHz.
        analyser.getByteFrequencyData(spectrum);
        const first = Math.max(1, Math.floor(80 / binHz));
        const last = Math.min(spectrum.length - 2, Math.floor(1000 / binHz));
        const peaks: NoiseSource[] = [];
        for (let i = first; i <= last; i += 1) {
          const value = spectrum[i]!;
          if (value < 60) continue;
          if (value <= spectrum[i - 1]! || value < spectrum[i + 1]!) continue;
          const hz = Math.round(i * binHz);
          if (peaks.some((peak) => Math.abs(peak.hz - hz) < SAME_SPEAKER_HZ)) continue;
          // Give every recurring frequency a friendly, stable identity.
          let known = speakersRef.current.find((entry) => Math.abs(entry.hz - hz) < SAME_SPEAKER_HZ);
          if (!known) {
            known = { id: speakersRef.current.length + 1, hz, level: value };
            speakersRef.current.push(known);
          }
          // Smooth the tracked centroid so the pinned person never jitters away.
          known.hz = Math.round(known.hz * 0.82 + hz * 0.18);
          known.level = value;
          peaks.push({ hz: known.hz, level: value, id: known.id, label: `Person ${known.id}` });
        }
        peaks.sort((a, b) => b.level - a.level);
        const top = peaks.slice(0, 4);
        // Always keep the locked person visible, even during a quiet moment.
        if (lockedIdRef.current !== null && !top.some((item) => item.id === lockedIdRef.current)) {
          const held = speakersRef.current.find((entry) => entry.id === lockedIdRef.current);
          if (held) top.unshift({ hz: held.hz, level: held.level, id: held.id, label: `Person ${held.id}` });
        }
        top.sort((a, b) => a.id - b.id);
        setSources(top.slice(0, 5));

        // A speaker chosen on the event-hall map is already pinned. Attach the
        // closest detected voice identity to that target without switching away.
        if (lockedIdRef.current === null && initialTargetRef.current !== null && top.length) {
          const targetHz = initialTargetRef.current;
          const nearest = [...top].sort(
            (a, b) => Math.abs(a.hz - targetHz) - Math.abs(b.hz - targetHz),
          )[0];
          if (nearest) lockPitchRef.current(nearest.id, nearest.hz, true);
        }

        // Follow the pinned person's drifting centroid instead of re-picking a voice.
        if (lockedIdRef.current !== null) {
          const tracked = speakersRef.current.find((entry) => entry.id === lockedIdRef.current);
          if (tracked && filterRef.current) {
            filterRef.current.frequency.setTargetAtTime(tracked.hz, context.currentTime, 0.25);
            filterRef.current.Q.value = pinnedRef.current ? LOCK_Q * 1.5 : LOCK_Q;
            lockedRef.current = tracked.hz;
            setLockedHz(tracked.hz);
          }
        }

        elapsed += 400;
        // Hands-free: lock the dominant voice automatically if nobody picked one.
        if (lockedRef.current === null && elapsed >= 2400 && top[0]) {
          lockPitchRef.current(top[0].id, top[0].hz);
        } else if (lockedRef.current === null) {
          setState("listening");
        }
      }, 400);

      const cycle = window.setInterval(() => {
        void processWindow();
      }, WINDOW_MS);

      cleanupRef.current = () => {
        window.clearInterval(detect);
        window.clearInterval(cycle);
        processor.onaudioprocess = null;
        processor.disconnect();
        filter.disconnect();
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
    };

    void start();
    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [onHighNoise, processWindow]);

  return (
    <div className="ambient-monitor" role="status" aria-live="polite">
      {state === "denied" ? (
        <MicOff className="text-destructive" aria-hidden="true" />
      ) : state === "running" ? (
        <LockKeyhole className="text-signal" aria-hidden="true" />
      ) : (
        <AudioLines className="text-signal" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="data-label">
          Autonomous Isolation Engine:{" "}
          {state === "denied"
            ? "Microphone blocked"
            : state === "running"
              ? `Locked · ${lockedHz ? Math.round(lockedHz) : 0} Hz`
              : "Capturing ambient sources"}
        </p>
        <p className="mt-1 font-mono text-sm">
          {state === "denied" ? "Allow the microphone to start automatically." : `${level} dB venue floor`}
          {highRef.current ? (
            <span className="ambient-alert">[High Crowd Noise Detected — Pitch Lock Enabled]</span>
          ) : null}
        </p>

        {state !== "denied" ? (
          <div className="pitch-picker" role="group" aria-label="Detected pitch signatures in the room">
            {sources.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                <Loader2 className="inline size-3 animate-spin" aria-hidden="true" /> Scanning ambient sources…
              </span>
            ) : (
              sources.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="pitch-chip"
                  data-active={lockedId === item.id}
                  aria-pressed={lockedId === item.id}
                  aria-label={`Isolate ${item.label} at ${item.hz} hertz — ${describePitch(item.hz)}`}
                  title={`${item.label} · ${describePitch(item.hz)}`}
                  onClick={() => lockPitchRef.current(item.id, item.hz, pinnedRef.current)}
                >
                  {item.label} · {item.hz} Hz{lockedId === item.id && pinned ? " · PINNED" : ""}
                  <span className="pitch-chip-meta">{describePitch(item.hz)}</span>
                </button>
              ))
            )}
          </div>
        ) : null}

        {state !== "denied" ? (
          <button
            type="button"
            className="pin-signature-button"
            data-pinned={pinned}
            aria-label="Pin the strongest stage PA speaker signature and strip background crowd noise"
            title="Locks the loudest detected voice and suppresses everything outside its frequency band"
            disabled={sources.length === 0}
            onClick={() => {
              const target =
                sources.find((item) => item.id === lockedId) ??
                [...sources].sort((a, b) => b.level - a.level)[0];
              if (target) lockPitchRef.current(target.id, target.hz, true);
            }}
          >
            <LockKeyhole className="size-4" aria-hidden="true" />
            {pinned && lockedId !== null
              ? `Signature Pinned · Person ${lockedId} · ${lockedHz ? Math.round(lockedHz) : 0} Hz`
              : "Pin Stage PA Speaker Signature"}
          </button>
        ) : null}

        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
        {lastTranslation ? (
          <p className="mt-1 text-xs text-signal" lang={language}>
            {lastTranslation}
          </p>
        ) : null}
      </div>
    </div>
  );
}
