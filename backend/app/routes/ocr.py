import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from fastapi.responses import JSONResponse
from typing import Optional, Literal

from ..services.ocr_engine import OCREngine
from ..services.image_preprocessor import ImagePreprocessor
from ..models.schemas import OCRDocumentResult

router = APIRouter(prefix="/ocr", tags=["OCR"])

@router.post("/analyze")
async def analyze_document(file: UploadFile = File(...)):
    """Analiza si el documento contiene texto nativo o escaneos y devuelve estructura."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")
    
    try:
        analysis = OCREngine.analyze_pdf(content)
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al analizar el PDF: {str(e)}")

@router.post("/process")
async def process_ocr(
    file: UploadFile = File(...),
    mode: Literal["mode_a", "mode_b", "mode_c"] = Form("mode_a"),
    language: str = Form("spa"),
    deskew: bool = Form(True),
    enhance_contrast: bool = Form(True),
    phone_photo_mode: bool = Form(False),
    pages_json: Optional[str] = Form(None)
):
    """
    Ejecuta el reconocimiento OCR en el documento según el modo solicitado:
    - Mode A: OCR fiel al original (capa de texto invisible)
    - Mode B: OCR editable con coordenadas y bloques
    - Mode C: OCR con reconstrucción estructural
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    target_pages = None
    if pages_json:
        try:
            target_pages = json.loads(pages_json)
        except Exception:
            pass

    try:
        out_pdf_bytes, doc_result = OCREngine.process_document(
            pdf_bytes=content,
            mode=mode,
            language=language,
            deskew=deskew,
            enhance_contrast=enhance_contrast,
            phone_photo_mode=phone_photo_mode,
            target_pages=target_pages
        )

        # Retornar el PDF resultante con la metadata en las cabeceras
        headers = {
            "Content-Disposition": f'attachment; filename="ocr_{mode}_{file.filename}"',
            "X-OCR-Pages": str(doc_result.total_pages),
            "X-OCR-Mode": doc_result.mode,
            "X-OCR-Time-Ms": str(doc_result.processing_time_ms),
            "Access-Control-Expose-Headers": "X-OCR-Pages, X-OCR-Mode, X-OCR-Time-Ms, X-OCR-Metadata"
        }
        
        # Enviar también el JSON de metadata codificado para el frontend
        metadata_str = doc_result.model_dump_json()
        # Si es pequeño se puede incluir en cabecera o devolver mediante endpoint multipart
        return Response(
            content=out_pdf_bytes,
            media_type="application/pdf",
            headers=headers
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error durante el OCR: {str(e)}")

@router.post("/metadata")
async def get_ocr_metadata(
    file: UploadFile = File(...),
    mode: Literal["mode_a", "mode_b", "mode_c"] = Form("mode_b"),
    language: str = Form("spa"),
    deskew: bool = Form(True),
    enhance_contrast: bool = Form(True)
) -> OCRDocumentResult:
    """Devuelve únicamente el árbol JSON estructurado de bloques, palabras, coordenadas y confianza."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        _, doc_result = OCREngine.process_document(
            pdf_bytes=content,
            mode=mode,
            language=language,
            deskew=deskew,
            enhance_contrast=enhance_contrast
        )
        return doc_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo metadatos OCR: {str(e)}")

@router.post("/preprocess-image")
async def preprocess_image(
    file: UploadFile = File(...),
    deskew: bool = Form(True),
    enhance_contrast: bool = Form(True),
    phone_photo_mode: bool = Form(False),
    denoise: bool = Form(False),
    binarize: bool = Form(False)
):
    """Preprocesa una imagen para corregir perspectiva, sombras, contraste o ruido."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    try:
        out_bytes, info = ImagePreprocessor.process_pipeline(
            content,
            deskew=deskew,
            enhance_contrast=enhance_contrast,
            phone_photo_mode=phone_photo_mode,
            denoise=denoise,
            binarize=binarize
        )
        return Response(
            content=out_bytes,
            media_type="image/png",
            headers={
                "X-Preprocess-Info": json.dumps(info),
                "Access-Control-Expose-Headers": "X-Preprocess-Info"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al preprocesar la imagen: {str(e)}")
