import os
import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

app = FastAPI(title="Rishova AI Diagram Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DiagramRequest(BaseModel):
    prompt: str

def extract_clean_mermaid(text: str) -> str:
    match = re.search(r"```(?:mermaid)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    raw = match.group(1) if match else text
    lines = raw.strip().split("\n")
    valid_starts = ("graph", "flowchart", "sequencediagram", "classdiagram", "erdiagram", "statediagram", "gantt", "pie")
    
    clean_lines = []
    started = False
    for line in lines:
        stripped = line.strip()
        if not started:
            if any(stripped.lower().startswith(kw) for kw in valid_starts):
                started = True
                clean_lines.append(line)
        else:
            if not stripped.startswith("```"):
                clean_lines.append(line)
                
    result = "\n".join(clean_lines).strip()
    return result if result else raw.replace("```", "").strip()

@app.post("/api/ai/diagram")
async def generate_diagram(req: DiagramRequest):
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not found in .env")

    client = Groq(api_key=api_key)

    # Fetch active models dynamically from your account
    active_models = []
    try:
        models_data = client.models.list().data
        active_models = [m.id for m in models_data if "whisper" not in m.id and "preview" not in m.id]
    except Exception:
        active_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"]

    system_prompt = (
        "You are an automated Mermaid.js generator engine. "
        "Output ONLY valid Mermaid diagram syntax starting with graph TD or sequenceDiagram. "
        "Do not include any explanations, markdown comments, or introductory text."
    )

    last_error = None
    for model_name in active_models:
        try:
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Generate clean mermaid diagram: {req.prompt}"}
                ],
                temperature=0.1,
            )
            raw_output = completion.choices[0].message.content
            cleaned = extract_clean_mermaid(raw_output)
            return {"mermaid": cleaned, "model": model_name}
        except Exception as e:
            last_error = str(e)
            continue

    raise HTTPException(status_code=500, detail=f"Failed to generate diagram: {last_error}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)