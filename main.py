import time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

interests = ["software engineering", "varsity tennis", "chinese calligraphy", "cooking fusilli"]
toxic = ["rage", "prank", "gossip", "brainrot"]


class EvaluateRequest(BaseModel):
    text_content: str


class KeywordsRequest(BaseModel):
    keywords: List[str]


@app.get("/interests")
async def get_interests():
    return {"keywords": interests}


@app.post("/interests")
async def set_interests(payload: KeywordsRequest):
    global interests
    interests = [k.lower().strip() for k in payload.keywords if k.strip()]
    return {"keywords": interests}


@app.get("/toxic")
async def get_toxic():
    return {"keywords": toxic}


@app.post("/toxic")
async def set_toxic(payload: KeywordsRequest):
    global toxic
    toxic = [k.lower().strip() for k in payload.keywords if k.strip()]
    return {"keywords": toxic}


@app.post("/evaluate")
async def evaluate(payload: EvaluateRequest):
    start = time.perf_counter()

    text = payload.text_content.lower()

    score = 0

    for keyword in toxic:
        if keyword in text:
            score -= 5

    for interest in interests:
        if interest in text:
            score += 10

    if score < 0:
        action = "SKIP"
        delay_ms = 500
    elif score > 0:
        action = "LIKE_AND_STAY"
        delay_ms = 3000
    else:
        action = "SKIP"
        delay_ms = 1000

    execution_ms = (time.perf_counter() - start) * 1000

    return {"action": action, "score": score, "delay_ms": delay_ms, "execution_ms": execution_ms}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
