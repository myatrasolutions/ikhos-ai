# IKHOS AI

**Real-Time Acoustic Isolation and Live Translation for Public Venues**

IKHOS AI is an accessible listening platform for conferences, ceremonies, auditoriums, and other crowded venues. It helps an attendee choose one speaker by location, isolate that voice from ambient noise, continuously translate it into a preferred language, and hear the translated result at an inclusive listening pace.

The same application also includes an Advanced Command Center for technical demonstrations and a Venue Management Portal for operational visibility.

## Core experience

1. Choose a listening language.
2. Select a person on the event-hall map by the direction of their voice.
3. Pin that speaker. IKHOS holds the selected voice signature and suppresses surrounding crowd sound.
4. Read and hear the continuous translation while live telemetry remains visible.

## User manual

### Before you begin

- Open IKHOS AI in a modern browser.
- Allow microphone access when prompted. The microphone is required for live acoustic detection and translation.
- For spoken output, make sure the device volume is audible and the browser is allowed to play sound.

### 1. Select your language

On the welcome screen, choose the language in which you want to read and hear the event. The preference is saved on the device and remains available when you return.

Select **Continue to Audio Lock**.

### 2. Choose and pin a speaker

The event-hall map shows detected voices as people positioned according to sound direction. Each person has a stable name such as **Person 1** and a frequency reading in hertz.

1. Select a person to preview their voice and location.
2. Confirm that the preview matches the speaker you want to follow.
3. Select **Pin selected speaker**.
4. Wait for the green confirmation stating that surrounding noise has been removed.
5. Select **Confirm Signature & Start Live Translation**.

Once pinned, IKHOS continues tracking that same person even when their voice pitch shifts slightly. Other detected voices are visually dimmed and excluded from the translation feed.

### 3. Follow the live translation

The live screen presents:

- **English source:** the isolated speaker's original words.
- **Your live translation:** large, high-contrast translated text in the selected language.
- **Spoken translation:** synthesized speech at 0.88× speed for greater listening clarity.
- **Status details:** isolation level, pinned person and frequency, and current latency.

IKHOS processes new audio automatically. No repeated start or translate button is required.

### Change views

Use the top navigation to switch between:

- **Attendee Live Stream:** the guided language, speaker, and translation journey.
- **Advanced Command Center:** raw and isolated waveforms, beamforming controls, transcripts, and technical diagnostics.
- **Venue Management Portal (B2B):** receiver counts, active language streams, latency, venue coverage, and accessibility reporting.

### High-contrast mode

Turn on **WCAG High Contrast** from the top bar at any time. This changes the interface to pure black and white, strengthens borders, and increases the minimum text size for improved visibility.

### If the microphone is blocked

Use the browser's site controls to allow microphone access, then reload the page. IKHOS will begin listening automatically.

### If spoken playback is paused

Some browsers require one interaction before they allow audio playback. Select anywhere in the application once; the live transcript and data synchronization continue even if playback is paused.

## Processing workflow

The live workflow combines browser audio analysis, voice-frequency isolation, speech recognition, translation, and accessible speech synthesis. Google Language and AI services are used when available, with a managed AI fallback to keep the experience resilient during provider quota or service interruptions.

Live transcripts, target language, noise-suppression level, latency, and stream status are synchronized through the shared `active_streams` data source so attendee and venue views update together.

## Accessibility

- Keyboard-accessible controls and visible focus states
- Descriptive labels for interactive controls
- Screen-reader status announcements for selection, pinning, and translation
- WCAG-focused high-contrast mode
- Large translated text and clear information hierarchy
- Reduced-motion support
- 0.88× spoken translation rate

## Local development

Requirements: Node.js 20+ and Bun.

```sh
git clone https://github.com/myatrasolutions/IkhosAI.git
cd IkhosAI
bun install
bun run dev
```

The development server is available at `http://localhost:8080`.

## Technology

- React 19 and TypeScript
- TanStack Start and TanStack Router
- Tailwind CSS
- Web Audio API
- Lovable Cloud realtime data synchronization
- Google Speech-to-Text, Translation, Text-to-Speech, and Gemini with managed fallback

## Production notes

- Keep service credentials in the secure project secret store; never commit them.
- Enable the required Google Cloud APIs and production quota before launch.
- Test microphone permissions and audio playback on the target venue Wi-Fi and attendee devices.
- Validate high-contrast mode and keyboard navigation before each release.
