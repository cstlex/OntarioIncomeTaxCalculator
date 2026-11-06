#!/usr/bin/env node
/**
 * Injects the server-rendered app (default inputs) into dist/index.html.
 * Runs after `vite build` and `vite build --ssr src/entry-server.tsx --outDir dist-ssr`.
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'dist', 'index.html');
const ssrDir = path.join(root, 'dist-ssr');

const { render } = await import(pathToFileURL(path.join(ssrDir, 'entry-server.js')).href);
const appHtml = render();
const html = await readFile(htmlPath, 'utf8');
const placeholder = '<div id="root"></div>';
if (!html.includes(placeholder)) throw new Error('Root placeholder not found in dist/index.html');
await writeFile(htmlPath, html.replace(placeholder, `<div id="root">${appHtml}</div>`));
await rm(ssrDir, { recursive: true, force: true });
console.log(`Prerendered ${(appHtml.length / 1024).toFixed(1)} KiB of HTML into dist/index.html`);
