import io
from typing import Literal
import pymupdf
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from PIL import Image

from .layout_analyzer import LayoutAnalyzer

class DocumentConverter:
    @staticmethod
    def pdf_to_docx(pdf_bytes: bytes) -> bytes:
        """Convierte PDF a documento DOCX conservando párrafos, títulos y tablas."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        word_doc = docx.Document()

        for page in doc:
            tables = LayoutAnalyzer.extract_tables(page)
            # Regiones de tablas para no duplicar texto
            table_rects = [pymupdf.Rect(t["bbox"]) for t in tables]

            # Bloques de texto ordenados verticalmente
            blocks = page.get_text("blocks")
            blocks.sort(key=lambda b: (b[1], b[0]))

            for b in blocks:
                if b[6] != 0:
                    continue
                block_rect = pymupdf.Rect(b[0], b[1], b[2], b[3])
                
                # Si el bloque cae dentro de una tabla reconocida, se ignora aquí (se insertará con la tabla)
                in_table = any(block_rect.intersects(t_rect) for t_rect in table_rects)
                if in_table:
                    continue

                text = b[4].strip()
                if not text:
                    continue

                # Determinar si es título o párrafo
                # Títulos suelen ser cortos y tener mayor tamaño
                lines = text.split("\n")
                if len(lines) <= 2 and len(text) < 100:
                    p = word_doc.add_heading(text, level=2)
                else:
                    p = word_doc.add_paragraph(text)
                p.paragraph_format.space_after = Pt(6)

            # Insertar tablas detectadas
            for t in tables:
                rows_data = t["data"]
                if not rows_data:
                    continue
                n_rows = len(rows_data)
                n_cols = len(rows_data[0]) if rows_data else 0
                if n_cols == 0:
                    continue

                table = word_doc.add_table(rows=n_rows, cols=n_cols)
                table.style = "Table Grid"
                for r_idx, row in enumerate(rows_data):
                    for c_idx, val in enumerate(row):
                        cell = table.cell(r_idx, c_idx)
                        cell.text = str(val or "").strip()
                word_doc.add_paragraph()  # Espaciador

            # Salto de página entre páginas si no es la última
            if page.number < len(doc) - 1:
                word_doc.add_page_break()

        doc.close()
        out_stream = io.BytesIO()
        word_doc.save(out_stream)
        return out_stream.getvalue()

    @staticmethod
    def pdf_to_xlsx(pdf_bytes: bytes) -> bytes:
        """Extrae tablas y datos estructurados del PDF en un libro Excel XLSX."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        wb = openpyxl.Workbook()
        wb.remove(wb.active)  # Quitar hoja por defecto

        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )

        sheet_count = 0
        for page_idx, page in enumerate(doc):
            tables = LayoutAnalyzer.extract_tables(page)
            for t_idx, table_data in enumerate(tables):
                sheet_count += 1
                sheet_title = f"Pág{page_idx + 1}_Tabla{t_idx + 1}"[:31]
                ws = wb.create_sheet(title=sheet_title)

                for r_idx, row in enumerate(table_data["data"], start=1):
                    for c_idx, cell_value in enumerate(row, start=1):
                        cell = ws.cell(row=r_idx, column=c_idx, value=cell_value or "")
                        cell.border = thin_border
                        if r_idx == 1:
                            cell.font = header_font
                            cell.fill = header_fill
                            cell.alignment = Alignment(horizontal="center", vertical="center")

                # Auto-ajustar anchos de columnas
                for col in ws.columns:
                    max_len = max(len(str(c.value or "")) for c in col)
                    col_letter = openpyxl.utils.get_column_letter(col[0].column)
                    ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # Si no hubo tablas formales, volcar el texto por líneas estructuradas
        if sheet_count == 0:
            ws = wb.create_sheet(title="Texto_Extraido")
            row_num = 1
            for page in doc:
                lines = page.get_text().split("\n")
                for line in lines:
                    line_str = line.strip()
                    if line_str:
                        # Si tiene tabulaciones o múltiples espacios, separar en columnas
                        parts = [p.strip() for p in line_str.split("\t") if p.strip()]
                        if len(parts) <= 1:
                            ws.cell(row=row_num, column=1, value=line_str)
                        else:
                            for c_idx, val in enumerate(parts, start=1):
                                ws.cell(row=row_num, column=c_idx, value=val)
                        row_num += 1

        doc.close()
        out_stream = io.BytesIO()
        wb.save(out_stream)
        return out_stream.getvalue()

    @staticmethod
    def pdf_to_txt(pdf_bytes: bytes) -> str:
        """Extrae el contenido textual limpio con jerarquía de páginas."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        output = []
        for i, page in enumerate(doc):
            output.append(f"--- PÁGINA {i + 1} ---")
            output.append(page.get_text())
        doc.close()
        return "\n\n".join(output)

    @staticmethod
    def pdf_to_images(pdf_bytes: bytes, dpi: int = 200, format: Literal["png", "jpeg"] = "png") -> list[bytes]:
        """Renderiza cada página del PDF en una imagen con la resolución seleccionada."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        images = []
        for page in doc:
            pix = page.get_pixmap(dpi=dpi)
            images.append(pix.tobytes(format))
        doc.close()
        return images

    @staticmethod
    def images_to_pdf(images_bytes_list: list[bytes]) -> bytes:
        """Convierte una lista de imágenes en un documento PDF multipágina."""
        doc = pymupdf.open()
        for img_bytes in images_bytes_list:
            pil_img = Image.open(io.BytesIO(img_bytes))
            # Dimensiones en puntos PDF (72 DPI)
            w_pt = (pil_img.width / pil_img.info.get("dpi", (72, 72))[0]) * 72
            h_pt = (pil_img.height / pil_img.info.get("dpi", (72, 72))[1]) * 72
            page = doc.new_page(width=w_pt, height=h_pt)
            page.insert_image(page.rect, stream=img_bytes)
        out = doc.tobytes()
        doc.close()
        return out
