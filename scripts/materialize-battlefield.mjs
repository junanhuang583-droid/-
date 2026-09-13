import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const sourceDir = resolve(root, "assets-source/battlefield/gothic-abyss");
const outputFile = resolve(root, "public/assets/battlefield/gothic-abyss.webp");
const expectedBytes = 65756;
const expectedSha256 = "dbe7ca4e4bfe8fcff7b3720541675ef9d2f6eb0bfa0a581223a69b8b08e2acff";

const parts = (await readdir(sourceDir))
  .filter((name) => /^part\d+\.txt$/.test(name))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

if (parts.length !== 12) {
  throw new Error(`Expected 12 battlefield source chunks, found ${parts.length}`);
}

const base64 = (
  await Promise.all(parts.map((name) => readFile(resolve(sourceDir, name), "utf8")))
).join("").replace(/\s+/g, "");

const bytes = Buffer.from(base64, "base64");
const sha256 = createHash("sha256").update(bytes).digest("hex");

if (bytes.length !== expectedBytes) {
  throw new Error(`Battlefield asset byte length mismatch: ${bytes.length} !== ${expectedBytes}`);
}
if (sha256 !== expectedSha256) {
  throw new Error(`Battlefield asset checksum mismatch: ${sha256}`);
}
if (
  bytes.subarray(0, 4).toString("ascii") !== "RIFF"
  || bytes.subarray(8, 12).toString("ascii") !== "WEBP"
) {
  throw new Error("Battlefield asset is not a valid WebP container");
}

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, bytes);
console.log(`Materialized battlefield artwork: ${bytes.length} bytes, sha256 ${sha256}`);
