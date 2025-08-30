import os
import re
import json
import logging
from typing import Optional, Dict, Any, Tuple, List

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse
import httpx
from dotenv import load_dotenv
from openai import AsyncOpenAI

from models.models import (
    PersonalContextRequest,
    PersonalContextResponse,
    RealtimeRequest,
    RealtimeResponse,
    WhisperRequest,
    EnrichLinkedInRequest,
    EnrichLinkedInResponse,
)
from prompts import (
    BASE_BEHAVIOR,
    ENRICHMENT_SYSTEM_PROMPT,
    ENRICHMENT_USER_PROMPT_TEMPLATE,
)

load_dotenv()

# --- Logging ----------------------------------------------------------------------

logger = logging.getLogger("momtest-backend")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(asctime)s %(name)s: %(message)s')
logger.setLevel(logging.INFO)

# --- Environment Variables & Configuration -----------------------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
# Prefer a distinct realtime model, fallback to a sane default preview model
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview-2024-12-17")
ELEVEN_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVEN_MODEL = os.getenv("ELEVENLABS_MODEL_ID", "eleven_turbo_v2_5")
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
SCRAPINGDOG_API_KEY = os.getenv("SCRAPINGDOG_API_KEY")
ACI_API_KEY = os.getenv("ACI_API_KEY")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

PERSONAL_CONTEXT_FILE = "personal_context.txt"

# --- FastAPI App Initialization ----------------------------------------------------

app = FastAPI(title="Mom Test Assistant Backend")

origins = [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# --- Reusable HTTP Client Dependency -----------------------------------------------

async def get_http_client() -> httpx.AsyncClient:
    async with httpx.AsyncClient(timeout=40.0) as client:
        yield client

# --- OpenAI Client Initialization --------------------------------------------------

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY missing")

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)


# --- Helper Functions --------------------------------------------------------------

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
        f"\n\nMy personal context:\n{personal_context}" if personal_context else ""
    )
    client_context_section = (
        f"\n\nContext for this call (client-provided):\n{client_context}"
        if client_context
        else ""
    )
    return BASE_BEHAVIOR + personal_context_section + client_context_section


# --- Enrichment Endpoint Helpers ---------------------------------------------------

LINKEDIN_PERSON_REGEX = re.compile(r"linkedin\.com/in/([^/?#]+)")
LINKEDIN_COMPANY_REGEX = re.compile(r"linkedin\.com/company/([^/?#]+)")


def parse_linkedin_kind_and_id(url: str) -> Tuple[str, str]:
    person_match = LINKEDIN_PERSON_REGEX.search(url)
    if person_match:
        return "profile", person_match.group(1)

    company_match = LINKEDIN_COMPANY_REGEX.search(url)
    if company_match:
        return "company", company_match.group(1)

    raise HTTPException(
        status_code=400,
        detail="URL must be a valid linkedin.com/in/... or linkedin.com/company/... link",
    )


async def scrapingdog_get(
    client: httpx.AsyncClient,
    link_type: str,
    link_id: str
) -> Dict[str, Any]:
    if not SCRAPINGDOG_API_KEY:
        raise HTTPException(status_code=400, detail="SCRAPINGDOG_API_KEY is not configured.")

    api_url = "https://api.scrapingdog.com/linkedin/"
    params = {"api_key": SCRAPINGDOG_API_KEY, "type": link_type, "linkId": link_id, "premium": "true"}

    try:
        resp = await client.get(api_url, params=params)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        else:
            raise HTTPException(status_code=502, detail="Scrapingdog returned no profile data.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Scrapingdog API error: {e.response.text}")
    except (httpx.RequestError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=502, detail=f"Scrapingdog request failed: {e}")


async def brave_search_aci(
    client: httpx.AsyncClient,
    company_name: str
) -> Optional[List[Dict[str, Any]]]:
    if not ACI_API_KEY or not company_name:
        return None

    url = "https://api.aci.dev/functions/BRAVE_SEARCH__WEB_SEARCH/execute"
    headers = {"Authorization": f"Bearer {ACI_API_KEY}"}
    payload = {"q": f'{company_name} official site news', "count": 3}

    try:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        # ACI returns a list of results directly
        return resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError, json.JSONDecodeError):
        # Fail silently if Brave search fails
        return None

def shrink_person(person: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "full_name": person.get("full_name"),
        "headline": person.get("headline"),
        "summary": person.get("summary"),
        "location": person.get("location"),
        "experience": [
            {
                "title": exp.get("title"),
                "company_name": exp.get("company_name"),
                "duration": exp.get("duration"),
            }
            for exp in person.get("experience", [])[:4] # Keep recent 4 experiences
        ],
    }

def shrink_company(company: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "company_name": company.get("company_name"),
        "tagline": company.get("tagline"),
        "description": company.get("description"),
        "industry": company.get("industry"),
        "website": company.get("website"),
        "company_size": company.get("company_size"),
        "founded": company.get("founded"),
    }


async def synthesize_context(
    person: Optional[Dict],
    company: Optional[Dict],
    search: Optional[List]
) -> str:
    synthesis_payload = {
        "person_small": shrink_person(person) if person else None,
        "company_small": shrink_company(company) if company else None,
        "search_results": search,
    }
    # Remove null values for a cleaner prompt
    synthesis_payload = {k: v for k, v in synthesis_payload.items() if v is not None}

    user_prompt = ENRICHMENT_USER_PROMPT_TEMPLATE.format(
        payload_json=json.dumps(synthesis_payload, indent=2)
    )

    try:
        completion = await openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": ENRICHMENT_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        return completion.choices[0].message.content or ""
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OpenAI synthesis failed: {e}")


# --- API Routes --------------------------------------------------------------------

@app.get("/")
def root():
    return PlainTextResponse("Mom Test Assistant Backend is running.")


