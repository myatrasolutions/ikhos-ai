# Roadmap — Ikhos AI (consolidated platform)

- [x] Member A attendee + venue dashboards, realtime active_streams subscription
- [x] Member B Google/Gemini pipeline (STT, translation, TTS 0.88×, OCR, Q&A, summary) with Lovable AI fallback
- [x] Consolidation: shared language preference (localStorage `targetLanguageCode`) used by both surfaces
- [x] First-load onboarding language modal + header "Selected Output" quick-change badge
- [x] Ambient noise monitor (Web Audio AnalyserNode, 128 FFT) with >65 dB pitch-lock trigger
- [x] Live Translation Engine controls inside the attendee isolation panel (stage chunk + live mic) publishing to active_streams
- [x] Verified end-to-end in the browser: "Published in 1571 ms · Spanish"
- [ ] BLOCKED (user action): enable Speech-to-Text, Translation v3, Text-to-Speech and Vision on the Google Cloud project (currently 403) and raise the Gemini quota — until then those steps fall back to Lovable AI
- [x] Autonomous isolation engine: auto mic capture on load, ranked ambient pitch sources, one-tap (or auto) pitch lock, continuous 6 s translate + speak loop, no activation buttons
- [x] Slogan "Never Miss a Word That Matters." in the shared header and page/meta titles

- Guided attendee flow (welcome -> pin speaker -> live transcript) with Advanced Command Center toggle.
- French added end-to-end (DB check, language maps, TTS locale).
- Speaker pin now tracks a stable Person id with a smoothed centroid so the lock holds.
- [x] Replace the calibration bar graph with an immersive event-hall person selector and explicit pin action.
- [x] Restyle the live translation experience in the selected Charcoal & Jade editorial direction.
- [x] Add a high-level introduction and user manual to README.md.
- [ ] Create a pull request to https://github.com/myatrasolutions/IkhosAI.
