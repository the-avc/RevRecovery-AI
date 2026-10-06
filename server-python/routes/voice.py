from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from agents.hinglish_voice import generate_hinglish_audio, AUDIO_OUTPUT_DIR

router = APIRouter()

 
class VoiceRequest(BaseModel):
    customerName: str
    amount: float


class VoiceResponse(BaseModel):
    audioPath: str | None
    success: bool


@router.post("/generate-voice", response_model=VoiceResponse)
async def generate_voice(req: VoiceRequest):
    """Generates a Hinglish voice message MP3 for high-value recovery outreach."""
    try:
        audio_path = generate_hinglish_audio(req.customerName, req.amount)
        return VoiceResponse(audioPath=audio_path, success=True)
    except Exception as e:
        print(f"[Voice] Generation failed: {e}")
        return VoiceResponse(audioPath=None, success=False)


@router.get("/audio/{filename}")
async def serve_audio(filename: str):
    """Serves generated audio files for playback in the React dashboard."""
    file_path = (AUDIO_OUTPUT_DIR / filename).resolve()
    if not file_path.is_relative_to(AUDIO_OUTPUT_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(str(file_path), media_type="audio/mpeg")
