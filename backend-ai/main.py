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

# Stable, active Groq model
ACTIVE_MODEL = "gemma2-9b-it"

class UniversalRequest(BaseModel):
    prompt: str
    model: str = ACTIVE_MODEL
    user_email: str = "guest"

class SyncProjectsRequest(BaseModel):
    user_email: str
    sessions: list

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "model": ACTIVE_MODEL}

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

        completion = client.chat.completions.create(
            model=ACTIVE_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You are RISHOVA AI, an intelligent, helpful, and creative assistant. Understand Hindi, Hinglish, and English naturally and respond contextually with clear formatting and code blocks when asked."
                },
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        response_text = completion.choices[0].message.content

        return {
            "intent": "CHAT",
            "title": "Rishova AI",
            "data": {
                "markdown_response": response_text,
                "code_snippet": "",
                "files": {},
                "language": "text",
                "commands": []
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))