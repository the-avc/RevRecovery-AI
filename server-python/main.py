from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn
import os

load_dotenv()

from routes.analyze import router as analyze_router
from routes.voice import router as voice_router
from routes.promise import router as promise_router

app = FastAPI(
    title="AI Revenue Recovery Engine",
    description="Python AI/ML microservice for revenue recovery decisions",
    version="1.0.0"
)

# Split origins, filter out empty strings (when env var is not set)
raw_origins = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [o for o in raw_origins.split(",") if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(voice_router)
app.include_router(promise_router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "AI Revenue Recovery Engine"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
