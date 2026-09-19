# IKHOS AI

### *Never Miss a Word That Matters.*

**Real-Time Acoustic Isolation and Live Translation for Public Venues**

---

## The Human Experience Behind IKHOS AI

Imagine standing inside a crowded stadium, a noisy graduation ceremony, or an echoing conference hall. The venue is packed, voices echo off the walls, and the stage speaker is over a hundred feet away. 

For non-native speakers, immigrant families, and hard-of-hearing individuals, these moments—celebrations, keynotes, milestone ceremonies—are often lost in a sea of unintelligible crowd noise. Distance and ambient echo turn standard smartphone translation apps into garbled static ("Garbage In, Garbage Out"). 

**IKHOS AI was created so that no one is left out of the conversation.** 

By bridging physics and cloud AI, IKHOS AI allows attendees to zero in on a single stage speaker, strip away over 95% of background venue noise, and receive crystal-clear, real-time translations in their native language—delivered at a comfortable, inclusive listening pace.

---

## The Core Concept & Technology

Physics prevents standard omnidirectional phone microphones from isolating a distant voice in a noisy environment. IKHOS AI solves this through a guided hardware-software pipeline:

1. **Spatial Direction & Pitch Fingerprinting:** The app maps active stage speakers by sound direction and acoustic pitch (frequency in Hz).
2. **Dynamic Beamforming & Noise Suppression:** When an attendee "pins" a speaker, IKHOS locks onto that specific voice signature, applying differential beamforming and noise filtering to strip surrounding ambient chatter.
3. **Low-Latency Neural Pipeline:** The clean audio stream is processed through cloud AI (Speech-to-Text, Neural Translation, and Text-to-Speech) in under 1.8 seconds.
4. **Accessible Delivery:** Attendees read large, high-contrast captions and hear continuous, synthesized speech tuned to a clear, zero-fatigue 0.88× playback rate.

---

## Core Experience

* **Select a Language:** Choose your native language from a zero-literacy onboarding flow.
* **Spatial Speaker Selection:** Locate the speaker on the event-hall map by the direction of their voice.
* **Acoustic Pinning:** Lock the speaker’s frequency signature ($Hz$) to strip out ambient venue noise.
* **Live Immersive Translation:** Read and hear continuous, synchronized translations with real-time telemetry metrics.

---

## User Manual

### Before You Begin
* Open **IKHOS AI** in a modern web browser.
* Allow microphone access when prompted. The microphone is required for live acoustic detection and translation.
* For spoken audio output, ensure your device volume is audible and the browser is permitted to play sound.

### 1. Select Your Language
On the welcome screen, choose the language in which you want to read and hear the event. Your preference is saved locally on the device and remains active throughout your session. Select **Continue to Audio Lock**.

### 2. Choose and Pin a Speaker
* The event-hall map displays detected voices positioned by sound direction and fundamental frequency ($Hz$).
* Select a person (e.g., *Person 1 — 240 Hz*) to preview their location and live audio snippet.
* Confirm that the preview matches the stage speaker you wish to follow.
* Select **Pin Selected Speaker** and wait for the confirmation indicator confirming surrounding noise rejection.
* Select **Confirm Signature & Start Live Translation**.
* Once pinned, IKHOS continuously tracks that speaker even during subtle pitch fluctuations, dimming background voices out of the feed.

### 3. Follow the Live Translation
The high-focus live view presents:
* **English Source:** The isolated speaker's original raw transcript.
* **Your Live Translation:** Large, high-contrast translated text in your selected language.
* **Spoken Translation:** Synthesized, zero-fatigue speech audio at 0.88× speed for maximum comprehension.
* **System Telemetry:** Isolation level ($-96\text{ dB}$), target frequency lock, and end-to-end latency ($1.4\text{s}$).

---

## Multi-View Navigation

Use the top navigation bar to switch between three operational modes:

* **Attendee Live Stream:** The guided, step-by-step language selection, speaker lock, and translation journey.
* **Advanced Command Center:** The technical diagnostic dashboard displaying dual audio visualizers (Raw Venue Input vs. Isolated Signal), beamforming cutoff sliders, and DSP telemetry.
* **Venue Management Portal (B2B):** The enterprise portal for venue operators displaying active receiver node heatmaps, language request analytics, and turn-key **ADA & Accessibility Compliance Audit Reports**.

---

## High-Contrast & Accessibility Features

Toggle **WCAG High Contrast Mode** from the top header at any time. This mode:
* Switches the interface to an ultra-high-contrast monochrome theme.
* Enforces strong contrast borders and bumps base font sizes by over 20%.
* Features full keyboard navigation, screen-reader focus announcements, and reduced-motion support.

---

## Troubleshooting

* **If the Microphone is Blocked:** Click the browser site settings icon in the address bar to allow microphone permissions, then reload the page.
* **If Audio Playback is Paused:** Modern web browsers require a user interaction before playing auto-play audio. Click anywhere inside the application once to resume spoken audio output.

---

## Technical Architecture & Processing Workflow

The live workflow combines browser Web Audio API signal processing, frequency centroid extraction, speech recognition, neural translation, and accessible speech synthesis. Google AI services (Gemini, Speech-to-Text, Translation, and TTS) power the live AI pipeline, supported by a managed fallback architecture to ensure uptime during network degradation or quota limits.

Real-time transcripts, target languages, decibel noise-suppression metrics, and latency metrics are synchronized through a shared `active_streams` Supabase publication layer, ensuring attendee views and venue management portals stay in sync.

---

## Local Development Setup

### Prerequisites
* Node.js 20+
* [Bun](https://bun.sh/) package manager

### Installation
```bash
# Clone the repository
git clone [https://github.com/myatrasolutions/IkhosAI.git](https://github.com/myatrasolutions/IkhosAI.git)

# Navigate into the directory
cd IkhosAI

# Install dependencies
bun install

# Start the local development server
bun run dev
