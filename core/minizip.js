// Lightweight Zip Reader & Writer for DOCX parsing and generation
// Pure standard JS: works in Chrome Extension and Node.js without dependencies.

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

// Browser / Node stream deflate
async function compressDeflate(dataUint8) {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(dataUint8);
    writer.close();
    const chunks = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((a, b) => a + b.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
  // Node fallback
  const zlib = await import('zlib');
  return new Uint8Array(zlib.deflateRawSync(dataUint8));
}

// Browser / Node stream inflate
async function decompressDeflate(dataUint8) {
  if (typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(dataUint8);
    writer.close();
    const chunks = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((a, b) => a + b.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
    return result;
  }
  // Node fallback
  const zlib = await import('zlib');
  return new Uint8Array(zlib.inflateRawSync(dataUint8));
}

export class MiniZip {
  // Read all text files from a zip buffer (e.g., DOCX file)
  static async readZip(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const files = {};

    let pos = 0;
    while (pos < bytes.length - 4) {
      const sig = view.getUint32(pos, true);
      if (sig !== 0x04034b50) break; // Not local file header

      const compMethod = view.getUint16(pos + 8, true);
      const compSize = view.getUint32(pos + 18, true);
      const uncompSize = view.getUint32(pos + 22, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);

      const nameBytes = bytes.slice(pos + 30, pos + 30 + nameLen);
      const fileName = new TextDecoder('utf-8').decode(nameBytes);

      const dataOffset = pos + 30 + nameLen + extraLen;
      const dataSlice = bytes.slice(dataOffset, dataOffset + compSize);

      let contentBytes;
      if (compMethod === 0) {
        contentBytes = dataSlice;
      } else if (compMethod === 8) {
        contentBytes = await decompressDeflate(dataSlice);
      } else {
        contentBytes = dataSlice;
      }

      files[fileName] = contentBytes;
      pos = dataOffset + compSize;
    }

    return files;
  }

  // Create a zip archive (Uint8Array) from a key-value map of { path: string | Uint8Array }
  static async createZip(fileMap) {
    const entries = [];
    let localHeadersLen = 0;

    for (const [name, content] of Object.entries(fileMap)) {
      const rawBytes = typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content;

      const compressed = await compressDeflate(rawBytes);
      const useComp = compressed.length < rawBytes.length;
      const finalData = useComp ? compressed : rawBytes;
      const method = useComp ? 8 : 0;
      const crc = crc32(rawBytes);
      const nameBytes = new TextEncoder().encode(name);

      entries.push({
        name,
        nameBytes,
        method,
        crc,
        compSize: finalData.length,
        uncompSize: rawBytes.length,
        data: finalData
      });
    }

    // Build buffers
    const localBuffers = [];
    const centralBuffers = [];
    let currentOffset = 0;

    for (const entry of entries) {
      // Local Header: 30 bytes + name length
      const lh = new Uint8Array(30 + entry.nameBytes.length);
      const lhView = new DataView(lh.buffer);
      lhView.setUint32(0, 0x04034b50, true);
      lhView.setUint16(4, 20, true);
      lhView.setUint16(6, 0, true);
      lhView.setUint16(8, entry.method, true);
      lhView.setUint16(10, 0, true); // time
      lhView.setUint16(12, 0, true); // date
      lhView.setUint32(14, entry.crc, true);
      lhView.setUint32(18, entry.compSize, true);
      lhView.setUint32(22, entry.uncompSize, true);
      lhView.setUint16(26, entry.nameBytes.length, true);
      lhView.setUint16(28, 0, true); // extra len
      lh.set(entry.nameBytes, 30);

      localBuffers.push(lh, entry.data);

      // Central Header: 46 bytes + name length
      const ch = new Uint8Array(46 + entry.nameBytes.length);
      const chView = new DataView(ch.buffer);
      chView.setUint32(0, 0x02014b50, true);
      chView.setUint16(4, 20, true);
      chView.setUint16(6, 20, true);
      chView.setUint16(8, 0, true);
      chView.setUint16(10, entry.method, true);
      chView.setUint16(12, 0, true);
      chView.setUint16(14, 0, true);
      chView.setUint32(16, entry.crc, true);
      chView.setUint32(20, entry.compSize, true);
      chView.setUint32(24, entry.uncompSize, true);
      chView.setUint16(28, entry.nameBytes.length, true);
      chView.setUint16(30, 0, true); // extra len
      chView.setUint16(32, 0, true); // comment len
      chView.setUint16(34, 0, true); // disk start
      chView.setUint16(36, 0, true); // internal attrs
      chView.setUint32(38, 0, true); // external attrs
      chView.setUint32(42, currentOffset, true);
      ch.set(entry.nameBytes, 46);

      centralBuffers.push(ch);
      currentOffset += lh.length + entry.data.length;
    }

    const centralLen = centralBuffers.reduce((a, b) => a + b.length, 0);

    // End of Central Directory (22 bytes)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, entries.length, true);
    eocdView.setUint16(10, entries.length, true);
    eocdView.setUint32(12, centralLen, true);
    eocdView.setUint32(16, currentOffset, true);
    eocdView.setUint16(20, 0, true);

    const allParts = [...localBuffers, ...centralBuffers, eocd];
    const totalSize = allParts.reduce((a, b) => a + b.length, 0);
    const finalZip = new Uint8Array(totalSize);

    let zipOffset = 0;
    for (const part of allParts) {
      finalZip.set(part, zipOffset);
      zipOffset += part.length;
    }

    return finalZip;
  }
}
