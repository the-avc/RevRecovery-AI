"""
Hinglish Voice Generator
Generates personalized Hinglish (Hindi + English) TTS audio for high-value recovery outreach.
Uses gTTS (Google Text-to-Speech) — free and works offline.
"""

from gtts import gTTS
from pathlib import Path
import uuid

# Audio files will be stored here and served by the Node server
AUDIO_OUTPUT_DIR = Path(__file__).parent.parent / "audio_files"
AUDIO_OUTPUT_DIR.mkdir(exist_ok=True)


def generate_hinglish_audio(customer_name: str, amount: float, payment_link: str) -> str:
    """Generates a Hinglish TTS audio file and returns its file path."""
    first_name = customer_name.split()[0]
    script = (
        f"Namaste, {first_name} ji! "
        f"Aapka {amount:,.0f} rupaye ka payment unfortunately process nahi ho saka. "
        f"Koi tension nahi — hum aapki help karne ke liye yahan hain. "
        f"Aapke liye ek naya payment link ready hai. "
        f"Kripya apna SMS ya email check karein aur payment complete karein. "
        f"Agar koi problem ho, toh hume call karein. "
        f"Dhanyavaad!"
    )

    filepath = AUDIO_OUTPUT_DIR / f"recovery_{uuid.uuid4().hex[:8]}.mp3"
    gTTS(text=script, lang="hi", slow=False).save(str(filepath))

    print(f"[Voice] Generated Hinglish audio: {filepath}")
    return str(filepath)
