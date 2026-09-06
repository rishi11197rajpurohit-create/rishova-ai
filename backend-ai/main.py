import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Rishova AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Your exact active chat models from Groq
SUPPORTED_MODELS = [
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "allam-2-7b"
]

class UniversalRequest(BaseModel):
    prompt: str
    model: str = "qwen/qwen3.8-27b"
    user_email: str = "guest"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live", "models": SUPPORTED_MODELS}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_prompt = req.prompt.strip()
    last_error = None

    for model_name in SUPPORTED_MODELS:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": "You are Rishova AI, a helpful, brilliant, and friendly AI assistant. Provide detailed, well-structured answers with clear Markdown formatting and code snippets. Support Hindi, Hinglish, and English naturally."
                    },
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4,
                max_tokens=2048,
            )
            return {
                "intent": "CHAT",
                "title": "Rishova AI",
                "data": {
                    "markdown_response": completion.choices[0].message.content,
                    "model_used": model_name
                }
            }
        except Exception as e:
            last_error = e
            continue

    raise HTTPException(status_code=500, detail=str(last_error))