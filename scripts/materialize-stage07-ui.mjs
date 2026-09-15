import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const sourceDir = resolve(root, "assets-source/ui-stage07/end-turn-device");
const outputFile = resolve(root, "src/web/assets/ui-stage07/end-turn-device.webp");
const expectedParts = 8;
const expectedBytes = 27486;
const expectedSha256 = "dedff0552daac903a5c5a6e57c77dffb8e4c1e97affaca8c6c0cd98322b3e72e";

const parts = (await readdir(sourceDir))
  .filter((name) => /^part\d+\.txt$/.test(name))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (parts.length !== expectedParts) {
  throw new Error(`Expected ${expectedParts} Stage 0-7.2 UI source chunks, found ${parts.length}`);
}

const base64 = (
  await Promise.all(parts.map((name) => readFile(resolve(sourceDir, name), "utf8")))
).join("").replace(/\s+/g, "");

const bytes = Buffer.from(base64, "base64");
const sha256 = createHash("sha256").update(bytes).digest("hex");

if (bytes.length !== expectedBytes) {
  throw new Error(`End-turn asset byte length mismatch: ${bytes.length} !== ${expectedBytes}`);
}
if (sha256 !== expectedSha256) {
  throw new Error(`End-turn asset checksum mismatch: ${sha256} !== ${expectedSha256}`);
}
if (
  bytes.subarray(0, 4).toString("ascii") !== "RIFF"
  || bytes.subarray(8, 12).toString("ascii") !== "WEBP"
) {
  throw new Error("End-turn asset is not a valid WebP container");
}

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, bytes);
console.log(`Materialized Stage 0-7.2 end-turn artwork: ${bytes.length} bytes, sha256 ${sha256}`);
