# DocuPilot Studio - Plataforma Privada Profesional de Edición de PDF con OCR Avanzado

Plataforma integral y modular inspirada en las capacidades profesionales de **Adobe Acrobat Pro** y **Wondershare PDFelement**, diseñada para editar, reconocer, convertir, organizar y proteger documentos PDF con **fidelidad milimétrica del diseño original** y motor **OCR multimodo**.

---

## 1. Arquitectura del Sistema

La plataforma implementa una arquitectura desacoplada de alto rendimiento:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 16 + React 19)                │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌───────────────┐   │
│   │   PDF.js Canvas    │   │  Toolbar & Context│   │ OCR & Review  │   │
│   │  Rendering Engine  │   │     Inspectors    │   │  Panels / Diff│   │
│   └─────────┬──────────┘   └─────────┬─────────┘   └───────┬───────┘   │
│             │                        │                     │           │
│             ▼                        ▼                     ▼           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  Content Stream Rewriter (pdf-lib + fontkit + metric layout)  │   │
│   └──────────────────────────────────┬─────────────────────────────┘   │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ HTTP / Multipart
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       BACKEND (Python 3.12 + FastAPI)                  │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌───────────────┐   │
│   │   PyMuPDF (fitz)   │   │ OpenCV Preprocess │   │ Tesseract OCR │   │
│   │ Layout & Tables    │   │  Deskew & Contrast│   │  HOCR / Boxes │   │
│   └─────────┬──────────┘   └─────────┬─────────┘   └───────┬───────┘   │
│             │                        │                     │           │
│             ▼                        ▼                     ▼           │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Multi-Mode OCR Engine: Modo A, Modo B, Modo C + DOCX/XLSX      │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Motor OCR Multimodo

### Modo A: OCR Fiel al Original
- Conserva el 100% de la estética visual, resolución, colores e imágenes de cada página.
- Genera una **capa de texto invisible calibrada geométricamente** (`render_mode=3`) alineada al subpíxel con cada palabra.
- Habilita búsqueda rápida (`Ctrl+F`), selección precisa y copiado de texto en escaneos.

### Modo B: OCR Editable
- Identifica bloques, líneas y palabras con coordenadas, tamaño, estilo y confianza de reconocimiento.
- Permite **reemplazar y editar texto directamente sobre el documento**, cubriendo o sustituyendo el contenido original y conservando las tipografías correspondientes.
- Incluye **Panel de Revisión OCR** con detección de baja confianza (< 75%) y telemetría de cajas delimitadoras.

### Modo C: OCR con Reconstrucción
- Reconstruye la jerarquía visual del documento a partir de escaneos.
- Detecta títulos, párrafos, listas, tablas y columnas.
- Permite exportar a **PDF**, **Microsoft Word (.docx)** y **Microsoft Excel (.xlsx)**.

---

## 3. Preprocesamiento de Imágenes (OpenCV)

Antes del reconocimiento óptico, el motor aplica filtros para maximizar la tasa de acierto:
- **Deskew (Enderezado automático)**: Calcula el ángulo de inclinación mediante el rectángulo mínimo de contornos o transformada de Hough y rota la imagen a 0°.
- **Contraste CLAHE**: Ecualización adaptativa de histograma para documentos tenues o descoloridos.
- **Modo Foto de Celular**: Eliminación de sombras e iluminación irregular mediante morfología matemática y sustracción de fondo.
- **Binarización Adaptativa & Denoise**: Limpieza de ruido de escaneo conservando trazos finos.

---

## 4. Comparador Visual Antes / Después (Diff Viewer)

Herramienta integrada para verificar que el documento no ha sufrido alteraciones visuales no deseadas:
- **Lado a Lado (Side-by-side)**: Comparación síncrona entre el escaneo original y la página editada.
- **Cortinilla Interactiva (Split Slider)**: Barra deslizante interactiva que permite revelar gradualmente los cambios.
- **Superposición (Overlay)**: Mezcla visual con opacidad graduable del 0 al 100%.

---

## 5. Conversión y Organización de Documentos

- **Formatos de exportación**:
  - PDF (vectorial, sin restricciones ni cifrado)
  - Microsoft Word (.docx con tablas y encabezados)
  - Microsoft Excel (.xlsx con extracción de celdas)
  - Texto plano (.txt en UTF-8)
  - Imágenes PNG / JPEG (150 y 300 DPI)
