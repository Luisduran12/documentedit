import os
import shutil
from pathlib import Path
import pytesseract

class Settings:
    PROJECT_NAME: str = "DocuPilot Studio Backend"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api"
    
    # Storage and temp files
    TEMP_DIR: Path = Path(os.environ.get("TEMP_DIR", Path(__file__).resolve().parent.parent / "temp"))
    MAX_FILE_SIZE_MB: int = int(os.environ.get("MAX_FILE_SIZE_MB", "50"))
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "*"
    ]
    
    # Tesseract path auto-detection
    TESSERACT_CMD: str = ""
    TESSDATA_DIR: str = ""

settings = Settings()
settings.TEMP_DIR.mkdir(parents=True, exist_ok=True)

def init_tesseract() -> str:
    possible_paths = [
        os.environ.get("TESSERACT_CMD", ""),
        str(Path.home() / "AppData" / "Local" / "Programs" / "Tesseract-OCR" / "tesseract.exe"),
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        "/usr/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/opt/homebrew/bin/tesseract",
        shutil.which("tesseract") or ""
    ]
    for p in possible_paths:
        if p and Path(p).is_file():
            settings.TESSERACT_CMD = str(p)
            pytesseract.pytesseract.tesseract_cmd = str(p)
            
            # Tessdata directory
            tessdata_candidates = [
                Path(p).parent / "tessdata",
                Path("/usr/share/tesseract-ocr/5/tessdata"),
                Path("/usr/share/tesseract-ocr/4.00/tessdata"),
            ]
            for td in tessdata_candidates:
                if td.is_dir():
                    settings.TESSDATA_DIR = str(td)
                    os.environ["TESSDATA_PREFIX"] = str(td)
                    break
            return str(p)
            
    # Default fallback to which
    which_cmd = shutil.which("tesseract")
    if which_cmd:
        settings.TESSERACT_CMD = which_cmd
        pytesseract.pytesseract.tesseract_cmd = which_cmd
        return which_cmd
    return ""

init_tesseract()
