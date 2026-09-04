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

def find_youtube_video_id(query: str) -> str:
    """Finds a real YouTube Video ID for any topic query or extracts it from a URL"""
    # 1. Direct URL detection
    url_match = re.search(r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})', query)
    if url_match:
        return url_match.group(1)

    # 2. Search YouTube HTML to get the top matching video ID
    try:
        clean_search = re.sub(r'(video|player|lecture|tutorial|masterclass|watch|show|play|of|on|about|for)\s+', ' ', query, flags=re.IGNORECASE).strip()
        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(clean_search)}"
        req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=4) as response:
            html = response.read().decode('utf-8')
            video_ids = re.findall(r'/watch\?v=([a-zA-Z0-9_-]{11})', html)
            if video_ids:
                return video_ids[0]
    except Exception:
        pass

    # Topic-specific fallbacks
    q_low = query.lower()
    if "python" in q_low:
        return "_uQrJ0TkZlc"
    elif "operating system" in q_low or "concurrency" in q_low or "deadlock" in q_low:
        return "26QPDBe-NB8"
    elif "react" in q_low or "javascript" in q_low:
        return "bMknfKXIFA8"
    elif "java" in q_low:
        return "eIrMbAQSU34"
    elif "ai" in q_low or "machine learning" in q_low:
        return "aircAruvnKk"
    return "26QPDBe-NB8"

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an intelligent, helpful, and eloquent AI Studio built by Rishikesh Singh Jagarwal.

STRICT CONVERSATION RULES:
1. When user asks for any video, tutorial, or lecture, NEVER say "I cannot play videos". You have a full live YouTube-powered Video Studio right in the Preview tab.
2. NEVER repeat sentences or fall into repetitive loops.
3. Output clean, polite, and helpful explanations in the user's language (Marwari, Hindi, Hinglish, or English).
4. For video requests: Provide a structured breakdown of the lecture (Summary, Key Takeaways, Timestamped Chapters), and include a downloadable .srt subtitle code block in ```srt.
"""

def generate_video_studio_html(video_id: str, topic_title: str) -> str:
    clean_title = topic_title.replace('"', '\\"').replace("'", "\\'")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rishova AI Video Studio</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      padding: 16px;
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
    }}
    .video-card {{
      width: 100%;
      max-width: 820px;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 12px 30px rgba(0,0,0,0.6);
    }}
    .player-container {{
      position: relative;
      width: 100%;
      height: 400px;
      background: #000;
    }}
    iframe {{
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }}
    .meta-box {{
      padding: 18px;
    }}
    h2 {{
      margin: 0 0 6px 0;
      font-size: 1.2rem;
      color: #38bdf8;
    }}
    p {{
      margin: 0 0 14px 0;
      font-size: 0.88rem;
      color: #a1a1aa;
      line-height: 1.4;
    }}
    .chapters-title {{
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #71717a;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .chapters-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }}
    .chap-btn {{
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #f4f4f5;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.82rem;
      text-align: left;
      transition: all 0.2s;
    }}
    .chap-btn:hover, .chap-btn.active {{
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }}
    .status-badge {{
      display: inline-block;
      background: #064e3b;
      color: #6ee7b7;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      margin-bottom: 8px;
    }}
  </style>
</head>
<body>
  <div class="video-card">
    <div class="player-container">
      <iframe 
        id="lectureVideo" 
        src="[https://www.youtube-nocookie.com/embed/](https://www.youtube-nocookie.com/embed/){video_id}?enablejsapi=1&autoplay=1&mute=0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen>
      </iframe>
    </div>

    <div class="meta-box">
      <span class="status-badge">● Live Streaming Video & Audio (YouTube HD)</span>
      <h2>🎬 {clean_title}</h2>
      <p>Original continuous audio-visual lecture loaded directly in your Rishova workspace. Click any chapter to jump to that part:</p>

      <div class="chapters-title">📑 Video Chapters & Topics</div>
      <div class="chapters-grid">
        <button class="chap-btn active" onclick="seekVideo(0, this)">⏱ 00:00 1. Introduction & Overview</button>
        <button class="chap-btn" onclick="seekVideo(120, this)">⏱ 02:00 2. Core Concepts & Foundations</button>
        <button class="chap-btn" onclick="seekVideo(360, this)">⏱ 06:00 3. Detailed Walkthrough</button>
        <button class="chap-btn" onclick="seekVideo(600, this)">⏱ 10:00 4. Practical Implementation</button>
        <button class="chap-btn" onclick="seekVideo(900, this)">⏱ 15:00 5. Summary & Key Takeaways</button>
      </div>
    </div>
  </div>

  <script>
    function seekVideo(seconds, btn) {{
      document.querySelectorAll('.chap-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      const iframe = document.getElementById('lectureVideo');
      iframe.src = "[https://www.youtube-nocookie.com/embed/](https://www.youtube-nocookie.com/embed/){video_id}?enablejsapi=1&autoplay=1&mute=0&start=" + seconds;
    }}
  </script>
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
            if "<!doctype html" in content_lower or "<html" in content_lower or "<video" in content_lower or "<iframe" in content_lower:
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
    elif any(k in prompt_lower for k in ["video", "youtube", "subtitle", "transcribe video", "video summary", "scene", "masterclass player", "lecture video"]):
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

    # Automatically fetch and embed the actual video for the exact user question
    if intent == "VIDEO":
        vid_id = find_youtube_video_id(user_prompt)
        topic_name = user_prompt.replace("video", "").replace("lecture", "").replace("player", "").strip().title()
        if len(topic_name) < 3:
            topic_name = "Video Learning Masterclass"
        files_map["index.html"] = {
            "language": "html",
            "code": generate_video_studio_html(vid_id, topic_name)
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