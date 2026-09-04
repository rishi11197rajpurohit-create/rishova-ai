import os
import re
import json
import io
import base64
import urllib.parse
import urllib.request
from typing import List
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

def fetch_live_web_snippets(query: str) -> str:
    snippets = []
    try:
        clean_q = re.sub(r'(search|latest|news|today|current|breakthroughs|in)\s+', '', query, flags=re.IGNORECASE).strip()
        wiki_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={urllib.parse.quote(clean_q)}&limit=3&namespace=0&format=json"
        req = urllib.request.Request(wiki_url, headers={'User-Agent': 'RishovaStudio/1.0 (academic project)'})
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            if len(data) >= 4 and data[2]:
                for desc, link in zip(data[2], data[3]):
                    if desc and len(desc) > 20:
                        snippets.append(f"• {desc} [Source: {link}]")
    except Exception:
        pass

    try:
        ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1&skip_disambig=1"
        req = urllib.request.Request(ddg_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as res:
            ddg_data = json.loads(res.read().decode('utf-8'))
            if ddg_data.get("AbstractText"):
                snippets.append(f"• {ddg_data['AbstractText']} [Source: {ddg_data.get('AbstractURL', 'Web Retrieval')}]")
            for topic in ddg_data.get("RelatedTopics", [])[:2]:
                if isinstance(topic, dict) and topic.get("Text"):
                    snippets.append(f"• {topic['Text']} [Source: {topic.get('FirstURL', 'Web Retrieval')}]")
    except Exception:
        pass

    if snippets:
        return "\n\n--- [LIVE RETRIEVED KNOWLEDGE SOURCES] ---\n" + "\n".join(snippets) + "\n------------------------------------------\n"
    return ""

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an intelligent, helpful, and eloquent AI Studio built by Rishikesh Singh Jagarwal.

STRICT CONVERSATION RULES:
1. NEVER repeat sentences or fall into repetitive loops.
2. NEVER output internal thoughts, chain-of-thought traces, or <think> tags.
3. LANGUAGE HANDLING:
   - Match the user's language naturally (Marwari, Hindi, Hinglish, English, etc.).
4. VIDEO & MEDIA DIRECTIVE (Section 10 & 19):
   When user asks for video lecture, tutorial, masterclass, or video search:
   - Provide direct clickable YouTube and web video search links in Markdown.
   - Output structured academic notes and timestamped chapters in Markdown.
   - Always output a downloadable .srt subtitles code block inside ```srt.
"""

def generate_video_hub_html(topic_title: str) -> str:
    clean_topic = topic_title.replace('"', '').replace("'", "").strip()
    encoded_query = urllib.parse.quote_plus(clean_topic)
    
    yt_search_url = f"[https://www.youtube.com/results?search_query=](https://www.youtube.com/results?search_query=){encoded_query}"
    google_video_url = f"[https://www.google.com/search?tbm=vid&q=](https://www.google.com/search?tbm=vid&q=){encoded_query}"
    mit_url = f"[https://www.youtube.com/results?search_query=](https://www.youtube.com/results?search_query=){encoded_query}+mit+opencourseware"
    fcc_url = f"[https://www.youtube.com/results?search_query=](https://www.youtube.com/results?search_query=){encoded_query}+freecodecamp"

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rishova AI Video Hub</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 20px;
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
    }}
    .hub-card {{
      width: 100%;
      max-width: 820px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 12px 30px rgba(0,0,0,0.6);
    }}
    .badge {{
      display: inline-block;
      background: #0284c7;
      color: #e0f2fe;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 12px;
    }}
    h2 {{
      margin: 0 0 8px 0;
      font-size: 1.3rem;
      color: #38bdf8;
    }}
    p {{
      margin: 0 0 20px 0;
      font-size: 0.9rem;
      color: #a1a1aa;
      line-height: 1.5;
    }}
    .video-grid {{
      display: flex;
      flex-direction: column;
      gap: 12px;
    }}
    .video-link-card {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #27272a;
      border: 1px solid #3f3f46;
      border-radius: 10px;
      padding: 14px 18px;
      text-decoration: none;
      color: #f4f4f5;
      cursor: pointer;
      transition: all 0.2s;
    }}
    .video-link-card:hover {{
      background: #1e293b;
      border-color: #38bdf8;
      transform: translateY(-2px);
    }}
    .card-left {{
      display: flex;
      align-items: center;
      gap: 14px;
    }}
    .card-icon {{
      font-size: 1.6rem;
    }}
    .card-info h4 {{
      margin: 0 0 4px 0;
      font-size: 0.95rem;
      color: #f8fafc;
    }}
    .card-info span {{
      font-size: 0.78rem;
      color: #94a3b8;
    }}
    .play-btn {{
      background: #ef4444;
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .play-btn.google {{
      background: #2563eb;
    }}
    .chapters-section {{
      margin-top: 24px;
      padding-top: 18px;
      border-top: 1px solid #27272a;
    }}
    .chap-title {{
      font-size: 0.85rem;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }}
    .chap-list {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }}
    .chap-pill {{
      background: #18181b;
      border: 1px solid #3f3f46;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      color: #cbd5e1;
    }}
  </style>
</head>
<body>
  <div class="hub-card">
    <span class="badge">&#127916; Multimodal Video Hub</span>
    <h2>Lectures &amp; Video Streams: {clean_topic}</h2>
    <p>Click below to open high-definition verified video streams directly on YouTube and Google Video search:</p>

    <div class="video-grid">
      <a href="{yt_search_url}" target="_blank" rel="noopener noreferrer" class="video-link-card">
        <div class="card-left">
          <div class="card-icon">&#9654;&#65039;</div>
          <div class="card-info">
            <h4>YouTube Top Results ({clean_topic})</h4>
            <span>Full HD video lectures, top channels, and complete tutorials</span>
          </div>
        </div>
        <div class="play-btn">&#9658; Watch on YouTube</div>
      </a>

      <a href="{fcc_url}" target="_blank" rel="noopener noreferrer" class="video-link-card">
        <div class="card-left">
          <div class="card-icon">&#128218;</div>
          <div class="card-info">
            <h4>freeCodeCamp / Complete Masterclass</h4>
            <span>Comprehensive full courses with timestamps and practical code</span>
          </div>
        </div>
        <div class="play-btn">&#9658; Open Course</div>
      </a>

      <a href="{mit_url}" target="_blank" rel="noopener noreferrer" class="video-link-card">
        <div class="card-left">
          <div class="card-icon">&#127979;</div>
          <div class="card-info">
            <h4>MIT &amp; University Academic Lectures</h4>
            <span>Deep computer science theory, architecture, and university slides</span>
          </div>
        </div>
        <div class="play-btn">&#9658; Open Lectures</div>
      </a>

      <a href="{google_video_url}" target="_blank" rel="noopener noreferrer" class="video-link-card">
        <div class="card-left">
          <div class="card-icon">&#128269;</div>
          <div class="card-info">
            <h4>Google Multi-Platform Video Search</h4>
            <span>All web videos across Coursera, YouTube, NPTEL and Vimeo</span>
          </div>
        </div>
        <div class="play-btn google">&#128279; View All Videos</div>
      </a>
    </div>

    <div class="chapters-section">
      <div class="chap-title">&#128193; Syllabus Timeline &amp; Timestamp Navigation</div>
      <div class="chap-list">
        <div class="chap-pill">&#9201; 00:00 1. Introduction &amp; Setup</div>
        <div class="chap-pill">&#9201; 02:30 2. Core Concepts &amp; Architecture</div>
        <div class="chap-pill">&#9201; 06:15 3. Practical Code Implementation</div>
        <div class="chap-pill">&#9201; 12:40 4. Advanced Topics &amp; Optimization</div>
      </div>
    </div>
  </div>
</body>
</html>"""

def parse_llm_markdown_response(text: str, user_prompt: str, is_web_search: bool = False):
    clean_text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    clean_text = re.sub(r"^Here's a thinking process:[\s\S]*?(?=\n\n|\Z)", "", clean_text, flags=re.IGNORECASE)
    normalized_text = clean_text.replace('\r\n', '\n').replace('\r', '\n').strip()

    intent = "CHAT"
    mermaid_code = ""
    commands = []
    files_map = {}

    mermaid_match = re.search(r"```(?:mermaid)?\s*\n?((?:graph|flowchart|sequenceDiagram|erDiagram|classDiagram|stateDiagram)[\s\S]*?)```", normalized_text, re.IGNORECASE)
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"
    else:
        raw_diagram = re.search(r"((?:graph|flowchart)\s+(?:TD|TB|LR|RL)[\s\S]*?)(?:\n\n\n|\Z|```)", normalized_text, re.IGNORECASE)
        if raw_diagram:
            mermaid_code = raw_diagram.group(1).strip()
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
            match_name = re.search(r"([\w\-./]+\.(html|css|js|jsx|ts|tsx|json|py|sql|sh|md|srt|vtt))", clean_l, re.IGNORECASE)
            if match_name:
                filename = os.path.basename(match_name.group(1))
                break

        if not filename:
            content_lower = content.lower()
            if "<!doctype html" in content_lower or "<html" in content_lower or "<video" in content_lower or "hub-card" in content_lower:
                filename = "index.html"
            elif lang == "css" or ":root" in content:
                filename = "style.css"
            elif lang in ["js", "javascript"] and any(k in content for k in ["document.", "addEventListener"]):
                filename = "script.js"
            elif lang in ["py", "python"]:
                filename = f"main_{file_idx}.py"
            elif lang == "srt":
                filename = "subtitles.srt"
            else:
                ext = lang if lang in ["js", "py", "json", "html", "css", "ts", "sql", "srt", "vtt"] else "txt"
                filename = f"file_{file_idx}.{ext}"

        if filename not in files_map:
            files_map[filename] = {
                "language": "html" if filename.endswith(".html") else ("css" if filename.endswith(".css") else (lang or "javascript")),
                "code": content
            }
            file_idx += 1

    prompt_lower = user_prompt.lower()
    
    if mermaid_code or any(k in prompt_lower for k in ["diagram", "flowchart", "architecture", "erd", "schema"]):
        intent = "DIAGRAM"
    elif any(k in prompt_lower for k in ["generate image", "create image", "draw", "photo of", "paint", "फोटो बनाओ", "तस्वीर"]):
        intent = "IMAGE"
    elif any(k in prompt_lower for k in ["video", "youtube", "subtitle", "transcribe video", "video summary", "scene", "masterclass player", "lecture video", "play a video", "videos", "video link"]):
        intent = "VIDEO"
    elif any(k in prompt_lower for k in ["audio", "transcribe", "voice transcript"]):
        intent = "AUDIO"
    elif any(k in prompt_lower for k in ["compare documents", "documents", "multi-file", "pdf summary"]):
        intent = "DOCS"
    elif any(k in prompt_lower for k in ["chart", "data analysis", "visualize", "plot", "graph", "analytics"]):
        intent = "DATA"
    elif any(k in prompt_lower for k in ["resume", "cv", "portfolio"]):
        intent = "CAREER"
    elif any(k in prompt_lower for k in ["teach", "quiz", "mcq", "learn", "roadmap", "exam prep"]):
        intent = "LEARNING"
    elif is_web_search or any(k in prompt_lower for k in ["search", "latest", "today", "news", "current", "weather", "price"]):
        intent = "RESEARCH"
    elif any(k in prompt_lower for k in ["build", "create", "api", "code", "app", "python", "calculator", "html"]):
        intent = "BUILDER"

    if intent == "VIDEO":
        topic_name = re.sub(r'(video|player|lecture|tutorial|play|a|on|for|videos|links)\s+', ' ', user_prompt, flags=re.IGNORECASE).strip().title()
        if len(topic_name) < 3:
            topic_name = "Programming & Technology Lectures"
        files_map["index.html"] = {
            "language": "html",
            "code": generate_video_hub_html(topic_name)
        }

    if intent == "IMAGE" and "![" not in normalized_text:
        clean_img_prompt = urllib.parse.quote(re.sub(r'(generate|create|draw|paint|an|image|of|photo|तस्वीर|फोटो|बनाओ)\s+', '', user_prompt, flags=re.IGNORECASE).strip())
        img_markdown = f"\n\n![Generated Image](https://image.pollinations.ai/prompt/{clean_img_prompt}?width=1024&height=1024&nologo=true)\n\n"
        normalized_text = img_markdown + normalized_text

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
    except Exception:
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
                temperature=0.4,
                top_p=0.9,
                max_tokens=2048,
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
        user_prompt = req.prompt.strip()
        is_web_query = any(k in user_prompt.lower() for k in ["search", "latest", "today", "news", "current", "weather", "breakthroughs", "price"])
        
        web_context = ""
        if is_web_query:
            web_context = fetch_live_web_snippets(user_prompt)

        final_prompt = user_prompt + ("\n" + web_context if web_context else "")

        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": final_prompt}
        ]
        raw_markdown = run_groq_inference(messages, preferred_model=req.model, user_email=req.user_email)
        return parse_llm_markdown_response(raw_markdown, req.prompt, is_web_search=is_web_query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/documents-multi")
async def handle_multi_document_prompt(
    files: List[UploadFile] = File(...),
    prompt: str = Form("Analyze these files"),
    model: str = Form("llama-3.3-70b-versatile"),
    user_email: str = Form("guest")
):
    try:
        combined_text_corpus = []
        has_image = False
        image_base64 = None

        for file in files:
            content = await file.read()
            filename = file.filename.lower()

            if filename.endswith((".png", ".jpg", ".jpeg", ".webp")):
                has_image = True
                image_base64 = base64.b64encode(content).decode("utf-8")
                combined_text_corpus.append(f"=== ATTACHED IMAGE: {file.filename} ===")

            elif filename.endswith((".mp3", ".wav", ".m4a", ".ogg")):
                try:
                    transcription = client.audio.transcriptions.create(
                        file=(file.filename, io.BytesIO(content)),
                        model="whisper-large-v3-turbo",
                        response_format="text",
                        language="en"
                    )
                    combined_text_corpus.append(f"=== AUDIO TRANSCRIPT ({file.filename}) ===\n{transcription}\n")
                except Exception as ex:
                    combined_text_corpus.append(f"=== AUDIO FILE ({file.filename}) ===\n(Audio Transcription notes: {ex})\n")

            elif filename.endswith(".pdf"):
                try:
                    pdf_reader = PdfReader(io.BytesIO(content))
                    pages_text = [p.extract_text() or "" for p in pdf_reader.pages[:10]]
                    extracted_text = "\n".join(pages_text)
                    combined_text_corpus.append(f"=== DOCUMENT: {file.filename} ===\n{extracted_text[:4000]}\n")
                except Exception as ex:
                    combined_text_corpus.append(f"Error reading PDF {file.filename}: {ex}")

            else:
                try:
                    extracted_text = content.decode("utf-8", errors="ignore")
                    combined_text_corpus.append(f"=== DOCUMENT: {file.filename} ===\n{extracted_text[:4000]}\n")
                except Exception as ex:
                    combined_text_corpus.append(f"Error reading file {file.filename}: {ex}")

        if has_image and image_base64:
            vision_messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"{prompt}\n\nIf this image contains a diagram, flowchart, or architecture, convert it into clean Mermaid.js code starting with `graph TD` in ```mermaid. If it contains text or a certificate, extract it accurately using OCR."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                    ]
                }
            ]
            try:
                completion = client.chat.completions.create(
                    model="llama-3.2-11b-vision-preview",
                    messages=vision_messages,
                    temperature=0.2
                )
                raw_markdown = completion.choices[0].message.content
                return parse_llm_markdown_response(raw_markdown, prompt)
            except Exception as e:
                pass

        full_doc_context = "\n".join(combined_text_corpus)
        composed_prompt = (
            f"User Instruction: {prompt}\n\n"
            f"Attached Files & Content:\n{full_doc_context}\n\n"
            f"Synthesize, extract, transcribe, or compare as requested without repetition."
        )

        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": composed_prompt}
        ]
        raw_markdown = run_groq_inference(messages, preferred_model=model, user_email=user_email)
        return parse_llm_markdown_response(raw_markdown, prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))