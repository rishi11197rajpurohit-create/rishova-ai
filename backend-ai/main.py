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

app = FastAPI(title="Rishova AI Universal Engine")

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
    user_email: str = "Rishikesh"

@app.get("/")
def read_root():
    return {"status": "Rishova AI Universal Backend Live"}

@app.post("/api/upload")
async def extract_multiple_files(files: List[UploadFile] = File(...)):
    """Process single or multiple PDFs safely without crashing or overflow"""
    results = []
    for file in files:
        try:
            content_bytes = await file.read()
            extracted_text = ""

            if file.filename.lower().endswith(".pdf"):
                pdf_file = io.BytesIO(content_bytes)
                reader = PdfReader(pdf_file)
                for page in reader.pages[:8]:
                    text = page.extract_text()
                    if text:
                        extracted_text += text + "\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                continue

            # Safe slice per document
            if len(clean_text) > 3500:
                clean_text = clean_text[:3500] + "\n[... Document truncated for inference ...]"

            results.append({
                "filename": file.filename,
                "text": clean_text
            })
        except Exception:
            continue

    if not results:
        raise HTTPException(status_code=400, detail="No readable text found in uploaded files.")

    return {"files": results}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite ChatGPT-level intelligence created for Rishikesh. "
            "Give direct, highly accurate, and structured answers. Never output thinking tags or drafts. "
            "Support Hindi, Hinglish, and English naturally matching user queries. "
            "Seamlessly answer across multiple attached documents and keep conversational context intact."
        )
    }

    groq_messages = [system_message]

    # Smart sliding context window to allow UNLIMITED chat length without token errors
    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:2000]})
        
        # Take the most recent 8 messages for context
        groq_messages.extend(clean_history[-8:])
    else:
        groq_messages.append({"role": "user", "content": req.prompt.strip()[:3500]})

    # Dynamic Auto-Model Selection from user's live enabled models
    try:
        available_models = [
            m.id for m in client.models.list().data 
            if not any(b in m.id for b in ["whisper", "guard", "compound", "safeguard", "embed"])
        ]
    except Exception:
        available_models = ["openai/gpt-oss-20b"]

    def generate():
        stream = None
        error_log = ""

        for model_id in available_models:
            try:
                stream = client.chat.completions.create(
                    model=model_id,
                    messages=groq_messages,
                    temperature=0.3,
                    max_tokens=1500,
                    stream=True
                )
                break
            except Exception as e:
                error_log = str(e)
                continue

        if not stream:
            yield f"Service busy. Details: {error_log[:100]}"
            return

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if token:
                    yield token
        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")