import os
import io
import re
import base64
import urllib.parse
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
import pdfplumber
from PIL import Image

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
    return {"status": "Rishova AI Live"}

def run_vision_ocr(image_bytes: bytes) -> str:
    """Accurate OCR using Groq Vision"""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.thumbnail((1024, 1024))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64_str}"

        completion = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": "Extract all text precisely: Student/Candidate Name, Course Name, Organization, Issue Date, Certificate ID. Do not skip names."
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                }
            ],
            temperature=0.0,
            max_tokens=600
        )
        return completion.choices[0].message.content.strip()
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
                with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                    for page in pdf.pages[:6]:
                        text = page.extract_text()
                        if text:
                            extracted_text += text + "\n"

                    # If scanned/no selectable text, render first page to image for Vision OCR
                    if len(extracted_text.strip()) < 25 and len(pdf.pages) > 0:
                        pix = pdf.pages[0].to_image(resolution=150).original
                        buf = io.BytesIO()
                        pix.save(buf, format="JPEG")
                        ocr_data = run_vision_ocr(buf.getvalue())
                        if ocr_data:
                            extracted_text = f"[OCR READ DATA]:\n{ocr_data}\n"

            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                ocr_data = run_vision_ocr(content_bytes)
                if ocr_data:
                    extracted_text = f"[OCR READ DATA]:\n{ocr_data}\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Document Attached: {file.filename}]"

            if len(clean_text) > 4000:
                clean_text = clean_text[:4000] + "\n[... Content truncated ...]"

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

def check_image_intent(prompt: str) -> Optional[str]:
    """Catches all variations of image/photo generation requests"""
    p = prompt.lower().strip()
    img_keywords = ["photo", "image", "tasveer", "tasvir", "chitra", "picture"]
    action_keywords = ["banao", "bnao", "bana do", "bna do", "generate", "create", "make", "draw", "dikhao"]

    has_img = any(k in p for k in img_keywords)
    has_action = any(k in p for k in action_keywords)

    if has_img and has_action:
        # Strip generation commands
        clean = re.sub(r'(ek|ki|sundar|photo|image|tasveer|tasvir|chitra|picture|banao|bnao|bana do|bna do|generate|create|make|draw|dikhao|ye)', '', prompt, flags=re.IGNORECASE).strip()
        if len(clean) < 3:
            clean = "majestic royal rajasthani heritage fort golden hour cinematic architecture"
        else:
            clean = f"{clean}, ultra detailed, photorealistic, 8k resolution, cinematic lighting"
        return clean
    return None

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    # Direct Image Generation
    img_prompt = check_image_intent(user_input)
    if img_prompt:
        encoded = urllib.parse.quote(img_prompt)
        image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"
        def serve_image():
            yield f"![{img_prompt}]({image_url})\n\n**यहाँ आपकी माँगी गई फ़ोटो प्रस्तुत है!**"
        return StreamingResponse(serve_image(), media_type="text/plain")

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, built for Rishikesh. You have ChatGPT Plus level precision.\n\n"
            "RULES:\n"
            "1. CERTIFICATE & DOCUMENT VERIFICATION: When user asks about a document, examine the text and state the exact Candidate Name, Course Name, and Organization. Never state that you don't have the data.\n"
            "2. MULTILINGUAL & RAJASTHANI: Mirror the user's language (Hindi, Hinglish, Marwari, English).\n"
            "3. NO METADATA/THINK TAGS: Deliver only the direct response.\n"
            "4. NO LINKS: Do not give search links."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "I don't have the OCR data"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    groq_messages.append({"role": "user", "content": user_input})

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
                    presence_penalty=0.2,
                    frequency_penalty=0.2,
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