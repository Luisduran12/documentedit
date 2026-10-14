import re
from typing import Any
import pymupdf

from ..models.schemas import AIAnalysisResult
from .layout_analyzer import LayoutAnalyzer

class AIAssistant:
    DATE_PATTERNS = [
        r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b',
        r'\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b',
        r'\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4}\b',
        r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b'
    ]

    AMOUNT_PATTERNS = [
        r'\$\s?[\d,.]+(?:\.\d{2})?',
        r'\b(?:USD|EUR|COP|MXN)\s?[\d,.]+',
        r'[\d,.]+\s?(?:€|EUR|USD|\$)'
    ]

    EMAIL_PATTERN = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    PHONE_PATTERN = r'(?:\+\d{1,3}[- ]?)?\(?\d{2,4}\)?[- ]?\d{3,4}[- ]?\d{3,4}'
    ID_PATTERN = r'\b(?:NIT|RUT|CC|ID|DNI|RFC|NIF)[\s.:#]*[\d.-]+[a-zA-Z]?'

    # Errores comunes de OCR y sus correcciones sugeridas
    OCR_COMMON_TYPOS = [
        (r'\b0(?=[a-zA-Z])', 'O', 'Cero sustituido por letra O'),
        (r'(?<=[a-zA-Z])0\b', 'o', 'Cero al final de palabra sustituido por letra o'),
        (r'\b1(?=[a-z])', 'l', 'Uno sustituido por letra ele (l)'),
        (r'(?<=[a-z])1\b', 'l', 'Uno al final sustituido por letra ele (l)'),
        (r'\brn\b', 'm', 'Secuencia "rn" probablemente letra "m"'),
        (r'(?<=[a-zA-Z])5(?=[a-zA-Z])', 's', 'Número 5 dentro de palabra sustituido por ese (s)'),
    ]

    @classmethod
    def analyze_document(cls, pdf_bytes: bytes) -> AIAnalysisResult:
        """Analiza local y privadamente el PDF extrayendo entidades, resumen, tablas y sugerencias OCR."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        full_text_list = []
        tables_list = []

        for page in doc:
            full_text_list.append(page.get_text())
            tabs = LayoutAnalyzer.extract_tables(page)
            for t in tabs:
                tables_list.append(t["data"])

        doc.close()
        full_text = "\n".join(full_text_list).strip()

        if not full_text:
            return AIAnalysisResult(
                summary="El documento no contiene texto legible directamente. Se recomienda procesarlo con el Motor OCR.",
                key_points=[],
                entities={},
                ocr_corrections=[],
                tables=[]
            )

        # 1. Extracción de entidades
        entities: dict[str, list[str]] = {
            "dates": [],
            "amounts": [],
            "emails": [],
            "phones": [],
            "tax_ids": []
        }

        for dp in cls.DATE_PATTERNS:
            matches = re.findall(dp, full_text, flags=re.IGNORECASE)
            entities["dates"].extend(matches)

        for ap in cls.AMOUNT_PATTERNS:
            matches = re.findall(ap, full_text)
            entities["amounts"].extend(matches)

        raw_emails = re.findall(cls.EMAIL_PATTERN, full_text)
        entities["emails"] = list(set(e.rstrip(".,;:!?)") for e in raw_emails))
        entities["phones"] = list(set(re.findall(cls.PHONE_PATTERN, full_text)))
        entities["tax_ids"] = list(set(re.findall(cls.ID_PATTERN, full_text, flags=re.IGNORECASE)))
        entities["dates"] = list(dict.fromkeys(entities["dates"]))[:15]
        entities["amounts"] = list(dict.fromkeys(entities["amounts"]))[:15]

        # 2. Resumen inteligente (oraciones con mayor densidad léxica y palabras clave)
        sentences = [s.strip() for s in re.split(r'[.\n]+', full_text) if len(s.strip()) > 30]
        # Ponderar oraciones que contengan palabras relevantes
        keywords = ("acuerdo", "contrato", "informe", "total", "fecha", "servicio", "pago", "objeto", "certificado", "resolución", "cláusula")
        ranked_sentences = sorted(
            sentences,
            key=lambda s: sum(2 for k in keywords if k in s.lower()) + (1 if any(c.isdigit() for c in s) else 0),
            reverse=True
        )

        top_sentences = ranked_sentences[:3] if ranked_sentences else sentences[:3]
        summary = " ".join(top_sentences) + "." if top_sentences else "Documento procesado con éxito."

        # 3. Puntos clave
        key_points = []
        if entities["tax_ids"]:
            key_points.append(f"Identificadores detectados: {', '.join(entities['tax_ids'][:3])}")
        if entities["amounts"]:
            key_points.append(f"Valores e importes clave: {', '.join(entities['amounts'][:3])}")
        if entities["dates"]:
            key_points.append(f"Fechas relevantes: {', '.join(entities['dates'][:3])}")
        if len(key_points) < 2 and len(sentences) > 3:
            key_points.append(sentences[0])

        # 4. Sugerencias de corrección OCR
        ocr_corrections = []
        for pattern, replacement, reason in cls.OCR_COMMON_TYPOS:
            for match in re.finditer(pattern, full_text):
                matched_str = match.group()
                corrected_str = re.sub(pattern, replacement, matched_str)
                if matched_str != corrected_str and len(ocr_corrections) < 10:
                    ocr_corrections.append({
                        "original": matched_str,
                        "suggestion": corrected_str,
                        "reason": reason,
                        "context": full_text[max(0, match.start() - 15):min(len(full_text), match.end() + 15)].strip()
                    })

        return AIAnalysisResult(
            summary=summary,
            key_points=key_points,
            entities=entities,
            ocr_corrections=ocr_corrections,
            tables=tables_list[:5]
        )
