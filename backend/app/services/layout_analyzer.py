from typing import Any
import pymupdf

class LayoutAnalyzer:
    @staticmethod
    def extract_tables(page: pymupdf.Page) -> list[dict]:
        """Detecta tablas con PyMuPDF table finder."""
        tables_data = []
        try:
            tabs = page.find_tables()
            for tab in tabs:
                extracted = tab.extract()
                bbox = list(tab.bbox)
                tables_data.append({
                    "bbox": bbox,
                    "rows_count": len(extracted),
                    "cols_count": len(extracted[0]) if extracted else 0,
                    "data": extracted
                })
        except Exception:
            pass
        return tables_data

    @staticmethod
    def analyze_page_layout(page: pymupdf.Page) -> dict[str, Any]:
        """Analiza la estructura semántica de la página: columnas, márgenes, tablas, imágenes."""
        rect = page.rect
        blocks = page.get_text("blocks")
        tables = LayoutAnalyzer.extract_tables(page)
        images = page.get_images()

        text_blocks = []
        for b in blocks:
            # b: (x0, y0, x1, y1, "text", block_no, block_type)
            if b[6] == 0:  # Text block
                text_blocks.append({
                    "bbox": [b[0], b[1], b[2], b[3]],
                    "text": b[4],
                    "lines": b[4].count("\n") + 1
                })

        # Estimar márgenes
        margin_left = min((b["bbox"][0] for b in text_blocks), default=36.0)
        margin_right = rect.width - max((b["bbox"][2] for b in text_blocks), default=rect.width - 36.0)
        margin_top = min((b["bbox"][1] for b in text_blocks), default=36.0)
        margin_bottom = rect.height - max((b["bbox"][3] for b in text_blocks), default=rect.height - 36.0)

        # Detectar columnas (agrupación horizontal de bloques)
        columns = 1
        if len(text_blocks) >= 2:
            x_mids = [(b["bbox"][0] + b["bbox"][2]) / 2 for b in text_blocks]
            left_col = sum(1 for x in x_mids if x < rect.width * 0.45)
            right_col = sum(1 for x in x_mids if x > rect.width * 0.55)
            if left_col >= 2 and right_col >= 2:
                columns = 2

        return {
            "width": rect.width,
            "height": rect.height,
            "margins": {
                "top": round(margin_top, 1),
                "bottom": round(margin_bottom, 1),
                "left": round(margin_left, 1),
                "right": round(margin_right, 1)
            },
            "columns": columns,
            "tables": tables,
            "images_count": len(images),
            "text_blocks_count": len(text_blocks)
        }
