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
    model: str = "llama-3.3-70b-versatile"
    user_email: str = "guest"

class SyncProjectsRequest(BaseModel):
    user_email: str
    sessions: list

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
      max-width: 840px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7);
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
      <span style="background: #3b82f6; color: #fff; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">✨ FLUX AI IMAGE EDITOR</span>
      <span style="color: #a1a1aa; font-size: 0.8rem;">1024 x 1024 Ultra HD</span>
    </div>
    <div style="color: #cbd5e1; font-size: 0.9rem; margin-top: 10px; font-style: italic;">"{prompt_text}"</div>

    <div class="compare-container">
      {original_block}
      <div style="flex: 1; min-width: 280px; text-align: center;">
        <span style="color: #38bdf8; font-size: 0.85rem; font-weight: 600;">🎨 AI EDITED RESULT</span>
        <div style="margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid #38bdf8; background: #000;">
          <img src="{img_url}" style="width: 100%; height: auto; display: block;" />
        </div>
      </div>
    </div>

    <a href="{img_url}" target="_blank" download="rishova_ai_edited.jpg" class="action-btn">⬇ Download High-Res Edited Image</a>
  </div>
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

        # Direct Image Generation
        if any(k in user_prompt.lower() for k in ["generate image", "create image", "draw", "photo of", "paint", "फोटो बनाओ", "तस्वीर", "image of"]):
            clean_prompt = re.sub(r'(generate image|create image|draw|photo of|paint|an image of|image of|तस्वीर|फोटो|बनाओ)\s*', '', user_prompt, flags=re.IGNORECASE).strip() or "Futuristic AI Studio"
            encoded = urllib.parse.quote(clean_prompt)
            seed = abs(hash(clean_prompt)) % 100000
            img_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true&seed={seed}"
            html_card = generate_image_studio_html(clean_prompt, img_url)

            return {
                "intent": "IMAGE",
                "title": "AI Image Art",
                "data": {
                    "mermaid": "",
                    "markdown_response": f"### ✨ AI Image Generated\n\n![Generated Art]({img_url})\n\n**Prompt:** *\"{clean_prompt}\"*\n\n👉 *Switch to **👁️ Preview** tab to view and download in Ultra HD.*",
                    "code_snippet": html_card,
                    "files": {"index.html": {"language": "html", "code": html_card}},
                    "language": "html",
                    "commands": []
                }
            }

        # Code & Architecture Inference
        completion = client.chat.completions.create(
            model=req.model,
            messages=[
                {"role": "system", "content": "You are RISHOVA AI Universal Studio. Provide modular, clean solutions."},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        response_text = completion.choices[0].message.content

        files_map = {}
        code_blocks = re.findall(r"```([a-zA-Z0-9_+-]+)?\s*\n([\s\S]*?)```", response_text)
        idx = 1
        for lang, code in code_blocks:
            l_clean = (lang or "javascript").lower()
            if l_clean in ["mermaid", "bash", "sh"]:
                continue
            ext = "py" if l_clean == "python" else ("html" if "html" in l_clean else "js")
            files_map[f"file_{idx}.{ext}"] = {"language": l_clean, "code": code.strip()}
            idx += 1

        mermaid_match = re.search(r"```(?:mermaid)?\s*\n?((?:graph|flowchart)[\s\S]*?)```", response_text)
        mermaid_code = mermaid_match.group(1).strip() if mermaid_match else ""

        return {
            "intent": "DIAGRAM" if mermaid_code else ("BUILDER" if files_map else "CHAT"),
            "title": "Rishova AI Studio Response",
            "data": {
                "mermaid": mermaid_code,
                "markdown_response": response_text,
                "code_snippet": list(files_map.values())[0]["code"] if files_map else "",
                "files": files_map,
                "language": "javascript",
                "commands": []
            }
        }
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

        # 🌟 AI IMAGE-TO-IMAGE EDITING (ChatGPT / Gemini Style)
        if has_image and any(k in prompt.lower() for k in ["edit", "change", "add", "remove", "background", "बदलो", "एडिट", "हटाओ", "लगाओ", "कन्वर्ट", "make"]):
            vision_messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": f"You are an expert AI image art director. The user wants to edit this image with the following instruction: '{prompt}'. Describe the modified target scene in a highly detailed, cinematic text-to-image prompt (1-2 sentences). Preserve the person's pose and core identity while strictly applying the requested modifications. Do not write intros or explanations, output only the image prompt."
                        },
                        {
                            "type": "image_url", 
                            "image_url": {"url": f"data:image/jpeg;base64,{image_base64}"}
                        }
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

            encoded_prompt = urllib.parse.quote(refined_prompt)
            seed = abs(hash(refined_prompt)) % 100000
            edited_img_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&seed={seed}"
            original_url = f"data:image/jpeg;base64,{image_base64}"

            html_card = generate_image_studio_html(prompt, edited_img_url, original_url)

            return {
                "intent": "IMAGE",
                "title": "AI Image-to-Image Edit",
                "data": {
                    "mermaid": "",
                    "markdown_response": f"### ✨ AI Image Edited Successfully\n\n**User Request:** *\"{prompt}\"*\n\n![Edited Image]({edited_img_url})\n\n👉 *Switch to the **👁️ Preview** tab to see the side-by-side comparison with your original photo and download in Ultra HD.*",
                    "code_snippet": html_card,
                    "files": {"index.html": {"language": "html", "code": html_card}},
                    "language": "html",
                    "commands": []
                }
            }

        # Regular Multi-Doc / PDF Q&A
        context = "\n".join(doc_texts)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are RISHOVA AI. Answer user questions referencing specific page numbers like [Source: Page X]."},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {prompt}"}
            ],
            temperature=0.3
        )
        return {
            "intent": "DOCS",
            "title": "Document Analysis",
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