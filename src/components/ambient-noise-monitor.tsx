import { useEffect, useRef, useState } from "react";
import { AudioLines, MicOff } from "lucide-react";

import { Button } from "@/components/ui/button";

type MonitorState = "off" | "active" | "denied";

/**
 * Lightweight ambient noise monitor: a 128-point FFT AnalyserNode sampled a few
 * times a second, so it stays cheap on phones. Above ~65 dB it reports a
 * pitch-lock recommendation to the parent isolation controls.
 */
export function AmbientNoiseMonitor({ onHighNoise }: { onHighNoise?: (high: boolean) => void }) {
  const [state, setState] = useState<MonitorState>("off");
  const [level, setLevel] = useState(0);
  const [high, setHigh] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const highRef = useRef(false);

  useEffect(() => () => cleanupRef.current?.(), []);

  const stop = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setState("off");
    setLevel(0);
    setHigh(false);
    highRef.current = false;
    onHighNoise?.(false);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / buffer.length);
        // Map RMS to an approximate venue SPL reading (30 dB floor).
        const db = Math.max(30, Math.min(110, 30 + 20 * Math.log10(Math.max(rms, 0.0005)) + 80));
        setLevel(Math.round(db));
        const isHigh = db > 65;
        if (isHigh !== highRef.current) {
          highRef.current = isHigh;
          setHigh(isHigh);
          onHighNoise?.(isHigh);
        }
      }, 300);

      cleanupRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
      setState("active");
    } catch {
      setState("denied");
    }
  };

  return (
    <div className="ambient-monitor" role="status" aria-live="polite">
      <AudioLines className={state === "active" ? "text-signal" : "text-muted-foreground"} aria-hidden="true" />
      <div className="min-w-0">
        <p className="data-label">Ambient Noise Monitor: {state === "active" ? "Active" : state === "denied" ? "Microphone blocked" : "Standby"}</p>
        <p className="mt-1 font-mono text-sm">
          {state === "active" ? `${level} dB venue floor` : "Enable to sample the room"}
          {high ? <span className="ambient-alert">[High Crowd Noise Detected — Pitch Lock Enabled]</span> : null}
        </p>
      </div>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={state === "active" ? stop : start}
        aria-pressed={state === "active"}
        aria-label={state === "active" ? "Stop ambient noise monitoring" : "Start ambient noise monitoring"}
      >
        {state === "active" ? <MicOff aria-hidden="true" /> : <AudioLines aria-hidden="true" />}
        {state === "active" ? "Stop monitor" : "Start monitor"}
      </Button>
    </div>
  );
}
