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

class MessageItem(BaseModel):
    role: str
    content: str

class UniversalRequest(BaseModel):
    prompt: str
    messages: Optional[List[MessageItem]] = None
    model: Optional[str] = None
    user_email: str = "Rishikesh"

@app.get("/api/models")
def get_active_models():
    """Dynamically fetch all working models enabled for this exact API Key"""
    try:
        models_data = client.models.list()
        # Filter chat-supported active models
        active_list = [
            {"id": m.id, "name": m.id}
            for m in models_data.data
            if "whisper" not in m.id and "guard" not in m.id
        ]
        return {"models": active_list}
    except Exception as e:
        return {"models": [{"id": "gemma2-9b-it", "name": "Gemma 2 (9B)"}], "error": str(e)}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an intelligent, helpful AI assistant built for Rishikesh. "
            "Jump straight to the final answer without any planning, thoughts, or <think> tags. "
            "Respond naturally in Hindi, Hinglish, or English. Remember the context of prior messages."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        for m in req.messages[-6:]:
            text = m.content.strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]):
                role = "assistant" if m.role == "assistant" else "user"
                groq_messages.append({"role": role, "content": text})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    # Pick the model: user selection -> or auto-detect from active account models
    chosen_model = req.model
    if not chosen_model:
        try:
            available = client.models.list().data
            chat_models = [m.id for m in available if "whisper" not in m.id and "guard" not in m.id]
            chosen_model = chat_models[0] if chat_models else "gemma2-9b-it"
        except Exception:
            chosen_model = "gemma2-9b-it"

    def generate():
        try:
            stream = client.chat.completions.create(
                model=chosen_model,
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
            yield f"API Error ({chosen_model}): {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain")