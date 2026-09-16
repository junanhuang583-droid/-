// Test-only HTTP server. Mirrors the actual Pages /-/ subpath.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
const types = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".webmanifest":"application/manifest+json", ".webp":"image/webp", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml" };
createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {res.writeHead(302,{Location:"/-/"});res.end();return;}
    if (!url.pathname.startsWith("/-/")) {res.writeHead(404);res.end();return;}
    if (url.pathname === "/-/test-broken-sw.js") {
      const worker=(await readFile(resolve(root,"sw.js"),"utf8"))
        .replace(/const CACHE_NAME = ([^;]+);/, 'const CACHE_NAME = "card-game-shell-test-broken";')
        .replace("const PRECACHE = [", 'const PRECACHE = ["./missing-mandatory-art.webp",');
      res.writeHead(200,{"Content-Type":"text/javascript","Cache-Control":"no-store","Service-Worker-Allowed":"/-/"});res.end(worker);return;
    }
    const name=decodeURIComponent(url.pathname.slice(3)) || "index.html";
    const file=resolve(root,name);
    if (!file.startsWith(root+sep) || !(await stat(file)).isFile()) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{"Content-Type":types[extname(file)]??"application/octet-stream","Cache-Control":"no-store"});res.end(await readFile(file));
  } catch {res.writeHead(404);res.end("Not found");}
}).listen(4174,"127.0.0.1",()=>console.log("Acceptance server: http://127.0.0.1:4174/-/"));
