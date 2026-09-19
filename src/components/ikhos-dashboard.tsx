import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Antenna,
  Check,
  ChevronDown,
  CircleDot,
  FileCheck2,
  Headphones,
  Languages,
  LockKeyhole,
  Mic2,
  Radio,
  ShieldCheck,
  Smartphone,
  Waves,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Role = "attendee" | "venue";
type Stream = Tables<"active_streams">;

const fallbackStream: Stream = {
  id: "demo",
  attendee_name: "Guest C-307",
  selected_language: "Spanish",
  noise_suppression_db: -95.4,
  latency_ms: 1400,
  original_transcript:
    "Every attendee deserves clear, immediate access to the ideas being shared from the stage. The system continuously adapts as the speaker moves across the venue.",
  translated_transcript:
    "Cada asistente merece un acceso claro e inmediato a las ideas que se comparten desde el escenario. El sistema se adapta continuamente mientras el orador se desplaza por el recinto.",
  status: "active",
  created_at: new Date(0).toISOString(),
};

const languageCopy: Record<string, string> = {
  Spanish: fallbackStream.translated_transcript,
  Mandarin: "每位与会者都应该清晰、即时地了解舞台上分享的想法。系统会随着演讲者在场地内移动而持续调整。",
  Hindi: "हर सहभागी मंच से साझा किए जा रहे विचारों तक स्पष्ट और तत्काल पहुँच का हकदार है। वक्ता के आगे बढ़ने पर प्रणाली लगातार अनुकूलित होती है।",
  Vietnamese: "Mỗi người tham dự đều xứng đáng được tiếp cận rõ ràng, tức thì với những ý tưởng đang được chia sẻ trên sân khấu.",
  Arabic: "يستحق كل حاضر وصولاً واضحاً وفورياً إلى الأفكار التي تتم مشاركتها من على المسرح.",
  Nepali: "हरेक सहभागीले मञ्चबाट साझा गरिएका विचारहरूमा स्पष्ट र तत्काल पहुँच पाउनुपर्छ।",
  Swahili: "Kila mhudhuriaji anastahili kupata mawazo yanayoshirikiwa jukwaani kwa uwazi na mara moja.",
};

const sections = [
  ["101", 68], ["102", 82], ["103", 46], ["104", 74], ["105", 57], ["106", 91],
  ["107", 63], ["108", 78], ["109", 39], ["110", 86], ["111", 53], ["112", 71],
  ["201", 45], ["202", 67], ["203", 32], ["204", 58], ["205", 76], ["206", 49],
  ["207", 61], ["208", 84], ["209", 55], ["210", 70], ["211", 42], ["212", 64],
] as const;

function Waveform({ isolated, cutoff }: { isolated?: boolean; cutoff: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let animation = 0;
    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      const colors = getComputedStyle(canvas);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = colors.getPropertyValue(isolated ? "--wave-isolated" : "--wave-raw").trim();
      context.lineWidth = isolated ? 2.5 : 1.8;
      context.beginPath();
      const suppression = Math.abs(cutoff) / 96;
      const amplitude = isolated ? 18 + suppression * 17 : 32 - suppression * 20;
      for (let x = 0; x <= width; x += 3) {
        const signal = isolated
          ? Math.sin(x * 0.055 + frame) * 0.55 + Math.sin(x * 0.021 + frame * 0.6) * 0.45
          : Math.sin(x * 0.14 + frame * 1.4) * 0.35 + Math.random() * 0.65 - 0.32;
        const y = height / 2 + signal * amplitude;
        if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
      frame += 0.045;
      animation = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animation);
  }, [cutoff, isolated]);

  return <canvas ref={canvasRef} className="h-24 w-full" aria-hidden="true" />;
}

function Stat({ icon: Icon, label, value, accent = false }: { icon: typeof Activity; label: string; value: string; accent?: boolean }) {
  return (
    <div className="telemetry-cell">
      <Icon className={accent ? "text-signal" : "text-muted-foreground"} aria-hidden="true" />
      <div><p className="data-label">{label}</p><p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p></div>
    </div>
  );
}

