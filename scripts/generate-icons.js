// Standalone PNG generator for HoneLENS icons without external dependencies
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + width * 4);
    scanlines[scanlineOffset] = 0; // Filter None
    rgbaBuffer.copy(
      scanlines,
      scanlineOffset + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function renderHoneIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const navy = [0x18, 0x32, 0x4a, 0xff];
  const teal = [0x1f, 0x6f, 0x78, 0xff];
  const edge = [0xc9, 0xe8, 0x5e, 0xff];

  // Draw on scaled coordinate system (130 x 175)
  const pad = size * 0.1;
  const drawW = size - pad * 2;
  const drawH = size - pad * 2;

  function toLocal(x, y) {
    return [pad + (x / 130) * drawW, pad + (y / 175) * drawH];
  }

  // Helper point in polygon
  function insidePoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Left stem polygon: (0, 175), (0, 31.5), (31.5, 0), (31.5, 175)
  const leftStem = [
    toLocal(0, 175),
    toLocal(0, 31.5),
    toLocal(31.5, 0),
    toLocal(31.5, 175)
  ];

  // Right stem polygon: (98, 0), (129.5, 0), (129.5, 143.5), (98, 175)
  const rightStem = [
    toLocal(98, 0),
    toLocal(129.5, 0),
    toLocal(129.5, 143.5),
    toLocal(98, 175)
  ];

  // Crossbar: rect x: 15.75, y: 77.88, w: 98, h: 19.25
  const barTopLeft = toLocal(15.75, 77.88);
  const barBottomRight = toLocal(15.75 + 98, 77.88 + 19.25);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      // Check crossbar first
      if (px >= barTopLeft[0] && px <= barBottomRight[0] &&
          py >= barTopLeft[1] && py <= barBottomRight[1]) {
        buf[idx] = teal[0];
        buf[idx + 1] = teal[1];
        buf[idx + 2] = teal[2];
        buf[idx + 3] = teal[3];
      }

      // Check left stem
      if (insidePoly(px, py, leftStem)) {
        buf[idx] = navy[0];
        buf[idx + 1] = navy[1];
        buf[idx + 2] = navy[2];
        buf[idx + 3] = navy[3];
      }

      // Check right stem
      if (insidePoly(px, py, rightStem)) {
        buf[idx] = navy[0];
        buf[idx + 1] = navy[1];
        buf[idx + 2] = navy[2];
        buf[idx + 3] = navy[3];
      }
    }
  }

  return buf;
}

const assetsDir = path.join(process.cwd(), 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const rgba = renderHoneIcon(size);
  const png = createPng(size, size, rgba);
  fs.writeFileSync(path.join(assetsDir, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
}

// Also save pristine SVG logo
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 175" width="130" height="175" role="img" aria-label="HoneLENS">
  <rect x="15.75" y="77.88" width="98.00" height="19.25" fill="#1F6F78"/>
  <polygon points="0.00,175.00 0.00,31.50 31.50,0.00 31.50,175.00" fill="#18324A"/>
  <polygon points="98.00,0.00 129.50,0.00 129.50,143.50 98.00,175.00" fill="#18324A"/>
</svg>`;
fs.writeFileSync(path.join(assetsDir, 'honenurse-logo.svg'), svgContent);
console.log('Saved assets/honenurse-logo.svg');
