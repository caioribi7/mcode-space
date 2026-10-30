import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, outfile: 'dist/app.js', format: 'iife', sourcemap: true, loader: { '.ttf': 'file' }, target: 'chrome140' });
await cp('src/index.html', 'dist/index.html');
await cp('assets', 'dist/assets', { recursive: true });
console.log('MCode Space preparado em dist/.');
