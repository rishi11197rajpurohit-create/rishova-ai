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

# Groq active production models
AVAILABLE_MODELS = [
    {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 (70B Versatile)"}
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
            "You are Rishova AI, a brilliant, helpful AI assistant created for Rishikesh. "
            "Give direct, well-structured, comprehensive answers. "
            "Seamlessly support Hindi, Hinglish, and English matching the user's language. "
            "Be context-aware and reference earlier messages in this conversation naturally."
        )
    }

    groq_messages = [system_message]

    # Clean history: drop decommissioned/error logs and empty strings
    if req.messages and len(req.messages) > 0:
        for m in req.messages[-6:]:
            text = m.content.strip()
            if text and not any(text.startswith(prefix) for prefix in ["Service", "Kripya", "API Error", "Error code"]):
                role = "assistant" if m.role == "assistant" else "user"
                groq_messages.append({"role": role, "content": text})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    def generate():
        try:
            stream = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=groq_messages,
                temperature=0.4,
                max_tokens=1500,
                stream=True
            )
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token
        except Exception as e:
            yield f"API Error: {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain")