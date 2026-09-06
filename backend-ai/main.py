import os
import re
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
    {"id": "qwen/qwen3.6-27b", "name": "Qwen 3.6 (27B) - Smart & Fast"},
    {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 (27B) - Deep Reasoner"},
    {"id": "allam-2-7b", "name": "Allam 2 (7B) - Ultra Fast"}
]

class MessageItem(BaseModel):
    role: str
    content: str

class UniversalRequest(BaseModel):
    prompt: str
    messages: Optional[List[MessageItem]] = None
    model: str = "qwen/qwen3.6-27b"
    user_email: str = "Rishikesh"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "models": AVAILABLE_MODELS}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a brilliant, professional, and helpful AI assistant created for Rishikesh. "
            "CRITICAL OPERATIONAL RULES:\n"
            "1. NEVER output <think> tags, chain-of-thought, draft outlines, or planning steps. Always jump straight into the direct answer.\n"
            "2. Seamlessly remember and reference previous turns of the ongoing conversation.\n"
            "3. Provide clean markdown with proper syntax highlighting for code blocks.\n"
            "4. Respond naturally in Hindi, Hinglish, or English based on the user's language."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        for m in req.messages[-10:]:
            clean_content = re.sub(r"<think>[\s\S]*?</think>", "", m.content).strip()
            if clean_content:
                groq_messages.append({"role": m.role, "content": clean_content})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    chosen_model = req.model if any(m["id"] == req.model for m in AVAILABLE_MODELS) else AVAILABLE_MODELS[0]["id"]

    def generate():
        stream = None
        candidate_ids = [chosen_model] + [m["id"] for m in AVAILABLE_MODELS if m["id"] != chosen_model]
        
        for m_name in candidate_ids:
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
            yield "Service is currently busy. Please try again in a few seconds."
            return

        in_think_block = False
        buffer = ""

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if not token:
                    continue

                buffer += token

                if "<think>" in buffer:
                    in_think_block = True
                
                if in_think_block:
                    if "</think>" in buffer:
                        parts = buffer.split("</think>", 1)
                        clean_part = parts[1].lstrip()
                        in_think_block = False
                        buffer = ""
                        if clean_part:
                            yield clean_part
                    continue
                else:
                    yield buffer
                    buffer = ""
                    
            if buffer and not in_think_block:
                yield buffer

        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")