// El package.json de la librería declara "type": "module", así que Node trataría
// como ESM también lo que hay en dist/cjs. Este marcador le dice que esa carpeta
// es CommonJS, que es lo que consumen NestJS (api y worker).
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/cjs/package.json');
writeFileSync(out, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log('dist/cjs marcado como CommonJS');