@app.post("/api/enrich_linkedin", response_model=EnrichLinkedInResponse)
async def enrich_linkedin(
    payload: EnrichLinkedInRequest,
    client: httpx.AsyncClient = Depends(get_http_client)
):
    if not all([SCRAPINGDOG_API_KEY, ACI_API_KEY, OPENAI_API_KEY]):
        raise HTTPException(status_code=400, detail="A required API key is missing on the server.")

    link_type, link_id = parse_linkedin_kind_and_id(payload.url)

    person_data, company_data, search_results = None, None, None
    company_name_for_search = None

    if link_type == "profile":
        person_data = await scrapingdog_get(client, "profile", link_id)
        # Get company name from the most recent experience for search, without a new API call
        if person_data.get("experience"):
            company_name_for_search = person_data["experience"][0].get("company_name")

    elif link_type == "company":
        company_data = await scrapingdog_get(client, "company", link_id)
        company_name_for_search = company_data.get("company_name")

    if company_name_for_search:
        search_results = await brave_search_aci(client, company_name_for_search)

    autofill_context = await synthesize_context(person_data, company_data, search_results)

    return EnrichLinkedInResponse(
        input_url=payload.url,
        person=person_data,
        company=company_data,
        search_results=search_results,
        autofill_context=autofill_context,
    )

# Keep existing endpoints as they are
@app.get("/api/personal_context")
def get_personal_context():
    return PlainTextResponse(read_personal_context())


@app.post("/api/personal_context", response_model=PersonalContextResponse)
def update_personal_context(payload: PersonalContextRequest):
    with open(PERSONAL_CONTEXT_FILE, "w", encoding="utf-8") as f:
        f.write(payload.content)
    return PersonalContextResponse(status="ok")

@app.post("/api/realtime", response_model=RealtimeResponse)
async def create_realtime_client_secret(
    payload: RealtimeRequest,
    client: httpx.AsyncClient = Depends(get_http_client),
    request: Request = None,
):
    if not OPENAI_API_KEY:
        logger.error("/api/realtime called but OPENAI_API_KEY missing")
        raise HTTPException(status_code=400, detail="Server is missing OPENAI_API_KEY")

    user_context: str = (payload.context or "").strip()
    voice: Optional[str] = payload.voice

    logger.info("/api/realtime payload: ip=%s, voice=%s, context_len=%d",
                request.client.host if request and request.client else "?",
                voice,
                len(user_context))

    session_cfg = {
        "model": OPENAI_REALTIME_MODEL,
        **({"voice": voice} if voice else {}),
        "instructions": make_instructions(user_context, read_personal_context()),
        "tools": [
            {
                "type": "function",
                "name": "whisper_hint",
                "description": "Play a brief whispered hint about a missed MOM Test opportunity.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "hint": {
                            "type": "string",
                            "description": "<=120 chars cue about what was missed.",
                        },
                        "followup_question": {
                            "type": "string",
                            "description": "One neutral, non-leading question to ask next.",
                        },
                    },
                    "required": ["hint", "followup_question"],
                },
            }
        ],
    }

    logger.info("/api/realtime session_cfg: model=%s, voice=%s, instructions_len=%d, tools=%d",
                session_cfg.get("model"),
                session_cfg.get("voice"),
                len(session_cfg.get("instructions", "")),
                len(session_cfg.get("tools", [])))

    url = "https://api.openai.com/v1/realtime/sessions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    # The sessions endpoint expects the session fields at the top level (no wrapper)
    body = session_cfg

    try:
        r = await client.post(url, headers=headers, json=body)
        logger.info("/api/realtime OpenAI response: status=%d", r.status_code)
        raw_text = r.text
        if r.status_code >= 400:
            # Log up to 2KB of body for diagnostics
            snippet = raw_text[:2048]
            logger.error("OpenAI realtime error %d: %s", r.status_code, snippet)
            return JSONResponse({"error": snippet}, status_code=r.status_code)
        data = r.json()
        logger.info("/api/realtime OpenAI ok: keys=%s", list(data.keys()))
        client_secret = (
            (data.get("client_secret") or {}).get("value")
            if isinstance(data, dict)
            else None
        )
        if not client_secret:
            logger.error("/api/realtime missing client_secret in response: %s", raw_text[:512])
            raise HTTPException(status_code=502, detail="OpenAI did not return client_secret")
        logger.info("/api/realtime success: issued client_secret (len=%d)", len(client_secret))
        return RealtimeResponse(client_secret=client_secret)
    except httpx.RequestError as e:
        logger.exception("/api/realtime httpx request error: %s", str(e))
        raise HTTPException(status_code=502, detail=f"Network error contacting OpenAI: {e}")
    except json.JSONDecodeError as e:
        logger.exception("/api/realtime JSON decode error: %s", str(e))
        raise HTTPException(status_code=502, detail="Invalid JSON from OpenAI realtime API")
    except Exception as e:
        logger.exception("/api/realtime unexpected error: %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/whisper")
def elevenlabs_whisper(
    payload: WhisperRequest,
    client: httpx.AsyncClient = Depends(get_http_client)
):
    if not ELEVEN_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY missing")

    text: str = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    whisper_text = f"[whispers] {text}"
    eleven_url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}/stream"
    q = {"model_id": ELEVEN_MODEL, "text": whisper_text, "output_format": "mp3_22050_32"}

    async def gen():
        try:
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
                resp.raise_for_status()
                async for chunk in resp.aiter_bytes():
                    yield chunk
        except httpx.HTTPStatusError as e:
            yield f"Error: {e.response.status_code} - {e.response.text}".encode()
        except Exception as e:
            yield f"Error: {e}".encode()

    return StreamingResponse(gen(), media_type="audio/mpeg")
