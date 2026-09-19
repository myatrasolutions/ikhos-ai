# Roadmap — Member B (Speech & AI pipeline)

- [x] Verify Google Cloud key against each service
- [x] Google service layer with Gemini fallback (src/lib/google-ai.server.ts)
- [x] Server functions: STT/translate/TTS/OCR/Q&A/summary/health (src/lib/member-b.functions.ts)
- [x] Member B Engine Control Panel drawer + additive mount on "/"
- [x] Writes into active_streams (-96.0 dB, latency ms) so Member A's dashboards update live
- [x] Google key saved in the secure secret store (GOOGLE_CLOUD_API_KEY + GOOGLE_LANGUAGE_API_KEY)
- [x] "Simulate Live Google AI Translation Payload" button (simulateLivePayload server fn)
- [ ] BLOCKED (user action): enable Speech-to-Text, Translation v3, Text-to-Speech and Vision on Google Cloud project 600213423011 — currently 403, so those steps route through Gemini 2.5 Flash
- [ ] BLOCKED (user action): Gemini free-tier quota exhausted (429) — raise quota/billing on the Google project
- Note: spec's second Supabase project/anon key is not used; both members share this project's backend, so writes already trigger Member A's realtime UI.
