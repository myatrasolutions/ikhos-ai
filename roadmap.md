# Roadmap

## Member B — Speech & AI Engine (in progress)
- [x] Verify Google Cloud API key (only Gemini enabled; STT/Translation/TTS/Vision disabled on GCP project 600213423011)
- [ ] Google service layer (STT, Translation, TTS, Vision) with Gemini 2.5 Flash fallback
- [ ] Server functions for transcribe / translate / synthesize / OCR / Q&A
- [ ] "Member B: Speech & AI Engine Control Panel" drawer (input selector, metric monitor, quality comparison, Q&A sandbox)
- [ ] Write results to active_streams for Member A's realtime UI
- [ ] Move GOOGLE_CLOUD_API_KEY from .env into the secure secret store

## Blocked (needs user)
- Enabling Speech-to-Text, Translation, Text-to-Speech and Vision APIs in Google Cloud
