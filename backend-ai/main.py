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

app = FastAPI(title="Rishova AI Universal Studio")

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
You are RISHOVA AI, an elite Senior Software Architect and Universal AI Studio.
When the user asks to build an application, script, API, or software:
1. Provide a step-by-step setup guide with terminal commands in a ```bash code block.
2. Provide the complete production-grade source code with proper imports, clean architecture, and comments in a code block like ```javascript or ```python.
3. If applicable, provide the project directory structure.

When the user asks for diagrams/architecture:
1. Provide the valid diagram syntax strictly in a ```mermaid block.

Be thorough, clear, and complete. Do not truncate the code.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    intent = "CHAT"
    mermaid_code = ""
    code_snippet_parts = []
    language = "javascript"
    commands = []

    # 1. Mermaid Extraction
    mermaid_match = re.search(r"```mermaid\n([\s\S]*?)```", text)
    if not mermaid_match:
        mermaid_match = re.search(r"```\n(graph [\s\S]*?|flowchart [\s\S]*?|sequenceDiagram[\s\S]*?|classDiagram[\s\S]*?)```", text)
    
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"

    # 2. Bash / Terminal Commands Extraction
    bash_blocks = re.findall(r"```(?:bash|sh|shell|cmd|powershell)\n([\s\S]*?)```", text, re.IGNORECASE)
    for b in bash_blocks:
        lines = [line.strip() for line in b.strip().split("\n") if line.strip() and not line.strip().startswith("#")]
        commands.extend(lines)

    # 3. Source Code Blocks Extraction
    code_matches = list(re.finditer(r"```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```", text))
    for m in code_matches:
        lang = (m.group(1) or "").lower()
        block = m.group(2).strip()
        if lang not in ["mermaid", "bash", "sh", "shell", "cmd", "powershell"]:
            if len(block) > 20:
                code_snippet_parts.append(f"// ==================== [FILE / MODULE] ====================\n\n{block}")
                if lang and lang != "json":
                    language = lang
                intent = "BUILDER"

    combined_code = "\n\n".join(code_snippet_parts) if code_snippet_parts else ""

    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "develop", "function"]):
        intent = "BUILDER"
    elif any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd"]):
        intent = "DIAGRAM"

    if intent == "BUILDER" and not commands:
        commands = ["npm init -y", "npm install express jsonwebtoken bcryptjs dotenv", "node index.js"]

    return {
        "intent": intent,
        "title": "Rishova Universal Studio Task",
        "data": {
            "mermaid": mermaid_code,
            "markdown_response": text,
            "code_snippet": combined_code or text,
            "language": language,
            "commands": commands,
            "summary": "Task processed successfully"
        }
    }

def run_groq_inference(messages: list, temperature: float = 0.2):
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

    raise HTTPException(status_code=500, detail=f"Groq execution failed: {str(last_err)}")

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