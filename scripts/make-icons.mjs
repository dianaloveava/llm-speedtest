// Generates the Tauri icon set with no image libraries: a rounded blue tile
// with a white bolt, rasterised by hand and packed into PNG/ICO containers.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('src-tauri/icons');
fs.mkdirSync(OUT, { recursive: true });

const BG = [0, 113, 227, 255];       // --accent
const FG = [255, 255, 255, 255];

// Lightning bolt polygon in a 0..1 square (x, y), clockwise.
const BOLT = [
  [0.56, 0.08], [0.26, 0.55], [0.46, 0.55], [0.38, 0.92],
  [0.72, 0.42], [0.50, 0.42], [0.62, 0.08],
];

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded-square coverage via distance to the inner rect corners.
      const dx = Math.max(Math.abs(x + 0.5 - cx) - (half - radius), 0);
      const dy = Math.max(Math.abs(y + 0.5 - cy) - (half - radius), 0);
      const outside = Math.hypot(dx, dy) - radius;
      const coverage = Math.max(0, Math.min(1, 0.5 - outside));

      let color = BG;
      if (pointInPolygon((x + 0.5) / size, (y + 0.5) / size, BOLT)) color = FG;

      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = Math.round(color[3] * coverage);
    }
  }
  return px;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, crcBuf]);
}

function png(size) {
  const raw = render(size);
  const stride = size * 4;
  const withFilters = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilters[y * (stride + 1)] = 0;                       // filter: none
    raw.copy(withFilters, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(withFilters, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(pngData, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);   // type: icon
  header.writeUInt16LE(1, 4);   // one image
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;   // 0 means 256
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngData.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngData]);
}

const targets = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
];

for (const [name, size] of targets) {
  const data = png(size);
  fs.writeFileSync(path.join(OUT, name), data);
  console.log(`icons: ${name} (${size}×${size}, ${(data.length / 1024).toFixed(1)} KiB)`);
}

const icon256 = png(256);
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(icon256, 256));
console.log(`icons: icon.ico (256×256)`);
