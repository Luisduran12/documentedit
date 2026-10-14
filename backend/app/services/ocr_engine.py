import io
import time
import math
import uuid
from typing import Optional, Literal
from PIL import Image
import pymupdf  # PyMuPDF
import pytesseract

from ..config import settings
from ..models.schemas import OCRWord, OCRLine, OCRBlock, OCRPageResult, OCRDocumentResult
from .image_preprocessor import ImagePreprocessor

class OCREngine:
    @classmethod
    def is_page_scanned(cls, page: pymupdf.Page) -> bool:
        """Determina si una página es un escaneo o contiene texto nativo vectorizado."""
        text = page.get_text().strip()
        if len(text) > 40:
            return False
        # Si tiene imágenes que ocupan casi toda la página y poco o nada de texto nativo
        images = page.get_images()
        return len(images) > 0 or len(text) < 10

    @classmethod
    def analyze_pdf(cls, pdf_bytes: bytes) -> dict:
        """Analiza la estructura completa del PDF: páginas escaneadas vs nativas, dimensiones, fuentes."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        pages_info = []
        total_scanned = 0
        total_native = 0

        for i, page in enumerate(doc):
            scanned = cls.is_page_scanned(page)
            if scanned:
                total_scanned += 1
            else:
                total_native += 1
                
            fonts = page.get_fonts()
            rect = page.rect
            pages_info.append({
                "page_number": i + 1,
                "is_scanned": scanned,
                "width": rect.width,
                "height": rect.height,
                "rotation": page.rotation,
                "font_count": len(fonts),
                "images_count": len(page.get_images()),
                "text_char_count": len(page.get_text().strip()),
            })

        doc.close()
        return {
            "total_pages": len(pages_info),
            "scanned_pages": total_scanned,
            "native_pages": total_native,
            "recommended_mode": "mode_a" if total_scanned > 0 else "native_edit",
            "pages": pages_info
        }

    @classmethod
    def process_document(
        cls,
        pdf_bytes: bytes,
        mode: Literal["mode_a", "mode_b", "mode_c"] = "mode_a",
        language: str = "spa",
        deskew: bool = True,
        enhance_contrast: bool = True,
        phone_photo_mode: bool = False,
        target_pages: Optional[list[int]] = None
    ) -> tuple[bytes, OCRDocumentResult]:
        """
        Ejecuta el pipeline OCR multimodo.
        Retorna los bytes del PDF resultante y el resultado estructurado de metadatos.
        """
        start_time = time.time()
        input_doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        output_doc = pymupdf.open()
        
        pages_result: list[OCRPageResult] = []
        tess_lang = "spa+eng" if language in ("spa", "auto", "es") else "eng"

        for page_idx in range(len(input_doc)):
            page_num = page_idx + 1
            if target_pages is not None and page_num not in target_pages:
                # Copiar página sin procesar
                output_doc.insert_pdf(input_doc, from_page=page_idx, to_page=page_idx)
                continue

            page = input_doc[page_idx]
            rect = page.rect
            width, height = rect.width, rect.height
            is_scanned = cls.is_page_scanned(page)

            # Renderizar página a alta resolución (200 o 300 DPI) para OCR óptimo
            pix = page.get_pixmap(dpi=200)
            img_bytes = pix.tobytes("png")

            # Preprocesamiento con OpenCV si se solicita
            if deskew or enhance_contrast or phone_photo_mode:
                img_bytes, _ = ImagePreprocessor.process_pipeline(
                    img_bytes,
                    deskew=deskew,
                    enhance_contrast=enhance_contrast,
                    phone_photo_mode=phone_photo_mode
                )

            # Extraer palabras y cajas con Tesseract
            pil_img = Image.open(io.BytesIO(img_bytes))
            data = pytesseract.image_to_data(
                pil_img, lang=tess_lang, output_type=pytesseract.Output.DICT
            )

            scale_x = width / pil_img.width
            scale_y = height / pil_img.height

            # Agrupar palabras en líneas y bloques
            blocks_dict: dict[int, list[OCRLine]] = {}
            lines_dict: dict[tuple[int, int], list[OCRWord]] = {}
            all_words: list[OCRWord] = []
            low_confidence_count = 0

            n_boxes = len(data["text"])
            for i in range(n_boxes):
                word_text = data["text"][i].strip()
                if not word_text:
                    continue

                conf = float(data["conf"][i])
                if conf < 0:
                    conf = 85.0
                if conf < 75.0:
                    low_confidence_count += 1

                # Coordenadas en puntos PDF (72 pt/pulgada)
                x0 = data["left"][i] * scale_x
                y0 = data["top"][i] * scale_y
                w = data["width"][i] * scale_x
                h = data["height"][i] * scale_y
                x1 = x0 + w
                y1 = y0 + h

                font_size = max(6.0, round(h * 0.85, 1))
                word = OCRWord(
                    text=word_text,
                    confidence=conf,
                    bbox=[round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
                    font_size=font_size,
                    is_low_confidence=(conf < 75.0)
                )
                all_words.append(word)

                block_num = data["block_num"][i]
                line_num = data["line_num"][i]
                line_key = (block_num, line_num)
                if line_key not in lines_dict:
                    lines_dict[line_key] = []
                lines_dict[line_key].append(word)

            # Construir líneas y bloques estructurados
            structured_blocks: list[OCRBlock] = []
            for (block_num, line_num), words in lines_dict.items():
                if not words:
                    continue
                line_text = " ".join(w.text for w in words)
                lx0 = min(w.bbox[0] for w in words)
                ly0 = min(w.bbox[1] for w in words)
                lx1 = max(w.bbox[2] for w in words)
                ly1 = max(w.bbox[3] for w in words)
                avg_h = sum(w.font_size for w in words) / len(words)
                
                line_obj = OCRLine(
                    text=line_text,
                    bbox=[round(lx0, 2), round(ly0, 2), round(lx1, 2), round(ly1, 2)],
                    words=words,
                    line_height=round(avg_h * 1.2, 1)
                )

                if block_num not in blocks_dict:
                    blocks_dict[block_num] = []
                blocks_dict[block_num].append(line_obj)

            page_full_text = []
            for b_idx, lines in blocks_dict.items():
                if not lines:
                    continue
                bx0 = min(l.bbox[0] for l in lines)
                by0 = min(l.bbox[1] for l in lines)
                bx1 = max(l.bbox[2] for l in lines)
                by1 = max(l.bbox[3] for l in lines)
                block_text = "\n".join(l.text for l in lines)
                page_full_text.append(block_text)

                # Clasificación de tipo de bloque
                avg_size = sum(w.font_size for l in lines for w in l.words) / max(1, sum(len(l.words) for l in lines))
                block_type = "paragraph"
                if by0 < height * 0.08:
                    block_type = "header"
                elif by1 > height * 0.92:
                    block_type = "footer"
                elif avg_size >= 15.0 or (len(lines) == 1 and len(block_text) < 60 and avg_size >= 13.0):
                    block_type = "heading"

                conf_avg = sum(w.confidence for l in lines for w in l.words) / max(1, sum(len(l.words) for l in lines))
                structured_blocks.append(OCRBlock(
                    id=f"block_{page_num}_{b_idx}",
                    type=block_type,
                    bbox=[round(bx0, 2), round(by0, 2), round(bx1, 2), round(by1, 2)],
                    text=block_text,
                    lines=lines,
                    confidence=round(conf_avg, 1)
                ))

            avg_page_conf = (
                sum(w.confidence for w in all_words) / len(all_words) if all_words else 100.0
            )

            page_result = OCRPageResult(
                page_number=page_num,
                width=round(width, 2),
                height=round(height, 2),
                is_scanned=is_scanned,
                average_confidence=round(avg_page_conf, 1),
                low_confidence_count=low_confidence_count,
                blocks=structured_blocks,
                text_content="\n\n".join(page_full_text)
            )
            pages_result.append(page_result)

            # Creación de la página según el modo
            if mode == "mode_a":
                # MODO A: OCR FIEL AL ORIGINAL
                # Mantener la imagen original (o preprocesada) y superponer capa de texto invisible
                new_page = output_doc.new_page(width=width, height=height)
                # Insertar la imagen de fondo
                new_page.insert_image(rect, stream=img_bytes)
                
                # Insertar capa de texto invisible con render_mode=3 (invisible font)
                for w in all_words:
                    pt_x = w.bbox[0]
                    # En PyMuPDF, la coordenada Y es la línea base
                    pt_y = w.bbox[3] - (w.font_size * 0.15)
                    try:
                        new_page.insert_text(
                            pymupdf.Point(pt_x, pt_y),
                            w.text,
                            fontsize=w.font_size,
                            render_mode=3  # Modo invisible para búsqueda y selección precisa
                        )
                    except Exception:
                        pass

            elif mode == "mode_b":
                # MODO B: OCR EDITABLE
                # Crear página base con imagen, y dejar disponibles los bloques para reemplazo interactivo
                new_page = output_doc.new_page(width=width, height=height)
                new_page.insert_image(rect, stream=img_bytes)
                # Capa invisible inicial para que sea seleccionable
                for w in all_words:
                    try:
                        new_page.insert_text(
                            pymupdf.Point(w.bbox[0], w.bbox[3] - (w.font_size * 0.15)),
                            w.text,
                            fontsize=w.font_size,
                            render_mode=3
                        )
                    except Exception:
                        pass

            elif mode == "mode_c":
                # MODO C: RECONSTRUCCIÓN ESTRUCTURAL
                # Crea una página limpia vectorial con títulos, párrafos y distribución matemática
                new_page = output_doc.new_page(width=width, height=height)
                for blk in structured_blocks:
                    for line in blk.lines:
                        font_size = line.words[0].font_size if line.words else 11.0
                        is_bold = blk.type == "heading"
                        font_name = "helv" if not is_bold else "hebo"
                        try:
                            new_page.insert_text(
                                pymupdf.Point(line.bbox[0], line.bbox[3] - (font_size * 0.15)),
                                line.text,
                                fontname=font_name,
                                fontsize=font_size,
                                color=(0.1, 0.1, 0.1)
                            )
                        except Exception:
                            pass

        out_pdf_bytes = output_doc.tobytes()
        input_doc.close()
        output_doc.close()

        processing_time = (time.time() - start_time) * 1000.0
        doc_result = OCRDocumentResult(
            total_pages=len(pages_result),
            language=language,
            mode=mode,
            pages=pages_result,
            processing_time_ms=round(processing_time, 1)
        )

        return out_pdf_bytes, doc_result
