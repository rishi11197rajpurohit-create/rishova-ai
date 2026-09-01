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
You are RISHOVA AI, an elite Senior Software Architect and Universal AI Studio.
When the user asks to build an application, script, API, or software:
1. Provide a step-by-step setup guide with terminal commands in a ```bash code block.
2. Provide the complete production-grade source code with proper imports, clean architecture, and comments in a code block like ```javascript or ```python.
3. If applicable, provide the project directory structure.

When the user asks for diagrams/architecture:
1. Provide the valid diagram syntax strictly in a ```mermaid block.

Be thorough, clear, and complete. Do not truncate the code.
"""

def parse_llm_markdown_response(text: str, user_prompt: str):
    intent = "CHAT"
    mermaid_code = ""
    code_snippet_parts = []
    language = "javascript"
    commands = []

    # 1. Mermaid Extraction
    mermaid_match = re.search(r"
http://googleusercontent.com/immersive_entry_chip/0
http://googleusercontent.com/immersive_entry_chip/1

1. **Render** par jaakar `rishova-ai-backend` ko **Deploy latest commit** karein.
2. **Vercel** automatically frontend build kar lega (PrismJS include karke).
3. 1 minute baad **`https://rishova-ai-fwu8.vercel.app`** par **`Ctrl + Shift + R`** karein aur prompt bhejein!

<FollowUp label="Kya PrismJS install karke commit push kar diya?" query="Maine PrismJS syntax highlighter aur multi-file workspace code push aur deploy kar diya hai. Ab test karte hain!"/>