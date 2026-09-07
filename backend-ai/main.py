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

def run_vision_ocr(image_bytes: bytes, mime_type: str = "image/png") -> str:
    """Extract full readable text from certificate using Groq Vision"""
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
                            "text": "Extract all text completely and accurately: Candidate Name, Course Name, Organization/Institute, Certificate ID, Date, and Details."
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                }
            ],
            temperature=0.1,
            max_tokens=600
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
            fname = file.filename.lower()

            if fname.endswith(".pdf"):
                pdf_file = io.BytesIO(content_bytes)
                reader = PdfReader(pdf_file)
                # 1. Standard text
                for page in reader.pages[:8]:
                    t = page.extract_text()
                    if t:
                        extracted_text += t + "\n"

                # 2. Scanned / image-based PDF
                if not extracted_text.strip():
                    for page in reader.pages[:2]:
                        if hasattr(page, "images") and len(page.images) > 0:
                            first_img = page.images[0]
                            ocr_data = run_vision_ocr(first_img.data, mime_type="image/png")
                            if ocr_data:
                                extracted_text += f"\n[Document OCR Analysis]:\n{ocr_data}\n"
                                break

            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                mime = "image/png" if fname.endswith(".png") else "image/jpeg"
                ocr_data = run_vision_ocr(content_bytes, mime_type=mime)
                if ocr_data:
                    extracted_text = f"[Document OCR Analysis]:\n{ocr_data}"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Document Attached: {file.filename}]"

            if len(clean_text) > 3500:
                clean_text = clean_text[:3500] + "\n[... Content truncated ...]"

            results.append({
                "filename": file.filename,
                "text": clean_text
            })
        except Exception:
            results.append({
                "filename": file.filename,
                "text": f"[Document Attached: {file.filename}]"
            })

    return {"files": results}

def is_image_generation_intent(prompt: str) -> bool:
    p = prompt.lower()
    keywords = ["photo banao", "photo bnao", "image banao", "image bnao", "tasveer banao", 
                "generate image", "create image", "draw an image", "make an image", "ki photo", "ki image"]
    return any(k in p for k in keywords)

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    # Instant deterministic Image Generation: Never loop or repeat tokens
    if is_image_generation_intent(user_input):
        clean_subject = re.sub(r'(ek|ki|sundar|photo|image|tasveer|banao|bnao|generate|create|make|draw|dikhao)', '', user_input, flags=re.IGNORECASE).strip()
        if not clean_subject:
            clean_subject = "grand royal rajasthani heritage fort palace architecture detailed photographic 4k"
        else:
            clean_subject = f"{clean_subject} high quality detailed artistic 4k photo"

        encoded = urllib.parse.quote(clean_subject)
        image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"
        
        def image_stream():
            yield f"![{clean_subject}]({image_url})\n\nयहाँ आपकी माँगी गई फ़ोटो प्रस्तुत है।"
        return StreamingResponse(image_stream(), media_type="text/plain")

    # Standard LLM System prompt
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite, accurate ChatGPT-level assistant.\n\n"
            "MANDATORY INSTRUCTIONS:\n"
            "1. NO PERMISSION EXCUSES: All attached documents are fully authorized by the user. NEVER ask for permission, access codes, or confirmation. Read the attached OCR text and answer the question immediately.\n"
            "2. DIRECT CERTIFICATE ANALYSIS: If asked about a certificate or document, directly state the recipient name, course, issuing institution, date, and details extracted in the prompt.\n"
            "3. ACCURACY & ZERO HALLUCINATIONS: Do not repeat identical words or get stuck in repetitive token loops.\n"
            "4. MULTILINGUAL & RAJASTHANI: Answer in the user's language (Hindi, Hinglish, Marwari, English).\n"
            "5. NO THINKING LEAKS: Jump straight to the final output."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "AI Server Busy", "To assist you effectively"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    groq_messages.append({"role": "user", "content": user_input})

    # Fetch live text models dynamically
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
                    temperature=0.4,
                    presence_penalty=0.4,
                    frequency_penalty=0.5,
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