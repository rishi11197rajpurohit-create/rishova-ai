import os
import io
import re
import base64
import urllib.request
import urllib.parse
import json
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
    return {"status": "Rishova AI Universal Engine Live"}

def get_quick_facts(query: str) -> str:
    """Instant facts from Wikipedia without external delays"""
    try:
        clean = re.sub(r'[^\w\s]', '', query).strip()
        stop_words = ["btao", "kya", "hai", "ke", "bare", "me", "ri", "ra", "ro", "mhane", "batavo", "batao", "image", "photo", "bnao", "generate"]
        words = [w for w in clean.split() if w.lower() not in stop_words]
        search_term = " ".join(words[:2]) if words else clean
        if not search_term or len(search_term) < 3:
            return ""

        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(search_term)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'RishovaAI/1.0'})
        with urllib.request.urlopen(req, timeout=1.2) as response:
            data = json.loads(response.read().decode('utf-8'))
            extract = data.get("extract", "")
            if extract:
                return f"\n[VERIFIED HISTORICAL FACTS]:\n{extract}\n"
    except Exception:
        pass
    return ""

def run_vision_ocr(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Extract full readable text and data from scanned certificate/image using Groq Vision"""
    try:
        b64_img = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_img}"

        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": "Perform exact OCR extraction: Read and list all text, names, dates, certificate IDs, titles, issuing organizations, and tabular figures clearly."
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                }
            ],
            temperature=0.1,
            max_tokens=800
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return ""

@app.post("/api/upload")
async def extract_multiple_files(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        try:
            content_bytes = await file.read()
            extracted_text = ""
            filename_lower = file.filename.lower()

            if filename_lower.endswith(".pdf"):
                pdf_file = io.BytesIO(content_bytes)
                reader = PdfReader(pdf_file)
                # 1. Try standard text extraction
                for page in reader.pages[:8]:
                    t = page.extract_text()
                    if t:
                        extracted_text += t + "\n"

                # 2. If scanned / empty text, extract image from first page and run Vision OCR
                if not extracted_text.strip():
                    for page in reader.pages[:2]:
                        if hasattr(page, "images") and len(page.images) > 0:
                            first_img = page.images[0]
                            ocr_result = run_vision_ocr(first_img.data, mime_type="image/png")
                            if ocr_result:
                                extracted_text += f"\n[OCR Vision Extracted Content]:\n{ocr_result}\n"
                                break

            elif any(filename_lower.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                mime = "image/png" if filename_lower.endswith(".png") else "image/jpeg"
                ocr_result = run_vision_ocr(content_bytes, mime_type=mime)
                if ocr_result:
                    extracted_text = f"[OCR Image Content]:\n{ocr_result}"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Document Attached: {file.filename}]"

            if len(clean_text) > 3500:
                clean_text = clean_text[:3500] + "\n[... Truncated ...]"

            results.append({
                "filename": file.filename,
                "text": clean_text
            })
        except Exception:
            results.append({
                "filename": file.filename,
                "text": f"[Document: {file.filename}]"
            })

    return {"files": results}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    facts = get_quick_facts(user_input)

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite AI assistant comparable to ChatGPT Plus and Gemini.\n\n"
            "MANDATORY CAPABILITIES:\n"
            "1. AI IMAGE GENERATION (DALL-E 3 Equivalent):\n"
            "   When the user requests to generate, create, draw, or make an image/photo/artwork (e.g., 'generate image of...', 'ek photo banao', 'tasveer banao'):\n"
            "   Translate the subject into a rich, detailed English prompt and output a Markdown image EXACTLY like this:\n"
            "   ![Generated Image](https://image.pollinations.ai/prompt/<URL_ENCODED_ENGLISH_PROMPT>?width=1024&height=1024&nologo=true&seed=42)\n"
            "   Followed by a polite, brief caption in the user's language.\n\n"
            "2. ACCURACY & DOCUMENT INTELLIGENCE:\n"
            "   When analyzing attached documents or OCR extractions, accurately cite the person's name, certificate title, dates, and institutions without guessing.\n\n"
            "3. REGIONAL DIALECTS & LANGUAGES:\n"
            "   Fluently speak Marwari, Mewari, Rajasthani, Hindi, Hinglish, English, and all global languages. Mirror the user's language naturally.\n\n"
            "4. CLEAN PRESENTATION:\n"
            "   Never leak <think> tags or internal notes. Use Markdown tables and clean bullet points."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "AI Server Busy"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    final_user_content = user_input + (facts if facts else "")
    groq_messages.append({"role": "user", "content": final_user_content})

    # Available text models
    banned = ["whisper", "guard", "compound", "safeguard", "embed", "vision"]
    try:
        models_data = client.models.list().data
        active_models = [m.id for m in models_data if not any(b in m.id for b in banned)]
    except Exception:
        active_models = ["openai/gpt-oss-20b"]

    def generate():
        stream = None
        error_msg = ""

        for model_name in active_models:
            try:
                stream = client.chat.completions.create(
                    model=model_name,
                    messages=groq_messages,
                    temperature=0.3,
                    max_tokens=1800,
                    stream=True
                )
                break
            except Exception as e:
                error_msg = str(e)
                continue

        if not stream:
            yield f"Connection busy: {error_msg[:100]}. Please retry."
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