import os
import json
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Rishova AI Orchestrator")

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
You are RISHOVA AI, an intelligent universal multi-agent task orchestrator.
Analyze the user prompt and classify the intent into one of these types:
1. "DIAGRAM" (User wants an architecture diagram, ERD, DFD, flowchart, or workflow).
2. "LEARNING" (User wants to learn a concept from zero, exam prep, practice, or step-by-step tutorial).
3. "BUILDER" (User wants to write code, create an app, build a script, or terminal commands).
4. "CHAT" (General question, reasoning, conversation, or advice).

You must respond with a clean, strictly valid JSON object using this exact structure:
{
  "intent": "DIAGRAM",
  "title": "Title of the task",
  "data": {
     "mermaid": "graph TD\\n  User[User] --> Pay[Payment]",
     "markdown_response": "Full formatted response and explanation here.",
     "commands": [],
     "summary": "Brief 1-line summary"
  }
}
Note for DIAGRAM: Provide ONLY valid Mermaid syntax inside data.mermaid.
Do not output anything outside the JSON object.
"""

def extract_json(text: str):
    """Clean and extract JSON from model output safely"""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    return json.loads(text)

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Orchestrator is Live"}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        # Get active chat models directly from Groq account
        models_data = client.models.list().data
        active_models = [
            m.id for m in models_data 
            if not any(x in m.id for x in ["whisper", "guard", "vision", "embed"])
        ]
        
        if not active_models:
            active_models = ["llama-3.1-70b-versatile", "llama-3.2-3b-preview"]
        
        last_error = None
        for model_id in active_models:
            try:
                completion = client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
                        {"role": "user", "content": req.prompt}
                    ],
                    temperature=0.1
                )
                raw_text = completion.choices[0].message.content
                return extract_json(raw_text)
            except Exception as model_err:
                last_error = model_err
                continue

        raise HTTPException(status_code=500, detail=f"All models failed: {str(last_error)}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))