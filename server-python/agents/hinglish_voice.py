"""Hinglish voice outreach (gTTS) for high-value recovery. Returns mp3 path."""

from gtts import gTTS
from pathlib import Path
import uuid

AUDIO_OUTPUT_DIR = Path(__file__).parent.parent / "audio_files"
AUDIO_OUTPUT_DIR.mkdir(exist_ok=True)


def generate_hinglish_audio(customer_name: str, amount: float) -> str:
    first = (customer_name or "Customer").split()[0]
    try:
        amt = f"{float(amount):,.0f}"
    except (TypeError, ValueError):
        amt = "0"
    script = (
        f"Namaste, {first} ji! Aapka {amt} rupaye ka payment process nahi ho saka. "
        f"Koi tension nahi. Aapke liye ek naya payment link ready hai. "
        f"Kripya apna SMS ya email check karein aur payment complete karein. Dhanyavaad!"
    )
    path = AUDIO_OUTPUT_DIR / f"recovery_{uuid.uuid4().hex[:8]}.mp3"
    try:
        gTTS(text=script, lang="hi", slow=False).save(str(path))
    except Exception as e:
        print(f"[Voice] gTTS failed ({e}), saving script as text fallback")
        txt_path = path.with_suffix(".txt")
        txt_path.write_text(script, encoding="utf-8")
        return str(txt_path)
    print(f"[Voice] Generated: {path}")
    return str(path)
