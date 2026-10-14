import io
import pytest
import pymupdf
import numpy as np
import cv2
from PIL import Image

from app.services.image_preprocessor import ImagePreprocessor
from app.services.ocr_engine import OCREngine
from app.services.converter import DocumentConverter
from app.services.organizer import DocumentOrganizer
from app.services.ai_assistant import AIAssistant
from app.models.schemas import OCRDocumentResult

@pytest.fixture
def sample_pdf():
    """Crea un PDF sintético con texto, tabla y metadatos para pruebas."""
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    
    # Texto de prueba con fechas, importes y datos
    page.insert_text(pymupdf.Point(50, 60), "CONTRATO DE PRESTACION DE SERVICIOS", fontsize=16, fontname="hebo")
    page.insert_text(pymupdf.Point(50, 100), "Fecha de firma: 12/10/2026. Importe total: $4,500.00 USD.", fontsize=11)
    page.insert_text(pymupdf.Point(50, 130), "Contratante NIT 900.123.456-7. Contacto: admin@empresa.com. Tel: +57 300 1234567.", fontsize=10)
    page.insert_text(pymupdf.Point(50, 160), "El presente acuerdo regula las condiciones del servicio documental y OCR.", fontsize=10)

    # Dibujar una tabla sencilla
    rect_table = pymupdf.Rect(50, 200, 550, 300)
    page.draw_rect(rect_table, color=(0.2, 0.4, 0.8), width=1.5)
    page.draw_line(pymupdf.Point(50, 230), pymupdf.Point(550, 230), color=(0.2, 0.4, 0.8), width=1)
    page.draw_line(pymupdf.Point(250, 200), pymupdf.Point(250, 300), color=(0.2, 0.4, 0.8), width=1)
    page.insert_text(pymupdf.Point(60, 220), "CONCEPTO", fontsize=11, fontname="hebo")
    page.insert_text(pymupdf.Point(260, 220), "MONTO", fontsize=11, fontname="hebo")
    page.insert_text(pymupdf.Point(60, 260), "Licencia de software", fontsize=10)
    page.insert_text(pymupdf.Point(260, 260), "$3,000.00", fontsize=10)
    page.insert_text(pymupdf.Point(60, 285), "Soporte y mantenimiento", fontsize=10)
    page.insert_text(pymupdf.Point(260, 285), "$1,500.00", fontsize=10)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

