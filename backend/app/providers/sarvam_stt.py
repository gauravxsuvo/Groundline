from __future__ import annotations

import mimetypes

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..config import settings

STT_URL = "https://api.sarvam.ai/speech-to-text"
TIMEOUT = httpx.Timeout(30.0, connect=5.0)

# Sarvam documents WAV (16-bit PCM), MP3, AAC, FLAC and OGG for this endpoint,
# and recommends WAV at 16kHz mono for best accuracy, which is exactly what the
# frontend records. mimetypes alone is not enough to rely on: it resolves
# ".webm" to "video/webm" on Windows, which is not an audio type at all.
_CONTENT_TYPES = {
    "wav": "audio/wav",
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "aac": "audio/aac",
    "flac": "audio/flac",
    "ogg": "audio/ogg",
    "opus": "audio/ogg",
    "webm": "audio/webm",
}


class SarvamSTTError(RuntimeError):
    pass


class _RetryableSTTError(SarvamSTTError):
    """Sarvam-side 5xx, worth one more attempt. A 4xx (bad key, unsupported
    format, audio too long) fails identically on retry, so it is not one."""


def _content_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in _CONTENT_TYPES:
        return _CONTENT_TYPES[ext]
    guessed, _ = mimetypes.guess_type(filename)
    return guessed if guessed and guessed.startswith("audio/") else "application/octet-stream"


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.2, max=2.0),
    retry=retry_if_exception_type((httpx.TransportError, _RetryableSTTError)),
    reraise=True,
)
def _post(files: dict, data: dict, headers: dict) -> httpx.Response:
    with httpx.Client(timeout=TIMEOUT) as client:
        response = client.post(STT_URL, headers=headers, files=files, data=data)
    if response.status_code >= 500:
        raise _RetryableSTTError(f"Sarvam STT failed ({response.status_code}): {response.text[:300]}")
    return response


def transcribe(audio_bytes: bytes, filename: str) -> str:
    """Sends one audio clip to Sarvam and returns the transcript.

    Raises SarvamSTTError with a message meant to be shown to the person who
    recorded the clip, not just logged: an empty transcript here almost always
    means the microphone captured silence, and that is worth saying plainly
    rather than surfacing as a generic failure.
    """
    if not settings.sarvam_api_key:
        raise SarvamSTTError("SARVAM_API_KEY is not set")
    if not audio_bytes:
        raise SarvamSTTError("the recording was empty")
    if len(audio_bytes) > settings.max_audio_bytes:
        raise SarvamSTTError(
            f"the recording is {len(audio_bytes) / 1_000_000:.1f}MB, over the "
            f"{settings.max_audio_bytes / 1_000_000:.0f}MB limit. Sarvam's sync endpoint "
            "accepts up to 30 seconds of audio."
        )

    files = {"file": (filename, audio_bytes, _content_type(filename))}
    data = {
        "model": settings.stt_model,
        "mode": settings.stt_mode,
        "language_code": settings.stt_language_code,
    }
    headers = {"api-subscription-key": settings.sarvam_api_key}

    response = _post(files, data, headers)

    if response.status_code != 200:
        raise SarvamSTTError(f"Sarvam STT failed ({response.status_code}): {response.text[:300]}")

    transcript = (response.json().get("transcript") or "").strip()
    if not transcript:
        raise SarvamSTTError("no speech was detected in the recording")
    return transcript