function AppHeader({ role, setRole, highContrast, setHighContrast }: {
  role: Role; setRole: (role: Role) => void; highContrast: boolean; setHighContrast: (value: boolean) => void;
}) {
  return (
    <header className="border-b border-border bg-panel/95">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-mark" aria-hidden="true"><Waves /></div>
          <div className="min-w-0"><p className="font-display text-2xl font-bold text-foreground">Ikhos <span className="text-signal">AI</span></p><p className="truncate text-xs text-muted-foreground">Real-Time Acoustic Isolation & Live Translation for Public Venues</p></div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="role-tabs" aria-label="Select workspace" role="tablist">
            <button type="button" role="tab" aria-selected={role === "attendee"} className="role-tab" data-active={role === "attendee"} onClick={() => setRole("attendee")}>Attendee Live Stream</button>
            <button type="button" role="tab" aria-selected={role === "venue"} className="role-tab" data-active={role === "venue"} onClick={() => setRole("venue")}>Venue Management Portal <span className="hidden xl:inline">(B2B)</span></button>
          </nav>
          <div className="flex items-center justify-between gap-3 border-l-0 border-border pl-0 sm:border-l sm:pl-4">
            <label htmlFor="contrast-mode" className="text-xs font-semibold text-foreground">WCAG High Contrast</label>
            <Switch id="contrast-mode" checked={highContrast} onCheckedChange={setHighContrast} aria-label="Toggle WCAG high contrast mode" />
          </div>
        </div>
      </div>
    </header>
  );
}

function AttendeeView({ streams }: { streams: Stream[] }) {
  const [cutoff, setCutoff] = useState(-96);
  const [language, setLanguage] = useState("Spanish");
  const [locked, setLocked] = useState(false);
  const [compare, setCompare] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const selectedStream = streams.find((stream) => stream.selected_language === language) ?? streams[0] ?? fallbackStream;

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [selectedStream.translated_transcript]);

  return (
    <div className="page-shell">
      <section aria-labelledby="live-status-heading">
        <div className="section-heading"><div><p className="eyebrow"><span className="live-dot" />Live session · Grand Auditorium</p><h1 id="live-status-heading">Attendee Acoustic Command</h1></div><span className="status-badge"><Check />Signal verified</span></div>
        <div className="telemetry-grid">
          <Stat icon={Activity} label="End-to-end latency" value={`${(selectedStream.latency_ms / 1000).toFixed(1)} s`} accent />
          <Stat icon={Waves} label="Noise suppression" value="95.4%" />
          <Stat icon={CircleDot} label="Directional beamform lock" value="ACTIVE" accent />
          <Stat icon={Antenna} label="Hardware pairing" value="Ikhos Receiver #4092" />
        </div>
        <div className="mobile-array-badge"><Smartphone aria-hidden="true" /><strong>Mobile Multi-Mic Array:</strong> Connected <span /> <strong>Software Beamforming:</strong> Active <span /> <strong>Digital Isolation:</strong> {cutoff} dB</div>
      </section>

      <div className="workspace-grid">
        <section className="panel" aria-labelledby="isolation-heading">
          <div className="panel-header"><div><p className="eyebrow">DSP channel 04</p><h2 id="isolation-heading">Acoustic Isolation Control Center</h2></div><span className="status-badge"><Radio />Receiving</span></div>
          <div className="lock-bar">
            <div><p className="data-label">PA Acoustic Lock</p><p className="mt-1 text-sm text-muted-foreground">Calibrate to the stage loudspeaker array</p></div>
            <Tooltip><TooltipTrigger asChild><Button variant={locked ? "default" : "outline"} className="min-h-11" aria-pressed={locked} onClick={() => setLocked(!locked)}><LockKeyhole />Pin Stage PA Speaker Signature</Button></TooltipTrigger><TooltipContent>Locks beamforming onto the primary stage audio source</TooltipContent></Tooltip>
          </div>
          {locked && <div className="lock-confirmation" role="status"><Check />[PA Acoustic Fingerprint Locked — 95% Crowd Noise Stripped]</div>}
          <div className="wave-stack">
            <div className="wave-panel raw-wave"><div className="wave-label"><span>Raw Venue Input</span><span>Garbled Ambient Noise</span></div><Waveform cutoff={cutoff} /></div>
            <div className="wave-panel isolated-wave"><div className="wave-label"><span>Isolated Stage Speaker Signal</span><span>Voice focus / clean</span></div><Waveform cutoff={cutoff} isolated /></div>
          </div>
          <div className="slider-zone">
            <div className="flex items-end justify-between gap-4"><div><label htmlFor="noise-cutoff" className="font-semibold text-foreground">Directional Noise Cutoff (dB)</label><p className="mt-1 text-xs text-muted-foreground">Adaptive isolation intensity</p></div><output htmlFor="noise-cutoff" className="font-mono text-2xl font-bold text-signal">{cutoff} dB</output></div>
            <input id="noise-cutoff" className="range-control" type="range" min="-96" max="0" step="1" value={cutoff} onChange={(event) => setCutoff(Number(event.target.value))} aria-label="Directional noise cutoff in decibels" />
            <div className="flex justify-between text-xs text-muted-foreground"><span>−96 dB · Full isolation</span><span>0 dB · Raw crowd audio</span></div>
          </div>
        </section>

        <section className="panel" aria-labelledby="translation-heading">
          <div className="panel-header"><div><p className="eyebrow">Neural translation channel</p><h2 id="translation-heading">Real-Time Translation Stream</h2></div><label className="language-select"><Languages aria-hidden="true" /><span className="sr-only">Translation language</span><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Select translation language">{Object.keys(languageCopy).map((item) => <option key={item}>{item}</option>)}</select><ChevronDown aria-hidden="true" /></label></div>
          <div ref={transcriptRef} className="transcript-grid" aria-live="polite">
            <article><p className="data-label">Stage Speaker (English Raw)</p><p className="transcript-copy">“{selectedStream.original_transcript || fallbackStream.original_transcript}”</p><span className="speaker-chip"><Mic2 />Stage left · Live</span></article>
            <article><p className="data-label text-signal">Ikhos Live Neural Translation · {language}</p><p className="transcript-copy translated">“{selectedStream.selected_language === language ? selectedStream.translated_transcript : languageCopy[language]}”</p><span className="speaker-chip"><Languages />98.7% confidence</span></article>
          </div>
          <div className="mt-4 border-t border-border pt-4"><Button variant="outline" className="min-h-11 w-full sm:w-auto" aria-expanded={compare} onClick={() => setCompare(!compare)}><Smartphone />Compare vs Standard Phone Mic Output</Button></div>
          {compare && <div className="comparison-grid" role="region" aria-label="Microphone output comparison"><div><p className="data-label text-alert">Standard Unfiltered Mic</p><p>“Wel—[crowd noise]—system—[inaudible]—stage...”</p></div><div><p className="data-label text-signal">Ikhos Mobile DSP Feed</p><p>“Every attendee deserves clear, immediate access.”</p></div></div>}
        </section>
      </div>
    </div>
  );
}

function ComplianceDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild><Button className="min-h-11 w-full"><FileCheck2 />Generate Turn-Key Compliance Report</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><p className="eyebrow">Certificate IKH-ADA-4092</p><DialogTitle className="font-display text-2xl">Automated Accessibility Audit</DialogTitle><DialogDescription>Formal venue compliance summary generated from the current live session.</DialogDescription></DialogHeader>
        <div className="certificate">
          <div className="flex items-center gap-3 border-b border-border pb-5"><div className="brand-mark"><ShieldCheck /></div><div><p className="font-display text-xl font-bold">IKHOS AI</p><p className="text-sm text-muted-foreground">ADA & Accessibility Assurance</p></div></div>
          <dl className="certificate-grid"><div><dt>Venue timestamp</dt><dd>19 Sep 2026 · 11:42 CDT</dd></div><div><dt>Active caption coverage</dt><dd>99.4%</dd></div><div><dt>Acoustic isolation rating</dt><dd>−95.4 dB</dd></div><div><dt>Average stream latency</dt><dd>1.4 seconds</dd></div></dl>
          <div className="compliance-pass"><Check /><div><strong>FEDERAL ADA CONTROL CHECK: PASSED</strong><p>Caption delivery, language access, and assistive listening channels meet configured thresholds.</p></div></div>
        </div>
        <DialogFooter><Button className="min-h-11" onClick={() => window.print()}><FileCheck2 />Export PDF / Print Certificate</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VenueView({ streams }: { streams: Stream[] }) {
  const activeCount = streams.filter((stream) => stream.status === "active").length || 247;
  const avgLatency = streams.length ? Math.round(streams.reduce((sum, stream) => sum + stream.latency_ms, 0) / streams.length) : 1390;
  const [selectedSection, setSelectedSection] = useState("106");
  const selectedDensity = sections.find(([id]) => id === selectedSection)?.[1] ?? 91;
  const distribution = useMemo(() => [{ name: "Spanish", value: 42 }, { name: "Mandarin", value: 28 }, { name: "Hindi", value: 15 }, { name: "Others", value: 15 }], []);

  return (
    <div className="page-shell">
      <section aria-labelledby="venue-heading">
        <div className="section-heading"><div><p className="eyebrow"><span className="live-dot" />Venue network · Grand Auditorium</p><h1 id="venue-heading">Executive Venue Overview</h1></div><span className="status-badge"><ShieldCheck />All systems nominal</span></div>
        <div className="telemetry-grid"><Stat icon={Headphones} label="Connected receivers" value="2,847" accent /><Stat icon={Languages} label="Active language streams" value={String(Math.max(activeCount, 7))} /><Stat icon={Activity} label="Average latency" value={`${(avgLatency / 1000).toFixed(2)} s`} /><Stat icon={ShieldCheck} label="ADA compliance rating" value="99.4%" accent /></div>
      </section>
      <div className="venue-grid">
        <section className="panel venue-map-panel" aria-labelledby="map-heading"><div className="panel-header"><div><p className="eyebrow">Live spatial telemetry</p><h2 id="map-heading">Receiver Density · Sections 101–212</h2></div><div className="map-legend"><span />Low <span />High</div></div>
          <div className="auditorium"><div className="stage"><span>STAGE / PA ARRAY</span><div /></div><div className="section-grid">{sections.map(([id, density]) => <Tooltip key={id}><TooltipTrigger asChild><button type="button" className="section-node" data-level={density > 80 ? "high" : density > 55 ? "medium" : "low"} data-selected={id === selectedSection} aria-label={`Section ${id}, ${density}% receiver density`} onClick={() => setSelectedSection(id)}><span>{id}</span><small>{density}%</small></button></TooltipTrigger><TooltipContent>Section {id}: {density}% active receiver density</TooltipContent></Tooltip>)}</div></div>
          <div className="map-readout" aria-live="polite"><CircleDot /><div><p className="data-label">Selected node cluster</p><p>Section {selectedSection} · {selectedDensity}% density · {Math.round(selectedDensity * 2.7)} active receivers</p></div></div>
        </section>
        <div className="space-y-5">
          <section className="panel" aria-labelledby="language-heading"><div className="panel-header"><div><p className="eyebrow">Live demand mix</p><h2 id="language-heading">Language Distribution</h2></div><Languages className="text-signal" /></div><div className="donut-wrap"><div className="donut" role="img" aria-label="Spanish 42 percent, Mandarin 28 percent, Hindi 15 percent, Other languages 15 percent"><div><strong>2,847</strong><span>requests</span></div></div><ul className="legend-list">{distribution.map((item, index) => <li key={item.name}><span className={`legend-swatch swatch-${index + 1}`} /><span>{item.name}</span><strong>{item.value}%</strong></li>)}</ul></div></section>
          <section className="panel compliance-panel" aria-labelledby="compliance-heading"><ShieldCheck className="h-8 w-8 text-signal" /><div><p className="eyebrow">Turn-Key ADA Compliance Engine</p><h2 id="compliance-heading">Automated Federal ADA & Accessibility Audit Status</h2><p className="mt-2 text-sm text-muted-foreground">24 of 24 acoustic, captioning, latency, and language-access controls are verified.</p></div><div className="audit-score"><span>Audit readiness</span><strong>99.4%</strong></div><ComplianceDialog /></section>
        </div>
      </div>
    </div>
  );
}

export function IkhosDashboard() {
  const [role, setRole] = useState<Role>("attendee");
  const [highContrast, setHighContrast] = useState(false);
  const [streams, setStreams] = useState<Stream[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from("active_streams").select("*").order("created_at", { ascending: false });
      if (mounted && data) setStreams(data);
    };
    void load();
    const channel = supabase.channel("active-streams-dashboard").on("postgres_changes", { event: "*", schema: "public", table: "active_streams" }, () => void load()).subscribe();
    return () => { mounted = false; void supabase.removeChannel(channel); };
  }, []);

  return (
    <TooltipProvider delayDuration={250}>
      <div className={highContrast ? "high-contrast min-h-dvh bg-background" : "min-h-dvh bg-background"}>
        <AppHeader role={role} setRole={setRole} highContrast={highContrast} setHighContrast={setHighContrast} />
        {role === "attendee" ? <AttendeeView streams={streams} /> : <VenueView streams={streams} />}
      </div>
    </TooltipProvider>
  );
}