// Standalone zero-dependency ZIP packager for Chrome Extension
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createZipArchive(files, outputPath) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const data = fs.readFileSync(file.src);
    const compressed = zlib.deflateRawSync(data);
    const useCompressed = compressed.length < data.length;
    const finalData = useCompressed ? compressed : data;
    const compMethod = useCompressed ? 8 : 0; // 8 = Deflate, 0 = Stored

    const crc = crc32(data);
    const nameBuf = Buffer.from(file.dest.replace(/\\/g, '/'), 'utf8');

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4);          // Version needed
    localHeader.writeUInt16LE(0, 6);           // Flags
    localHeader.writeUInt16LE(compMethod, 8);  // Compression method
    localHeader.writeUInt16LE(0, 10);          // Mod time
    localHeader.writeUInt16LE(0, 12);          // Mod date
    localHeader.writeUInt32LE(crc, 14);        // CRC32
    localHeader.writeUInt32LE(finalData.length, 18); // Compressed size
    localHeader.writeUInt32LE(data.length, 22);      // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);   // Filename length
    localHeader.writeUInt16LE(0, 28);                // Extra length
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, finalData);

    // Central directory file header (46 bytes + name length)
    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0, 8);           // Flags
    centralHeader.writeUInt16LE(compMethod, 10); // Compression method
    centralHeader.writeUInt16LE(0, 12);          // Mod time
    centralHeader.writeUInt16LE(0, 14);          // Mod date
    centralHeader.writeUInt32LE(crc, 16);        // CRC32
    centralHeader.writeUInt32LE(finalData.length, 20); // Compressed size
    centralHeader.writeUInt32LE(data.length, 24);      // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);   // Filename length
    centralHeader.writeUInt16LE(0, 30);                // Extra length
    centralHeader.writeUInt16LE(0, 32);                // Comment length
    centralHeader.writeUInt16LE(0, 34);                // Disk start
    centralHeader.writeUInt16LE(0, 36);                // Internal attrs
    centralHeader.writeUInt32LE(0, 38);                // External attrs
    centralHeader.writeUInt32LE(offset, 42);           // Relative offset of local header
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + finalData.length;
  }

  const centralDirSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);
  const centralDirOffset = offset;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // Signature
  eocd.writeUInt16LE(0, 4);                // Disk number
  eocd.writeUInt16LE(0, 6);                // Disk start
  eocd.writeUInt16LE(files.length, 8);     // Total entries this disk
  eocd.writeUInt16LE(files.length, 10);    // Total entries
  eocd.writeUInt32LE(centralDirSize, 12);  // Central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);// Offset of central dir
  eocd.writeUInt16LE(0, 20);               // Comment length

  const fullZip = Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, fullZip);
  console.log(`Packaged ${files.length} files into ${outputPath} (${(fullZip.length / 1024).toFixed(1)} KB)`);
}

// CRC32 implementation
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

// Collect extension files
const rootDir = process.cwd();
const includeDirs = ['background', 'content', 'popup', 'sidepanel', 'workspace', 'core', 'lib', 'styles', 'assets'];
const includeFiles = ['manifest.json', 'README.md'];

const filesToZip = [];

for (const file of includeFiles) {
  const full = path.join(rootDir, file);
  if (fs.existsSync(full)) {
    filesToZip.push({ src: full, dest: file });
  }
}

for (const dir of includeDirs) {
  const fullDir = path.join(rootDir, dir);
  if (fs.existsSync(fullDir)) {
    function walk(curr, rel) {
      for (const item of fs.readdirSync(curr)) {
        const itemFull = path.join(curr, item);
        const itemRel = path.join(rel, item);
        const stat = fs.statSync(itemFull);
        if (stat.isDirectory()) {
          walk(itemFull, itemRel);
        } else {
          filesToZip.push({ src: itemFull, dest: itemRel });
        }
      }
    }
    walk(fullDir, dir);
  }
}

createZipArchive(filesToZip, path.join(rootDir, 'dist', 'HoneLENS-v1.0.0.zip'));
