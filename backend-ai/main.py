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
            "You are Rishova AI, an intelligent assistant created for Rishikesh. "
            "Deliver direct, helpful responses in Hindi, Hinglish, or English. "
            "Be context-aware and reference earlier messages in this conversation."
        )
    }

    groq_messages = [system_message]

    # Clean history: omit system errors and empty strings
    if req.messages and len(req.messages) > 0:
        for m in req.messages[-6:]:
            text = m.content.strip()
            if text and not text.startswith("Service") and not text.startswith("Kripya") and not text.startswith("Error"):
                role = "assistant" if m.role == "assistant" else "user"
                groq_messages.append({"role": role, "content": text})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    target_model = req.model if req.model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"] else "llama-3.3-70b-versatile"

    def generate():
        stream = None
        attempt_models = [target_model, "llama-3.1-8b-instant"] if target_model != "llama-3.1-8b-instant" else ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
        last_error = ""

        for m_name in attempt_models:
            try:
                stream = client.chat.completions.create(
                    model=m_name,
                    messages=groq_messages,
                    temperature=0.4,
                    max_tokens=1000,
                    stream=True
                )
                break
            except Exception as e:
                last_error = str(e)
                continue

        if not stream:
            yield f"API Error: {last_error}"
            return

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token
        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")