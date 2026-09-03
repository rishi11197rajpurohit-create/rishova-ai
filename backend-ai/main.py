import os
import re
import json
from datetime import datetime
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

DB_FILE = "rishova_store.json"

def load_store():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {"projects": {}, "usage": {}}

def save_store(data):
    try:
        with open(DB_FILE, "w") as f:
            json.dump(data, f)
    except:
        pass

class UniversalRequest(BaseModel):
    prompt: str
    model: str = "llama-3.3-70b-versatile"
    user_email: str = "guest"

class SyncProjectsRequest(BaseModel):
    user_email: str
    sessions: list

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an elite Senior Full-Stack Software Architect, Computer Science Professor, and Universal AI Studio.

STRICT LANGUAGE & OUTPUT DIRECTIVES:
1. ALWAYS generate ALL code, comments, explanations, tests, and guides in STRICT, PROFESSIONAL ENGLISH ONLY.
2. Put terminal commands in ```bash code blocks.
3. Put source code in dedicated blocks (```html, ```css, ```javascript, ```python) with file names as the very first line comment (e.g., // index.html, /* style.css */, # script.py).

LEARNING & TEACHING ENGINE DIRECTIVE:
If the user asks to "teach", "learn", "explain from scratch/zero level", or "create a quiz/test":
1. Break down the topic systematically: Concept Roadmap -> Zero-Level Intuition -> Deep Dive Example -> Quick Summary Notes.
2. If interactive practice or quiz is requested, generate an interactive single-page HTML/CSS/JS Quiz App (index.html, style.css, script.js) with clickable options, instant score calculation, and answer explanations so the user can test their knowledge directly in the Preview Sandbox!

CAREER & RESUME STUDIO DIRECTIVE:
If the user asks for a resume, CV, or portfolio, generate a clean ATS-friendly HTML (index.html) and CSS (style.css).

DIAGRAM DIRECTIVE:
If the user asks for a diagram/architecture, enclose standard Mermaid code starting with `graph TD` inside ```mermaid.
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
        if any(tree_char in content for tree_char in ["|--", "├──", "└──", "📁"]):
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
            elif lang == "css" or ":root" in content:
                filename = "style.css"
            elif lang in ["js", "javascript"] and any(k in content for k in ["document.", "addEventListener"]):
                filename = "script.js"
            elif lang in ["py", "python"]:
                filename = f"main_{file_idx}.py"
            else:
                ext = lang if lang in ["js", "py", "json", "html", "css", "ts", "sql"] else "txt"
                filename = f"file_{file_idx}.{ext}"

        if filename not in files_map:
            files_map[filename] = {
                "language": "html" if filename.endswith(".html") else ("css" if filename.endswith(".css") else (lang or "javascript")),
                "code": content
            }
            file_idx += 1

    prompt_lower = user_prompt.lower()
    if any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd", "schema"]):
        intent = "DIAGRAM"
    elif any(k in prompt_lower for k in ["resume", "cv", "portfolio", "cover letter"]):
        intent = "CAREER"
    elif any(k in prompt_lower for k in ["teach", "quiz", "mcq", "learn", "roadmap", "exam prep"]):
        intent = "LEARNING"
    elif any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "python", "calculator", "html"]):
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

def get_active_groq_models():
    try:
        model_list = client.models.list()
        active_ids = [m.id for m in model_list.data if getattr(m, 'active', True)]
        sorted_models = []
        for mid in active_ids:
            if "llama-3.3-70b" in mid:
                sorted_models.insert(0, mid)
            elif "llama" in mid.lower():
                sorted_models.append(mid)
        for mid in active_ids:
            if mid not in sorted_models:
                sorted_models.append(mid)
        return sorted_models
    except Exception as e:
        return ["llama-3.3-70b-versatile"]

def run_groq_inference(messages: list, preferred_model: str = "llama-3.3-70b-versatile", user_email: str = "guest"):
    available_models = get_active_groq_models()
    
    if preferred_model in available_models:
        candidate_models = [preferred_model] + [m for m in available_models if m != preferred_model]
    else:
        candidate_models = available_models
    
    last_error = None
    for model_name in candidate_models:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2
            )
            total_tokens = getattr(completion.usage, "total_tokens", 500) if hasattr(completion, "usage") else 500
            
            store = load_store()
            user_usage = store.get("usage", {}).get(user_email, {"tokens_used": 0, "requests_count": 0})
            user_usage["tokens_used"] += total_tokens
            user_usage["requests_count"] += 1
            if "usage" not in store:
                store["usage"] = {}
            store["usage"][user_email] = user_usage
            save_store(store)

            return completion.choices[0].message.content
        except Exception as err:
            last_error = err
            continue

    raise HTTPException(status_code=500, detail=f"Inference failed: {str(last_error)}")

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Universal Studio is Live"}

@app.get("/api/usage/{user_email}")
def get_user_usage(user_email: str):
    store = load_store()
    user_usage = store.get("usage", {}).get(user_email, {"tokens_used": 0, "requests_count": 0})
    return {
        "user_email": user_email,
        "tokens_used": user_usage.get("tokens_used", 0),
        "requests_count": user_usage.get("requests_count", 0),
        "daily_limit": 50000
    }

@app.post("/api/cloud/sync")
def sync_cloud_projects(req: SyncProjectsRequest):
    store = load_store()
    if "projects" not in store:
        store["projects"] = {}
    store["projects"][req.user_email] = req.sessions
    save_store(store)
    return {"status": "success", "synced_count": len(req.sessions)}

@app.get("/api/cloud/load/{user_email}")
def load_cloud_projects(user_email: str):
    store = load_store()
    sessions = store.get("projects", {}).get(user_email, [])
    return {"status": "success", "sessions": sessions}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": req.prompt}
        ]
        raw_markdown = run_groq_inference(messages, preferred_model=req.model, user_email=req.user_email)
        return parse_llm_markdown_response(raw_markdown, req.prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))