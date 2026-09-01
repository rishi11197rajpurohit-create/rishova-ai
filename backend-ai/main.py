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

app = FastAPI(title="Rishova AI Orchestrator & Multi-Agent Engine")

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

You must respond with a clean, strictly valid JSON object using this exact structure:
{
  "intent": "BUILDER",
  "title": "Short Task Title",
  "data": {
     "mermaid": "graph TD\\n  A --> B",
     "markdown_response": "Full formatted response with explanations and file structure.",
     "code_snippet": "// Primary source code here\\nconsole.log('Hello World');",
     "language": "javascript",
     "commands": ["npm install express", "node index.js"],
     "summary": "Brief 1-line summary"
  }
}
Note for BUILDER: Provide the main complete code inside data.code_snippet, the programming language name inside data.language, and terminal commands in data.commands.
Note for DIAGRAM: Provide ONLY valid Mermaid syntax inside data.mermaid.
Do not output anything outside the JSON object.
"""

def extract_json(text: str):
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
    """Ensure reliable and stable Groq production chat models"""
    preferred_models = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"
    ]
    try:
        available = [m.id for m in client.models.list().data]
        for model in preferred_models:
            if model in available:
                return model
        return "llama-3.3-70b-versatile"
    except Exception:
        return "llama-3.3-70b-versatile"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Multi-Agent Engine is Live"}

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

        truncated_text = extracted_text[:20000]
        model_id = get_active_model()

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
3. Respond in a friendly, easy-to-understand tone (Hindi/English mix if prompted in Hindi).
"""

        completion = client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": doc_system_prompt},
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
                "code_snippet": "",
                "language": "",
                "commands": [],
                "summary": f"Deep analysis completed for {file.filename}"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document Intelligence Error: {str(e)}")