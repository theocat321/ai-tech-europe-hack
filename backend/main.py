import os
import json
from typing import Optional
from fastapi import FastAPI, Body, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse
import httpx
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ELEVEN_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY missing")
if not ELEVEN_API_KEY:
    raise RuntimeError("ELEVENLABS_API_KEY missing")

app = FastAPI(title="Mom Test Assistant Backend")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- Helper: build the realtime session instructions --------------------------------

BASE_BEHAVIOR = """
You are "Mom Test Assistant".
Primary mode: SILENT LISTENER. You do not interrupt normal flow.
Only speak aloud if the user asks you directly. Otherwise, help via a function tool.

Goal: help the interviewer run a great MOM Test–style conversation.
- Never pitch or describe "our solution".
- Prefer questions about PAST BEHAVIOR, not hypotheticals or opinions.
- Avoid leading questions; keep questions neutral and concise.
- Prioritize: frequency, recency, money/time spent, existing alternatives, prior attempts, decision-maker, constraints/budget, deadlines, integrations/data sources.

When you detect the interviewer SKIPS or GLIDES OVER a strong signal (e.g., they mention a problem, workaround, cost, budget, switching friction, timeline, stakeholders), CALL the tool `whisper_hint` with:
- hint: <=120 chars, crisp cue (what we missed)
- followup_question: ONE specific, neutral, past-behavior question the interviewer can ask next.

Cadence: at most one hint every 45 seconds.

If the user explicitly asks you for help, answer with 1–2 sentences, or give 1–2 high-quality questions.
"""

def make_instructions(user_context: str) -> str:
    context = f"\nContext for this call (developer-provided):\n{user_context.strip()}\n"
    return BASE_BEHAVIOR + context

# --- Routes ------------------------------------------------------------------------

@app.get("/")
def root():
    return PlainTextResponse("Mom Test Assistant Backend is running.")

@app.post("/api/realtime")
async def create_realtime_client_secret(payload: dict = Body(...)):
    """
    Mint a short-lived client_secret for WebRTC Realtime. The frontend will use it
    as the Bearer token in the 'POST /v1/realtime?model=gpt-realtime' SDP exchange.
    """
    user_context: str = payload.get("context") or ""
    voice: Optional[str] = payload.get("voice")  # e.g., "marin" or "cedar" (OpenAI realtime voices)

    session_cfg = {
        "type": "realtime",
        "model": "gpt-realtime",
        # Set a voice so the model can speak. Marin/Cedar are new high-quality voices.
        **({"voice": voice} if voice else {}),
        "instructions": make_instructions(user_context),
        # Tool definition: the model will call this when it wants to whisper a hint.
        "tools": [
            {
                "type": "function",
                "name": "whisper_hint",
                "description": "Play a brief whispered hint to the interviewer about a missed MOM Test opportunity and propose one sharp follow-up question.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "hint": {
                            "type": "string",
                            "description": "<=120 chars cue about what was missed; short and to the point."
                        },
                        "followup_question": {
                            "type": "string",
                            "description": "One neutral, non-leading question in past-behavior form the interviewer should ask next."
                        }
                    },
                    "required": ["hint", "followup_question"]
                },
            }
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"session": session_cfg},
            )
        if r.status_code >= 400:
            return JSONResponse({"error": r.text}, status_code=r.status_code)
        data = r.json()
        client_secret = data.get("client_secret", {}).get("value")
        if not client_secret:
            raise HTTPException(status_code=500, detail="No client_secret returned")
        return {"client_secret": client_secret}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/whisper", response_class=StreamingResponse)
async def elevenlabs_whisper(payload: dict = Body(...)):
    """
    Generate a short whispered TTS hint. Keep it LOW LATENCY.
    You can switch ELEVENLABS_MODEL_ID to 'eleven_v3' to fully leverage [whispers] tags.
    """
    text: str = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # For stronger whisper style with v3 models, prepend an audio tag:
    # If you're on v3, this tag is effective; on turbo/flash it is typically ignored, which is fine.
    whisper_text = f"[whispers] {text}"

    # Stream audio chunks back to the browser as MP3
    eleven_url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}/stream"
    q = {
        "model_id": ELEVEN_MODEL,
        "text": whisper_text,
        "output_format": "mp3_22050_32",
        # Keep responses snappy; you can tweak via VoiceSettings, but default is okay for short hints.
    }

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    eleven_url,
                    headers={
                        "xi-api-key": ELEVEN_API_KEY,
                        "Content-Type": "application/json",
                        "Accept": "audio/mpeg",
                    },
                    json=q,
                ) as resp:
                    if resp.status_code >= 400:
                        chunk = await resp.aread()
                        yield chunk
                        return
                    async for chunk in resp.aiter_bytes():
                        if chunk:
                            yield chunk
        except Exception as e:
            yield f"Error: {e}".encode()

    return StreamingResponse(gen(), media_type="audio/mpeg")
