# Roadmap — Member B (Speech & AI pipeline)

- [x] Verify Google Cloud key against each service
- [x] Google service layer with Gemini fallback (src/lib/google-ai.server.ts)
- [x] Server functions: STT/translate/TTS/OCR/Q&A/summary/health (src/lib/member-b.functions.ts)
- [x] Member B Engine Control Panel drawer + additive mount on "/"
- [x] Writes into active_streams (-96.0 dB, latency ms) so Member A's dashboards update live
- [ ] BLOCKED (user action): enable Speech-to-Text, Translation v3, Text-to-Speech and Vision on Google Cloud project 600213423011 — currently 403, so those steps route through Gemini 2.5 Flash
- [ ] Move GOOGLE_CLOUD_API_KEY from .env into the project secret store
