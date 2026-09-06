import os
import io
import re
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File
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
                clean_text = f"[Image/Scanned document: {file.filename}]"

            if len(clean_text) > 3500:
                clean_text = clean_text[:3500] + "\n[... Content truncated ...]"

            results.append({
                "filename": file.filename,
                "text": clean_text
            })
        except Exception:
            results.append({
                "filename": file.filename,
                "text": f"[Attached document: {file.filename}]"
            })

    return {"files": results}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a polyglot, ChatGPT-level intelligence created for Rishikesh.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. FACTUAL ACCURACY IS PARAMOUNT: Never alter, invent, or confuse historical facts, names, dates, or lineages (e.g., Maharana Pratap was from the Sisodia Rajput dynasty of Mewar, never Rathore or Bhagwat). Ensure 100% verified facts.\n"
            "2. UNIVERSAL MULTILINGUAL SUPPORT: You speak and understand ALL world languages, Indian languages, and regional dialects (including Rajasthani / Marwari / Mewari, Gujarati, Punjabi, Bhojpuri, Marathi, Bengali, Tamil, Telugu, Hindi, Hinglish, English, French, Spanish, Arabic, etc.).\n"
            "3. MIRROR THE USER'S LANGUAGE: Always reply in the EXACT language and dialect the user uses. If the user asks in Marwari/Rajasthani (e.g. 'कांई चाल रह्यो है', 'म्हाने बताओ'), respond fluently in authentic Marwari. If in Hindi, respond in Hindi. If in Hinglish, respond in Hinglish.\n"
            "4. NO INTERNAL LEAKS: Never produce thoughts, drafts, or <think>...</think> tags.\n"
            "5. BEAUTIFUL FORMATTING: Present complex data, Excel summaries, and tabular comparisons in clean Markdown tables."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]) and "पॉपस्टेम" not in text:
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-6:])
    else:
        clean_prompt = re.sub(r'<think>.*?</think>', '', req.prompt, flags=re.DOTALL).strip()
        groq_messages.append({"role": "user", "content": clean_prompt[:3000]})

    # Preferred reliable models
    preferred_models = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "openai/gpt-oss-20b"
    ]

    def generate():
        stream = None
        error_log = ""

        for model_id in preferred_models:
            try:
                stream = client.chat.completions.create(
                    model=model_id,
                    messages=groq_messages,
                    temperature=0.3,          # Precise & factual
                    presence_penalty=0.1,
                    frequency_penalty=0.1,
                    max_tokens=1800,
                    stream=True
                )
                break
            except Exception as e:
                error_log = str(e)
                continue

        if not stream:
            yield f"Service busy. Details: {error_log[:100]}"
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
                        clean_tail = parts[1].lstrip()
                        in_think_block = False
                        buffer = ""
                        if clean_tail:
                            yield clean_tail
                    continue
                else:
                    yield buffer
                    buffer = ""

        except Exception as e:
            yield f"\n[Stream interrupted: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")