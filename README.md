# Tiger Mom — Mom Test Interview Coach

Silent listener that nudges you during customer interviews to stay Mom‑Test aligned: ask about past behavior, avoid leading questions, and dig into real signals like workarounds, spend, timelines, and stakeholders.


## What’s Inside

- Backend: FastAPI service that orchestrates OpenAI (LLM, Whisper STT, TTS), ElevenLabs (optional TTS), ScrapingDog (LinkedIn data), and ACI.dev (Brave search). Holds short‑lived in‑memory sessions and exposes JSON APIs.
- Frontend: React + Vite app that captures mic audio, streams chunks to the backend for transcription, flags anti‑patterns, and plays concise hints (chime or TTS). Includes a profile editor for your personal context and a session summary view.

Repo layout:

```
backend/            # FastAPI app, prompts, Pydantic models, templates, .env.example
mommy/              # React 19 + Vite 7 + TailwindCSS v4 frontend
```


## Quickstart

Prereqs:

- Python 3.11+
- Node.js 20+ (for the frontend)

1) Backend

```
cd backend
cp .env.example .env   # then edit with your keys
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Env keys (edit `backend/.env`):

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default: `gpt-4o-mini`)
- `OPENAI_REALTIME_MODEL` (for the realtime session endpoint; default provided)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_ID` (optional for ElevenLabs TTS)
- `SCRAPINGDOG_API_KEY` (optional for LinkedIn enrichment)
- `ENABLED_SCRAPINGDOG` (`true|false`; if `false`, uses local templates)
- `ACI_API_KEY` (optional; enables Brave search via ACI.dev during enrichment)
- `CORS_ORIGINS` (e.g. `http://localhost:5173`)

2) Frontend

```
cd mommy
npm i
# Optionally: echo VITE_API_URL=http://localhost:8000 > .env.local
npm run dev  # http://localhost:5173
```


## How It Works (High Level)

- Prepare: On Home, optionally enrich a LinkedIn URL → backend queries ScrapingDog (+ optional ACI/Brave) and synthesizes concise prep bullets via OpenAI.
- Profile: “My Context” is stored on the server and fed into model instructions to personalize hints.
- Call: Chat page records mic, posts short `audio/webm` chunks to `/api/stt_chunk` → Whisper transcribes → model classifies anti‑patterns → generates one neutral follow‑up → UI surfaces as a short hint (and optionally speaks it).
- Summary: End call to see a computed Mom‑Test score, warning timeline, hint rate, and per‑aspect bars.


## Backend API (selected)

- `POST /api/enrich_linkedin` → { url } ⇒ LinkedIn person/company + optional Brave search ⇒ OpenAI synthesis to bullet points.
- `GET /api/personal_context` / `POST /api/personal_context` → read/write your profile text.
- `POST /api/session/start` → returns `session_id` for background transcription.
- `POST /api/stt_chunk?session_id=...` → body: `audio/webm` (opus) bytes ⇒ Whisper transcription; appends to session transcript.
- `POST /api/aspect_detect` → classifies latest snippet into anti‑patterns (compliment, hypothetical, leading, pitching, fluff, yesno, vague).
- `POST /api/aspect_suggest` → returns one concise, neutral follow‑up question based on context + aspect.
- `POST /api/tts` → OpenAI TTS (`gpt-4o-mini-tts`) returns `audio/mpeg`.
- `GET /api/hints` → background hint engine (throttled) returning JSON hints.
- `POST /api/realtime` → obtains an OpenAI Realtime `client_secret` (for a future WebRTC client).


## Prompts and Behavior

- Base behavior (“Tiger Mom”): silent, only emits hints; focuses on past behavior, constraints, stakeholders; avoids pitching/leading.
- Dedicated JSON‑only prompts for enrichment, hinting, and anti‑pattern classification ensure predictable parsing.


## Development Notes

- Sessions are in‑memory and ephemeral; restart clears them. Consider persisting if you need history.
- Audio: Browser `MediaRecorder` sends `audio/webm;codecs=opus`; backend posts multipart to OpenAI Whisper.
- Enrichment: If ScrapingDog is disabled, the backend serves template markdown to keep the flow working.
- Voice: Hints can be a chime or short TTS line. ElevenLabs support is optional; OpenAI TTS is available under `/api/tts`.


## Troubleshooting

- CORS: Set `CORS_ORIGINS` in backend `.env` to your frontend origin.
- 401/403 from OpenAI: verify `OPENAI_API_KEY` and model names.
- Whisper errors on chunks: ensure you’re sending `audio/webm` and not empty bodies; check browser permissions.
- Enrichment fails: populate `SCRAPINGDOG_API_KEY` and/or set `ENABLED_SCRAPINGDOG=false` to use templates.


## Roadmap (optional)

- Wire the Realtime `/api/realtime` path to a WebRTC client (browser) with tool calls for live hints.
- Persist transcripts/stats, export summary.
- Add rate limiting and stricter validation; optional Sentry DSN wiring.
