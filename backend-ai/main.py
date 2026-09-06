import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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

    def generate():
        chosen_model = SUPPORTED_MODELS[0]
        try:
            stream = client.chat.completions.create(
                model=chosen_model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are Rishova AI, an intelligent, helpful AI assistant built just like ChatGPT. Format responses cleanly with Markdown, use inline code with single backticks, and multi-line code blocks with language tags. Support Hindi, Hinglish, and English naturally."
                    },
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4,
                max_tokens=2048,
                stream=True
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    yield content
        except Exception as e:
            yield f"\n[Error: {str(e)}]"

    return StreamingResponse(generate(), media_type="text/plain")