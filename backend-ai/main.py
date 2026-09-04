import os
import re
import json
import io
import base64
import urllib.parse
import urllib.request
from typing import List
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
        req = urllib.request.Request(wiki_url, headers={'User-Agent': 'RishovaStudio/1.0'})
        with urllib.request.urlopen(req, timeout=4) as res:
            data = json.loads(res.read().decode('utf-8'))
            if len(data) >= 4 and data[2]:
                for desc, link in zip(data[2], data[3]):
                    if desc and len(desc) > 20:
                        snippets.append(f"• {desc} [Source: {link}]")
    except Exception:
        pass

    if snippets:
        return "\n\n--- [LIVE WEB SOURCES] ---\n" + "\n".join(snippets) + "\n-------------------------\n"
    return ""

SYSTEM_ORCHESTRATOR_PROMPT = """
You are RISHOVA AI, an intelligent studio created by Rishikesh Singh Jagarwal.
- Deliver well-structured responses.
- For video courses, provide readable bullet lists and direct links.
- For PDF questions, cite the source page (e.g., [Source: Page 2]).
"""

def generate_image_studio_html(prompt_text: str, img_url: str, original_url: str = None) -> str:
    original_block = f"""
      <div style="flex: 1; min-width: 280px; text-align: center;">
        <span style="color: #94a3b8; font-size: 0.85rem; font-weight: 600;">📷 ORIGINAL UPLOAD</span>
        <div style="margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #3f3f46; background: #000;">
          <img src="{original_url}" style="width: 100%; height: auto; display: block;" />
        </div>
      </div>
    """ if original_url else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rishova AI Image Studio</title>
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
      justify-content: center;
      min-height: 100vh;
    }}
    .image-card {{
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
      max-width: 800px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      text-align: center;
    }}
    .compare-container {{
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 14px;
      justify-content: center;
    }}
    .action-btn {{
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 10px 22px;
      border-radius: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin-top: 16px;
      transition: background 0.2s;
    }}
    .action-btn:hover {{ background: #0369a1; }}
  </style>
</head>
<body>
  <div class="image-card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span style="background: #3b82f6; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">✨ FLUX AI STUDIO</span>
      <span style="color: #a1a1aa; font-size: 0.8rem;">1024 x 1024 Ultra HD</span>
    </div>
    <div style="color: #cbd5e1; font-size: 0.9rem; margin-top: 10px; font-style: italic;">"{prompt_text}"</div>

    <div class="compare-container">
      {original_block}
      <div style="flex: 1; min-width: 280px; text-align: center;">
        <span style="color: #38bdf8; font-size: 0.85rem; font-weight: 600;">🎨 AI GENERATED / EDITED</span>
        <div style="margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #38bdf8; background: #000;">
          <img src="{img_url}" style="width: 100%; height: auto; display: block;" />
        </div>
      </div>
    </div>

    <a href="{img_url}" target="_blank" download="rishova_ai_image.jpg" class="action-btn">⬇ Download High-Res Image</a>
  </div>
</body>
</html>"""

def parse_llm_markdown_response(text: str, user_prompt: str, original_image_base64: str = None):
    clean_text = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    normalized_text = clean_text.replace('\r\n', '\n').replace('\r', '\n').strip()

    intent = "CHAT"
    mermaid_code = ""
    commands = []
    files_map = {}

    mermaid_match = re.search(r"```(?:mermaid)?\s*\n?((?:graph|flowchart|sequenceDiagram|erDiagram|classDiagram)[\s\S]*?)```", normalized_text, re.IGNORECASE)
    if mermaid_match:
        mermaid_code = mermaid_match.group(1).strip()
        intent = "DIAGRAM"

    prompt_lower = user_prompt.lower()

    if any(k in prompt_lower for k in ["generate image", "create image", "draw", "photo of", "paint", "फोटो बनाओ", "तस्वीर", "edit image", "edit photo", "background change", "add", "remove", "बदलो", "एडिट"]):
        intent = "IMAGE"

    if intent == "IMAGE":
        clean_img_prompt = re.sub(r'(generate|create|draw|paint|an|image|of|photo|picture|edit|तस्वीर|फोटो|बनाओ|करो)\s+', '', user_prompt, flags=re.IGNORECASE).strip()
        if not clean_img_prompt:
            clean_img_prompt = "Indian developer coding in a futuristic cyber studio at night"

        encoded_prompt = urllib.parse.quote(clean_img_prompt)
        generated_img_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&seed=88"

        orig_url = f"data:image/jpeg;base64,{original_image_base64}" if original_image_base64 else None
        files_map["index.html"] = {
            "language": "html",
            "code": generate_image_studio_html(clean_img_prompt, generated_img_url, orig_url)
        }

        edit_text = "✨ **Image Transformed:** I processed your instruction and generated the updated scene below." if original_image_base64 else "✨ **AI Image Generated Successfully:**"
        normalized_text = f"{edit_text}\n\n![Generated Image]({generated_img_url})\n\n**Prompt:** *\"{clean_img_prompt}\"*\n\nSwitch to the **👁️ Preview** tab on the right to view and download it in Ultra HD."

    return {
        "intent": intent,
        "title": "Rishova AI Studio Response",
        "data": {
            "mermaid": mermaid_code,
            "markdown_response": normalized_text,
            "code_snippet": "",
            "files": files_map,
            "language": "html" if intent == "IMAGE" else "javascript",
            "commands": commands,
            "summary": "Task executed"
        }
    }

def run_groq_inference(messages: list, preferred_model: str = "llama-3.3-70b-versatile", user_email: str = "guest"):
    try:
        completion = client.chat.completions.create(
            model=preferred_model,
            messages=messages,
            temperature=0.4,
            max_tokens=2048,
        )
        return completion.choices[0].message.content
    except Exception:
        fallback = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.4,
            max_tokens=2048,
        )
        return fallback.choices[0].message.content

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Universal Studio is Live"}

@app.get("/api/usage/{user_email}")
def get_user_usage(user_email: str):
    store = load_store()
    user_usage = store.get("usage", {}).get(user_email, {"tokens_used": 1546, "requests_count": 5})
    return {
        "user_email": user_email,
        "tokens_used": user_usage.get("tokens_used", 1546),
        "requests_count": user_usage.get("requests_count", 5),
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

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        user_prompt = req.prompt.strip()

        # अगर केवल इमेज जेनरेशन है तो तुरंत इमेज रिटर्न करें
        if any(k in user_prompt.lower() for k in ["generate image", "create image", "draw", "photo of", "फोटो बनाओ", "तस्वीर"]):
            return parse_llm_markdown_response("", user_prompt)

        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
        raw_markdown = run_groq_inference(messages, preferred_model=req.model, user_email=req.user_email)
        return parse_llm_markdown_response(raw_markdown, req.prompt)
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

            elif filename.endswith(".pdf"):
                try:
                    pdf_reader = PdfReader(io.BytesIO(content))
                    for page_idx, page in enumerate(pdf_reader.pages[:15], start=1):
                        txt = page.extract_text() or ""
                        if txt.strip():
                            combined_text_corpus.append(f"--- [PAGE {page_idx}] ---\n{txt[:1200]}\n")
                except Exception as ex:
                    combined_text_corpus.append(f"PDF error: {ex}")

        # अगर यूज़र ने फोटो डाली है और एडिट/बदलने को कहा है (Image Editing / ChatGPT style)
        if has_image and any(k in prompt.lower() for k in ["edit", "change", "add", "remove", "background", "बदलो", "एडिट", "लगाओ", "हटाओ"]):
            vision_messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Describe the main subject of this image and how to modify it based on this instruction: '{prompt}'. Output only a single descriptive text-to-image prompt without formatting."},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}}
                    ]
                }
            ]
            try:
                vision_res = client.chat.completions.create(
                    model="llama-3.2-11b-vision-preview",
                    messages=vision_messages,
                    temperature=0.3
                )
                refined_prompt = vision_res.choices[0].message.content.strip()
            except Exception:
                refined_prompt = prompt

            return parse_llm_markdown_response("", refined_prompt, original_image_base64=image_base64)

        # सामान्य डॉक्यूमेंट एनालिसिस
        full_doc_context = "\n".join(combined_text_corpus)
        messages = [
            {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
            {"role": "user", "content": f"Files context:\n{full_doc_context}\n\nUser Question: {prompt}"}
        ]
        raw_markdown = run_groq_inference(messages, preferred_model=model, user_email=user_email)
        return parse_llm_markdown_response(raw_markdown, prompt)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))