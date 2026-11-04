import fs from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
function crc32(data) { let c = 0xffffffff; for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function files(dir, prefix = '') {
  const values = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Symlinks are not packaged.');
    const relative = prefix + item.name;
    if (item.isDirectory()) values.push(...await files(path.join(dir, item.name), `${relative}/`));
    else if (item.isFile()) values.push(relative);
  }
  return values.sort();
}
export async function zipDirectory(dir, output) {
  const handle = await fs.open(output, 'wx');
  let offset = 0;
  const entries = [];
  try {
    const now = new Date();
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const names = await files(dir);
    for (const relative of names) {
      const data = await fs.readFile(path.join(dir, relative));
      const name = Buffer.from(path.basename(dir) + '/' + relative);
      const compress = /\.(?:html|m?js|css|json|md|txt|svg|bat|sh)$/i.test(relative);
      const packed = compress ? deflateRawSync(data, { level: 9 }) : data;
      const method = compress ? 8 : 0;
      const crc = crc32(data);
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(method, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
      header.writeUInt16LE(dosTime, 10); header.writeUInt16LE(dosDate, 12);
      await handle.write(header); await handle.write(name); await handle.write(packed);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
      central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14);
      entries.push(central, name);
      offset += header.length + name.length + packed.length;
    }
    const central = Buffer.concat(entries);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
    await handle.write(central); await handle.write(end);
    console.log(`ZIP: ${names.length} files; ${output}`);
  } finally { await handle.close(); }
}
