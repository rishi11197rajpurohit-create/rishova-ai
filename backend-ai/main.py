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
    messages: Optional[List[MessageItem]] = None
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
            "You are Rishova AI, a brilliant, professional, and helpful AI assistant created for Rishikesh. "
            "CRITICAL OPERATIONAL RULES:\n"
            "1. NEVER output <think> tags, chain-of-thought, draft outlines, or planning steps. Always jump straight into the direct answer.\n"
            "2. Seamlessly remember and reference previous turns of the ongoing conversation.\n"
            "3. Provide clean markdown with proper syntax highlighting for code blocks.\n"
            "4. Respond naturally in Hindi, Hinglish, or English based on the user's language."
        )
    }

    groq_messages = [system_message]

    # Clean and append conversation history
    if req.messages and len(req.messages) > 0:
        for m in req.messages[-10:]:
            # Filter out empty or thinking tokens from history
            clean_content = re.sub(r"<think>[\s\S]*?</think>", "", m.content).strip()
            if clean_content:
                groq_messages.append({"role": m.role, "content": clean_content})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()})

    chosen_model = req.model if req.model in CANDIDATE_MODELS else CANDIDATE_MODELS[0]

    def generate():
        stream = None
        for m_name in [chosen_model] + [m for m in CANDIDATE_MODELS if m != chosen_model]:
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

                # If <think> tag starts, suppress it
                if "<think>" in buffer:
                    in_think_block = True
                
                if in_think_block:
                    if "</think>" in buffer:
                        # Extract everything after </think>
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