#!/usr/bin/env bash
set -e

echo "==============================================================="
echo "    DOCUPILOT STUDIO - PLATAFORMA PROFESIONAL DE PDF & OCR"
echo "==============================================================="
echo ""

# Activar entorno virtual de python si existe
if [ -d "backend/venv" ]; then
    source backend/venv/bin/activate
fi

echo "[1/2] Iniciando Backend FastAPI en segundo plano (puerto 8000)..."
export PYTHONPATH=backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

echo "[2/2] Iniciando Frontend Next.js (puerto 3000)..."
echo "Frontend: http://localhost:3000"
echo "Backend API Docs: http://127.0.0.1:8000/docs"
echo ""

npm run dev
