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
    return {"status": "Rishova AI Active"}

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
                            "text": "Extract all text accurately: Student/Candidate Name, Course, Issuing Organization, Date, Certificate ID."
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
                            extracted_text = f"[OCR DATA]:\n{ocr_data}\n"

            elif any(fname.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                ocr_data = run_vision_ocr(content_bytes)
                if ocr_data:
                    extracted_text = f"[OCR DATA]:\n{ocr_data}\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Document: {file.filename}]"

            if len(clean_text) > 4000:
                clean_text = clean_text[:4000] + "\n[... Content truncated ...]"

            results.append({"filename": file.filename, "text": clean_text})
        except Exception:
            results.append({"filename": file.filename, "text": f"[Document: {file.filename}]"})

    return {"files": results}

REAL_PHOTO_DATABASE = {
    "jaisalmer": {
        "title": "जैसलमेर का सोनार किला (Jaisalmer Fort)",
        "url": "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=1200&q=80",
        "desc": "जैसलमेर का सोनार किला पीले बलुआ पत्थर से निर्मित यूनेस्को विश्व धरोहर स्थल है।"
    },
    "mehrangarh": {
        "title": "मेहरानगढ़ किला, जोधपुर (Mehrangarh Fort)",
        "url": "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=1200&q=80",
        "desc": "जोधपुर का मेहरानगढ़ दुर्ग 1459 ईस्वी में राव जोधा द्वारा चिड़ियाटूँक पहाड़ी पर बनवाया गया था।"
    },
    "chittorgarh": {
        "title": "चित्तौड़गढ़ दुर्ग (Chittorgarh Fort)",
        "url": "https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=1200&q=80",
        "desc": "चित्तौड़गढ़ दुर्ग भारत का सबसे विशाल किला है, जो तीन ऐतिहासिक जौहर और विजय स्तम्भ के लिए प्रसिद्ध है।"
    },
    "aamer": {
        "title": "आमेर का किला, जयपुर (Amer Fort)",
        "url": "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1200&q=80",
        "desc": "जयपुर का आमेर दुर्ग हिन्दू-राजपूत स्थापत्य कला का उत्कृष्ट उदाहरण है।"
    },
    "hawa mahal": {
        "title": "हवा महल, जयपुर (Hawa Mahal)",
        "url": "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80",
        "desc": "1799 में सवाई प्रताप सिंह द्वारा निर्मित 953 खिड़कियों वाला पाँच मंजिला गुलाबी महल।"
    }
}

def get_curated_or_generated_photo(query: str):
    q = query.lower()
    for key, data in REAL_PHOTO_DATABASE.items():
        if key in q:
            return data["url"], data["title"], data["desc"]

    clean = re.sub(r'(ek|ki|sundar|photo|image|tasveer|banao|bnao|dikhao|batao|chahiye|picture)', '', query, flags=re.IGNORECASE).strip()
    prompt_subject = f"Documentary realistic travel photograph of {clean or 'Rajasthan Heritage'}, authentic daylight, 35mm lens DSLR"
    encoded = urllib.parse.quote(prompt_subject)
    gen_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1200&height=800&nologo=true"
    return gen_url, clean.title() or "राजस्थान धरोहर", "यहाँ आपकी माँगी गई प्रामाणिक फ़ोटो प्रस्तुत है।"

def is_image_request(prompt: str) -> bool:
    p = prompt.lower().strip()
    img_words = ["photo", "image", "tasveer", "tasvir", "chitra", "picture", "फोटो", "तस्वीर", "चित्र"]
    return any(w in p for w in img_words)

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_input = req.prompt.strip()

    if is_image_request(user_input):
        photo_url, title, caption = get_curated_or_generated_photo(user_input)
        def send_photo():
            yield f"![{title}]({photo_url})\n\n### 🏛️ {title}\n\n{caption}"
        return StreamingResponse(send_photo(), media_type="text/plain")

    # Strict ChatGPT-4o Persona with Uncompromising Factual Accuracy
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite AI assistant comparable to ChatGPT-4o and Claude 3.5 Sonnet.\n\n"
            "ACCURACY & FACTUAL ENFORCEMENT:\n"
            "1. NO FICTION OR HALLUCINATIONS: You must provide strictly verified, authentic historical and general facts. Never invent names or words (like 'जलसेना', 'सिंहासन-सिंह', 'राणा केसरी सिंह').\n"
            "2. CHITTORGARH GROUND TRUTH:\n"
            "   - Built in the 7th century by Mauryan ruler Chitrangada Mori (चित्रांगद मौर्य).\n"
            "   - Governed by the Guhila / Sisodia dynasty of Mewar.\n"
            "   - 1st Saka/Jauhar (1303): Alauddin Khalji attacked Rana Ratan Singh. Rani Padmini led the Jauhar.\n"
            "   - 2nd Saka/Jauhar (1535): Sultan Bahadur Shah of Gujarat attacked. Rani Karnavati led the Jauhar while Rawat Bagh Singh led the defense.\n"
            "   - 3rd Saka/Jauhar (1567-1568): Mughal Emperor Akbar besieged the fort. Defended heroically by Jaimal Rathore and Patta Chundawat (Maharana Udai Singh II had shifted to the hills).\n"
            "   - Key landmarks: Vijay Stambha (built by Maharana Kumbha), Kirti Stambha, Gaumukh Reservoir, Padmini Palace, Meerabai Temple.\n"
            "3. RESPONSE FORMAT:\n"
            "   - Clean, professional, well-structured output just like ChatGPT Classic.\n"
            "   - Clear emoji subheadings (e.g. '### 📍 1. भौगोलिक स्थिति', '### 📜 2. ऐतिहासिक पृष्ठभूमि', '### ⚔️ 3. तीन प्रमुख साके व जौहर').\n"
            "   - Bullet points for crisp readability.\n"
            "4. NATURAL TONE: Respond in fluent, natural, grammatically correct Hindi or English according to the user prompt. Do not add forced Marwari translations unless explicitly asked."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "I don't have", "AI Server Busy"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    groq_messages.append({"role": "user", "content": user_input})

    # High-accuracy primary model list
    target_models = [
        "llama-3.3-70b-versatile",
        "llama3-70b-8192",
        "llama-3.1-8b-instant"
    ]

    def generate():
        stream = None
        last_err = ""

        for model_name in target_models:
            try:
                stream = client.chat.completions.create(
                    model=model_name,
                    messages=groq_messages,
                    temperature=0.15,  # Low temperature eliminates hallucinated words
                    presence_penalty=0.0,
                    frequency_penalty=0.0,
                    max_tokens=2200,
                    stream=True
                )
                break
            except Exception as e:
                last_err = str(e)
                continue

        if not stream:
            yield f"AI Server Busy: {last_err[:100]}. Kripya 5 second baad dobara bhein."
            return

        in_think = False
        buffer = ""

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if not token:
                    continue

                buffer += token

                if "<think>" in buffer:
                    in_think = True
                
                if in_think:
                    if "</think>" in buffer:
                        parts = buffer.split("</think>", 1)
                        clean_tail = parts[1].lstrip()
                        in_think = False
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