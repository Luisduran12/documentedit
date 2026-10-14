// Modelo de edición no destructiva: el PDF original nunca se modifica; las ediciones son esta lista
// de páginas + objetos (JSON) y solo se aplican con pdf-lib al guardar/exportar.

export type Rotation = 0 | 90 | 180 | 270;

/** Caja de vista de la página en espacio PDF nativo: [x0, y0, x1, y1] (pt). */
export type ViewBox = [number, number, number, number];

export type PageState = {
  id: string;
  /** Índice de página en el PDF base, o null si es una página en blanco insertada. */
  src: number | null;
  /** Rotación intrínseca del PDF (/Rotate). Define el "marco de pantalla" de los objetos. */
  baseRotation: Rotation;
  /** Rotación añadida por el usuario. */
  rotation: Rotation;
  view: ViewBox;
};

export type FontRef = {
  /** Id del catálogo (p. ej. "liberation-sans", "Helvetica") o "custom:<uuid>". */
  family: string;
  bold: boolean;
  italic: boolean;
};

export type Align = "left" | "center" | "right";

/**
 * Coordenadas de todos los objetos: puntos PDF en el marco de pantalla de la página
 * (rotación intrínseca aplicada, origen arriba-izquierda, y hacia abajo).
 */
type Box = { id: string; pageId: string; x: number; y: number; w: number; h: number; /** Grados (horario). */ rotation?: number };

export type TextStyle = {
  font: FontRef;
  size: number;
  color: string; // #rrggbb
  opacity: number; // 0..1
  lineHeight: number; // múltiplo del tamaño
  tracking: number; // pt extra entre caracteres
  align: Align;
};

export type TextObject = Box & {
  type: "text";
  text: string;
  style: TextStyle;
  /** Si existe, es una edición de texto original: se tapa este rectángulo con el color de fondo muestreado. */
  cover?: { x: number; y: number; w: number; h: number; color: string };
  /** Nombre de fuente detectado en el PDF (para el aviso del inspector). */
  sourceFont?: string;
};

export type ImageObject = Box & {
  type: "image";
  assetKey: string;
  mime: "image/png" | "image/jpeg";
  opacity: number;
  /** Cómo encaja la imagen en su caja (por defecto, estirar a la caja). */
  fit?: "stretch" | "contain" | "cover";
  /** Escalado sin suavizado (QR e imágenes pequeñas, para que sigan escaneables). */
  pixelated?: boolean;
  /** Tamaño en píxeles de la imagen (para avisar de baja resolución). */
  px?: { w: number; h: number };
};

export type QrObject = Box & { type: "qr"; url: string; shareId: string };

export type HighlightObject = Box & { type: "highlight"; color: string; opacity: number };

/** Tapar/borrar zona: rectángulo opaco. */
export type CoverObject = Box & { type: "cover"; color: string };

/** Trazos normalizados [0..1] dentro de la caja: se mueven y redimensionan libremente. */
export type InkObject = Box & { type: "ink"; strokes: [number, number][][]; color: string; width: number };

/**
 * Edición de un texto ORIGINAL del PDF (línea). Se elimina el texto original del content stream y se
 * escribe el nuevo con la misma fuente y métricas. x,y,w,h = caja original (marco de pantalla).
 */
export type TextEditObject = Box & {
  type: "textEdit";
  /** Registros de texto (operaciones) y rangos de glifos que forman la línea original. */
  parts: { rec: string; from: number; to: number }[];
  originalText: string;
  text: string;
  align: Align;
  /** Multiplicador de la escala horizontal original (1 = igual). */
  scaleX: number;
  /** Multiplicador del tamaño original (1 = igual). */
  sizeScale: number;
  color?: string;
  /** Familia sustituta elegida a mano. */
  fontOverride?: string;
  /** Respaldo: tapar con color (solo si no se puede eliminar limpiamente o el usuario lo fuerza). */
  cover?: { color: string; rects: { x: number; y: number; w: number; h: number }[]; forced?: boolean };
  /** Espacio horizontal disponible en la celda (marco), para avisar de desbordes. */
  room?: { x0: number; x1: number };
  /** Desplazamiento (marco, pt) si el texto original se movió a otra posición. */
  dx?: number;
  dy?: number;
  /** Nombres de las fuentes originales de la línea (informativo). */
  fontNames?: string[];
};

/** "Borrar zona": elimina del content stream imágenes, trayectos vectoriales (y opcionalmente texto) dentro. */
export type ZoneEraseObject = Box & { type: "zoneErase"; includeText: boolean; label?: string };

/**
 * Imagen ORIGINAL del PDF: borrada o reubicada (mover/redimensionar/rotar). `ref` = id del dibujo en el
 * content stream; `orig` = caja original (marco).
 */
export type ImageEditObject = Box & {
  type: "imageEdit";
  ref: string;
  orig: { x: number; y: number; w: number; h: number };
  removed: boolean;
  rotation?: number;
};

export type EditObject = TextObject | TextEditObject | ImageObject | QrObject | HighlightObject | CoverObject | InkObject | ZoneEraseObject | ImageEditObject;

export type EditDoc = { pages: PageState[]; objects: EditObject[] };

export type Draft = EditDoc & { formatVersion: 1; baseDocumentId: string; savedAt: string };
