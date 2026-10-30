// Reusable read-only ASAR access for DSH's app.asar.
const fs = require('fs');
const path = require('path');

function open(asarPath) {
  const fd = fs.openSync(asarPath, 'r');
  const b = Buffer.alloc(16);
  fs.readSync(fd, b, 0, 16, 0);
  const headerBlock = b.readUInt32LE(4);
  const raw = Buffer.alloc(headerBlock + 4);
  fs.readSync(fd, raw, 0, raw.length, 16);
  const nul = raw.indexOf(0);
  const json = (nul >= 0 ? raw.slice(0, nul) : raw).toString('utf8');
  const header = JSON.parse(json);
  const unpackedRoot = asarPath.replace(/app\.asar$/, 'app.asar.unpacked');
  const all = [];
  (function walk(node, prefix) {
    for (const [name, v] of Object.entries(node.files || {})) {
      const p = prefix ? prefix + '/' + name : name;
      if (v.files) walk(v, p);
      else all.push({ path: p, size: v.size, offset: v.offset, unpacked: !!v.unpacked });
    }
  })(header, '');
  return { fd, all, dataOffset: 8 + headerBlock, unpackedRoot };
}

function read(h, entry) {
  if (entry.unpacked) return fs.readFileSync(path.join(h.unpackedRoot, entry.path));
  const b = Buffer.alloc(entry.size);
  fs.readSync(h.fd, b, 0, entry.size, h.dataOffset + Number(entry.offset));
  return b;
}

module.exports = { open, read };
