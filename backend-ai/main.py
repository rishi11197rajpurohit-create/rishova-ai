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
1. Always put terminal commands inside a separate ```bash code block.
2. Put each file inside its own markdown code block with the appropriate language name (e.g. ```javascript or ```python).
3. Specify the exact file path at the top of each code block as a comment (e.g. // config/database.js).
4. Put folder trees in plain text, never inside programming language code blocks.
5. Provide complete, working, production-grade code without truncating.

When asked for diagrams or flowcharts:
1. Use standard, strict, error-free Mermaid flowchart syntax starting with `graph TD` or `flowchart TD`.
2. NEVER use complex inline styles, CSS classes, or custom classDef directives.
3. Keep node labels clean inside simple quotes if they have spaces (e.g. A["Frontend Client"] --> B["API Gateway"]).
4. Put the syntax strictly inside a ```mermaid code block.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    normalized_text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    intent = "CHAT"
    mermaid_code = ""
    commands = []
    files_map = {}

    # 1. Mermaid diagram
    mermaid_match = re.search(r"```mermaid\s*\n([\s\S]*?)```", normalized_text)
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"

    # 2. Terminal commands
    bash_blocks = re.findall(r"```(?:bash|sh|shell|cmd|powershell)\s*\n([\s\S]*?)```", normalized_text, re.IGNORECASE)
    for b in bash_blocks:
        for line in b.split("\n"):
            cleaned = line.strip()
            if cleaned and not cleaned.startswith("#"):
                if not any(token in cleaned for token in ["const ", "let ", "var ", "import ", "require(", "function", "{", "}", "=>", "class "]):
                    commands.append(cleaned)

    # 3. Source code files
    code_pattern = re.compile(r"```([a-zA-Z0-9_+-]+)?\s*\n([\s\S]*?)```")
    file_idx = 1
    
    for match in code_pattern.finditer(normalized_text):
        lang = (match.group(1) or "").lower()
        content = match.group(2).strip()

        if lang in ["bash", "sh", "shell", "cmd", "powershell", "mermaid", "text"]:
            continue
        
        if "|--" in content or "├──" in content or "└──" in content:
            continue

        if len(content) < 15:
            continue

        first_line = content.split("\n")[0].strip()
        filename = ""
        
        # Simple string check for filename in header comment
        if any(first_line.startswith(prefix) for prefix in ["//", "#", "/*"]):
            clean_first = first_line.replace("//", "").replace("#", "").replace("/*", "").replace("*/", "").strip()
            parts = clean_first.split()
            if parts and "." in parts[0] and len(parts[0]) < 60:
                filename = os.path.basename(parts[0])

        if not filename:
            ext = lang if lang in ["js", "py", "json", "html", "css", "ts"] else ("js" if "javascript" in lang else "txt")
            filename = f"file_{file_idx}.{ext}"

        if filename not in files_map:
            files_map[filename] = {
                "language": lang or "javascript",
                "code": content
            }
            file_idx += 1

    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "node", "react", "express"]):
        intent = "BUILDER"
    elif any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd"]):
        intent = "DIAGRAM"

    primary_code = ""
    primary_lang = "javascript"
    if files_map:
        first_key = list(files_map.keys())[0]
        primary_code = files_map[first_key]["code"]
        primary_lang = files_map[first_key]["language"]

    return {
        "intent": intent,
        "title": "Rishova AI Studio Response",
        "data": {
            "mermaid": mermaid_code,
            "markdown_response": normalized_text,
            "code_snippet": primary_code,
            "files": files_map,
            "language": primary_lang,
            "commands": list(dict.fromkeys(commands)),
            "summary": "Task executed"
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

    raise HTTPException(status_code=500, detail=f"Groq failed: {str(last_err)}")

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
    prompt: str = Form("Analyze document")
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

        truncated_text = extracted_text[:18000]

        doc_system_prompt = f"You are RISHOVA AI Document Intelligence Expert. Analyze '{file.filename}':\n{truncated_text}"
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
                "files": {},
                "language": "",
                "commands": [],
                "summary": f"Analyzed {file.filename}"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))