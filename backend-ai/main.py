import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Rishova AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

CANDIDATE_MODELS = [
    "qwen/qwen3.6-27b",
    "qwen/qwen3.8-27b",
    "allam-2-7b"
]

class UniversalRequest(BaseModel):
    prompt: str
    model: str = ""
    user_email: str = "guest"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "models": CANDIDATE_MODELS}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_prompt = req.prompt.strip()

    def generate():
        stream = None
        for model_name in CANDIDATE_MODELS:
            try:
                stream = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are Rishova AI, a brilliant assistant identical to ChatGPT. "
                                "CRITICAL INSTRUCTIONS:\n"
                                "- Jump directly into the final helpful response.\n"
                                "- NEVER output your internal thoughts, outlines, planning steps, or 'Draft:' notes.\n"
                                "- Provide clean, properly indented multi-line code blocks.\n"
                                "- Answer in the user's preferred language (Hindi, Hinglish, or English) naturally."
                            )
                        },
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.2,
                    max_tokens=800,
                    stream=True
                )
                break
            except Exception:
                continue

        if not stream:
            yield "Service is currently busy. Please try again in a moment."
            return

        try:
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")