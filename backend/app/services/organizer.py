import io
import math
import pymupdf
from typing import Optional, Literal

class DocumentOrganizer:
    @staticmethod
    def merge_pdfs(pdf_list: list[bytes]) -> bytes:
        """Une varios archivos PDF en un único documento."""
        merged_doc = pymupdf.open()
        for pdf_bytes in pdf_list:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
            merged_doc.insert_pdf(doc)
            doc.close()
        out = merged_doc.tobytes()
        merged_doc.close()
        return out

    @staticmethod
    def split_pdf(pdf_bytes: bytes, ranges: list[tuple[int, int]]) -> list[bytes]:
        """Divide un PDF según rangos de páginas (1-indexados)."""
        src_doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        splits = []
        for start, end in ranges:
            start_idx = max(0, start - 1)
            end_idx = min(len(src_doc) - 1, end - 1)
            new_doc = pymupdf.open()
            new_doc.insert_pdf(src_doc, from_page=start_idx, to_page=end_idx)
            splits.append(new_doc.tobytes())
            new_doc.close()
        src_doc.close()
        return splits

    @staticmethod
    def rotate_pages(pdf_bytes: bytes, page_numbers: list[int], angle: int) -> bytes:
        """Rota las páginas especificadas (90, 180, 270 grados)."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        for p_num in page_numbers:
            idx = p_num - 1
            if 0 <= idx < len(doc):
                page = doc[idx]
                page.set_rotation((page.rotation + angle) % 360)
        out = doc.tobytes()
        doc.close()
        return out

    @staticmethod
    def delete_pages(pdf_bytes: bytes, page_numbers: list[int]) -> bytes:
        """Elimina las páginas indicadas (1-indexadas)."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        # Eliminar en orden descendente para no desplazar índices
        sorted_indices = sorted([p - 1 for p in page_numbers if 1 <= p <= len(doc)], reverse=True)
        for idx in sorted_indices:
            doc.delete_page(idx)
        out = doc.tobytes()
        doc.close()
        return out

    @staticmethod
    def reorder_pages(pdf_bytes: bytes, new_order: list[int]) -> bytes:
        """Reordena las páginas según una nueva secuencia de números de página (1-indexados)."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        new_doc = pymupdf.open()
        for p_num in new_order:
            idx = p_num - 1
            if 0 <= idx < len(doc):
                new_doc.insert_pdf(doc, from_page=idx, to_page=idx)
        out = new_doc.tobytes()
        doc.close()
        new_doc.close()
        return out

    @staticmethod
    def add_watermark(
        pdf_bytes: bytes,
        text: str,
        opacity: float = 0.3,
        font_size: float = 48.0,
        color: tuple[float, float, float] = (0.7, 0.7, 0.7),
        angle: float = 45.0
    ) -> bytes:
        """Inserta una marca de agua diagonal con opacidad en todas las páginas."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        for page in doc:
            rect = page.rect
            cx = rect.width / 2
            cy = rect.height / 2
            
            # Crear un Form XObject o dibujar texto centrado
            # Usar insert_text rotado
            rad = math.radians(angle)
            # PyMuPDF morph: rotación alrededor del centro
            morph = (pymupdf.Point(cx, cy), pymupdf.Matrix(angle))
            page.insert_text(
                pymupdf.Point(cx - (len(text) * font_size * 0.25), cy),
                text,
                fontsize=font_size,
                fontname="helv",
                color=color,
                morph=morph
            )
        out = doc.tobytes()
        doc.close()
        return out

    @staticmethod
    def add_header_footer(
        pdf_bytes: bytes,
        header_text: Optional[str] = None,
        footer_text: Optional[str] = None,
        number_pages: bool = True,
        font_size: float = 9.0
    ) -> bytes:
        """Inserta encabezado, pie de página y numeración 'Página X de Y'."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        total_pages = len(doc)

        for i, page in enumerate(doc):
            rect = page.rect
            curr_page = i + 1

            # Encabezado (superior centrado o derecha)
            if header_text:
                page.insert_text(
                    pymupdf.Point(36, 25),
                    header_text,
                    fontsize=font_size,
                    fontname="helv",
                    color=(0.4, 0.4, 0.4)
                )

            # Pie de página / Numeración
            f_text = footer_text or ""
            if number_pages:
                num_str = f"Página {curr_page} de {total_pages}"
                f_text = f"{f_text}  -  {num_str}" if f_text else num_str

            if f_text:
                # Medir ancho aproximado para alinear a la derecha
                approx_w = len(f_text) * font_size * 0.5
                page.insert_text(
                    pymupdf.Point(max(36, rect.width - approx_w - 36), rect.height - 20),
                    f_text,
                    fontsize=font_size,
                    fontname="helv",
                    color=(0.4, 0.4, 0.4)
                )

        out = doc.tobytes()
        doc.close()
        return out
