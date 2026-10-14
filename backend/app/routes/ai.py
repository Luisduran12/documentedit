from fastapi import APIRouter, UploadFile, File, HTTPException
from ..services.ai_assistant import AIAssistant
from ..models.schemas import AIAnalysisResult

router = APIRouter(prefix="/ai", tags=["Asistente IA"])

@router.post("/analyze", response_model=AIAnalysisResult)
async def analyze_document_with_ai(file: UploadFile = File(...)):
    """Analiza de forma privada y local el documento, extrayendo resumen, entidades y correcciones OCR."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        result = AIAssistant.analyze_document(content)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en el análisis de IA: {str(e)}")
