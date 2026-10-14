import json
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from typing import Optional, Literal

from ..services.organizer import DocumentOrganizer

router = APIRouter(prefix="/organize", tags=["Organización"])

@router.post("/merge")
async def merge_pdfs(files: list[UploadFile] = File(...)):
    """Combina varios archivos PDF en un único documento secuencial."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos para unir.")

    try:
        pdf_bytes_list = [await f.read() for f in files]
        merged = DocumentOrganizer.merge_pdfs(pdf_bytes_list)
        return Response(
            content=merged,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="documento_unido.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uniendo PDFs: {str(e)}")

@router.post("/rotate")
async def rotate_pages(
    file: UploadFile = File(...),
    pages_json: str = Form("[]"),
    angle: int = Form(90)
):
    """Rota las páginas especificadas."""
    content = await file.read()
    pages = json.loads(pages_json)
    try:
        rotated = DocumentOrganizer.rotate_pages(content, pages, angle)
        return Response(
            content=rotated,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="rotado_{file.filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error rotando páginas: {str(e)}")

@router.post("/delete-pages")
async def delete_pages(
    file: UploadFile = File(...),
    pages_json: str = Form("[]")
):
    """Elimina las páginas indicadas del documento."""
    content = await file.read()
    pages = json.loads(pages_json)
    try:
        updated = DocumentOrganizer.delete_pages(content, pages)
        return Response(
            content=updated,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="paginas_eliminadas_{file.filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error eliminando páginas: {str(e)}")

@router.post("/watermark")
async def add_watermark(
    file: UploadFile = File(...),
    text: str = Form("CONFIDENCIAL"),
    opacity: float = Form(0.25),
    font_size: float = Form(48.0)
):
    """Agrega una marca de agua diagonal con transparencia a todas las páginas."""
    content = await file.read()
    try:
        watermarked = DocumentOrganizer.add_watermark(
            content, text=text, opacity=opacity, font_size=font_size
        )
        return Response(
            content=watermarked,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="marca_agua_{file.filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error aplicando marca de agua: {str(e)}")

@router.post("/header-footer")
async def add_header_footer(
    file: UploadFile = File(...),
    header_text: Optional[str] = Form(None),
    footer_text: Optional[str] = Form(None),
    number_pages: bool = Form(True)
):
    """Añade encabezado, pie de página o numeración dinámica 'Página X de Y'."""
    content = await file.read()
    try:
        processed = DocumentOrganizer.add_header_footer(
            content,
            header_text=header_text,
            footer_text=footer_text,
            number_pages=number_pages
        )
        return Response(
            content=processed,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="encabezado_{file.filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error aplicando encabezados/pies: {str(e)}")
