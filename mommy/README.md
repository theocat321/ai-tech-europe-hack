# Tiger Mom Frontend (React + Vite)

Modern, minimal UI for Tiger Mom — a silent Mom‑Test interview coach.

## Dev

```
npm i
# Optionally set backend URL: echo VITE_API_URL=http://localhost:8000 > .env.local
npm run dev  # http://localhost:5173
```

## Pages

- Home: mission‑led hero, LinkedIn enrichment, client context editor.
- My Context: structured profile (“Who I am”, goals, rules) that feeds backend prompts.
- Chat (Session): mic capture, hints feed, colored anti‑pattern cards, speaking toggle, pause/resume, end call.
- Summary: Mom‑Test Score, flow vs warned donuts, warning sparkline, hints/min sparkline, aspect bars.

## Controls

- Speaking On/Off (header): speaks follow‑ups via OpenAI TTS or plays a chime.
- Pause/Resume (header): mutes mic immediately.
- End Call (header): stops recorder + mic, ends backend session, halts hint polling, navigates to Summary.
- Demo Mode (FAB, bottom‑right): toggle; when ON shows force‑hint and test‑voice FABs.
- Floating recorder panel: recording indicator, EN badge (English STT), segment count, latest transcript.

## Behavior

- 5s audio segments → backend `/api/stt_chunk` (Whisper, translate=true, language=en).
- For each segment: `/api/aspect_detect` (LLM) → colored [compliment]/[leading]/… card → `/api/aspect_suggest` generates one concise, neutral, past‑behavior follow‑up (deduped against recent questions).
- Background hints: `/api/hints` poll adds “(hint) … — Try: …” with same speech/chime logic.

## Notes

- Browsers require a user gesture for audio; click once or use Demo → Test Voice to unlock.
- End Call immediately halts polling and recording to prevent stray requests.
- Styling uses shadcn patterns (Cards, Progress) with a clean, Notion‑like top bar and FABs.
