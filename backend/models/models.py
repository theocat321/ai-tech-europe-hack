from pydantic import BaseModel
from typing import Optional

class PersonalContextRequest(BaseModel):
    content: str

class PersonalContextResponse(BaseModel):
    status: str

class RealtimeRequest(BaseModel):
    context: Optional[str] = None
    voice: Optional[str] = None

class RealtimeResponse(BaseModel):
    client_secret: str

class WhisperRequest(BaseModel):
    text: str