@pytest.fixture
def sample_scanned_pdf():
    """Crea un PDF que simula una página escaneada (solo imagen)."""
    # Crear una imagen sintética con texto rasterizado
    img = np.ones((600, 800, 3), dtype=np.uint8) * 255
    cv2.putText(img, "DOCUMENTO ESCANEADO DE PRUEBA", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
    cv2.putText(img, "Numero de Factura: F-98231", (50, 160), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    cv2.putText(img, "Total a Pagar: $1,250.00 USD", (50, 220), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
    _, encoded = cv2.imencode(".png", img)

    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    page.insert_image(page.rect, stream=encoded.tobytes())
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes

def test_image_preprocessor_pipeline():
    """Valida el preprocesamiento con OpenCV: deskew, CLAHE, sombras y binarización."""
    img = np.ones((400, 500, 3), dtype=np.uint8) * 240
    cv2.putText(img, "Prueba Preprocessing", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (20, 20, 20), 2)
    _, original_bytes = cv2.imencode(".png", img)

    processed_bytes, info = ImagePreprocessor.process_pipeline(
        original_bytes.tobytes(),
        deskew=True,
        enhance_contrast=True,
        phone_photo_mode=True,
        binarize=False
    )
    assert len(processed_bytes) > 0
    assert "steps_applied" in info
    assert isinstance(info["deskew_angle"], float)

def test_analyze_pdf(sample_pdf, sample_scanned_pdf):
    """Valida la detección de páginas nativas vs escaneadas."""
    analysis_native = OCREngine.analyze_pdf(sample_pdf)
    assert analysis_native["total_pages"] == 1
    assert analysis_native["native_pages"] == 1
    assert analysis_native["scanned_pages"] == 0

    analysis_scanned = OCREngine.analyze_pdf(sample_scanned_pdf)
    assert analysis_scanned["total_pages"] == 1
    assert analysis_scanned["scanned_pages"] == 1
    assert analysis_scanned["recommended_mode"] == "mode_a"

def test_ocr_mode_a_fiel_al_original(sample_scanned_pdf):
    """Valida el Modo A: conserva la imagen y crea la capa de texto invisible alineada."""
    out_pdf, doc_result = OCREngine.process_document(
        sample_scanned_pdf,
        mode="mode_a",
        language="spa",
        deskew=False,
        enhance_contrast=False
    )
    assert len(out_pdf) > 0
    assert doc_result.mode == "mode_a"
    assert doc_result.total_pages == 1
    # Abrir el PDF resultante y verificar que ahora tiene texto seleccionable
    res_doc = pymupdf.open(stream=out_pdf, filetype="pdf")
    page_text = res_doc[0].get_text().upper()
    res_doc.close()
    assert "DOCUMENTO" in page_text or "PRUEBA" in page_text or "FACTURA" in page_text

def test_ocr_mode_b_editable(sample_scanned_pdf):
    """Valida el Modo B: extrae bloques, coordenadas, líneas y palabras con confianza."""
    out_pdf, doc_result = OCREngine.process_document(
        sample_scanned_pdf,
        mode="mode_b",
        language="spa"
    )
    assert len(out_pdf) > 0
    assert doc_result.mode == "mode_b"
    assert len(doc_result.pages) == 1
    p = doc_result.pages[0]
    assert len(p.blocks) > 0
    assert p.average_confidence >= 0

def test_ocr_mode_c_reconstruccion(sample_scanned_pdf):
    """Valida el Modo C: reconstruye la estructura visual."""
    out_pdf, doc_result = OCREngine.process_document(
        sample_scanned_pdf,
        mode="mode_c",
        language="spa"
    )
    assert len(out_pdf) > 0
    assert doc_result.mode == "mode_c"

def test_document_conversions(sample_pdf):
    """Valida la conversión a DOCX, XLSX, TXT e imágenes."""
    docx_bytes = DocumentConverter.pdf_to_docx(sample_pdf)
    assert len(docx_bytes) > 1000

    xlsx_bytes = DocumentConverter.pdf_to_xlsx(sample_pdf)
    assert len(xlsx_bytes) > 1000

    txt = DocumentConverter.pdf_to_txt(sample_pdf)
    assert "CONTRATO" in txt
    assert "$4,500.00" in txt

    images = DocumentConverter.pdf_to_images(sample_pdf, dpi=100)
    assert len(images) == 1
    assert len(images[0]) > 500

def test_document_organizer(sample_pdf):
    """Valida las operaciones de unión, rotación, marca de agua y encabezados."""
    # Duplicar y unir
    merged = DocumentOrganizer.merge_pdfs([sample_pdf, sample_pdf])
    doc_m = pymupdf.open(stream=merged, filetype="pdf")
    assert len(doc_m) == 2
    doc_m.close()

    # Rotar
    rotated = DocumentOrganizer.rotate_pages(sample_pdf, [1], 90)
    doc_r = pymupdf.open(stream=rotated, filetype="pdf")
    assert doc_r[0].rotation == 90
    doc_r.close()

    # Marca de agua
    watermarked = DocumentOrganizer.add_watermark(sample_pdf, "CONFIDENCIAL")
    assert len(watermarked) > 0

    # Encabezado y numeración
    with_hf = DocumentOrganizer.add_header_footer(sample_pdf, header_text="DocuPilot Header", number_pages=True)
    doc_hf = pymupdf.open(stream=with_hf, filetype="pdf")
    hf_text = doc_hf[0].get_text()
    assert "DocuPilot Header" in hf_text
    assert "Página 1 de 1" in hf_text
    doc_hf.close()

def test_ai_assistant(sample_pdf):
    """Valida el extractor de entidades, resumen y sugerencias OCR."""
    ai_result = AIAssistant.analyze_document(sample_pdf)
    assert len(ai_result.summary) > 20
    assert "12/10/2026" in ai_result.entities["dates"]
    assert any("$4,500.00" in amt for amt in ai_result.entities["amounts"])
    assert "admin@empresa.com" in ai_result.entities["emails"]
    assert any("900.123.456-7" in tid for tid in ai_result.entities["tax_ids"])
