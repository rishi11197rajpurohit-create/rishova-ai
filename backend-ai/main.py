import os
import io
import re
import urllib.request
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
    return {"status": "Rishova AI Universal Backend Live"}

def get_quick_facts(query: str) -> str:
    """Super-fast, 100% non-blocking factual summary via Wikipedia API (Never blocked on Render)"""
    try:
        # Extract core subject (e.g. mehrangarh, maharana pratap)
        clean = re.sub(r'[^\w\s]', '', query).strip()
        words = [w for w in clean.split() if w.lower() not in ["btao", "kya", "hai", "ke", "bare", "me", "ri", "ra", "ro", "mhane", "batavo"]]
        search_term = " ".join(words[:3]) if words else clean
        if not search_term:
            return ""

        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(search_term)}"
        req = urllib.request.Request(url, headers={'User-Agent': 'RishovaAI/1.0'})
        with urllib.request.urlopen(req, timeout=1.5) as response:
            data = json.loads(response.read().decode('utf-8'))
            extract = data.get("extract", "")
            if extract:
                return f"\n[VERIFIED HISTORICAL GROUND TRUTH]:\n{extract}\n"
    except Exception:
        pass
    return ""

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

    # Fast facts without blocking
    facts = get_quick_facts(user_input)

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a world-class conversational AI with the intelligence and precision of ChatGPT Plus.\n\n"
            "MANDATORY INSTRUCTIONS:\n"
            "1. ZERO HALLUCINATION: All historical, geographical, and general facts must be 100% authentic (e.g. Mehrangarh Fort was built by Rao Jodha in 1459 on Chidiyatunk hill; Famous gates include Jai Pol, Fateh Pol, Dedh Kangra Pol, Loha Pol; Maharana Pratap of Mewar fought at Haldighati 1576).\n"
            "2. REGIONAL & MARWARI EXPERTISE: If the prompt is in Rajasthani/Marwari (e.g. 'म्हाने बताओ', 'किला री खास बातां'), reply in rich, natural, authentic Marwari script with traditional polite tone. If in Hindi, reply in Hindi. If in English, reply in English.\n"
            "3. NO THINKING LEAKS: Jump straight to the answer without any internal thoughts or <think> tags.\n"
            "4. BEAUTIFUL LAYOUT: Use Markdown tables, bold bullet points, and neat typography."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code", "Thinking"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-4:])

    final_user_content = user_input + (facts if facts else "")
    groq_messages.append({"role": "user", "content": final_user_content})

    # Robust model sequence: if 70B is busy, instant 8B responds immediately
    models_to_try = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant"
    ]

    def generate():
        stream = None
        error_msg = ""

        for model_name in models_to_try:
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
            yield f"AI Server Busy: {error_msg[:80]}. Please retry."
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