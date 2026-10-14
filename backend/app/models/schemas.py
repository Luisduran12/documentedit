from typing import Optional, Literal
from pydantic import BaseModel, Field

class OCRWord(BaseModel):
    text: str
    confidence: float = 100.0
    bbox: list[float] = Field(description="[x0, y0, x1, y1] in points (72 DPI PDF space)")
    font_size: float = 12.0
    is_low_confidence: bool = False

class OCRLine(BaseModel):
    text: str
    bbox: list[float]
    words: list[OCRWord] = []
    line_height: float = 14.0

class OCRBlock(BaseModel):
    id: str
    type: Literal["paragraph", "heading", "table", "header", "footer", "list"] = "paragraph"
    bbox: list[float]
    text: str
    lines: list[OCRLine] = []
    confidence: float = 100.0

class OCRPageResult(BaseModel):
    page_number: int
    width: float
    height: float
    is_scanned: bool = False
    average_confidence: float = 100.0
    low_confidence_count: int = 0
    blocks: list[OCRBlock] = []
    text_content: str = ""

class OCRDocumentResult(BaseModel):
    total_pages: int
    language: str = "spa"
    mode: Literal["mode_a", "mode_b", "mode_c"] = "mode_a"
    pages: list[OCRPageResult] = []
    processing_time_ms: float = 0.0

class PreprocessOptions(BaseModel):
    deskew: bool = True
    enhance_contrast: bool = True
    phone_photo_mode: bool = False
    denoise: bool = False
    binarize: bool = False

class ConvertOptions(BaseModel):
    target_format: Literal["docx", "xlsx", "txt", "png", "jpg"]
    dpi: int = 300
    preserve_layout: bool = True

class OrganizeOperation(BaseModel):
    operation: Literal["merge", "split", "rotate", "delete", "watermark", "page_numbers", "header_footer"]
    params: dict = {}

class AIAnalysisResult(BaseModel):
    summary: str
    key_points: list[str] = []
    entities: dict[str, list[str]] = Field(default_factory=dict)
    ocr_corrections: list[dict[str, str]] = []
    tables: list[list[list[str]]] = []
