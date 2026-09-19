import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('assets-source/battlefield-v2');
const manifest = JSON.parse(await readFile(resolve(src, 'manifest.json'), 'utf8'));
if (!/^v2-(?:2c|3a1)-[a-f0-9]{12}$/.test(manifest.version)) throw new Error('Invalid V2 version');

const packDir = resolve(src, 'runtime-pack');
const parts = (await readdir(packDir)).filter((name) => /^part\d+\.txt$/.test(name)).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
if (!parts.length) throw new Error('Missing V2 runtime pack chunks');
const base64 = (await Promise.all(parts.map((name)=>readFile(resolve(packDir,name),'utf8')))).join('').replace(/\s+/g,'');
const pack = Buffer.from(base64,'base64');
const packedAssets = manifest.assets.filter((entry)=>!entry.transport);
const transportedAssets = manifest.assets.filter((entry)=>entry.transport);
const expectedPackBytes = packedAssets.reduce((sum, entry)=>sum+entry.bytes,0);
if (pack.length !== expectedPackBytes) throw new Error(`V2 runtime pack length mismatch: ${pack.length} !== ${expectedPackBytes}`);

const out = resolve('public/assets/battlefield-v2', manifest.version);
await rm(resolve('public/assets/battlefield-v2'), { recursive: true, force: true });
await mkdir(out, { recursive: true });
let offset = 0;
for (const entry of packedAssets) {
  if (!/^[a-z0-9-]+\.webp$/.test(entry.file)) throw new Error('Invalid asset filename');
  const bytes = pack.subarray(offset, offset + entry.bytes);
  offset += entry.bytes;
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`V2 asset integrity failure: ${entry.file}`);
  if (bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP' || bytes.readUInt32LE(4)+8 !== bytes.length) throw new Error(`Invalid WebP container: ${entry.file}`);
  await writeFile(resolve(out, entry.file), bytes);
}
if (offset !== pack.length) throw new Error(`V2 runtime pack trailing bytes: ${pack.length-offset}`);
for (const entry of transportedAssets) {
  if (!/^[a-z0-9-]+\.webp$/.test(entry.file)) throw new Error('Invalid transported asset filename');
  if (typeof entry.transport !== 'string' || !/^extra\/[a-z0-9-]+\.webp$/.test(entry.transport)) throw new Error('Invalid transported asset path');
  const bytes = await readFile(resolve(src, entry.transport));
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`V2 transported asset integrity failure: ${entry.file}`);
  if (bytes.toString('ascii',0,4) !== 'RIFF' || bytes.toString('ascii',8,12) !== 'WEBP' || bytes.readUInt32LE(4)+8 !== bytes.length) throw new Error(`Invalid transported WebP container: ${entry.file}`);
  await writeFile(resolve(out, entry.file), bytes);
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Verified and materialized ${manifest.assets.length} registered V2 assets from ${parts.length} source chunks + ${transportedAssets.length} extension assets`);
