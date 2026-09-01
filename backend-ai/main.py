import os
import json
import re
import io
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from pypdf import PdfReader

load_dotenv()

app = FastAPI(title="Rishova AI Universal Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

class UniversalRequest(BaseModel):
    prompt: str

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an intelligent universal multi-agent task orchestrator.
Analyze the user prompt and classify the intent into one of these types:
1. "DIAGRAM" (User wants an architecture diagram, ERD, DFD, flowchart, or workflow).
2. "BUILDER" (User wants to write code, create an app, build a script, generate a component, or terminal commands).
3. "LEARNING" (User wants to learn a concept from zero, exam prep, practice, or step-by-step tutorial).
4. "CHAT" (General question, reasoning, conversation, or advice).

You must respond ONLY with a valid JSON object matching this schema:
{
  "intent": "BUILDER",
  "title": "Short Task Title",
  "data": {
     "mermaid": "",
     "markdown_response": "Full detailed explanation with architecture and code walkthrough.",
     "code_snippet": "// Primary source code here\\nconsole.log('Hello World');",
     "language": "javascript",
     "commands": ["npm init -y", "npm install express jsonwebtoken bcryptjs dotenv"],
     "summary": "Brief 1-line summary"
  }
}
Note for BUILDER: Place the complete primary source code in data.code_snippet and commands in data.commands.
Note for DIAGRAM: Place ONLY valid Mermaid syntax inside data.mermaid.
"""

def extract_json_safely(text: str):
    """Clean markdown artifacts and parse JSON safely"""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    match = re.search(r'\{.*\}', text, re.DOTALL)
    json_str = match.group(0) if match else text

    try:
        return json.loads(json_str, strict=False)
    except Exception:
        cleaned = re.sub(r'[\x00-\x1f\x7f-\x9f]', lambda m: ' ' if m.group(0) in '\r\n\t' else '', json_str)
        try:
            return json.loads(cleaned, strict=False)
        except Exception:
            return {
                "intent": "BUILDER",
                "title": "Generated Code & Guide",
                "data": {
                    "mermaid": "",
                    "markdown_response": text,
                    "code_snippet": text,
                    "language": "javascript",
                    "commands": [],
                    "summary": "Generated response successfully"
                }
            }

def run_groq_inference(messages: list, temperature: float = 0.1):
    """Dynamically discover currently active chat models on user's API key"""
    active_chat_models = []
    try:
        model_list = client.models.list().data
        for m in model_list:
            mid = m.id.lower()
            # Filter out non-chat, audio, vision, preview, and decommissioned models
            if not any(x in mid for x in ["whisper", "vision", "embed", "orpheus", "guard", "audio", "decommissioned"]):
                if getattr(m, 'active', True):
                    active_chat_models.append(m.id)
    except Exception as e:
        print("Model list fetch error:", e)

    if not active_chat_models:
        active_chat_models = ["llama-3.1-8b-instant", "llama3-8b-8192"]

    last_err = None
    for model_id in active_chat_models:
        try:
            completion = client.chat.completions.create(
                model=model_id,
                messages=messages,
                temperature=temperature
            )
            return completion.choices[0].message.content
        except Exception as e:
            last_err = e
            continue

    raise HTTPException(status_code=500, detail=f"All active Groq models failed: {str(last_err)}")

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Universal Studio is Live"}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": req.prompt}
        ]
        raw_text = run_groq_inference(messages, temperature=0.1)
        return extract_json_safely(raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/document")
async def handle_document_upload(
    file: UploadFile = File(...),
    prompt: str = Form("Summarize this document and extract key metrics, tables, and insights")
):
    try:
        extracted_text = ""
        filename = file.filename.lower()
        content = await file.read()

        if filename.endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(content))
            for idx, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    extracted_text += f"\n--- [PAGE {idx + 1}] ---\n" + page_text
        else:
            extracted_text = content.decode("utf-8", errors="ignore")

        if not extracted_text.strip():
            extracted_text = "Note: The file appears to be an image-based scan or contains unstructured binary data."

        truncated_text = extracted_text[:18000]

        doc_system_prompt = f"""
You are RISHOVA AI - Document Intelligence & Data Analytics Expert.
Analyze the following document named '{file.filename}'.

DOCUMENT CONTENT:
========================================
{truncated_text}
========================================

INSTRUCTIONS:
1. Provide a comprehensive, professional breakdown in response to the user query.
2. Structure your answer using clear Markdown:
   - 📌 **Document Overview & Purpose**
   - 📊 **Key Data / Metrics / Columns (with Markdown Tables if applicable)**
   - 💡 **Key Insights & Analytics Findings**
   - 🎯 **Actionable Takeaways / Recommendations**
3. Respond in a friendly, easy-to-understand tone.
"""

        messages = [
            {"role": "system", "content": doc_system_prompt},
            {"role": "user", "content": prompt}
        ]
        response_text = run_groq_inference(messages, temperature=0.2)

        return {
            "intent": "DOCUMENT",
            "filename": file.filename,
            "data": {
                "markdown_response": response_text,
                "mermaid": "",
                "code_snippet": "",
                "language": "",
                "commands": [],
                "summary": f"Deep analysis completed for {file.filename}"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document Intelligence Error: {str(e)}")