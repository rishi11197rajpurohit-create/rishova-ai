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
                for page in reader.pages[:10]:
                    text = page.extract_text()
                    if text:
                        extracted_text += text + "\n"
            else:
                extracted_text = content_bytes.decode("utf-8", errors="ignore")

            clean_text = extracted_text.strip()
            if not clean_text:
                clean_text = f"[Scanned/Image document attached: {file.filename}]"

            if len(clean_text) > 4000:
                clean_text = clean_text[:4000] + "\n[... Document truncated ...]"

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
    system_message = {
        "role": "system",
        "content": (
            "You are Rishova AI, identical in capability and style to ChatGPT Plus. "
            "CRITICAL RULES:\n"
            "1. NEVER output internal thoughts, chain-of-thought, or <think>...</think> tags. Jump directly to the formatted response.\n"
            "2. When presenting data, Excel sheets, or statistics, ALWAYS format them as structured Markdown Tables with clear column headers.\n"
            "3. Use bold headings, bullet points, and numbered lists to make the answer clean, aesthetic, and scannable.\n"
            "4. Respond naturally in Hindi, Hinglish, or English matching the user's input.\n"
            "5. If asked to create an Excel file/table from PDFs, organize the data into rows and columns in a Markdown table."
        )
    }

    groq_messages = [system_message]

    if req.messages and len(req.messages) > 0:
        clean_history = []
        for m in req.messages:
            text = m.content.strip()
            # Strip any past think tags stored in history
            text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
            if text and not any(text.startswith(p) for p in ["Service", "Kripya", "API Error", "Error code"]):
                role = "assistant" if m.role == "assistant" else "user"
                clean_history.append({"role": role, "content": text[:2000]})
        groq_messages.extend(clean_history[-8:])
    else:
        clean_prompt = re.sub(r'<think>.*?</think>', '', req.prompt, flags=re.DOTALL).strip()
        groq_messages.append({"role": "user", "content": clean_prompt[:3500]})

    try:
        available_models = [
            m.id for m in client.models.list().data 
            if not any(b in m.id for b in ["whisper", "guard", "compound", "safeguard", "embed"])
        ]
    except Exception:
        available_models = ["openai/gpt-oss-20b"]

    def generate():
        stream = None
        error_log = ""

        for model_id in available_models:
            try:
                stream = client.chat.completions.create(
                    model=model_id,
                    messages=groq_messages,
                    temperature=0.2,
                    max_tokens=2000,
                    stream=True
                )
                break
            except Exception as e:
                error_log = str(e)
                continue

        if not stream:
            yield f"Service busy. Details: {error_log[:100]}"
            return

        in_think_block = False
        buffer = ""

        try:
            for chunk in stream:
                token = chunk.choices[0].delta.content or ""
                if not token:
                    continue

                buffer += token

                # Clean <think> tags dynamically during stream
                if "<think>" in buffer:
                    in_think_block = True
                
                if in_think_block:
                    if "</think>" in buffer:
                        # Extract everything after </think>
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