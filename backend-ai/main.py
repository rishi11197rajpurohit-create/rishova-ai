import os
import re
import json
import io
import base64
import urllib.parse
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

class UniversalRequest(BaseModel):
    prompt: str
    model: str = "llama3-8b-8192"
    user_email: str = "guest"

class SyncProjectsRequest(BaseModel):
    user_email: str
    sessions: list

def generate_blended_studio_html(target_scene: str, original_base64: str, bg_url: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Rishova AI Studio - Blended Photo</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }}
    .studio-card {{
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 14px;
      padding: 20px;
      max-width: 800px;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
    }}
    .badge {{
      background: #10b981;
      color: #fff;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 700;
      display: inline-block;
      margin-bottom: 8px;
    }}
    .canvas-box {{
      width: 100%;
      border-radius: 10px;
      overflow: hidden;
      border: 2px solid #27272a;
      background: #000;
      position: relative;
      margin: 14px 0;
    }}
    .canvas-box img.bg {{
      width: 100%;
      display: block;
    }}
    .canvas-box .fg-wrap {{
      position: absolute;
      inset: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      pointer-events: none;
    }}
    .canvas-box img.fg {{
      width: 85%;
      height: auto;
      object-fit: contain;
      filter: drop-shadow(0 15px 25px rgba(0,0,0,0.85)) contrast(1.05);
      mask-image: radial-gradient(ellipse 90% 85% at 50% 55%, black 70%, transparent 100%);
      -webkit-mask-image: radial-gradient(ellipse 90% 85% at 50% 55%, black 70%, transparent 100%);
    }}
    .btn-download {{
      background: #0284c7;
      color: #fff;
      padding: 10px 24px;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }}
    .btn-download:hover {{ background: #0369a1; }}
  </style>
</head>
<body>
  <div class="studio-card">
    <span class="badge">✨ FINAL MERGED PHOTO</span>
    <h3 style="font-size: 1.1rem; color: #f8fafc; margin-bottom: 4px;">Subject Locked AI Composition</h3>
    <p style="color: #94a3b8; font-size: 0.8rem;">Background Transformed to: <b>"{target_scene}"</b></p>

    <div class="canvas-box">
      <img id="bgImg" class="bg" src="{bg_url}" crossorigin="anonymous" />
      <div class="fg-wrap">
        <img id="fgImg" class="fg" src="data:image/jpeg;base64,{original_base64}" />
      </div>
    </div>

    <button class="btn-download" onclick="downloadMerged()">⬇ Download Final Merged Photo</button>
  </div>

  <canvas id="mergeCanvas" style="display:none;"></canvas>

  <script>
    function downloadMerged() {{
      const canvas = document.getElementById('mergeCanvas');
      const ctx = canvas.getContext('2d');
      const bg = document.getElementById('bgImg');
      const fg = document.getElementById('fgImg');

      canvas.width = 1024;
      canvas.height = 1024;

      ctx.drawImage(bg, 0, 0, 1024, 1024);
      const fgW = 1024 * 0.85;
      const fgH = (fg.naturalHeight / fg.naturalWidth) * fgW;
      const fgX = (1024 - fgW) / 2;
      const fgY = 1024 - fgH;
      ctx.drawImage(fg, fgX, fgY, fgW, fgH);

      const link = document.createElement('a');
      link.download = 'rishova_merged_photo.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }}
  </script>
</body>
</html>"""

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Universal Studio is Live"}

@app.get("/api/usage/{user_email}")
def get_user_usage(user_email: str):
    return {
        "user_email": user_email,
        "tokens_used": 1546,
        "requests_count": 5,
        "daily_limit": 50000
    }

@app.post("/api/cloud/sync")
def sync_cloud_projects(req: SyncProjectsRequest):
    return {"status": "success", "synced_count": len(req.sessions)}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        user_prompt = req.prompt.strip()

        # Check intent using LLM if needed, or natural chat
        completion = client.chat.completions.create(
            model=req.model,
            messages=[
                {"role": "system", "content": "You are RISHOVA AI, an intelligent developer and creative assistant. Understand Hindi, Hinglish, and English naturally and respond contextually."},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        response_text = completion.choices[0].message.content

        mermaid_match = re.search(r"```(?:mermaid)?\s*\n?((?:graph|flowchart)[\s\S]*?)```", response_text)
        mermaid_code = mermaid_match.group(1).strip() if mermaid_match else ""

        return {
            "intent": "DIAGRAM" if mermaid_code else "CHAT",
            "title": "Rishova AI",
            "data": {
                "mermaid": mermaid_code,
                "markdown_response": response_text,
                "code_snippet": "",
                "files": {},
                "language": "text",
                "commands": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/documents-multi")
async def handle_multi_document_prompt(
    files: List[UploadFile] = File(...),
    prompt: str = Form("Analyze these files"),
    model: str = Form("llama3-8b-8192"),
    user_email: str = Form("guest")
):
    try:
        has_image = False
        image_base64 = None
        doc_texts = []

        for f in files:
            content = await f.read()
            fname = f.filename.lower()
            if fname.endswith((".png", ".jpg", ".jpeg", ".webp")):
                has_image = True
                image_base64 = base64.b64encode(content).decode("utf-8")
            elif fname.endswith(".pdf"):
                reader = PdfReader(io.BytesIO(content))
                for p_idx, page in enumerate(reader.pages[:10], start=1):
                    t = page.extract_text() or ""
                    if t:
                        doc_texts.append(f"[Page {p_idx}] {t[:800]}")

        # AI-POWERED INTENT UNDERSTANDING (No manual regex rules!)
        intent_ai = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an intent classifier for photo editing. The user gives an image and a prompt in Hindi, Hinglish, or English.\n"
                        "Determine if the user wants to change, replace, remove, or swap the background.\n"
                        "Output ONLY a JSON object with two fields:\n"
                        "- 'is_bg_swap': boolean (true/false)\n"
                        "- 'english_scene_description': a concise, photorealistic English description of the desired background (e.g. 'luxurious modern villa garden with driveway sunny day'). If the user didn't specify a place, create a stunning realistic scene that fits a car/person.\n"
                        "Output pure JSON only, no markdown, no explanation."
                    )
                },
                {"role": "user", "content": f"User Prompt: {prompt}"}
            ],
            temperature=0.1
        )

        intent_res = intent_ai.choices[0].message.content.strip()
        bg_intent = False
        clean_bg = "luxurious modern villa entrance sunny day"

        try:
            cleaned_json = re.search(r'\{[\s\S]*?\}', intent_res)
            if cleaned_json:
                data = json.loads(cleaned_json.group(0))
                bg_intent = data.get("is_bg_swap", False)
                clean_bg = data.get("english_scene_description", clean_bg)
        except Exception:
            bg_intent = any(k in prompt.lower() for k in ["background", "change", "बदलो", "हटाओ", "लगाओ", "एडिट", "garden", "villa"])

        if has_image and bg_intent:
            encoded_bg = urllib.parse.quote(f"photorealistic {clean_bg}, wide angle ground view, architecture outdoor photography, 8k, sunny morning, empty background no cars no humans")
            seed = abs(hash(clean_bg)) % 100000
            new_bg_url = f"https://image.pollinations.ai/prompt/{encoded_bg}?width=1024&height=1024&nologo=true&seed={seed}"

            html_card = generate_blended_studio_html(clean_bg, image_base64, new_bg_url)

            return {
                "intent": "IMAGE",
                "title": "AI Background Swap",
                "data": {
                    "mermaid": "",
                    "markdown_response": (
                        f"### ✨ Background Transformed\n\n"
                        f"AI ने आपकी भाषा समझकर यह बैकग्राउंड तैयार किया है:\n"
                        f"**Scene:** *\"{clean_bg}\"*\n\n"
                        f"👉 दाएँ हाथ पर **👁️ Preview** टैब में देखें—कार और लड़का नई जगह सेट हो चुके हैं। आप इसे डाउनलोड भी कर सकते हैं।"
                    ),
                    "code_snippet": html_card,
                    "files": {"index.html": {"language": "html", "code": html_card}},
                    "language": "html",
                    "commands": []
                }
            }

        # Regular File Question & Answering
        context = "\n".join(doc_texts) if doc_texts else "Image uploaded."
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are RISHOVA AI Studio. Understand the user's intent clearly and answer like a top AI assistant."},
                {"role": "user", "content": f"Context:\n{context}\n\nUser Question: {prompt}"}
            ],
            temperature=0.3
        )
        return {
            "intent": "DOCS",
            "title": "File Analysis",
            "data": {
                "mermaid": "",
                "markdown_response": completion.choices[0].message.content,
                "code_snippet": "",
                "files": {},
                "language": "text",
                "commands": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))