import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Ensure public directory exists
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function createPngBuffer(width, height, drawPixelFn) {
  // RGBA pixels: 4 bytes per pixel + 1 filter byte (0) per scanline
  const rowSize = width * 4 + 1;
  const buffer = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    buffer[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      const pxOffset = rowOffset + 1 + x * 4;
      buffer[pxOffset] = r;
      buffer[pxOffset + 1] = g;
      buffer[pxOffset + 2] = b;
      buffer[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(buffer);

  // Helper for CRC32 calculation
  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      let byte = buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc ^ byte) & 1 ? 0xedb88320 : 0);
        byte >>>= 1;
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const typeAndData = Buffer.concat([typeBuf, data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([len, typeAndData, crcBuf]);
  }

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Icon design: Dark theme (#18181b), rounded rectangle / circle badge with a sleek Japanese " 没 " / " 浸 " / Play & Book symbol
function drawAppIcon(x, y, w, h, isMaskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Maskable icons use safe area (inner 80%)
  const margin = isMaskable ? 0 : w * 0.08;
  const cornerRadius = w * 0.22;

  // Background check for rounded rect
  let inBg = true;
  if (!isMaskable) {
    const rx = Math.max(0, Math.abs(dx) - (cx - margin - cornerRadius));
    const ry = Math.max(0, Math.abs(dy) - (cy - margin - cornerRadius));
    inBg = rx * rx + ry * ry <= cornerRadius * cornerRadius;
  }

  if (!inBg) {
    return [0, 0, 0, 0]; // Transparent outside icon bounds
  }

  // Base background: #18181b with subtle radial glow
  const normDist = dist / (w * 0.5);
  const glow = Math.max(0, 1 - normDist * 0.9);
  let r = Math.round(24 + glow * 15);
  let g = Math.round(24 + glow * 18);
  let b = Math.round(27 + glow * 35);
  let a = 255;

  // Outer ring / border accent
  if (!isMaskable && dist > cx - margin - 6 && dist <= cx - margin) {
    r = 99;
    g = 102;
    b = 241; // #6366f1 accent indigo
  }

  // Draw central graphic: sleek combination of play triangle and book page/frame
  const size = w * 0.38;

  // Outer glowing ring in center
  const ringDist = Math.abs(dist - size * 0.75);
  if (ringDist < size * 0.08) {
    const t = 1 - ringDist / (size * 0.08);
    r = Math.round(r * (1 - t) + 129 * t);
    g = Math.round(g * (1 - t) + 140 * t);
    b = Math.round(b * (1 - t) + 248 * t); // #818cf8
  }

  // Play button triangle pointing right in center
  // Triangle vertices relative to center
  const p1x = -size * 0.28;
  const p1y = -size * 0.42;
  const p2x = -size * 0.28;
  const p2y = size * 0.42;
  const p3x = size * 0.45;
  const p3y = 0;

  // Point-in-triangle check (barycentric)
  const dX = dx - size * 0.05; // slight shift right for visual optical center
  const dY = dy;

  const area = 0.5 * (-p2y * p3x + p1y * (p3x - p2x) + p1x * (p2y - p3y) + p2x * p3y);
  const s = 1 / (2 * area) * (p1y * p3x - p1x * p3y + (p3y - p1y) * dX + (p1x - p3x) * dY);
  const t = 1 / (2 * area) * (p1x * p2y - p1y * p2x + (p1y - p2y) * dX + (p2x - p1x) * dY);

  if (s >= 0 && t >= 0 && (1 - s - t) >= 0) {
    r = 244;
    g = 244;
    b = 245; // zinc-100 highlight
  }

  return [r, g, b, a];
}

console.log("Generating PWA icons...");

// Generate pwa-192x192.png
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPngBuffer(192, 192, (x, y, w, h) => drawAppIcon(x, y, w, h, false)));
console.log("Created pwa-192x192.png");

// Generate pwa-512x512.png
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPngBuffer(512, 512, (x, y, w, h) => drawAppIcon(x, y, w, h, false)));
console.log("Created pwa-512x512.png");

// Generate pwa-maskable-512x512.png
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPngBuffer(512, 512, (x, y, w, h) => drawAppIcon(x, y, w, h, true)));
console.log("Created pwa-maskable-512x512.png");

// Generate apple-touch-icon.png (180x180)
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPngBuffer(180, 180, (x, y, w, h) => drawAppIcon(x, y, w, h, false)));
console.log("Created apple-touch-icon.png");

// Generate favicon.svg
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <rect width="512" height="512" rx="112" fill="#18181b"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="#6366f1" stroke-width="16" opacity="0.8"/>
  <polygon points="216,144 216,368 376,256" fill="#f4f4f5"/>
</svg>`;
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgIcon);
console.log("Created favicon.svg");

console.log("All PWA icons generated successfully!");
