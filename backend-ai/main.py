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
You are RISHOVA AI, an elite Senior Full-Stack Software Architect and Universal AI Studio.
When generating code, scripts, or building applications:
1. NEVER compress code into a single line. Always use clean multi-line indentation with newline characters.
2. Put terminal setup commands inside a separate ```bash code block.
3. Put each code file inside its own markdown code block with the appropriate language tag (e.g. ```javascript or ```python). Provide the filename as a comment at the very top of each code block (e.g. // server.js).
4. If providing a folder structure, put it in plain text, NOT inside a programming language code block.
5. Provide complete, working, production-grade code without truncating.

When asked for diagrams:
1. Provide diagram syntax strictly inside a ```mermaid block.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    # Normalize line breaks strictly
    normalized_text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    intent = "CHAT"
    mermaid_code = ""
    code_snippets = []
    language = "javascript"
    commands = []

    # 1. Extract Mermaid Diagrams
    mermaid_match = re.search(r"```mermaid\n([\s\S]*?)```", normalized_text)
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"

    # 2. Extract Terminal Commands strictly (only bash/sh/shell/cmd/powershell)
    bash_blocks = re.findall(r"```(?:bash|sh|shell|cmd|powershell)\s*\n([\s\S]*?)```", normalized_text, re.IGNORECASE)
    for b in bash_blocks:
        for line in b.split("\n"):
            cleaned = line.strip()
            # Ignore comments, empty lines, and non-cli code accidentally placed in bash
            if cleaned and not cleaned.startswith("#") and not any(k in cleaned for k in ["const ", "let ", "var ", "import ", "require(", "function", "{", "}"]):
                commands.append(cleaned)

    # 3. Extract Real Source Code (Ignore folder structures and bash/mermaid)
    code_matches = re.finditer(r"```([a-zA-Z0-9_+-]+)?\n([\s\S]*?)```", normalized_text)
    for m in code_matches:
        lang = (m.group(1) or "").lower()
        block = m.group(2)
        
        # Skip non-source-code blocks
        if lang in ["mermaid", "bash", "sh", "shell", "cmd", "powershell", "text"]:
            continue
        
        # Skip if it looks like a directory tree (contains |-- or ├──)
        if "|--" in block or "├──" in block or "└──" in block:
            continue
            
        if len(block.strip()) > 20:
            code_snippets.append(block.strip())
            if lang and lang not in ["json", "txt"]:
                language = lang
            intent = "BUILDER"

    # Join multiple code files cleanly with dividers for the workspace
    if code_snippets:
        full_code_workspace = "\n\n// " + "="*60 + "\n\n".join(code_snippets)
    else:
        full_code_workspace = ""

    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "develop", "function", "node", "react"]):
        intent = "BUILDER"
    elif any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd"]):
        intent = "DIAGRAM"

    if intent == "BUILDER" and not commands:
        commands = ["npm init -y", "npm install express jsonwebtoken bcryptjs dotenv cors mongoose", "node server.js"]

    return {
        "intent": intent,
        "title": "Rishova Universal Studio Task",
        "data": {
            "mermaid": mermaid_code,
            "markdown_response": normalized_text,
            "code_snippet": full_code_workspace,
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
        active_chat_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

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