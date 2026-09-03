import os
import re
import io
import json
from datetime import datetime
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv
from pypdf import PdfReader
from sqlalchemy import create_engine, Column, String, Text, Integer, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

load_dotenv()

# Database Setup (Persistent SQLite Database)
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./rishova_studio.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ProjectModel(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, index=True)
    user_email = Column(String, index=True, default="guest")
    title = Column(String, default="New Project")
    data_json = Column(Text, default="{}")
    updated_at = Column(DateTime, default=datetime.utcnow)

class TokenUsageModel(Base):
    __tablename__ = "token_usage"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True, default="guest")
    tokens_used = Column(Integer, default=0)
    requests_count = Column(Integer, default=0)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
    user_email: str = "guest"

class SyncProjectsRequest(BaseModel):
    user_email: str
    sessions: list

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
            elif lang == "css" or ":root" in content or ("{" in content and "color" in content):
                filename = "style.css"
            elif lang in ["js", "javascript"] and any(k in content for k in ["document.", "addEventListener", "window."]):
                filename = "script.js"
            elif lang in ["json"] or (content.startswith("{") and "name" in content):
                filename = "package.json"
            else:
                ext = lang if lang in ["js", "py", "json", "html", "css", "ts", "sql"] else "js"
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

def run_groq_inference(messages: list, preferred_model: str = "llama-3.3-70b-versatile", user_email: str = "guest", db: Session = None):
    # Valid verified models on Groq
    candidate_models = [
        preferred_model,
        "llama-3.3-70b-versatile",
        "llama3-70b-8192",
        "llama3-8b-8192",
        "mixtral-8x7b-32768"
    ]
    
    # Remove duplicates preserving order
    unique_candidates = list(dict.fromkeys(candidate_models))
    
    last_error = None
    for model_name in unique_candidates:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.2
            )
            total_tokens = getattr(completion.usage, "total_tokens", 500) if hasattr(completion, "usage") else 500
            
            # Track usage in database
            if db:
                try:
                    usage = db.query(TokenUsageModel).filter(TokenUsageModel.user_email == user_email).first()
                    if not usage:
                        usage = TokenUsageModel(user_email=user_email, tokens_used=total_tokens, requests_count=1)
                        db.add(usage)
                    else:
                        usage.tokens_used += total_tokens
                        usage.requests_count += 1
                    db.commit()
                except Exception as db_err:
                    print(f"DB tracking notice: {db_err}")

            return completion.choices[0].message.content
        except Exception as err:
            last_error = err
            print(f"Model {model_name} failed: {err}. Trying next candidate...")
            continue

    raise HTTPException(status_code=500, detail=f"All AI engine models failed. Last error: {str(last_error)}")