from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Response
from typing import Literal

from ..services.converter import DocumentConverter

router = APIRouter(prefix="/convert", tags=["Conversión"])

@router.post("/export")
async def export_document(
    file: UploadFile = File(...),
    target_format: Literal["docx", "xlsx", "txt", "png", "jpg"] = Form(...),
    dpi: int = Form(200)
):
    """Convierte el PDF al formato de destino solicitado."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    base_name = file.filename.rsplit(".", 1)[0] if file.filename else "documento"

    try:
        if target_format == "docx":
            out_bytes = DocumentConverter.pdf_to_docx(content)
            return Response(
                content=out_bytes,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{base_name}.docx"'}
            )
        elif target_format == "xlsx":
            out_bytes = DocumentConverter.pdf_to_xlsx(content)
            return Response(
                content=out_bytes,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{base_name}.xlsx"'}
            )
        elif target_format == "txt":
            out_text = DocumentConverter.pdf_to_txt(content)
            return Response(
                content=out_text.encode("utf-8"),
                media_type="text/plain; charset=utf-8",
                headers={"Content-Disposition": f'attachment; filename="{base_name}.txt"'}
            )
        elif target_format in ("png", "jpg"):
            fmt = "png" if target_format == "png" else "jpeg"
            images = DocumentConverter.pdf_to_images(content, dpi=dpi, format=fmt)
            if not images:
                raise HTTPException(status_code=400, detail="El PDF no contiene páginas.")
            
            # Retornar la primera página o un zip si son varias
            # Para exportación directa de página
            mime = "image/png" if target_format == "png" else "image/jpeg"
            return Response(
                content=images[0],
                media_type=mime,
                headers={"Content-Disposition": f'attachment; filename="{base_name}_pag1.{target_format}"'}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Formato no soportado: {target_format}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al convertir documento: {str(e)}")

@router.post("/images-to-pdf")
async def images_to_pdf(files: list[UploadFile] = File(...)):
    """Convierte un lote de imágenes en un documento PDF multipágina."""
    if not files:
        raise HTTPException(status_code=400, detail="No se enviaron imágenes.")

    try:
        images_bytes = [await f.read() for f in files]
        pdf_bytes = DocumentConverter.images_to_pdf(images_bytes)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": 'attachment; filename="convertido.pdf"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando PDF desde imágenes: {str(e)}")
