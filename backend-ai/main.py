import os
import json
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
You are RISHOVA AI, an intelligent task orchestrator.
Analyze the user prompt and classify the intent into one of these types:
1. "DIAGRAM" (User wants an architecture diagram, ERD, DFD, flowchart, or workflow).
2. "LEARNING" (User wants to learn a concept from zero, exam prep, practice, or step-by-step tutorial).
3. "BUILDER" (User wants to write code, create an app, build a script, or terminal commands).
4. "CHAT" (General question, reasoning, conversation, or advice).

You must respond ONLY with a valid JSON object strictly matching this schema:
{
  "intent": "DIAGRAM" | "LEARNING" | "BUILDER" | "CHAT",
  "title": "Short title of the task",
  "data": {
     "mermaid": "ONLY valid Mermaid.js code if intent is DIAGRAM, else empty string",
     "markdown_response": "Full formatted markdown response with code/steps/explanation",
     "commands": ["terminal commands if applicable"],
     "summary": "Brief 1-line action summary"
  }
}
Do not wrap JSON in markdown backticks. Return raw JSON only.
"""

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Orchestrator is Live"}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    try:
        # Groq के लाइव और एक्टिव मॉडल्स को डायनामिक रूप से प्राप्त करना
        model_list = client.models.list()
        active_model_ids = [m.id for m in model_list.data if "whisper" not in m.id and "guard" not in m.id]
        
        # पसंदीदा मॉडल्स की प्राथमिकता क्रम
        preferred = ["llama-3.3-70b-versatile", "gemma2-9b-it", "deepseek-r1-distill-llama-70b"]
        selected_model = None
        for p in preferred:
            if p in active_model_ids:
                selected_model = p
                break
        
        if not selected_model and active_model_ids:
            selected_model = active_model_ids[0]
            
        if not selected_model:
            selected_model = "gemma2-9b-it"

        completion = client.chat.completions.create(
            model=selected_model,
            messages=[
                {"role": "system", "content": SYSTEM_ORCHESTRATOR_PROMPT},
                {"role": "user", "content": req.prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        response_text = completion.choices[0].message.content
        result = json.loads(response_text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))