- **Organización**:
  - Marcas de agua diagonales u horizontales con opacidad y tamaño ajustables.
  - Encabezados, pies de página y numeración automática («Página X de Y»).
  - Rotación permanente de páginas individuales o por rangos.
  - Reordenación, duplicación y eliminación de páginas.

---

## 6. Asistente Documental IA (Privado y Local)

- **Resumen Ejecutivo**: Síntesis inteligente del documento.
- **Extracción de Entidades**: Identificación de fechas, importes monetarios, correos electrónicos, teléfonos y números de identificación fiscal (NIT / RUT / CIF).
- **Sugerencias de Corrección OCR**: Detección de confusiones comunes (ej. `0` vs `O`, `1` vs `l`, `rn` vs `m`) con botón de aprobación explícita del usuario.

---

## 7. Estructura del Proyecto

```
docupilot-studio-main/
├── backend/                         # Motor de procesamiento en Python
│   ├── app/
│   │   ├── config.py                # Detección de Tesseract y variables de entorno
│   │   ├── main.py                  # API FastAPI y CORS
│   │   ├── models/schemas.py        # Modelos Pydantic para OCR, conversión y layout
│   │   ├── services/
│   │   │   ├── image_preprocessor.py# Deskew, CLAHE, sombras con OpenCV
│   │   │   ├── ocr_engine.py        # Modos A, B y C con PyMuPDF y Tesseract
│   │   │   ├── layout_analyzer.py   # Detección de tablas, columnas y márgenes
│   │   │   ├── converter.py         # Exportación a DOCX, XLSX, TXT e imágenes
│   │   │   ├── organizer.py         # Marcas de agua, encabezados, rotación
│   │   │   └── ai_assistant.py      # Resumen y extracción de entidades
│   │   └── routes/                  # Endpoints REST para cada servicio
│   ├── tests/
│   │   └── test_backend.py          # Suite de pruebas unitarias en Pytest
│   └── requirements.txt
├── src/                             # Aplicación web Next.js + React + TypeScript
│   ├── app/
│   │   ├── api/py/[...path]/        # Proxy reverso hacia el backend FastAPI
│   │   └── ...                      # Rutas de la aplicación web
│   ├── components/
│   │   ├── editor/
│   │   │   ├── ocr/                 # Diálogo OCR, panel de revisión y visor Diff
│   │   │   ├── convert/             # Diálogo de exportación DOCX/XLSX/PNG
│   │   │   ├── organize/            # Diálogo de marcas de agua y páginas
│   │   │   ├── ai/                  # Panel lateral del Asistente de IA
│   │   │   ├── context-toolbar.tsx  # Barra contextual flotante sobre selección
│   │   │   └── editor.tsx           # Editor maestro integrado
│   │   └── ui/                      # Componentes modales, menú y notificaciones
│   └── lib/
│       ├── ocr/                     # Cliente TypeScript para el motor OCR
│       └── editor/pdf/              # Tokenizador y reescritor de content streams
├── tests/                           # Suite de pruebas Vitest para el editor y fidelidad
├── start.bat                        # Script de inicio en 1 clic para Windows
├── start.sh                         # Script de inicio para Linux / macOS
└── package.json
```

---

## 8. Guía de Ejecución

### Opción Rápida (Windows)
Ejecuta el archivo:
```bat
start.bat
```
Este script detecta los ejecutables de Node.js, Python 3.12 y Tesseract OCR, inicia el backend FastAPI en el puerto 8000 y el frontend Next.js en el puerto 3000.

### Ejecución Manual

#### 1. Iniciar el Backend (Python):
```bash
# Instalar dependencias
pip install -r backend/requirements.txt

# Iniciar servidor FastAPI
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. Iniciar el Frontend (Next.js):
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Acceso:
- **Plataforma Web**: `http://localhost:3000`
- **Documentación Interactiva Swagger / OpenAPI**: `http://127.0.0.1:8000/docs`

---

## 9. Pruebas Automatizadas

### Pruebas del Backend (Pytest):
```bash
$env:PYTHONPATH = "backend"
pytest backend/tests/test_backend.py -v
```
*Valida preprocesamiento con OpenCV, detección de escaneos, OCR Modos A, B y C, conversiones a DOCX/XLSX, organizador de páginas y extracción con IA.*

### Pruebas del Frontend y Fidelidad (Vitest):
```bash
npm test
```
*Ejecuta los 133 tests de fidelidad matemática de content streams, eliminación limpia, descifrado y operaciones de objetos.*
