import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
const root = resolve("dist");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
}
const files = (await walk(root)).filter((f) => !f.endsWith(".map") && !f.endsWith("/sw.js") && !f.endsWith("/build-info.json")).sort();
const template = await readFile("scripts/sw-template.js", "utf8");
const hash = createHash("sha256").update(template);
for (const file of files) hash.update(relative(root, file)).update(await readFile(file));
const version = `baseline-${hash.digest("hex").slice(0, 16)}`;
const paths = files.map((file) => "./" + relative(root, file).replaceAll("\\", "/"));
await writeFile(join(root, "sw.js"), template.replace("__SHELL_VERSION__", JSON.stringify(version)).replace("__PRECACHE__", JSON.stringify(paths)));
await writeFile(join(root, "build-info.json"), JSON.stringify({ version, sourceCommit: process.env.SOURCE_COMMIT ?? process.env.GITHUB_SHA ?? "local-unpublished", precacheCount: paths.length }, null, 2));
console.log(`Generated complete offline shell ${version}: ${paths.length} files`);
