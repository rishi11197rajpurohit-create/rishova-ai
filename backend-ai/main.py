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

# Official active, non-decommissioned Groq production models
AVAILABLE_MODELS = [
    {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 (70B Versatile)"},
    {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B (Ultra Fast)"}
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
            "You are Rishova AI, a brilliant and helpful AI assistant created for Rishikesh. "
            "Respond directly and clearly. Seamlessly support Hindi, Hinglish, and English. "
            "Be context-aware and reference previous messages in this conversation naturally."
        )
    }

    groq_messages = [system_message]

    # Clean history: remove error messages and empty lines
    if req.messages and len(req.messages) > 0:
        for m in req.messages[-6:]:
            text = m.content.strip()
            if text and not text.startswith("Service") and not text.startswith("Kripya") and not text.startswith("API Error"):
                role = "assistant" if m.role == "assistant" else "user"
                groq_messages.append({"role": role, "content": text})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    chosen_model = req.model if req.model in ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"] else "llama-3.3-70b-versatile"

    def generate():
        stream = None
        # Try chosen model first, then fallback to the other active model
        candidates = [chosen_model] + [m["id"] for m in AVAILABLE_MODELS if m["id"] != chosen_model]
        last_error = ""

        for m_name in candidates:
            try:
                stream = client.chat.completions.create(
                    model=m_name,
                    messages=groq_messages,
                    temperature=0.4,
                    max_tokens=1200,
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