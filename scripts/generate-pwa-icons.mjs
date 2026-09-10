import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sizes = [192, 512];
mkdirSync("public", { recursive: true });

for (const size of sizes) {
  const pixels = Buffer.alloc(size * size * 4);
  fill(pixels, size, 23, 20, 17, 255);
  roundedRect(pixels, size, Math.round(size * 0.22), Math.round(size * 0.12), Math.round(size * 0.56), Math.round(size * 0.76), Math.round(size * 0.065), [43, 36, 29, 255]);
  roundedRectStroke(pixels, size, Math.round(size * 0.22), Math.round(size * 0.12), Math.round(size * 0.56), Math.round(size * 0.76), Math.round(size * 0.065), Math.max(3, Math.round(size * 0.035)), [195, 154, 91, 255]);
  roundedRectStroke(pixels, size, Math.round(size * 0.27), Math.round(size * 0.18), Math.round(size * 0.46), Math.round(size * 0.64), Math.round(size * 0.045), Math.max(2, Math.round(size * 0.012)), [110, 85, 55, 255]);
  circle(pixels, size, size * 0.5, size * 0.47, size * 0.18, [58, 45, 33, 255]);
  circleStroke(pixels, size, size * 0.5, size * 0.47, size * 0.18, Math.max(2, Math.round(size * 0.016)), [167, 125, 69, 255]);
  drawCg(pixels, size);
  writeFileSync(join("public", `icon-${size}.png`), encodePng(size, size, pixels));
}

function fill(buf, size, r, g, b, a) {
  for (let i = 0; i < size * size; i += 1) {
    const p = i * 4;
    buf[p] = r; buf[p + 1] = g; buf[p + 2] = b; buf[p + 3] = a;
  }
}

function setPixel(buf, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const p = (Math.floor(y) * size + Math.floor(x)) * 4;
  buf[p] = color[0]; buf[p + 1] = color[1]; buf[p + 2] = color[2]; buf[p + 3] = color[3];
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx; const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function roundedRect(buf, size, x, y, w, h, r, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      if (insideRoundedRect(px + 0.5, py + 0.5, x, y, w, h, r)) setPixel(buf, size, px, py, color);
    }
  }
}

function roundedRectStroke(buf, size, x, y, w, h, r, thickness, color) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const outer = insideRoundedRect(px + 0.5, py + 0.5, x, y, w, h, r);
      const inner = insideRoundedRect(px + 0.5, py + 0.5, x + thickness, y + thickness, w - thickness * 2, h - thickness * 2, Math.max(0, r - thickness));
      if (outer && !inner) setPixel(buf, size, px, py, color);
    }
  }
}

function circle(buf, size, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x + 0.5 - cx; const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, size, x, y, color);
    }
  }
}

function circleStroke(buf, size, cx, cy, radius, thickness, color) {
  const outer = radius * radius;
  const inner = (radius - thickness) * (radius - thickness);
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x + 0.5 - cx; const dy = y + 0.5 - cy; const d = dx * dx + dy * dy;
      if (d <= outer && d >= inner) setPixel(buf, size, x, y, color);
    }
  }
}

function drawCg(buf, size) {
  const color = [234, 211, 163, 255];
  const unit = Math.max(2, Math.round(size / 64));
  const ox = Math.round(size * 0.39); const oy = Math.round(size * 0.42);
  const c = [[0,0,5,1],[0,0,1,9],[0,8,5,1]];
  const g = [[7,0,5,1],[7,0,1,9],[7,8,5,1],[10,4,2,1],[11,4,1,5]];
  for (const [x,y,w,h] of [...c, ...g]) {
    for (let py = 0; py < h * unit; py += 1) for (let px = 0; px < w * unit; px += 1) setPixel(buf, size, ox + x * unit + px, oy + y * unit + py, color);
  }
}

function encodePng(width, height, rgba) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    rgba.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  typeBuf.copy(out, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), data.length + 8);
  return out;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
