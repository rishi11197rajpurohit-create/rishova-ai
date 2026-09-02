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
    model: str = "llama-3.3-70b-versatile"

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an elite Senior Full-Stack Software Architect and Universal AI Studio.

STRICT LANGUAGE & OUTPUT DIRECTIVES:
1. ALWAYS generate ALL code, comments, variable names, functions, documentation, and technical explanations in STRICT, PROFESSIONAL ENGLISH ONLY.
2. NEVER write code comments, identifiers, filenames, or technical guides in Hindi or Hinglish, regardless of the language used in the user prompt.
3. Always place terminal commands inside a separate ```bash code block.
4. Put each file inside its own markdown code block with the appropriate language name (e.g., ```html, ```css, ```javascript, ```python).
5. Specify the exact file name or relative path at the very top of each code block as a comment (e.g., // index.html, /* style.css */, // server.js).
6. Provide complete, production-grade, bug-free implementations without placeholders or truncations.

When requested for diagrams or flowcharts:
1. Use standard Mermaid syntax starting with `graph TD` or `flowchart TD` or `erDiagram`.
2. NEVER use complex inline styles, CSS classes, or custom classDef directives.
3. Keep all node labels in clean English inside simple quotes.
4. Enclose the syntax strictly inside a ```mermaid code block.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    normalized_text = text.replace('\r\n', '\n').replace('\r', '\n')
    
    intent = "CHAT"
    mermaid_code = ""
    commands = []
    files_map = {}

    mermaid_match = re.search(r"```mermaid\s*\n([\s\S]*?)```", normalized_text)
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"
    elif "erDiagram" in normalized_text or "classDiagram" in normalized_text:
        erd_match = re.search(r"```(?:text)?\s*\n((?:erDiagram|classDiagram)[\s\S]*?)```", normalized_text)
        if erd_match:
            mermaid_code = erd_match.group(1).strip()
            intent = "DIAGRAM"

    bash_blocks = re.findall(r"```(?:bash|sh|shell|cmd|powershell)\s*\n([\s\S]*?)```", normalized_text, re.IGNORECASE)
    for b in bash_blocks:
        for line in b.split("\n"):
            cleaned = line.strip()
            if cleaned and not cleaned.startswith("#"):
                if not any(token in cleaned for token in ["const ", "let ", "var ", "import ", "require(", "function", "{", "}", "=>", "class "]):
                    commands.append(cleaned)

    code_pattern = re.compile(r"```([a-zA-Z0-9_+-]+)?\s*\n([\s\S]*?)```")
    file_idx = 1
    
    for match in code_pattern.finditer(normalized_text):
        lang = (match.group(1) or "").lower()
        content = match.group(2).strip()

        if lang in ["bash", "sh", "shell", "cmd", "powershell", "mermaid"]:
            continue
        
        if any(tree_char in content for tree_char in ["|--", "├──", "└──", "📁", "├── ", "└── "]):
            continue
        if any(content.startswith(x) for x in ["ecommerce-api/", "auth-api/", "src/", "user-auth/"]):
            if not any(token in content for token in ["const ", "import ", "def ", "class ", "function", "var ", "{", "<"]):
                continue

        if len(content) < 20:
            continue

        first_lines = [l.strip() for l in content.split("\n")[:3] if l.strip()]
        filename = ""
        
        for line in first_lines:
            clean_l = re.sub(r"^(//|/\*|\*|#|<!--)\s*", "", line)
            clean_l = re.sub(r"\s*(\*/|-->)$", "", clean_l).strip()
            
            match_name = re.search(r"([\w\-./]+\.(html|css|js|jsx|ts|tsx|json|py|sql|sh|md))", clean_l, re.IGNORECASE)
            if match_name:
                filename = os.path.basename(match_name.group(1))
                break

        if not filename:
            content_lower = content.lower()
            if "<!doctype html" in content_lower or "<html" in content_lower:
                filename = "index.html"
            elif lang == "css" or ":root" in content or ("{" in content and ";" in content and ("margin" in content or "color" in content)):
                filename = "style.css"
            elif lang in ["js", "javascript"] and any(k in content for k in ["document.", "addEventListener", "window."]):
                filename = "script.js"
            elif lang in ["json"] or (content.startswith("{") and "name" in content):
                filename = "package.json"
            else:
                ext = lang if lang in ["js", "py", "json", "html", "css", "ts", "sql"] else ("js" if "javascript" in lang else "txt")
                filename = f"file_{file_idx}.{ext}"

        if filename not in files_map:
            files_map[filename] = {
                "language": "css" if filename.endswith(".css") else ("html" if filename.endswith(".html") else (lang or "javascript")),
                "code": content
            }
            file_idx += 1

    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd", "schema"]):
        intent = "DIAGRAM"
    elif any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "node", "react", "express", "portfolio", "page", "html"]):
        intent = "BUILDER"

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

def get_available_groq_models():
    """Dynamically get verified working models from Groq account"""
    try:
        models = client.models.list().data
        valid_chat_models = []
        for m in models:
            mid = m.id.lower()
            if not any(bad in mid for bad in ["whisper", "vision", "embed", "orpheus", "guard", "audio"]):
                valid_chat_models.append(m.id)
        if valid_chat_models:
            return valid_chat_models
    except Exception as e:
        print("Model list error:", e)
    return ["llama-3.3-70b-versatile"]

def run_groq_inference(messages: list, preferred_model: str = "llama-3.3-70b-versatile", temperature: float = 0.2):
    available_models = get_available_groq_models()
    
    # Priority order: Preferred -> Verified list -> Reliable fallbacks
    models_to_try = [preferred_model] + [m for m in available_models if m != preferred_model]
    
    last_error = None
    for model_id in models_to_try:
        try:
            completion = client.chat.completions.create(
                model=model_id,
                messages=messages,
                temperature=temperature
            )
            return completion.choices[0].message.content
        except Exception as e:
            last_error = e
            continue

    raise HTTPException(status_code=500, detail=f"All models failed. Last error: {str(last_error)}")

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
        raw_markdown = run_groq_inference(messages, preferred_model=req.model, temperature=0.2)
        return parse_llm_markdown_response(raw_markdown, req.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/document")
async def handle_document_upload(
    file: UploadFile = File(...),
    prompt: str = Form("Analyze document"),
    model: str = Form("llama-3.3-70b-versatile")
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
        response_text = run_groq_inference(messages, preferred_model=model, temperature=0.2)

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