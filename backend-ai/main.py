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

class UniversalRequest(BaseModel):
    prompt: str
    model: str = ""
    user_email: str = "guest"

@app.get("/")
def read_root():
    try:
        models = [m.id for m in client.models.list().data]
        return {"status": "RISHOVA AI Studio is Live", "available_models": models}
    except Exception as e:
        return {"status": "Error fetching models", "error": str(e)}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_prompt = req.prompt.strip()

    try:
        # 1. Fetch exact currently active models dynamically from Groq
        active_models = [m.id for m in client.models.list().data if "whisper" not in m.id]
        
        # Filter for top text chat models
        preferred_order = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it", "llama3-70b-8192"]
        sorted_models = [m for m in preferred_order if m in active_models] + [m for m in active_models if m not in preferred_order]

        last_error = None
        for model_name in sorted_models:
            try:
                completion = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are Rishova AI, a helpful, intelligent, and friendly AI assistant. Answer clearly, support Hindi, Hinglish, and English naturally, and provide well-formatted code blocks."
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
                        "used_model": model_name
                    }
                }
            except Exception as err:
                last_error = err
                continue

        raise HTTPException(status_code=500, detail=f"No models succeeded: {str(last_error)}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))