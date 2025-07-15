from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import ssl
import json
import datetime
from pathlib import Path
from langdetect import detect
from googletrans import Translator

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set your Gemini API Key and model
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyB3HLb0TmvqHCoovYqYaSq0fJvHARn9FXk")
# GEMINI_MODEL = "gemini-1.5-pro"  # ✅ FIXED model name

TRANSCRIPT_DIR = Path("transcripts")
TRANSCRIPT_DIR.mkdir(exist_ok=True)

translator = Translator()

@app.post("/generate-feedback")
async def generate_feedback(request: Request):
    try:
        body = await request.json()
        prompt = body.get("prompt", "").strip()
        print("🟢 Prompt received:\n", prompt)

        if not prompt:
            return {"error": "Prompt is empty"}

        payload = {
            "contents": [
                {"parts": [{"text": prompt}]}
            ]
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key={GEMINI_API_KEY}"
        print("🌐 Sending POST request to:", url)

        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:  # ✅ Bypass SSL, increase timeout
            try:
                response = await client.post(url, json=payload)
                print("🟡 Status code:", response.status_code)
                print("🟡 Raw response text:", response.text)

                try:
                    result = response.json()
                    print("✅ Parsed Gemini result:", result)
                    return result
                except Exception as e:
                    print("❌ Failed to parse JSON:", str(e))
                    return {"error": f"Failed to parse JSON response: {str(e)}", "raw": response.text}

            except httpx.HTTPError as http_err:
                print("❌ HTTP error during POST:", str(http_err))
                return {"error": f"HTTP error: {str(http_err)}"}

    except Exception as e:
        print("🔴 Top-level Exception occurred:", str(e))
        return {"error": str(e)}


@app.post("/save-transcript")
async def save_transcript(request: Request):
    data = await request.json()
    transcript = data.get("transcript")
    if not isinstance(transcript, list):
        return {"error": "Invalid transcript"}

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = TRANSCRIPT_DIR / f"transcript_{timestamp}.json"
    with open(file_path, "w") as f:
        json.dump(transcript, f, indent=2)
    return {"status": "saved"}


def needs_translation(text):
    return any(ord(char) > 127 for char in text)

@app.post("/translate-transcript")
async def translate_transcript(request: Request):
    data = await request.json()
    transcript = data.get("transcript", [])
    if not isinstance(transcript, list):
        return {"error": "Invalid transcript"}

    processed = []
    for pair in transcript:
        question = pair.get("question", "")
        answer = pair.get("answer", "")

        # --- Process question ---
        try:
            detected_q_lang = detect(question) if question else 'unknown'
            print(f"Original Q: {question} | Detected: {detected_q_lang}")
            if question and (needs_translation(question) or detected_q_lang != "en"):
                translated_q_obj = await translator.translate(question, dest="en")
                translated_q = translated_q_obj.text
                print(f"Translated Q: {translated_q}")
                question = translated_q
        except Exception as e:
            print(f"Q translation error: {e}")

        # --- Process answer ---
        try:
            detected_a_lang = detect(answer) if answer else 'unknown'
            print(f"Original A: {answer} | Detected: {detected_a_lang}")
            if answer and (needs_translation(answer) or detected_a_lang != "en"):
                translated_a_obj = await translator.translate(answer, dest="en")
                translated_a = translated_a_obj.text
                print(f"Translated A: {translated_a}")
                answer = translated_a
        except Exception as e:
            print(f"A translation error: {e}")

        processed.append({"question": question, "answer": answer})

    print("Processed transcript (all English):", processed)
    return {"transcript": processed}
