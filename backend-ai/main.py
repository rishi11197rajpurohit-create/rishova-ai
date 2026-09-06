import os
import io
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from pypdf import PdfReader

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
    try:
        models_data = client.models.list()
        # Filter purely stable chat-completion models, avoid compound or guard endpoints
        banned = ["whisper", "guard", "compound", "safeguard", "embed"]
        active_list = [
            {"id": m.id, "name": m.id}
            for m in models_data.data
            if not any(b in m.id for b in banned)
        ]
        return {"models": active_list}
    except Exception as e:
        return {"models": [], "error": str(e)}

@app.post("/api/upload")
async def extract_file_content(file: UploadFile = File(...)):
    """Extract text from uploaded PDF or TXT documents safely without overflow"""
    try:
        content_bytes = await file.read()
        extracted_text = ""

        if file.filename.endswith(".pdf"):
            pdf_file = io.BytesIO(content_bytes)
            reader = PdfReader(pdf_file)
            for page in reader.pages[:10]:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        else:
            extracted_text = content_bytes.decode("utf-8", errors="ignore")

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="File is empty or contains no readable text.")

        # Cap text at 4,500 characters (~900 tokens) to guarantee zero 'Request Too Large' errors
        trimmed = extracted_text.strip()
        if len(trimmed) > 4500:
            trimmed = trimmed[:4500] + "\n\n[... Remaining content truncated for optimal processing ...]"

        return {
            "filename": file.filename,
            "text": trimmed
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File parse error: {str(e)}")

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a brilliant, professional, and helpful AI assistant created for Rishikesh. "
            "Jump straight to the final answer. Never produce thoughts, drafts, or <think> tags. "
            "Respond naturally in Hindi, Hinglish, or English based on user's query. "
            "Carefully analyze any attached documents and provide clear answers."
        )
    }

    groq_messages = [system_message]

    # Clean history and limit message length
    if req.messages and len(req.messages) > 0:
        for m in req.messages[-4:]:
            text = m.content.strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]):
                role = "assistant" if m.role == "assistant" else "user"
                # Keep individual history messages under 1500 chars
                groq_messages.append({"role": role, "content": text[:1500]})
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()[:3500]})

    # Pick model
    chosen_model = req.model
    banned = ["whisper", "guard", "compound", "safeguard", "embed"]
    
    if not chosen_model or any(b in chosen_model for b in banned):
        try:
            available = client.models.list().data
            valid = [m.id for m in available if not any(b in m.id for b in banned)]
            chosen_model = valid[0] if valid else "openai/gpt-oss-20b"
        except Exception:
            chosen_model = "openai/gpt-oss-20b"

    def generate():
        try:
            stream = client.chat.completions.create(
                model=chosen_model,
                messages=groq_messages,
                temperature=0.3,
                max_tokens=1200,
                stream=True
            )
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token
        except Exception as e:
            yield f"API Error ({chosen_model}): {str(e)}"

    return StreamingResponse(generate(), media_type="text/plain")