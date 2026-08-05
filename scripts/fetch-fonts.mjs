#!/usr/bin/env node
/**
 * Descarga las fuentes del sistema de diseño y las deja en apps/web/public/fonts/.
 *
 * Se autoalojan a propósito: la PWA debe abrir y renderizar correctamente sin
 * conexión (§18), y el worker de PDF necesita las mismas fuentes instaladas para
 * que el documento sea idéntico a la vista previa.
 *
 * Uso:  node scripts/fetch-fonts.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'apps/web/public/fonts');

/**
 * Google Fonts sirve woff2 variables cuando el User-Agent los soporta.
 * Pedimos la CSS, extraemos la URL del woff2 y la descargamos.
 */
const FONTS = [
  {
    file: 'montserrat-variable.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@600..900&display=swap',
  },
  {
    file: 'hanken-grotesk-variable.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..600&display=swap',
  },
  {
    file: 'jetbrains-mono-variable.woff2',
    css: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500..700&display=swap',
  },
  {
    file: 'material-symbols-outlined.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block',
  },
];

// Un UA moderno hace que Google Fonts devuelva woff2 y no ttf.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const font of FONTS) {
    process.stdout.write(`→ ${font.file} … `);

    const cssRes = await fetch(font.css, { headers: { 'User-Agent': UA } });
    if (!cssRes.ok) throw new Error(`CSS ${cssRes.status} para ${font.file}`);
    const css = await cssRes.text();

    // Preferimos el bloque latin; si no lo identificamos, el primer woff2 sirve.
    const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
    if (urls.length === 0) throw new Error(`Sin woff2 en la CSS de ${font.file}`);

    const fontRes = await fetch(urls.at(-1), { headers: { 'User-Agent': UA } });
    if (!fontRes.ok) throw new Error(`Fuente ${fontRes.status} para ${font.file}`);

    const bytes = Buffer.from(await fontRes.arrayBuffer());
    await writeFile(resolve(OUT, font.file), bytes);
    console.log(`${(bytes.length / 1024).toFixed(0)} KB`);
  }

  console.log(`\n✅ Fuentes en ${OUT}`);
  console.log('Revisa las licencias: Montserrat, Hanken Grotesk y JetBrains Mono son SIL OFL 1.1;');
  console.log('Material Symbols es Apache 2.0. Todas permiten el autoalojado.');
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exitCode = 1;
});
