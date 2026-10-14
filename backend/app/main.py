from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import time

from .config import settings
from .routes.ocr import router as ocr_router
from .routes.convert import router as convert_router
from .routes.organize import router as organize_router
from .routes.ai import router as ai_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docupilot-backend")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Motor profesional de procesamiento de PDF con OCR multimodo, edición y conversión."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers bajo prefijo /api
app.include_router(ocr_router, prefix=settings.API_V1_PREFIX)
app.include_router(convert_router, prefix=settings.API_V1_PREFIX)
app.include_router(organize_router, prefix=settings.API_V1_PREFIX)
app.include_router(ai_router, prefix=settings.API_V1_PREFIX)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = f"{process_time:.4f}s"
    return response

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "tesseract_path": settings.TESSERACT_CMD or "No configurado",
        "tessdata_path": settings.TESSDATA_DIR or "No configurado"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
