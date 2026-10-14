# Editor: imágenes, «Borrar zona», mover/rotar y exportación

Complementa a [`editor-fidelidad.md`](editor-fidelidad.md) (edición del texto original). Misma técnica: el contenido
original se modifica **en el content stream**, sin tapar con rectángulos; todo lo que no se toca queda byte a byte.

## 1. Borrar imágenes y QR que ya trae el PDF

- El intérprete registra cada dibujo de imagen: XObject (`/Im Do`), imágenes en línea (`BI … ID … EI`), con máscara
  o transparencia (`SMask`/`Mask`), dentro de Form XObjects y bajo recortes.
- **Borrar** elimina esa operación del stream. Si la imagen está dentro de un Form XObject compartido, se clona el
  XObject solo para esa página (la otra página no cambia).
- Con **Seleccionar**, las imágenes del PDF se resaltan al pasar el puntero; un clic las selecciona, **Supr** las borra.

## 2. «Borrar zona» (QR vectoriales, sellos, gráficos)

Muchos QR vienen dibujados como cientos de cuadritos vectoriales. Al trazar una zona:

| Elemento | Qué se hace |
| --- | --- |
| Imagen dentro de la zona (≥ 90 % de su área) | Se elimina |
| Trayecto completamente dentro | Se elimina (construcción + pintado) |
| Trayecto con varios subtrayectos (p. ej. un QR en un solo trayecto) | Se **recorta**: se quitan solo los subtrayectos que están dentro |
| Trazo que atraviesa la zona (líneas de tabla) | **Se conserva** y se informa cuántos |
| Texto dentro de la zona | Solo si se marca «Borrar también el texto» (eliminación por glifo) |

Recortar geométricamente un segmento recto que cruza la zona no se hace: se conserva entero y se avisa en pantalla.

**Detección automática de QR**: sobre el render de la página se busca con jsQR (página completa y, si no aparece,
por ventanas solapadas). Cada QR encontrado muestra «QR · Borrar»: si coincide con una imagen se borra la imagen;
si es vectorial, se crea una zona ajustada al código (+1 módulo). Si la detección no lo encuentra, queda «Borrar zona».

## 3. Pegar, soltar y reemplazar imágenes

- Cmd/Ctrl+V (capturas, WhatsApp Web, otras pestañas), arrastrar archivos al lienzo (se colocan donde se sueltan),
  o «Añadir imagen» (en celular ofrece cámara/galería).
- PNG y JPG se incrustan **sin recomprimir** (PNG sin pérdida, con su transparencia); WEBP/GIF → PNG sin pérdida;
  SVG → PNG a ≥ 2000 px.
- Si la imagen es un QR, se marca **nítida** (`/Interpolate false` en el PDF y render pixelado) para que siga
  escaneable; el inspector muestra los ppp efectivos y avisa por debajo de 150 ppp.
- Con una imagen, un QR o una imagen original seleccionada, pegar/soltar ofrece **Reemplazar en el mismo lugar**
  (Ajustar o Rellenar) heredando posición, tamaño y rotación.
- «Insertar un QR de la app» lista los enlaces vigentes de «Imágenes y QR».

## 4. Mover, redimensionar y rotar

- **Todo lo editable se arrastra en un solo gesto**: textos e imágenes originales (se convierten en objeto editable al
  agarrarlos) y todo lo añadido.
- Texto original movido: se elimina limpiamente de su sitio y se reescribe con la misma fuente, escala, espaciado y
  color en el destino (se escribe al final de la página para no quedar cortado por su recorte original).
- Imagen original movida/redimensionada/rotada: se borra su dibujo y se vuelve a dibujar el **mismo XObject** con
  la nueva matriz (sin recomprimir).
- Esquinas: redimensionar con proporción fija (Shift libre; zonas y resaltados, libres). Asa superior: rotar (Shift,
  pasos de 15°). Selección múltiple con recuadro o Shift+clic; alinear en grupo; flechas (Shift: 10 pt); Supr;
  Cmd/Ctrl+D duplica lo añadido; capas: al frente / atrás. Guías magnéticas con la página y otros objetos (Alt las
  desactiva). En táctil: arrastrar con el dedo y **pellizcar sobre el objeto seleccionado** para redimensionarlo.
- Límite (se avisa en pantalla): las líneas sueltas de tabla y los gráficos vectoriales no son objetos individuales;
  para ellos está «Borrar zona».

## 5. Exportar

| Opción | Resultado |
| --- | --- |
| PDF | Mismo nombre que el archivo subido; sin cifrado ni restricciones. No guarda nada en el servidor. |
| PNG, página actual | `nombre.png` a 150, 200 o 300 ppp, fondo blanco |
| PNG, todas | `nombre.zip` con `nombre-p1.png`, `nombre-p2.png`… |

El PNG se renderiza desde el PDF final, así que incluye ediciones, imágenes pegadas y QR.

## 6. Pruebas

`tests/erase-move.test.ts`, `tests/images.test.ts`, `tests/export.test.ts`, `tests/store-ops.test.ts`
(sobre `tests/fixtures/fuec-sintetico.pdf`, render a 200 ppp):

- Borrar QR imagen, PNG con transparencia, imagen en línea e imagen en un XObject compartido: **0 píxeles fuera**.
- «Borrar zona» sobre el QR vectorial: ya no se decodifica, la línea de tabla que lo cruza sigue continua y fuera de
  la zona no cambia nada.
- Mover texto e imagen originales: origen limpio, destino idéntico (desplazamiento exacto en píxeles).
- Imagen pegada: posición correcta y píxeles idénticos al PNG; QR pegado legible en el PDF y en el PNG;
  ajustar/rellenar dentro del recuadro; rotación alrededor del centro.
- Exportación: nombres, ZIP, PNG sin ediciones igual al original.
- Deshacer/rehacer de cada operación (un gesto completo = un paso).

Prueba manual con el FUEC real (solo local): el logo de FURA/SuperTransporte se borró con **0 píxeles distintos
fuera de su área** y la celda intacta (verificado también en Vista Previa de macOS). Esa copia del FUEC no tenía QR;
el caso de QR vectorial está cubierto por el PDF sintético.
