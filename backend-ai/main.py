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
import fitz  # PyMuPDF for perfect scanned PDF extraction
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
    return {"status": "Rishova AI Engine Active"}

def extract_image_ocr(image_bytes: bytes) -> str:
    """Accurately extract text, candidate name, and credentials using Groq Vision"""
    try:
        # Resize if overly large to stay within Groq limits
        img = Image.open(io.BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        max_dim = 1600
        if max(img.size) > max_dim:
            img.thumbnail((max_dim, max_dim))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        jpeg_bytes = buf.getvalue()

        b64_img = base64.b64encode(jpeg_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64_img}"

        response = client.chat.completions.create(
            model="llama-3.2-11b-vision-preview",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Perform an extremely precise OCR text reading on this certificate/document.\n"
                                "Read and extract:\n"
                                "- EXACT Full Name of the recipient / student (Do NOT guess or shorten)\n"
                                "- Course / Skill Name\n"
                                "- Organization / Issuing Body\n"
                                "- Certificate Number / ID / Date\n"
                                "Output the raw extracted text cleanly."
                            )
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url}
                        }
                    ]
                }
            ],
            temperature=0.0,
            max_tokens=800
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"[OCR Error: {str(e)[:60]}]"

@app.post("/api/upload")
async def extract_multiple_files(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        try:
            content_bytes = await file.read()
            extracted_text = ""
            fname = file.filename.lower()

            if fname.endswith(".pdf"):
                doc = fitz.open(stream=content_bytes, filetype="pdf")
                # 1. First try regular text extraction
                for page in doc:
                    t = page.get_text()
                    if t:
                        extracted_text += t + "\n"

                # 2. If scanned or no selectable text, render first page as image and run Vision OCR
                if len(extracted_text.strip()) < 30:
                    first_page = doc[0]
                    pix = first_page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("png")
                    ocr_res = extract_image_ocr(img_bytes)
                    if ocr_res:
                        extracted_text = f"[HIGH ACCURACY OCR EXTRACTED TEXT]:\n{ocr_res}\n"

                doc.close()

            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                ocr_res = extract_image_ocr(content_bytes)
                if ocr_res:
                    extracted_text = f"[HIGH ACCURACY OCR EXTRACTED TEXT]:\n{ocr_res}\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Document Attached: {file.filename}]"

            if len(clean_text) > 4000:
                clean_text = clean_text[:4000] + "\n[... Truncated ...]"

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

def detect_image_generation(text: str) -> Optional[str]:
    """Robustly detect if the prompt asks to generate/draw/make an image"""
    cleaned = text.replace('"', '').replace("'", "").strip()
    patterns = [
        r"(?:photo|image|tasveer|tasvir|picture)\s+(?:banao|bnao|generate|create|make|dikhao)",
        r"(?:banao|bnao|generate|create|make)\s+(?:photo|image|tasveer|tasvir|picture)",
        r"ye\s+(?:banao|bnao)",
        r"photo\s+chahiye",
        r"tasveer\s+chahiye"
    ]
    is_img = any(re.search(p, cleaned, re.IGNORECASE) for p in patterns)
    if is_img:
        # Strip generation commands to form the core prompt
        prompt_subject = re.sub(r'(ek|ki|sundar|photo|image|tasveer|tasvir|picture|banao|bnao|generate|create|make|draw|dikhao|ye|chahiye)', '', cleaned, flags=re.IGNORECASE).strip()
        if len(prompt_subject) < 3:
            prompt_subject = "Majestic royal Rajasthani heritage palace fort, golden hour cinematic 8k"
        else:
            prompt_subject = f"{prompt_subject}, highly detailed, cinematic lighting, 8k resolution, photorealistic"
        return prompt_subject
    return None

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    # Instant Image Generation handler - bypasses text LLM excuses completely
    img_subject = detect_image_generation(user_input)
    if img_subject:
        encoded = urllib.parse.quote(img_subject)
        image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true"

        def image_stream():
            yield f"![{img_subject}]({image_url})\n\n**यहाँ आपकी माँगी गई फ़ोटो तैयार है!**"
        return StreamingResponse(image_stream(), media_type="text/plain")

    # Standard LLM Chat Handler
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, created for Rishikesh. You possess ChatGPT Plus level factual accuracy.\n\n"
            "STRICT RULES:\n"
            "1. CERTIFICATE / DOCUMENT TRUTH: When answering about an attached document or certificate, ALWAYS cite the exact name, roll number, course, and date found in the [HIGH ACCURACY OCR EXTRACTED TEXT]. NEVER invent or shorten names.\n"
            "2. REGIONAL DIALECTS: Speak Marwari, Rajasthani, Hindi, and English fluently. Mirror user language.\n"
            "3. NO REFUSALS: If user asked for an image, it is handled automatically. In text, answer directly.\n"
            "4. NO INTERNAL THOUGHTS: Never produce <think> tags or reasoning logs."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "AI Server Busy", "माफ़ कीजिए, मैं एक AI"]):
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
                    temperature=0.2,
                    presence_penalty=0.2,
                    frequency_penalty=0.3,
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