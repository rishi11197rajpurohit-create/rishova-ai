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
    return {"status": "Rishova AI Universal Backend Live"}

def get_live_web_context(query: str) -> str:
    """Silently fetch live web search facts to eliminate hallucinations without user intervention."""
    # Check if query likely needs factual verification (history, places, current events, facts)
    clean_q = re.sub(r'[^\w\s]', '', query).strip()
    if len(clean_q) < 4:
        return ""
    try:
        results = []
        with DDGS() as ddgs:
            # Search top 3 authoritative search results
            for r in ddgs.text(clean_q, max_results=3):
                title = r.get("title", "")
                body = r.get("body", "")
                results.append(f"Source [{title}]: {body}")
        if results:
            return "\n\n[LIVE VERIFIED WEB CONTEXT - USE THIS AS ABSOLUTE GROUND TRUTH FOR FACTS]:\n" + "\n".join(results)
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
    user_input = req.prompt.strip()

    # Step 1: Automatically gather live web facts in the background (Silent Web Grounding)
    web_knowledge = get_live_web_context(user_input)

    # Step 2: System prompt with complete Rajasthani dialect suite & strict factuality
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, a world-class assistant with the reasoning depth and factual precision of ChatGPT Plus and Gemini.\n\n"
            "STRICT RULES OF ACCURACY & DIALECTS:\n"
            "1. ZERO HALLUCINATIONS: Historical facts, dynasties, rulers, and dates MUST be 100% accurate (e.g. Mehrangarh Fort was founded in 1459 by Rao Jodha; Maharana Pratap fought Akbar/Man Singh at Haldighati in 1576 and was of the Sisodia dynasty of Mewar). Strictly adhere to the verified web context provided.\n"
            "2. COMPLETE RAJASTHANI & GLOBAL LANGUAGE MASTERY: Fluently speak and understand all dialects of Rajasthan including Marwari (जोधपुर/बीकानेर/बाड़मेर), Mewari (उदयपुर/चित्तौड़गढ़), Dhundhari (जयपुर/दौसा), Shekhawati (सीकर/झुंझुनूं/चुरू), Hadoti (कोटा/बूंदी), Wagdi (डूंगरपुर/बांसवाड़ा), along with Hindi, Hinglish, English, and all Indian & world languages.\n"
            "3. MIRROR THE USER'S EXACT TONE: If the user asks in Marwari/Rajasthani, respond in pure, authentic Rajasthani/Marwari while keeping all historical facts impeccably accurate.\n"
            "4. SEAMLESS OPERATION: Never disclose or announce that you used web search or background browsing. Give the answer directly and naturally.\n"
            "5. NO THINKING LEAKS: Never print internal notes, planning, drafts, or <think> tags.\n"
            "6. CLEAN FORMATTING: Structure answers with neat Markdown tables, bold headers, and crisp bullet points."
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

    # Inject live web context directly into the prompt without breaking conversation flow
    final_user_content = user_input + web_knowledge
    groq_messages.append({"role": "user", "content": final_user_content})

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
                    temperature=0.2,          # Low temperature ensures strict fact adherence
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
            yield f"Service busy. Please retry in a moment: {error_log[:100]}"
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