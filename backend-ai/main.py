import os
import io
import re
import base64
import urllib.parse
import urllib.request
import json
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
    return {"status": "Rishova AI Universal Engine Active"}

def fetch_real_web_image(query: str):
    """Fetches high-resolution authentic camera photos from Wikimedia Commons / Wikipedia API"""
    try:
        clean = re.sub(r'(ek|ki|sundar|photo|image|tasveer|tasvir|chitra|picture|banao|bnao|dikhao|batao|dikhaye|de|kile|kila|fort)', '', query, flags=re.IGNORECASE).strip()
        words = [w for w in clean.split() if w.lower() not in ["ke", "ka", "ra", "ri", "ro", "hai", "me"]]
        search_term = " ".join(words[:2]) if words else clean

        # 1. Search Wikipedia page image
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&generator=search&gsrsearch={urllib.parse.quote(search_term + ' fort')}&gsrlimit=1&pithumbsize=1200"
        req = urllib.request.Request(wiki_url, headers={'User-Agent': 'RishovaAI/1.0 (contact@rishova.ai)'})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            pages = data.get("query", {}).get("pages", {})
            for _, page in pages.items():
                if "thumbnail" in page:
                    return page["thumbnail"]["source"], page.get("title", search_term)

        # 2. Direct Commons Search fallback
        comm_url = f"https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch={urllib.parse.quote(search_term)}&gsrnamespace=6&prop=imageinfo&iiprop=url&gsrlimit=1"
        req2 = urllib.request.Request(comm_url, headers={'User-Agent': 'RishovaAI/1.0'})
        with urllib.request.urlopen(req2, timeout=2.0) as resp2:
            data2 = json.loads(resp2.read().decode('utf-8'))
            pages2 = data2.get("query", {}).get("pages", {})
            for _, page in pages2.items():
                if "imageinfo" in page and len(page["imageinfo"]) > 0:
                    return page["imageinfo"][0]["url"], search_term
    except Exception:
        pass
    return None, None

def get_live_web_facts(query: str) -> str:
    """Live web search grounding to ensure 100% factual accuracy in text answers"""
    try:
        clean = re.sub(r'[^\w\s]', '', query).strip()
        words = [w for w in clean.split() if len(w) > 2 and w.lower() not in ["btao", "kya", "hai", "ke", "bare", "me", "photo", "image"]]
        term = " ".join(words[:2]) if words else clean
        if not term:
            return ""

        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(term)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'RishovaAI/1.0'})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            extract = data.get("extract", "")
            if extract:
                return f"\n[LIVE WEB SEARCH FACTS]:\n{extract}\n"
    except Exception:
        pass
    return ""

def run_vision_ocr(image_bytes: bytes) -> str:
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
                            "text": "Extract all text precisely: Student/Candidate Name, Course Name, Organization, Issue Date, Certificate ID."
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

def is_image_request(prompt: str) -> bool:
    p = prompt.lower().strip()
    img_words = ["photo", "image", "tasveer", "tasvir", "chitra", "picture", "फोटो", "तस्वीर", "चित्र"]
    return any(w in p for w in img_words)

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    # REAL WEB PHOTO RETRIEVAL (No fake cartoon AI generation)
    if is_image_request(user_input):
        real_img_url, title = fetch_real_web_image(user_input)
        if real_img_url:
            def send_real_photo():
                yield f"![{title}]({real_img_url})\n\n📷 यह रही **{title}** की असली (Original Camera Web) तस्वीर।"
            return StreamingResponse(send_real_photo(), media_type="text/plain")

    # Live web facts attached to avoid hallucinations
    web_facts = get_live_web_facts(user_input)

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite assistant with live web grounding and ChatGPT Plus factual precision.\n\n"
            "RULES:\n"
            "1. STRICT FACTUAL TRUTH: Always use [LIVE WEB SEARCH FACTS] for dates, history, and places. Never fabricate.\n"
            "2. REGIONAL DIALECTS: Speak Marwari, Rajasthani, Hindi, and English natively.\n"
            "3. NO LEAKS: No internal thoughts or thinking tags.\n"
            "4. NO LINKS: Do not give random hyperlinks in text."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "I don't have"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    groq_messages.append({"role": "user", "content": f"{user_input}\n{web_facts}"})

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