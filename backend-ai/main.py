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

# List of models in order of priority
CANDIDATE_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768"
]

class UniversalRequest(BaseModel):
    prompt: str
    model: str = "llama-3.3-70b-versatile"
    user_email: str = "guest"

@app.get("/")
def read_root():
    return {"status": "RISHOVA AI Studio is Live"}

@app.post("/api/ai/universal")
async def handle_universal_prompt(req: UniversalRequest):
    user_prompt = req.prompt.strip()
    last_error = None

    # Try models one by one so it never fails with decommissioned errors
    for model_name in [req.model] + [m for m in CANDIDATE_MODELS if m != req.model]:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "system",
                        "content": "You are Rishova AI, a helpful, intelligent, and friendly AI assistant. Answer the user's questions clearly, naturally, and support Hindi, Hinglish, and English seamlessly."
                    },
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4,
                max_tokens=2048,
            )
            response_text = completion.choices[0].message.content
            return {
                "intent": "CHAT",
                "title": "Rishova AI",
                "data": {
                    "markdown_response": response_text
                }
            }
        except Exception as e:
            last_error = e
            continue

    raise HTTPException(status_code=500, detail=str(last_error))