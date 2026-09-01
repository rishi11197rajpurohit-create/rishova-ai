import os
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
You are RISHOVA AI, an intelligent universal software architect and task orchestrator.
When responding to user requests:
1. If the user asks to build an app, API, code, or software, provide:
   - Clear markdown explanation and directory structure.
   - Complete working source code in standard markdown code blocks (e.g., ```javascript or ```python).
   - Terminal setup/installation commands inside a ```bash block.
2. If the user asks for a diagram, architecture flow, flowchart, or ERD:
   - Provide the diagram strictly inside a ```mermaid code block.
3. If the user asks a general conceptual or learning question:
   - Provide structured, beautifully formatted markdown explanations with tables and lists.

Write clean, standard markdown directly.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    """Accurately extract Mermaid, Code Snippets, Commands and Intent from Markdown"""
    intent = "CHAT"
    mermaid_code = ""
    code_snippet = ""
    language = "javascript"
    commands = []

    # 1. Check for Mermaid Diagram
    mermaid_match = re.search(r"```(?:mermaid)?\n([\s\S]*?)```", text)
    if "graph " in text or "flowchart " in text or "sequenceDiagram" in text or "classDiagram" in text:
        if mermaid_match and ("graph" in mermaid_match.group(1) or "flowchart" in mermaid_match.group(1) or "sequenceDiagram" in mermaid_match.group(1)):
            mermaid_code = mermaid_match.group(1).strip()
            intent = "DIAGRAM"

    # 2. Extract Bash / Terminal Commands
    bash_matches = re.findall(r"```(?:bash|sh|shell|cmd|powershell)?\n([\s\S]*?)```", text)
    for b in bash_matches:
        lines = [line.strip() for line in b.strip().split("\n") if line.strip() and not line.startswith("#")]
        if lines:
            commands.extend(lines)

    # 3. Extract Primary Code Block
    code_matches = re.finditer(r"```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```", text)
    for m in code_matches:
        lang = (m.group(1) or "").lower()
        block = m.group(2).strip()
        if lang not in ["mermaid", "bash", "sh", "shell", "cmd", "powershell", "json"] and len(block) > 40:
            code_snippet = block
            language = lang if lang else "javascript"
            intent = "BUILDER"
            break

    # Keyword check for Builder/Diagram intent
    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "develop", "function", "component"]):
        intent = "BUILDER"
    elif any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd", "dfd", "workflow"]):
        intent = "DIAGRAM"

    return {
        "intent": intent,
        "title": "Rishova Universal Task",
        "data": {
            "mermaid": mermaid_code,
            "markdown_response": text,
            "code_snippet": code_snippet,
            "language": language,
            "commands": commands,
            "summary": "Task processed successfully"
        }
    }

def run_groq_inference(messages: list, temperature: float = 0.2):
    """Query currently active chat models on user's API key"""
    active_chat_models = []
    try:
        model_list = client.models.list().data
        for m in model_list:
            mid = m.id.lower()
            if not any(x in mid for x in ["whisper", "vision", "embed", "orpheus", "guard", "audio", "decommissioned"]):
                if getattr(m, 'active', True):
                    active_chat_models.append(m.id)
    except Exception as e:
        print("Model fetch error:", e)

    if not active_chat_models:
        active_chat_models = ["llama-3.1-8b-instant"]

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

    raise HTTPException(status_code=500, detail=f"All Groq models failed: {str(last_err)}")

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
        raw_markdown = run_groq_inference(messages, temperature=0.2)
        return parse_llm_markdown_response(raw_markdown, req.prompt)
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