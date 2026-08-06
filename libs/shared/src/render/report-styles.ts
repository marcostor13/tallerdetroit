/**
 * Hoja de estilos del documento emitido.
 *
 * Es **una sola** y la usan los dos consumidores: la vista previa del wizard y
 * el render de PDF con Playwright. El requisito UX-06 es que la vista previa sea
 * idéntica al PDF, y con dos hojas separadas eso dura hasta el primer cambio en
 * una de ellas.
 *
 * Va como texto y no como archivo `.css` porque tiene que viajar embebida: el
 * navegador sin red del taller y Chromium en el contenedor del worker no pueden
 * depender de que una petición a un `<link>` llegue a tiempo.
 *
 * Las medidas son de A4 con márgenes de 20 mm, que es lo que usa el Word actual.
 */
export const REPORT_STYLES = `
:root {
  --tinta: #1A1A1A;
  --tinta-suave: #4A4A4A;
  --linea: #B0B0B0;
  --linea-fina: #DDDDDD;
  --fondo-cabecera: #F2F2F2;
  --fuera-tolerancia: #B3261E;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  color: var(--tinta);
  background: #fff;
  font-family: 'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif;
  font-size: 10pt;
  line-height: 1.45;
}

/* Una hoja A4. En pantalla se ven apiladas; al imprimir, cada una es su página. */
.hoja {
  width: 210mm;
  min-height: 297mm;
  padding: 20mm;
  margin: 0 auto;
  background: #fff;
}

/* --- Cabecera SER-FOR-002 -------------------------------------------------
   Réplica del recuadro del formato controlado: logo, título y el bloque de
   código/versión/fecha que Calidad exige en todas sus páginas. */
.cabecera {
  display: grid;
  grid-template-columns: 34mm 1fr 42mm;
  border: 1pt solid var(--tinta);
  margin-bottom: 6mm;
}
.cabecera > * {
  padding: 3mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.cabecera__logo { border-right: 1pt solid var(--tinta); }
.cabecera__logo img { max-width: 100%; max-height: 16mm; object-fit: contain; }
.cabecera__titulo {
  border-right: 1pt solid var(--tinta);
  text-align: center;
  font-family: 'Montserrat', system-ui, sans-serif;
  font-weight: 700;
  font-size: 12pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.cabecera__meta { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 7.5pt; }
.cabecera__meta div { display: flex; justify-content: space-between; gap: 2mm; }
.cabecera__meta dt { color: var(--tinta-suave); }

/* --- Secciones ----------------------------------------------------------- */
.seccion { margin-bottom: 6mm; }

.seccion__titulo {
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 11pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1.5mm 2mm;
  background: var(--fondo-cabecera);
  border-left: 2pt solid var(--tinta);
  margin: 0 0 3mm;
  /* Un título al pie de página con su contenido en la siguiente es el defecto
     de paginación más visible del Word actual. */
  break-after: avoid;
  page-break-after: avoid;
}

.bloque { margin-bottom: 4mm; }
.bloque__titulo {
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 10pt;
  font-weight: 600;
  text-transform: uppercase;
  margin: 0 0 1.5mm;
  break-after: avoid;
  page-break-after: avoid;
}
.bloque__texto { margin: 0 0 2mm; text-align: justify; white-space: pre-line; }

/* --- Tablas de datos ----------------------------------------------------- */
.tabla-datos {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  /* Una tabla partida por la mitad se lee mal y descoloca los encabezados. */
  break-inside: avoid;
  page-break-inside: avoid;
}
.tabla-datos th,
.tabla-datos td {
  border: 0.5pt solid var(--linea);
  padding: 1.5mm 2mm;
  text-align: left;
  vertical-align: top;
}
.tabla-datos th {
  background: var(--fondo-cabecera);
  font-family: 'Montserrat', system-ui, sans-serif;
  font-weight: 600;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  width: 38mm;
}
.tabla-datos td.numero {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* --- Fotografías --------------------------------------------------------- */
.fotos {
  display: grid;
  grid-template-columns: 1fr 1fr; /* En pares, como el Word actual. */
  gap: 4mm;
  margin: 3mm 0;
}
.foto {
  /* La figura y su pie no se separan nunca: un pie huérfano en la página
     siguiente deja la foto sin explicación y el texto apuntando a nada. */
  break-inside: avoid;
  page-break-inside: avoid;
  margin: 0;
}
.foto img {
  width: 100%;
  height: 55mm;
  object-fit: cover;
  border: 0.5pt solid var(--linea);
  display: block;
}
.foto figcaption {
  font-size: 8pt;
  color: var(--tinta-suave);
  padding-top: 1mm;
  text-align: center;
}
.foto__numero {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 600;
  color: var(--tinta);
}

/* --- Listas -------------------------------------------------------------- */
.vinetas { margin: 0 0 2mm; padding-left: 5mm; }
.vinetas li { margin-bottom: 1mm; }

/* --- Firmas -------------------------------------------------------------- */
.firmas {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10mm;
  margin-top: 12mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.firma { text-align: center; }
.firma__linea { border-top: 0.5pt solid var(--tinta); margin-bottom: 1.5mm; }
.firma__nombre { font-weight: 600; font-size: 9pt; }
.firma__cargo { font-size: 8pt; color: var(--tinta-suave); text-transform: uppercase; }

/* --- Pie de verificación (E3.6) -----------------------------------------
   Empieza en la última página, no en una propia: es un pie, no un anexo. */
.verificacion {
  display: flex;
  align-items: center;
  gap: 4mm;
  margin-top: 10mm;
  padding-top: 3mm;
  border-top: 0.5pt solid var(--tinta-suave);
  break-inside: avoid;
  page-break-inside: avoid;
}
.verificacion__qr {
  width: 22mm;
  height: 22mm;
  flex: 0 0 auto;
}
.verificacion__titulo {
  font-family: 'Montserrat', system-ui, sans-serif;
  font-weight: 600;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 1mm;
}
.verificacion__url,
.verificacion__hash {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 7.5pt;
  color: var(--tinta-suave);
  margin: 0;
  word-break: break-all;
}

/* --- Marca de borrador ---------------------------------------------------
   Un borrador impreso sin distintivo se confunde con el documento emitido, y
   en un formato controlado eso es un problema de verdad. */
.borrador::before {
  content: 'BORRADOR';
  position: fixed;
  top: 45%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-30deg);
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 72pt;
  font-weight: 700;
  color: rgba(179, 38, 30, 0.10);
  letter-spacing: 0.1em;
  pointer-events: none;
  z-index: 100;
}

/* --- Tablas dimensionales (§12, E2.6) -------------------------------------
   El informe se imprime y se fotocopia en blanco y negro. El color marca el
   estado en pantalla, pero lo que sobrevive a una fotocopia es la NEGRITA y el
   símbolo: por eso un valor fuera de tolerancia lleva las tres cosas. */
.tabla-medicion {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 9pt;
  font-variant-numeric: tabular-nums;
  break-inside: avoid;
  page-break-inside: avoid;
}
.tabla-medicion caption {
  caption-side: top;
  text-align: left;
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 9.5pt;
  font-weight: 600;
  padding-bottom: 1mm;
}
.tabla-medicion th,
.tabla-medicion td {
  border: 0.5pt solid var(--linea);
  padding: 1mm 1.5mm;
  text-align: right;
  white-space: nowrap;
}
.tabla-medicion thead th,
.tabla-medicion tbody th {
  background: var(--fondo-cabecera);
  font-weight: 600;
  text-align: center;
}
.tabla-medicion tbody th { text-align: left; }

/* Fila de referencia: contra qué se midió. Sin ella la tabla es una lista de
   números sin significado, que es como sale hoy del Word. */
.tabla-medicion__referencia {
  font-family: 'Hanken Grotesk', system-ui, sans-serif;
  font-size: 8pt;
  color: var(--tinta-suave);
  padding-bottom: 1mm;
}
.tabla-medicion__referencia strong { color: var(--tinta); }

.celda--alerta { font-weight: 600; }

/* Fuera de tolerancia: negrita + símbolo + color. Cualquiera de los tres por
   separado se pierde en algún medio; los tres juntos, no. */
.celda--fuera {
  font-weight: 700;
  color: var(--fuera-tolerancia);
}
.celda--fuera::after { content: ' A0'; }

.celda--calculada {
  background: var(--fondo-cabecera);
  color: var(--tinta-suave);
}

.leyenda-medicion {
  font-family: 'Hanken Grotesk', system-ui, sans-serif;
  font-size: 7.5pt;
  color: var(--tinta-suave);
  margin: 1mm 0 3mm;
}

/* --- Inventario de desarmado (SER-T-FOR-002, D4) --------------------------
   Va dentro del informe, no como documento aparte: una sola versión de lo que
   se encontró al abrir el motor. */
.tabla-checklist {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
.tabla-checklist th,
.tabla-checklist td {
  border: 0.5pt solid var(--linea);
  padding: 1mm 2mm;
  text-align: left;
}
.tabla-checklist thead th {
  background: var(--fondo-cabecera);
  font-family: 'Montserrat', system-ui, sans-serif;
  font-size: 8pt;
  font-weight: 600;
  text-transform: uppercase;
}
.tabla-checklist td.cantidad {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
  width: 22mm;
}

/* Lo que falta o está averiado, en negrita: sobrevive a la fotocopia. */
.checklist--atencion { font-weight: 700; }
.checklist--atencion td { color: var(--fuera-tolerancia); }
.checklist--sin-revisar td { color: var(--tinta-suave); font-style: italic; }

/* Anexo de mediciones: empieza en página nueva, como en el Word. */
.hoja-mediciones { break-before: page; page-break-before: always; }

@media print {
  .hoja { margin: 0; padding: 0; width: auto; min-height: 0; }
  body { background: #fff; }
}

@page {
  size: A4;
  margin: 20mm;
}
`;
