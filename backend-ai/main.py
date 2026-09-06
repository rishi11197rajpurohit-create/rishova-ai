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
        active_list = [
            {"id": m.id, "name": m.id}
            for m in models_data.data
            if "whisper" not in m.id and "guard" not in m.id
        ]
        return {"models": active_list}
    except Exception as e:
        return {"models": [], "error": str(e)}

@app.post("/api/upload")
async def extract_file_content(file: UploadFile = File(...)):
    """Extract text from uploaded PDF or TXT documents"""
    try:
        content_bytes = await file.read()
        extracted_text = ""

        if file.filename.endswith(".pdf"):
            pdf_file = io.BytesIO(content_bytes)
            reader = PdfReader(pdf_file)
            for page in reader.pages[:15]:  # read up to first 15 pages
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        else:
            extracted_text = content_bytes.decode("utf-8", errors="ignore")

        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="File is empty or contains no readable text.")

        # Limit to 12,000 characters to keep within fast inference limits
        return {
            "filename": file.filename,
            "text": extracted_text[:12000].strip()
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
            "Maintain conversation context and carefully analyze any attached documents."
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

    chosen_model = req.model
    if not chosen_model:
        try:
            available = client.models.list().data
            chat_models = [m.id for m in available if "whisper" not in m.id and "guard" not in m.id]
            chosen_model = chat_models[0] if chat_models else "openai/gpt-oss-20b"
        except Exception:
            chosen_model = "openai/gpt-oss-20b"

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