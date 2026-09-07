import os
import io
import re
import asyncio
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from pypdf import PdfReader
from duckduckgo_search import DDGS

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

def sync_search(query: str) -> str:
    try:
        clean_q = re.sub(r'[^\w\s]', '', query).strip()
        if len(clean_q) < 3:
            return ""
        results = []
        with DDGS(timeout=3) as ddgs:
            for r in ddgs.text(clean_q, max_results=3):
                body = r.get("body", "")
                if body:
                    results.append(body)
        if results:
            return "\n[VERIFIED HISTORICAL FACTS FOR CONTEXT]:\n" + "\n".join(results)
    except Exception:
        pass
    return ""

async def get_live_web_context(query: str) -> str:
    try:
        return await asyncio.wait_for(asyncio.to_thread(sync_search, query), timeout=3.0)
    except Exception:
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

    web_knowledge = await get_live_web_context(user_input)

    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, an elite intelligence built for Rishikesh. You have complete expertise in world languages, Indian languages, and regional Rajasthani dialects.\n\n"
            "STRICT RULES:\n"
            "1. FACTUAL RIGOR: Never invent fake names, gates, kings, or architectural details. Example verified facts:\n"
            "   - Mehrangarh Fort: Founded in 1459 by Rao Jodha on Chidiyatunk hill. Famous gates: Jai Pol, Fateh Pol, Dedh Kangra Pol, Loha Pol. Key palaces: Moti Mahal, Phool Mahal, Sheesh Mahal. Houses Chamunda Mata temple.\n"
            "   - Maharana Pratap: Sisodia Rajput ruler of Mewar, battle of Haldighati (1576) against Mughal forces, horse Chetak.\n"
            "2. AUTHENTIC DIALECT MIRRORING: If asked in Marwari (मारवाड़ी), reply purely in natural, authentic Marwari script with traditional polite Rajasthani tone (e.g., 'जोधपुर रो मेहरानगढ़ किलो', 'राव जोधाजी बणवायो', 'घणी घणी खम्मा'). Do not mix broken Hindi.\n"
            "3. NO INTERNAL LEAKS: Output only the final answer directly without any <think> tags or thoughts.\n"
            "4. CLEAN STRUCTURE: Format with neat Markdown tables and clean bullet points."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]) and "कुशवाड़ा" not in text and "पाटी द्वार" not in text:
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:1500]})
        groq_messages.extend(clean_history[-6:])

    final_user_content = user_input + (f"\n\n{web_knowledge}" if web_knowledge else "")
    groq_messages.append({"role": "user", "content": final_user_content})

    # Force 70B parameter flagship model first for flawless reasoning and dialect fluency
    candidate_models = [
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant"
    ]

    def generate():
        stream = None
        error_log = ""

        for model_id in candidate_models:
            try:
                stream = client.chat.completions.create(
                    model=model_id,
                    messages=groq_messages,
                    temperature=0.2,
                    presence_penalty=0.1,
                    frequency_penalty=0.1,
                    max_tokens=2000,
                    stream=True
                )
                break
            except Exception as e:
                error_log = str(e)
                continue

        if not stream:
            yield f"Connection issue. Please retry: {error_log[:100]}"
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