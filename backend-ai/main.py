import os
from typing import List, Dict
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

class MessageItem(BaseModel):
    role: str
    content: str

class UniversalRequest(BaseModel):
    prompt: str
    messages: List[MessageItem] = []
    model: str = "qwen/qwen3.6-27b"
    user_email: str = "Rishikesh"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "models": CANDIDATE_MODELS}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an advanced, highly intelligent AI assistant identical to ChatGPT. "
            "STRICT RULES:\n"
            "1. Jump straight into the helpful answer without showing draft notes, internal reasoning, or thinking outlines.\n"
            "2. For code, provide clean, indented multi-line code blocks with language identifiers.\n"
            "3. Seamlessly support English, Hindi, and Hinglish based on how the user writes.\n"
            "4. Be context-aware and reference previous messages in this conversation naturally."
        )
    }

    # Build conversation context (keep last 8 turns to stay safe within token limits)
    groq_messages = [system_message]
    if req.messages:
        recent_history = req.messages[-8:]
        for m in recent_history:
            if m.content.strip():
                groq_messages.append({"role": m.role, "content": m.content})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    chosen_model = req.model if req.model in CANDIDATE_MODELS else CANDIDATE_MODELS[0]

    def generate():
        stream = None
        # Try requested model first, fallback to candidates
        try_models = [chosen_model] + [m for m in CANDIDATE_MODELS if m != chosen_model]
        
        for m_name in try_models:
            try:
                stream = client.chat.completions.create(
                    model=m_name,
                    messages=groq_messages,
                    temperature=0.3,
                    max_tokens=850,
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