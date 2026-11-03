#!/usr/bin/env node
/**
 * Generates every favicon / app icon / social image in `public/` from the SVG
 * sources below. Run with `npm run icons` after changing the design and commit
 * the output (the build does not run this script).
 *
 * Output:
 *   public/favicon.svg             modern browsers (scales to any size)
 *   public/favicon.ico             16/32/48 px legacy favicon
 *   public/apple-touch-icon.png    180 px, full-bleed (iOS rounds the corners)
 *   public/icon-192.png            PWA / Android
 *   public/icon-512.png            PWA / Android
 *   public/icon-maskable-512.png   PWA maskable (content inside the safe zone)
 *   public/og-image.png            1200x630 social preview
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => path.join(root, 'public', name);

const RED = '#D52B1E';
const RED_DARK = '#9E1B14';

const gradient = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="1" stop-color="${RED_DARK}"/>
    </linearGradient>
  </defs>`;

/**
 * The mark: three rising "paycheck deduction" bars that stop at a ceiling line —
 * the CPP / EI annual maximum this calculator is built around.
 * Drawn on a 512 grid; `scale` shrinks it around the centre (for maskable icons).
 */
function mark({ scale = 1, ceiling = true } = {}) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  return `
  <g transform="${t}" fill="#fff">
    <rect x="112" y="292" width="76" height="112" rx="14"/>
    <rect x="218" y="222" width="76" height="182" rx="14"/>
    <rect x="324" y="152" width="76" height="252" rx="14"/>
    ${ceiling ? '<rect x="96" y="108" width="320" height="22" rx="11" opacity="0.85"/>' : ''}
  </g>`;
}

const svgRounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>${mark()}
</svg>`;

const svgFullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
  <rect width="512" height="512" fill="url(#bg)"/>${mark({ scale })}
</svg>`;

/** Simplified mark for 16–48 px: chunkier bars, ceiling line kept but thicker. */
const svgSmall = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <g fill="#fff">
    <rect x="80" y="280" width="104" height="152" rx="16"/>
    <rect x="204" y="200" width="104" height="232" rx="16"/>
    <rect x="328" y="120" width="104" height="312" rx="16"/>
    <rect x="64" y="56" width="384" height="36" rx="18"/>
  </g>
</svg>`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1A1A1E"/>
      <stop offset="1" stop-color="#2A2A31"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${RED}"/>
      <stop offset="1" stop-color="${RED_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <g transform="translate(72 162) scale(0.6)">
    <rect width="512" height="512" rx="112" fill="url(#bg)"/>${mark()}
  </g>
  <g font-family="Inter, sans-serif" fill="#fff">
    <text x="440" y="250" font-size="64" font-weight="800">Ontario Income Tax</text>
    <text x="440" y="326" font-size="64" font-weight="800">&amp; Paycheck Calculator</text>
    <text x="440" y="400" font-size="27" font-weight="500" fill="#C9C9D1">Paycheck-by-paycheck CPP, CPP2 &amp; EI maximums</text>
    <text x="440" y="444" font-size="27" font-weight="500" fill="#C9C9D1">RSU tax rate · refund / balance owing</text>
  </g>
</svg>`;

async function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

/** Builds a .ico containing PNG-encoded images (supported by every modern browser). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

await writeFile(out('favicon.svg'), svgRounded.trim() + '\n');
const icoImages = [];
for (const size of [16, 32, 48]) icoImages.push({ size, data: await png(svgSmall, size) });
await writeFile(out('favicon.ico'), buildIco(icoImages));
await writeFile(out('apple-touch-icon.png'), await png(svgFullBleed(0.86), 180));
await writeFile(out('icon-192.png'), await png(svgRounded, 192));
await writeFile(out('icon-512.png'), await png(svgRounded, 512));
await writeFile(out('icon-maskable-512.png'), await png(svgFullBleed(0.72), 512));
await writeFile(
  out('og-image.png'),
  await sharp(Buffer.from(ogSvg), { density: 144 }).resize(1200, 630).png({ compressionLevel: 9 }).toBuffer(),
);
console.log('Icons written to public/');
