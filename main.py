from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
import os
import ssl

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