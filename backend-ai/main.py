import os
from typing import List, Optional
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

# Ultra-stable models with 6,000 - 20,000+ TPM limits
AVAILABLE_MODELS = [
    {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 (70B) - Ultra Smart"},
    {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 (8B) - Super Fast"}
]

class MessageItem(BaseModel):
    role: str
    content: str

class UniversalRequest(BaseModel):
    prompt: str
    messages: Optional[List[MessageItem]] = None
    model: str = "llama-3.3-70b-versatile"
    user_email: str = "Rishikesh"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "models": AVAILABLE_MODELS}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a helpful, intelligent assistant. "
            "Jump straight to the final answer. Support Hindi, Hinglish, and English naturally. "
            "Be context-aware and reference previous messages in this conversation."
        )
    }

    groq_messages = [system_message]

    # Sanitize and keep last 6 turns
    if req.messages:
        for m in req.messages[-6:]:
            if m.content and not m.content.startswith("Service busy") and not m.content.startswith("Kripya"):
                groq_messages.append({"role": m.role, "content": m.content.strip()})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    target_model = req.model if req.model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] else "llama-3.3-70b-versatile"

    def generate():
        stream = None
        # Fallback between the two rock-solid Llama models only
        candidate_models = [target_model, "llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
        seen = set()
        models_to_try = [x for x in candidate_models if not (x in seen or seen.add(x))]

        for m_name in models_to_try:
            try:
                stream = client.chat.completions.create(
                    model=m_name,
                    messages=groq_messages,
                    temperature=0.3,
                    max_tokens=1200,
                    stream=True
                )
                break
            except Exception:
                continue

        if not stream:
            yield "Service is currently busy. Please try again in a few seconds."
            return

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token
        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")