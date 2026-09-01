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

app = FastAPI(title="Rishova AI Orchestrator & Document Engine")

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
2. "LEARNING" (User wants to learn a concept from zero, exam prep, practice, or step-by-step tutorial).
3. "BUILDER" (User wants to write code, create an app, build a script, or terminal commands).
4. "CHAT" (General question, reasoning, conversation, or advice).

You must respond with a clean, strictly valid JSON object using this exact structure:
{
  "intent": "DIAGRAM",
  "title": "Title of the task",
  "data": {
     "mermaid": "graph TD\\n  User[User] --> Pay[Payment]",
     "markdown_response": "Full formatted response and explanation here.",
     "commands": [],
     "summary": "Brief 1-line summary"
  }
}
Note for DIAGRAM: Provide ONLY valid Mermaid syntax inside data.mermaid.
Do not output anything outside the JSON object.
"""

def extract_json(text: str):
    """Clean and extract JSON from model output safely"""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    return json.loads(text)

def get_active_model():
    """Dynamically get an active model ID from Groq"""
    try:
        models_data = client.models.list().data
        active_models = [
            m.id for m in models_data 
            if not any(x in m.id for x in ["whisper", "guard", "vision", "embed"])
        ]
        return active_models[0] if active_models else "llama-3.1-70b-versatile"
    except Exception:
        return "llama-3.1-70b-versatile"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Orchestrator & Document Engine is Live"}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        model_id = get_active_model()
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
                {"role": "user", "content": req.prompt}
            ],
            temperature=0.1
        )
        raw_text = completion.choices[0].message.content
        return extract_json(raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/document")
async def handle_document_upload(
    file: UploadFile = File(...),
    prompt: str = Form("Summarize this document and explain key points")
):
    try:
        extracted_text = ""
        filename = file.filename.lower()
        content = await file.read()

        if filename.endswith(".pdf"):
            pdf_reader = PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        else:
            extracted_text = content.decode("utf-8", errors="ignore")

        if not extracted_text.strip():
            extracted_text = f"File {file.filename} was uploaded but contained mostly tabular/binary data or scanned images."

        # Keep context safe
        truncated_text = extracted_text[:12000]

        model_id = get_active_model()
        system_doc_prompt = f"""
You are RISHOVA AI Document Intelligence Agent.
The user has uploaded a document named: '{file.filename}'.

Document Text Extracted:
---
{truncated_text}
---

Provide a clear, detailed, and structured breakdown answering the user's prompt. Use markdown formatting with bullet points and bold highlights.
"""
        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": system_doc_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )

        response_text = completion.choices[0].message.content
        return {
            "intent": "DOCUMENT",
            "filename": file.filename,
            "data": {
                "markdown_response": response_text,
                "mermaid": "",
                "commands": [],
                "summary": f"Analyzed file: {file.filename}"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document processing error: {str(e)}")