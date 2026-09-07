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
from pypdf import PdfReader
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
    """Robust OCR using Groq Vision without triggering 400 Bad Request"""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        # Resize to standard size optimal for vision LLMs
        img.thumbnail((1200, 1200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        jpeg_data = buf.getvalue()

        b64_str = base64.b64encode(jpeg_data).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64_str}"

        completion = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": "Read this certificate or document very carefully. Extract and list the EXACT full name of the student/recipient, course name, organization, certificate ID, and issue date."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": data_url
                            }
                        }
                    ]
                }
            ],
            temperature=0.1,
            max_tokens=500
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
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
                pdf_stream = io.BytesIO(content_bytes)
                reader = PdfReader(pdf_stream)
                
                # Step 1: Try reading native text
                for page in reader.pages[:6]:
                    t = page.extract_text()
                    if t:
                        extracted_text += t + "\n"

                # Step 2: If scanned / image PDF, extract image and run Vision OCR
                if len(extracted_text.strip()) < 40:
                    for page in reader.pages[:2]:
                        if hasattr(page, "images") and len(page.images) > 0:
                            for img_obj in page.images:
                                ocr_res = run_vision_ocr(img_obj.data)
                                if ocr_res:
                                    extracted_text += f"\n[HIGH-ACCURACY OCR CERTIFICATE DATA]:\n{ocr_res}\n"
                                    break
                            if extracted_text:
                                break

            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                ocr_res = run_vision_ocr(content_bytes)
                if ocr_res:
                    extracted_text = f"\n[HIGH-ACCURACY OCR CERTIFICATE DATA]:\n{ocr_res}\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Attached document: {file.filename}]"

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

def is_image_generation_request(prompt: str) -> Optional[str]:
    """Catches all variations of image/photo generation in Hindi, Hinglish, & English"""
    p = prompt.lower().strip()
    keywords = [
        "photo banao", "photo bnao", "photo bna do", "photo bana do",
        "image banao", "image bnao", "image bna do", "image bana do",
        "tasveer banao", "tasveer bnao", "chitra banao",
        "generate image", "create image", "make an image", "draw an image",
        "ki photo", "ki image"
    ]
    if any(k in p for k in keywords):
        # Extract core visual subject
        clean = re.sub(r'(ek|ki|sundar|photo|image|tasveer|tasvir|chitra|banao|bnao|bna do|bana do|generate|create|make|draw|dikhao)', '', prompt, flags=re.IGNORECASE).strip()
        if len(clean) < 3:
            clean = "grand royal rajasthani heritage fort palace golden hour cinematic"
        else:
            clean = f"{clean}, cinematic lighting, highly detailed 8k photography"
        return clean
    return None

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    # Instant Image Generation handler (Never delegates to text model)
    img_topic = is_image_generation_request(user_input)
    if img_topic:
        encoded = urllib.parse.quote(img_topic)
        image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"
        def serve_image():
            yield f"![{img_topic}]({image_url})\n\n**यहाँ आपकी माँगी गई फ़ोटो प्रस्तुत है!**"
        return StreamingResponse(serve_image(), media_type="text/plain")

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, created for Rishikesh. You have ChatGPT Plus level precision.\n\n"
            "RULES:\n"
            "1. DOCUMENT & CERTIFICATE ANALYSIS: When the user asks about an attached certificate, extract and state the EXACT recipient name, course name, issuing organization, and dates from the [HIGH-ACCURACY OCR CERTIFICATE DATA]. NEVER invent names or apologize.\n"
            "2. REGIONAL DIALECTS: Reply fluently in Hindi, Hinglish, Marwari (Rajasthani), or English matching user tone.\n"
            "3. NO LINKS: Never return external search links like Unsplash. Provide direct answers.\n"
            "4. CLEAN MARKDOWN: Format details into neat bullet points or tables without leaking <think> tags."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "Here’s a beautiful", "दिए गए PDF को पढ़ने"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    groq_messages.append({"role": "user", "content": user_input})

    # Available dynamic models
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