@echo off
title DocuPilot Studio - PDF & OCR Professional Platform
echo ===============================================================
echo     DOCUPILOT STUDIO - PLATAFORMA PROFESIONAL DE PDF & OCR
echo ===============================================================
echo.

set "NODE_DIR=%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64"
set "PY_DIR=%LOCALAPPDATA%\Programs\Python\Python312"
set "TESS_DIR=%LOCALAPPDATA%\Programs\Tesseract-OCR"

if exist "%NODE_DIR%" set "PATH=%NODE_DIR%;%PATH%"
if exist "%PY_DIR%" set "PATH=%PY_DIR%;%PY_DIR%\Scripts;%PATH%"
if exist "%TESS_DIR%" (
    set "PATH=%TESS_DIR%;%PATH%"
    set "TESSDATA_PREFIX=%TESS_DIR%\tessdata"
)

echo [1/3] Verificando dependencias...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python no encontrado en PATH. Asegurate de tener Python 3.10+ instalado.
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js no encontrado en PATH. Asegurate de tener Node.js 18+ instalado.
)

echo.
echo [2/3] Iniciando Backend FastAPI (PyMuPDF + OpenCV + Tesseract) en puerto 8000...
start "DocuPilot Backend (FastAPI)" cmd /k "set PYTHONPATH=backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Iniciando Frontend Next.js en puerto 3000...
echo.
echo Aplicacion disponible en: http://localhost:3000
echo Backend API disponible en: http://127.0.0.1:8000/docs
echo.
call npm run dev
