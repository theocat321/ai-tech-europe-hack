import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse
import httpx
from dotenv import load_dotenv

from models.models import (
    PersonalContextRequest,
    PersonalContextResponse,
    RealtimeRequest,
    RealtimeResponse,
    WhisperRequest,
)
from prompts import BASE_BEHAVIOR

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ELEVEN_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
PERSONAL_CONTEXT_FILE = "personal_context.txt"

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


def read_personal_context() -> str:
    try:
        with open(PERSONAL_CONTEXT_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def make_instructions(client_context: str, personal_context: str) -> str:
    client_context = (client_context or "").strip()
    personal_context = (personal_context or "").strip()

    personal_context_section = (
        f"\n\nMy personal context:\n{personal_context}"
        if personal_context
        else ""
    )
    client_context_section = (
        f"\n\nContext for this call (client-provided):\n{client_context}"
        if client_context
        else ""
    )
    return BASE_BEHAVIOR + personal_context_section + client_context_section


# --- Routes ------------------------------------------------------------------------

@app.get("/")
def root():
    return PlainTextResponse("Mom Test Assistant Backend is running.")


@app.get("/api/personal_context")
def get_personal_context():
    return PlainTextResponse(read_personal_context())


@app.post("/api/personal_context", response_model=PersonalContextResponse)
async def update_personal_context(payload: PersonalContextRequest):
    with open(PERSONAL_CONTEXT_FILE, "w", encoding="utf-8") as f:
        f.write(payload.content)
    return PersonalContextResponse(status="ok")


@app.post("/api/realtime", response_model=RealtimeResponse)
async def create_realtime_client_secret(payload: RealtimeRequest):
    """
    Mint a short-lived client_secret for WebRTC Realtime. The frontend will use it
    as the Bearer token in the 'POST /v1/realtime?model=gpt-realtime' SDP exchange.
    """
    user_context: str = payload.context or ""
    voice: Optional[str] = payload.voice  # e.g., "marin" or "cedar" (OpenAI realtime voices)

    session_cfg = {
        "type": "realtime",
        "model": "gpt-realtime",
        # Set a voice so the model can speak. Marin/Cedar are new high-quality voices.
        **({"voice": voice} if voice else {}),
        "instructions": make_instructions(user_context, read_personal_context()),
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
        return RealtimeResponse(client_secret=client_secret)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/whisper")
async def elevenlabs_whisper(payload: WhisperRequest):
    """
    Generate a short whispered TTS hint. Keep it LOW LATENCY.
    You can switch ELEVENLABS_MODEL_ID to 'eleven_v3' to fully leverage [whispers] tags.
    """
    text: str = (payload.text or "").strip()
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
        # Keep responses snappy; defaults are fine for short hints.
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
                        # Surface ElevenLabs error body to caller
                        chunk = await resp.aread()
                        yield chunk
                        return
                    async for chunk in resp.aiter_bytes():
                        if chunk:
                            yield chunk
        except Exception as e:
            yield f"Error: {e}".encode()

    return StreamingResponse(gen(), media_type="audio/mpeg")
